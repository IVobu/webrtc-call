const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : force;
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

class Element {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.checked = true;
    this.disabled = false;
    this.files = [];
    this.children = [];
    this.classList = new ClassList();
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
    this.srcObject = null;
    this.parentNode = null;
  }
  set className(value) {
    this.classList.values = new Set(value.split(/\s+/).filter(Boolean));
  }
  get className() { return [...this.classList.values].join(" "); }
  addEventListener(name, callback) {
    (this.listeners[name] ||= []).push(callback);
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === "src") this.src = "";
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    }
    this.parentNode = null;
  }
  querySelector(selector) {
    const descendants = [];
    const visit = (element) => element.children.forEach((child) => {
      descendants.push(child);
      visit(child);
    });
    visit(this);
    return descendants.find((element) => element.classList.contains(selector.slice(1))) || null;
  }
  closest(selector) {
    for (let element = this; element; element = element.parentNode) {
      if (element.classList.contains(selector.slice(1))) return element;
    }
    return null;
  }
}

class MediaTrack {
  constructor(kind, id) {
    this.kind = kind;
    this.id = id;
    this.enabled = true;
    this.readyState = "live";
    this.listeners = {};
    this.stopped = false;
  }
  getSettings() { return { deviceId: this.id, width: 960, height: 540, frameRate: 15 }; }
  getCapabilities() {
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  }
  applyConstraints() { return Promise.resolve(); }
  addEventListener(name, callback) {
    (this.listeners[name] ||= []).push(callback);
  }
  stop() {
    this.stopped = true;
    this.readyState = "ended";
  }
}

class MediaStreamMock {
  constructor(tracks = []) {
    this.id = `stream-${MediaStreamMock.nextId++}`;
    this.tracks = [...tracks];
  }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
  addTrack(track) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }
  removeTrack(track) { this.tracks = this.tracks.filter((item) => item !== track); }
}
MediaStreamMock.nextId = 1;

class Sender {
  constructor(track = null) { this.track = track; }
  async replaceTrack(track) { this.track = track; }
}

