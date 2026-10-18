const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "public", "client.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const signaling = fs.readFileSync(path.join(root, "lib", "signaling.js"), "utf8");
const { cleanSignal } = require("../lib/signaling");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");

test("client and server JavaScript parse without syntax errors", () => {
  assert.doesNotThrow(() => new Function(client));
  assert.doesNotThrow(() => new Function(server));
  assert.doesNotThrow(() => new Function(signaling));
});

test("ICE signaling validates and bounds untrusted candidate fields", () => {
  assert.match(signaling, /candidate\.candidate\.length > 10_000/);
  assert.match(signaling, /sdpMid\.length > 256/);
  assert.match(signaling, /sdpMLineIndex > 65_535/);
  assert.match(signaling, /usernameFragment\.length > 256/);
  assert.match(signaling, /candidate: \{ candidate: candidate\.candidate, sdpMid, sdpMLineIndex, usernameFragment \}/);
});

test("ICE validator accepts valid candidates and rejects malformed payloads", () => {
  const valid = cleanSignal({
    type: "ice",
    candidate: {
      candidate: "candidate:1 1 UDP 2122260223 192.0.2.1 5000 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "abc",
      unexpected: "must not be forwarded",
    },
  });
  assert.equal(valid.type, "ice");
  assert.equal(valid.candidate.unexpected, undefined);
  assert.equal(valid.candidate.candidate.startsWith("candidate:"), true);
  assert.equal(cleanSignal({ type: "ice", candidate: { candidate: "x".repeat(10_001) } }), null);
  assert.equal(cleanSignal({ type: "ice", candidate: { candidate: "x", sdpMLineIndex: -1 } }), null);
  assert.equal(cleanSignal({ type: "ice", candidate: { candidate: "x", sdpMid: 5 } }), null);
  assert.equal(cleanSignal({ type: "ice", candidate: [] }), null);
  assert.equal(cleanSignal({ type: "ice", candidate: { candidate: "x", usernameFragment: "y".repeat(257) } }), null);
});

test("SDP and screen signaling accept only supported bounded payloads", () => {
  assert.deepEqual(cleanSignal({ type: "sdp", sdp: { type: "offer", sdp: "v=0\\r\\n" } }), {
    type: "sdp",
    sdp: { type: "offer", sdp: "v=0\\r\\n" },
  });
  assert.deepEqual(cleanSignal({ type: "sdp", sdp: { type: "pranswer", sdp: "x" } }), null);
  assert.deepEqual(cleanSignal({ type: "sdp", sdp: { type: "answer", sdp: "x".repeat(200_000) } }), null);
  assert.deepEqual(cleanSignal({ type: "sdp", sdp: { type: "offer", sdp: 7 } }), null);
  assert.deepEqual(cleanSignal({ type: "screen", sharing: 1, streamId: "screen-1" }), {
    type: "screen",
    sharing: true,
    streamId: "screen-1",
  });
  assert.deepEqual(cleanSignal({ type: "screen", sharing: false, streamId: "s".repeat(120) }), {
    type: "screen",
    sharing: false,
    streamId: "s".repeat(100),
  });
  assert.equal(cleanSignal({ type: "unknown" }), null);
});

test("HTML IDs are unique", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("required interaction controls exist in the page and client", () => {
  for (const id of [
    "video-grid",
    "call-status",
    "right-panel",
    "participants-list",
    "avatar-strip",
    "show-names-toggle",
    "chat-btn",
    "chat-input",
    "screen-btn",
    "video-quality-select",
    "video-fps-select",
    "echo-cancel-toggle",
    "noise-suppression-toggle",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing HTML id: ${id}`);
  }
  assert.match(client, /function mediaErrorMessage/);
  assert.match(client, /function showCallStatus/);
  assert.match(client, /function renderScreenShareTile/);
  assert.match(client, /function applyScreenAudioVolume/);
  assert.match(client, /screen-share-mute/);
  assert.match(client, /maxFramerate = SETTINGS\.videoFps/);
  assert.match(client, /peerAudioSettings\.get\(ownerId\)/);
  assert.match(client, /function releaseMediaElement/);
  assert.match(client, /function releaseScreenShareTile/);
  assert.match(client, /forEach\(releaseMediaElement\)/);
  assert.match(css, /\.screen-share-mute/);
});

test("screen-share and participant audio settings stay connected", () => {
  assert.match(client, /applyScreenAudioVolume\(person\.id, streamId/);
  assert.match(client, /screenAudioSettings\.set\(stream\.id, saved\)/);
  assert.match(client, /screenAudioSettings\.delete\(stream\.id\)/);
});

test("local performance settings are applied to camera and screen-share senders", () => {
  assert.match(client, /for \(const stream of screenStreams\.values\(\)\)/);
  assert.match(client, /for \(const group of state\.screenSenders\.values\(\)\)/);
  assert.match(client, /params\.encodings\[0\]\.maxBitrate = maxBitrate/);
});
