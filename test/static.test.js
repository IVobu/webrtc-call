const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "public", "client.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");

test("client and server JavaScript parse without syntax errors", () => {
  assert.doesNotThrow(() => new Function(client));
  assert.doesNotThrow(() => new Function(server));
});

test("ICE signaling validates and bounds untrusted candidate fields", () => {
  assert.match(server, /candidate\.candidate\.length > 10_000/);
  assert.match(server, /sdpMid\.length > 256/);
  assert.match(server, /sdpMLineIndex > 65_535/);
  assert.match(server, /usernameFragment\.length > 256/);
  assert.match(server, /candidate: \{ candidate: candidate\.candidate, sdpMid, sdpMLineIndex, usernameFragment \}/);
});

test("HTML IDs are unique", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("required interaction controls exist in the page and client", () => {
  for (const id of [
    "video-grid",
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