class PeerConnectionMock {
  constructor() {
    this.transceivers = [];
    this.senders = [];
    this.connectionState = "new";
  }
  addTrack(track) {
    const sender = new Sender(track);
    this.senders.push(sender);
    return sender;
  }
  addTransceiver(kind) {
    const sender = new Sender();
    const transceiver = { sender, receiver: { track: new MediaTrack(kind, "remote") } };
    this.transceivers.push(transceiver);
    this.senders.push(sender);
    return transceiver;
  }
  getTransceivers() { return this.transceivers; }
  close() {}
  async createOffer() { return { type: "offer" }; }
  async createAnswer() { return { type: "answer" }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription() {}
  async addIceCandidate() {}
}

function createClient() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    },
    createElement(tag) {
      const element = new Element(tag);
      element.tagName = tag;
      return element;
    },
    querySelectorAll() { return []; },
  };
  document.getElementById("camera-device-select").value = "__default__";
  document.getElementById("screen-resolution").value = "540";
  document.getElementById("screen-frame-rate").value = "15";

  const mediaCalls = [];
  let displayCalls = 0;
  let nextMediaError = null;
  const mediaDevices = {
    getSupportedConstraints() {
      return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    },
    addEventListener() {},
    async enumerateDevices() {
      return [
        { kind: "audioinput", deviceId: "mic-a", label: "Private Microphone" },
        { kind: "audioinput", deviceId: "mic-b", label: "Second Microphone" },
        { kind: "videoinput", deviceId: "cam-a", label: "Private Camera" },
        { kind: "videoinput", deviceId: "cam-b", label: "Second Camera" },
      ];
    },
    async getUserMedia(constraints) {
      mediaCalls.push(constraints);
      if (nextMediaError) {
        const error = nextMediaError;
        nextMediaError = null;
        throw error;
      }
      if (constraints.audio) {
        const id = constraints.audio.deviceId?.exact || "mic-a";
        return new MediaStreamMock([new MediaTrack("audio", id)]);
      }
      if (constraints.video) {
        const id = constraints.video.deviceId?.exact || "cam-a";
        return new MediaStreamMock([new MediaTrack("video", id)]);
      }
      throw new Error("Unexpected getUserMedia constraints");
    },
    async getDisplayMedia() {
      displayCalls += 1;
      return new MediaStreamMock([new MediaTrack("video", `share-${displayCalls}`)]);
    },
  };

  const emitted = [];
  const socket = { on() {}, emit(name, payload) { emitted.push({ name, payload }); } };
  const savedValues = new Map();
  class FileReaderMock {
    readAsDataURL(file) {
      this.result = `data:${file.type};base64,R0lGODlh`;
      this.onload();
    }
  }
  class AudioContextMock {
    createAnalyser() {
      return {
        fftSize: 256,
        connect() {},
        disconnect() {},
        getByteTimeDomainData(samples) { samples.fill(128); },
      };
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  const context = {
    console: { error() {} },
    document,
    navigator: { mediaDevices },
    window: {
      isSecureContext: true,
      location: {
        origin: "https://test.invalid",
        pathname: "/",
        search: "",
        hash: "",
      },
      history: {
        lastReplacement: null,
        replaceState(_state, _title, url) { this.lastReplacement = url; },
      },
      AudioContext: AudioContextMock,
    },
    io: () => socket,
    elements,
    emitted,
    mediaCalls,
    getDisplayCalls: () => displayCalls,
    setNextMediaError: (error) => { nextMediaError = error; },
    RTCPeerConnection: PeerConnectionMock,
    RTCSessionDescription: class {},
    RTCIceCandidate: class {},
    MediaStream: MediaStreamMock,
    FileReader: FileReaderMock,
    localStorage: {
      getItem(key) { return savedValues.get(key) || null; },
      setItem(key, value) { savedValues.set(key, value); },
    },
    Promise,
    Map,
    Set,
    Uint8Array,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Error,
    URL,
    URLSearchParams,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout() {},
  };
  const source = fs.readFileSync("public/client.js", "utf8");
  vm.runInNewContext(`${source}
    globalThis.testApi = {
      getLocalStream, createPeerConnection, addRemoteVideo, switchAudioDevice,
      switchCameraDevice, startScreenShare, stopScreenShare, handleSignal,
      importAvatar, isValidAvatarDataUrl, localStream: () => localStream,
      audioSenders, videoSenders, shareSenders, shareSources, remoteVideos,
      remoteAvatarProfiles, localAvatarProfile, peers, setLocalSpeaking,
      saveAvatarPreferences, loadAvatarProfile, getRoomCodeFromHash,
      makeRoomLink, makeOverlayLink, clearRoomCodeFromAddress, saveName,
      loadName, NAME_STORAGE_KEY, remoteAudio, participantRows
    };`, context);
  return Object.assign(context.testApi, {
    emitted,
    mediaCalls,
    getDisplayCalls: () => displayCalls,
    setNextMediaError: (error) => { nextMediaError = error; },
    setHash: (hash) => { context.window.location.hash = hash; },
    history: context.window.history,
    savedValues,
    elements,
  });
}

async function run() {
  const app = createClient();
  const markup = fs.readFileSync("public/index.html", "utf8");
  const styles = fs.readFileSync("public/style.css", "utf8");
  assert(markup.indexOf("participants-sidebar") < markup.indexOf("class=\"call-main\""));
  assert(markup.indexOf("class=\"call-main\"") < markup.indexOf("class=\"call-settings\""));
  assert(markup.indexOf("id=\"video-grid\"") < markup.indexOf("id=\"avatar-strip\""));
  assert.match(markup, /id="mic-btn"[^>]*>Micro<\/button>/);
  assert.match(markup, /id="cam-btn"[^>]*>Caméra<\/button>/);
  assert.match(markup, /id="screen-btn"[^>]*>Screenshare<\/button>/);
  assert.doesNotMatch(markup, /privacy-mode|Masquer les noms/);
  assert.match(styles, /#call-screen\s*\{[^}]*height:\s*100vh/s);
  assert.match(styles, /\.share-tile,\s*\.local-share-tile\s*\{[^}]*resize:\s*both/s);
  assert.match(styles, /@media\s*\(max-width:\s*650px\)/);

  app.setHash("#room=abc123");
  assert.equal(app.getRoomCodeFromHash(), "abc123", "shared URL fragment should prefill a valid code");
  app.setHash("#room=%3Cscript%3E");
  assert.equal(app.getRoomCodeFromHash(), "", "invalid room fragments should be rejected");
  assert.equal(app.makeRoomLink("abc123"), "https://test.invalid/#room=abc123");
  assert.equal(app.makeOverlayLink("abc123"), "https://test.invalid/overlay.html#room=abc123");
  app.setHash("#room=abc123");
  app.clearRoomCodeFromAddress();
  assert.equal(app.history.lastReplacement, "/", "successful join should strip the code fragment");
  app.elements.get("name-input").value = "Nobu";
  app.saveName();
  app.elements.get("name-input").value = "";
  app.loadName();
  assert.equal(app.elements.get("name-input").value, "Nobu", "pseudo should persist locally");
  assert.equal(app.savedValues.has(app.NAME_STORAGE_KEY), true);

  assert.equal(await app.getLocalStream(), true, "microphone-only startup should succeed");
  assert.equal(app.mediaCalls.length, 1, "camera must not be requested during startup");
  assert.equal(app.localStream().getVideoTracks().length, 0);
  assert.equal(app.localStream().getAudioTracks().length, 1);
  const localAvatar = app.elements.get("local-avatar");
  const localFallback = app.elements.get("local-avatar-fallback");
  assert.equal(app.localAvatarProfile.bounce, true, "bounce should default on");
  assert.equal(app.localAvatarProfile.dimIdle, true, "idle dim should default on");
  assert.equal(localAvatar.classList.contains("avatar-idle-dim"), true);
  app.setLocalSpeaking(true);
  assert.equal(localAvatar.classList.contains("avatar-bounce"), true);
  assert.equal(localAvatar.classList.contains("avatar-idle-dim"), false);
  assert.equal(
    app.emitted.some(({ name }) => name === "overlay-state-update"),
    true,
    "voice state should be published to the read-only overlay channel"
  );
  app.setLocalSpeaking(false);
  assert.equal(localAvatar.classList.contains("avatar-bounce"), false);
  assert.equal(localAvatar.classList.contains("avatar-idle-dim"), true);
  app.elements.get("avatar-bounce").checked = false;
  app.elements.get("avatar-dim-idle").checked = false;
  app.saveAvatarPreferences();
  app.setLocalSpeaking(true);
  assert.equal(localAvatar.classList.contains("avatar-bounce"), false);
  assert.equal(localFallback.classList.contains("avatar-bounce"), false);
  app.setLocalSpeaking(false);
  assert.equal(localAvatar.classList.contains("avatar-idle-dim"), false);
  app.addRemoteVideo("peer", "Alice");
  app.createPeerConnection("peer");
  app.saveAvatarPreferences();
  assert.equal(app.emitted.some(({ payload }) =>
    payload.data && payload.data.type === "avatar-profile" &&
    payload.data.bounce === false && payload.data.dimIdle === false
  ), true, "effect preferences should be shared to peers");
  const oldMic = app.localStream().getAudioTracks()[0];
  app.elements.get("audio-device-select").value = "mic-b";
  await app.switchAudioDevice();
  assert.equal(app.audioSenders.get("peer").track.id, "mic-b");
  assert.equal(oldMic.stopped, true, "replaced microphone track should be stopped");
  app.elements.get("audio-device-select").value = "mic-a";
  app.setNextMediaError(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
  await app.switchAudioDevice();
  assert.equal(app.audioSenders.get("peer").track.id, "mic-b");
  assert.equal(app.localStream().getAudioTracks()[0].id, "mic-b");
  assert.equal(app.elements.get("audio-device-select").value, "mic-b");
  assert.match(app.elements.get("media-status").textContent, /refusé/);

  app.elements.get("camera-device-select").value = "cam-b";
  await app.switchCameraDevice();
  assert.equal(app.videoSenders.get("peer").track.id, "cam-b");
  app.elements.get("camera-device-select").value = "__off__";
  await app.switchCameraDevice();
  assert.equal(app.videoSenders.get("peer").track, null, "camera disable should clear its sender");

  await app.startScreenShare();
  await app.startScreenShare();
  assert.equal(app.shareSources.size, 2, "two independent sources should be active");
  assert.equal(app.getDisplayCalls(), 2);
  const sources = [...app.shareSources.values()];
  assert.notEqual(
    app.shareSenders.get("peer")[sources[0].slot].track,
    app.shareSenders.get("peer")[sources[1].slot].track
  );
  await app.startScreenShare();
  assert.equal(app.getDisplayCalls(), 2, "the simultaneous share limit must prevent a third capture");

  await app.stopScreenShare(sources[0].id);
  assert.equal(app.shareSources.size, 1);
  assert.equal(app.shareSenders.get("peer")[sources[0].slot].track, null);
  assert.equal(app.shareSenders.get("peer")[sources[1].slot].track, sources[1].track);
  assert(
    app.emitted.some(({ name, payload }) =>
      name === "signal" && payload.data.type === "share-ended" &&
      payload.data.slot === sources[0].slot
    ),
    "stopping one source should signal only its slot"
  );

  app.createPeerConnection("late-peer");
  await Promise.resolve();
  assert.equal(
    app.shareSenders.get("late-peer")[sources[1].slot].track,
    sources[1].track,
    "new peers should receive sources already being shared"
  );

  app.handleSignal("peer", {
    type: "avatar-profile",
    idle: "data:image/gif;base64,R0lGODlh",
    talking: "",
    speaking: true,
    camera: false,
  });
  assert.equal(app.remoteAvatarProfiles.get("peer").idle, "data:image/gif;base64,R0lGODlh");
  const peerAudio = app.remoteAudio.get("peer");
  const participantRow = app.participantRows.get("peer");
  const muteButton = participantRow.children.find((child) => child.className === "participant-mute");
  muteButton.listeners.click[0]();
  assert.equal(peerAudio.muted, true, "participant mute should affect only that remote audio element");
  muteButton.listeners.click[0]();
  assert.equal(peerAudio.muted, false);
  const volumeSlider = participantRow.children.find((child) => child.type === "range");
  volumeSlider.value = "0.35";
  volumeSlider.listeners.input[0]();
  assert.equal(peerAudio.volume, 0.35, "participant volume should be independently adjustable");
  const remoteAudioTrack = new MediaTrack("audio", "remote-audio");
  app.peers.get("peer").ontrack({
    track: remoteAudioTrack,
    streams: [new MediaStreamMock([remoteAudioTrack])],
    transceiver: { sender: app.audioSenders.get("peer") },
  });
  assert.equal(peerAudio.srcObject.getAudioTracks()[0], remoteAudioTrack);
  const peerTile = app.remoteVideos.get("peer").get("primary").closest(".video-tile");
  assert.equal(peerTile.classList.contains("speaking"), true, "speaking state should mark the peer tile");
  assert.equal(peerTile.querySelector(".avatar-view").classList.contains("avatar-bounce"), true);
  assert.equal(
    peerTile.querySelector(".avatar-view").src,
    "data:image/gif;base64,R0lGODlh",
    "remote avatar profile should be displayed on the peer tile"
  );
  app.handleSignal("peer", { type: "camera-state", enabled: true });
  const remoteCamera = new MediaTrack("video", "remote-camera");
  app.peers.get("peer").ontrack({
    track: remoteCamera,
    streams: [new MediaStreamMock([remoteCamera])],
    transceiver: { sender: app.videoSenders.get("peer") },
  });
  assert.equal(app.remoteVideos.get("peer").get("camera").classList.contains("hidden"), false);
  app.handleSignal("peer", { type: "camera-state", enabled: false });
  assert.equal(app.remoteVideos.get("peer").get("camera").classList.contains("hidden"), true);
  assert.equal(peerTile.querySelector(".avatar-view").classList.contains("hidden"), false);
  app.handleSignal("peer", { type: "avatar-state", speaking: false });
  assert.equal(peerTile.querySelector(".avatar-view").classList.contains("avatar-bounce"), false);
  assert.equal(peerTile.querySelector(".avatar-view").classList.contains("avatar-idle-dim"), true);
  const shareVideoTrack = new MediaTrack("video", "remote-share");
  const shareSender = app.shareSenders.get("peer")[sources[1].slot];
  app.peers.get("peer").ontrack({
    track: shareVideoTrack,
    streams: [],
    transceiver: { sender: shareSender },
  });
  assert.equal(app.remoteVideos.get("peer").has(`share-${sources[1].slot}`), true);
  assert.equal(app.elements.get("video-grid").children.length, 1);
  const localShareVisibility = sources[1].tile.children[2];
  localShareVisibility.listeners.click[0]();
  assert.equal(sources[1].tile.children[0].classList.contains("hidden"), true);
  assert.equal(localShareVisibility.textContent, "Afficher");
  const remoteShareTile = app.remoteVideos.get("peer").get(`share-${sources[1].slot}`).closest(".share-tile");
  const remoteShareVisibility = remoteShareTile.children.find((child) =>
    child.className === "share-visibility-btn"
  );
  remoteShareVisibility.listeners.click[0]();
  assert.equal(
    app.remoteVideos.get("peer").get(`share-${sources[1].slot}`).classList.contains("hidden"),
    true,
    "hiding a displayed share should not stop its received track"
  );
  assert.equal(
    app.remoteVideos.get("peer").get(`share-${sources[1].slot}`).srcObject.getVideoTracks()[0],
    shareVideoTrack,
    "a locally hidden share should continue receiving the remote source"
  );
  app.handleSignal("peer", { type: "share-ended", slot: sources[1].slot });
  assert.equal(app.remoteVideos.get("peer").has(`share-${sources[1].slot}`), false);
  assert.equal(app.elements.get("video-grid").children.length, 0);
  assert.equal(app.isValidAvatarDataUrl("data:image/svg+xml;base64,AAAA"), false);
  assert.equal(app.isValidAvatarDataUrl("https://example.com/avatar.gif"), false);

  const input = app.elements.get("avatar-idle-input");
  input.files = [{
    type: "image/gif",
    size: 50,
    arrayBuffer: async () => Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer,
  }];
  await app.importAvatar(input, "idle", app.elements.get("avatar-idle-preview"));
  assert.equal(
    app.localAvatarProfile.idle,
    "data:image/gif;base64,R0lGODlh",
    app.elements.get("avatar-status").textContent
  );
  assert.equal(
    app.isValidAvatarDataUrl("data:image/gif;base64,R0lGODlh"),
    true,
    "safe raster/GIF data URLs should be accepted"
  );
  input.files = [{
    type: "image/png",
    size: 50,
    arrayBuffer: async () => Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer,
  }];
  await app.importAvatar(input, "idle", app.elements.get("avatar-idle-preview"));
  assert.match(app.elements.get("avatar-status").textContent, /invalide/);
  assert.equal(
    app.localAvatarProfile.idle,
    "data:image/gif;base64,R0lGODlh",
    "a mismatched file type must not replace the saved avatar"
  );
  input.files = [{ type: "image/svg+xml", size: 50 }];
  await app.importAvatar(input, "idle", app.elements.get("avatar-idle-preview"));
  assert.match(app.elements.get("avatar-status").textContent, /SVG/);
  console.log("Media mocks passed: audio-only startup, device switching, concurrent share add/remove/cap, late-peer track setup, and avatar import/validation/signaling.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
