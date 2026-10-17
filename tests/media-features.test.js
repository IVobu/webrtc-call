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
    this.style = { values: {}, setProperty(name, value) { this.values[name] = value; } };
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
    return descendants.find((element) => selector.startsWith(".")
      ? element.classList.contains(selector.slice(1))
      : element.tagName === selector.toUpperCase()) || null;
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
  const callLayout = new Element("call-layout");
  callLayout.className = "call-layout";
  const documentListeners = {};
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
    querySelector(selector) {
      return selector === ".call-layout" ? callLayout : null;
    },
    querySelectorAll() { return []; },
    addEventListener(name, callback) {
      (documentListeners[name] ||= []).push(callback);
    },
    removeEventListener(name, callback) {
      documentListeners[name] = (documentListeners[name] || []).filter((item) => item !== callback);
    },
  };
  document.getElementById("camera-device-select").value = "__default__";
  document.getElementById("screen-resolution").value = "540";
  document.getElementById("screen-frame-rate").value = "15";

  const mediaCalls = [];
  let displayCalls = 0;
  let displayAudioAvailable = false;
  const displayRequests = [];
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
    async getDisplayMedia(constraints) {
      displayCalls += 1;
      displayRequests.push(constraints);
      const tracks = [new MediaTrack("video", `share-${displayCalls}`)];
      if (constraints.audio && displayAudioAvailable) {
        tracks.push(new MediaTrack("audio", `share-audio-${displayCalls}`));
      }
      return new MediaStreamMock(tracks);
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
      innerWidth: 1280,
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
      shareAudioSenders, remoteShareAudio, screenShareNotice: () => screenShareNotice,
      remoteAvatarProfiles, localAvatarProfile, peers, setLocalSpeaking,
      saveAvatarPreferences, loadAvatarProfile, getRoomCodeFromHash,
      makeRoomLink, makeOverlayLink, clearRoomCodeFromAddress, saveName,
      loadName, NAME_STORAGE_KEY, remoteAudio, participantRows, createParticipantRow,
      loadLayoutPreferences, saveLayoutPreferences, applyLayoutPreferences,
      setPseudonymsVisible, layoutPreferences: () => layoutPreferences,
      resizePanelFromKeyboard, callLayout
    };`, context);
  return Object.assign(context.testApi, {
    emitted,
    mediaCalls,
    getDisplayCalls: () => displayCalls,
    displayRequests,
    setDisplayAudioAvailable: (available) => { displayAudioAvailable = available; },
    setNextMediaError: (error) => { nextMediaError = error; },
    setHash: (hash) => { context.window.location.hash = hash; },
    history: context.window.history,
    savedValues,
    elements,
  });
}

function createOverlay(hash) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    },
    createElement(tag) {
      const element = new Element(tag);
      element.tagName = tag.toUpperCase();
      return element;
    },
  };
  const context = {
    document,
    window: { location: { hash } },
    URLSearchParams,
    Map,
    Set,
    String,
    Boolean,
    RegExp,
    io: () => ({ on() {}, emit() {} }),
  };
  const source = fs.readFileSync("public/overlay.js", "utf8");
  vm.runInNewContext(`${source}
    globalThis.overlayTestApi = { updatePeer, peers, peerFilter, isValidPeerFilter, isValidRoomCode };`,
  context);
  return Object.assign(context.overlayTestApi, { elements });
}

async function run() {
  const app = createClient();
  const markup = fs.readFileSync("public/index.html", "utf8");
  const clientSource = fs.readFileSync("public/client.js", "utf8");
  const styles = fs.readFileSync("public/style.css", "utf8");
  assert(markup.indexOf("participants-sidebar") < markup.indexOf("class=\"call-main\""));
  assert(markup.indexOf("class=\"call-main\"") < markup.indexOf("class=\"call-settings\""));
  assert(markup.indexOf("id=\"video-grid\"") < markup.indexOf("id=\"avatar-strip\""));
  assert(markup.indexOf("id=\"video-grid\"") < markup.indexOf("id=\"local-tile\""));
  assert.match(styles, /\.screen-share-panel\s*\{[^}]*grid-row:\s*1/s);
  assert.match(styles, /\.avatar-panel\s*\{[^}]*grid-row:\s*2/s);
  assert.match(markup, /<details class="room-menu">[\s\S]*?id="room-label"[\s\S]*?id="copy-link-btn"[\s\S]*?id="copy-code-btn"[\s\S]*?id="copy-overlay-link-btn"[\s\S]*?id="leave-btn"[\s\S]*?<\/details>/);
  assert.doesNotMatch(markup, /class="call-header"/);
  assert.match(markup, /id="mic-btn"[^>]*aria-label="Couper le micro"[^>]*>[\s\S]*?<svg/);
  assert.match(markup, /id="cam-btn"[^>]*aria-label="Activer la caméra"[^>]*>[\s\S]*?<svg/);
  assert.match(markup, /id="screen-btn"[^>]*aria-label="Partager un écran ou une fenêtre"[^>]*>[\s\S]*?<svg/);
  assert.doesNotMatch(markup, /privacy-mode|Masquer les noms/);
  assert.match(markup, /id="show-pseudonyms"[^>]*checked/);
  assert.match(markup, /<details class="settings-panel call-avatar-settings">[\s\S]*?id="call-avatar-idle-input"[^>]*accept="image\/png,image\/jpeg,image\/gif,image\/webp"[\s\S]*?id="call-avatar-talking-input"[^>]*accept="image\/png,image\/jpeg,image\/gif,image\/webp"[\s\S]*?id="call-avatar-idle-preview"[\s\S]*?id="call-avatar-talking-preview"[\s\S]*?id="call-avatar-status"[\s\S]*?<\/details>/);
  assert.match(markup, /PNG, JPEG, GIF ou WebP \(250 Ko maximum\)[\s\S]*?remplace uniquement l'image du mode choisi/);
  assert.match(markup, /participants-resizer/);
  assert.match(markup, /settings-resizer/);
  assert.match(styles, /\.participant-overlay-menu/);
  assert.match(styles, /\.room-menu-content/);
  assert.match(styles, /\.ctrl-btn svg/);
  assert.match(styles, /#local-tile \.video-label\s*\{[^}]*top:\s*8px[^}]*bottom:\s*auto/s);
  assert.doesNotMatch(markup, /screen-share-audio|Audio du partage d'écran activé par défaut/,
    "share audio should not have a separate settings checkbox");
  assert.doesNotMatch(markup, /screen-audio-option/);
  assert.match(clientSource, /getDisplayMedia\(\{[\s\S]*?audio:\s*true/);
  assert.match(styles, /\.share-audio-controls/);
  assert.match(styles, /\.share-tile\.selected \.share-audio-controls/);
  assert.match(styles, /\.pseudos-hidden \.video-label,\s*\.pseudos-hidden \.share-label/);
  assert.doesNotMatch(styles, /\.pseudos-hidden[^}]*participant-name/);
  assert.match(styles, /#call-screen\s*\{[^}]*height:\s*100vh/s);
  assert.match(styles, /grid-template-areas:\s*"participants participants-resizer main settings-resizer settings"/);
  assert.match(styles, /\.share-tile,\s*\.local-share-tile\s*\{[^}]*resize:\s*both/s);
  assert.match(styles, /@media\s*\(max-width:\s*650px\)/);

  app.setHash("#room=abc123");
  assert.equal(app.getRoomCodeFromHash(), "abc123", "shared URL fragment should prefill a valid code");
  app.setHash("#room=%3Cscript%3E");
  assert.equal(app.getRoomCodeFromHash(), "", "invalid room fragments should be rejected");
  assert.equal(app.makeRoomLink("abc123"), "https://test.invalid/#room=abc123");
  assert.equal(app.makeOverlayLink("abc123"), "https://test.invalid/overlay.html#room=abc123");
  assert.equal(
    app.makeOverlayLink("abc123", "peer_test-123"),
    "https://test.invalid/overlay.html#room=abc123&peer=peer_test-123"
  );
  const filteredOverlay = createOverlay("#room=abc123&peer=peer_test-123");
  assert.equal(filteredOverlay.isValidPeerFilter, true);
  assert.equal(filteredOverlay.updatePeer({
    id: "other_peer",
    name: "Other",
    avatar: {},
    speaking: false,
  }), false, "individual OBS overlay should ignore other participants");
  assert.equal(filteredOverlay.peers.size, 0);
  assert.equal(filteredOverlay.updatePeer({
    id: "peer_test-123",
    name: "Selected",
    avatar: {},
    speaking: true,
  }), true);
  assert.equal(filteredOverlay.peers.size, 1);
  const groupOverlay = createOverlay("#room=abc123");
  groupOverlay.updatePeer({ id: "first", name: "First", avatar: {}, speaking: false });
  groupOverlay.updatePeer({ id: "second", name: "Second", avatar: {}, speaking: true });
  assert.equal(groupOverlay.peers.size, 2, "group OBS overlay should display all participants");
  const invalidOverlay = createOverlay("#room=abc123&peer=%3Cscript%3E");
  assert.equal(invalidOverlay.isValidPeerFilter, false, "invalid participant filters should not fall back to group view");
  app.setHash("#room=abc123");
  app.clearRoomCodeFromAddress();
  assert.equal(app.history.lastReplacement, "/", "successful join should strip the code fragment");
  app.elements.get("name-input").value = "Nobu";
  app.saveName();
  app.elements.get("name-input").value = "";
  app.loadName();
  assert.equal(app.elements.get("name-input").value, "Nobu", "pseudo should persist locally");
  assert.equal(app.savedValues.has(app.NAME_STORAGE_KEY), true);
  assert.equal(app.layoutPreferences().participantsWidth, 220, "default participant panel width should be applied");
  assert.equal(app.layoutPreferences().settingsWidth, 260, "default settings panel width should be applied");
  app.resizePanelFromKeyboard(
    { key: "ArrowRight", preventDefault() {} },
    "participants"
  );
  assert.equal(app.layoutPreferences().participantsWidth, 236);
  assert.equal(JSON.parse(app.savedValues.get("webrtc-call-layout-v1")).participantsWidth, 236);
  app.layoutPreferences().settingsDocked = true;
  app.applyLayoutPreferences();
  assert.equal(app.callLayout.classList.contains("settings-docked"), true);
  assert.equal(app.callLayout.style.values["--settings-width"], "54px");
  const visibleNameRow = app.createParticipantRow("visible-peer", "Alice");
  app.setPseudonymsVisible(false);
  assert.equal(app.elements.get("call-screen").classList.contains("pseudos-hidden"), true);
  assert.equal(app.elements.get("show-pseudonyms").checked, false);
  assert.equal(app.savedValues.get("webrtc-call-show-pseudonyms-v1"), "false");
  assert.equal(
    visibleNameRow.querySelector(".participant-name").textContent,
    "Alice",
    "hiding video-area pseudonyms must leave participant sidebar names intact"
  );
  app.setPseudonymsVisible(true);
  assert.equal(app.elements.get("call-screen").classList.contains("pseudos-hidden"), false);

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
  const participantMenu = app.participantRows.get("peer").children.find((child) =>
    child.classList.contains("participant-overlay-menu")
  );
  const participantNameButton = app.participantRows.get("peer").children.find((child) =>
    child.classList.contains("participant-name-button")
  );
  participantNameButton.listeners.click[0]();
  assert.equal(participantMenu.classList.contains("hidden"), false, "clicking a participant name should open its OBS menu");
  participantNameButton.listeners.click[0]();
  assert.equal(participantMenu.classList.contains("hidden"), true);
  assert.equal(participantMenu.children[0].textContent, "Copier lien OBS individuel");
  assert.equal(participantMenu.children[1].textContent, "Copier lien OBS du groupe");
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
  assert.equal(app.shareSources.size, 1);
  assert.equal(app.getDisplayCalls(), 1);
  assert.equal(app.displayRequests[0].audio, true, "screen audio capture should be requested by default");
  app.setDisplayAudioAvailable(true);
  await app.startScreenShare();
  assert.equal(app.getDisplayCalls(), 2);
  assert.equal(app.displayRequests[1].audio, true, "audio should be requested for each selected capture");
  assert.equal(app.shareSources.size, 2, "two independent sources should be active");
  await app.startScreenShare();
  assert.equal(app.getDisplayCalls(), 2, "the simultaneous share limit must prevent a third capture");
  const sources = [...app.shareSources.values()];
  assert.notEqual(
    app.shareSenders.get("peer")[sources[0].slot].track,
    app.shareSenders.get("peer")[sources[1].slot].track
  );
  assert.equal(
    app.shareAudioSenders.get("peer")[sources[1].slot].track.id,
    "share-audio-2",
    "display audio must use the matching per-share audio transceiver"
  );
  await app.stopScreenShare(sources[0].id);
  assert.equal(app.shareSources.size, 1);
  assert.equal(app.shareSenders.get("peer")[sources[0].slot].track, null);
  assert.equal(app.shareSenders.get("peer")[sources[1].slot].track, sources[1].track);
  assert.equal(app.shareAudioSenders.get("peer")[sources[0].slot].track, null);
  assert.equal(app.shareAudioSenders.get("peer")[sources[1].slot].track, sources[1].stream.getAudioTracks()[0]);
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
  assert.equal(
    app.shareAudioSenders.get("late-peer")[sources[1].slot].track,
    sources[1].stream.getAudioTracks()[0],
    "late peers should receive the active display audio track on its dedicated transceiver"
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
  assert.equal(app.remoteVideos.get("peer").has(`share-${sources[1].slot}`), false);
  const remoteShareAudioTrack = new MediaTrack("audio", "remote-share-audio");
  app.peers.get("peer").ontrack({
    track: remoteShareAudioTrack,
    streams: [],
    transceiver: { sender: app.shareAudioSenders.get("peer")[sources[1].slot] },
  });
  const remoteShareAudio = app.remoteShareAudio.get("peer").get(sources[1].slot);
  assert.equal(remoteShareAudio.audio.srcObject.getAudioTracks()[0], remoteShareAudioTrack);
  assert.equal(remoteShareAudio.controls, null, "audio arriving first should wait for its matching share tile");
  const shareVideoTrack = new MediaTrack("video", "remote-share");
  const shareSender = app.shareSenders.get("peer")[sources[1].slot];
  app.peers.get("peer").ontrack({
    track: shareVideoTrack,
    streams: [],
    transceiver: { sender: shareSender },
  });
  assert.equal(app.remoteVideos.get("peer").has(`share-${sources[1].slot}`), true);
  assert.equal(
    remoteShareAudio.controls.closest(".share-tile"),
    app.remoteVideos.get("peer").get(`share-${sources[1].slot}`).closest(".share-tile"),
    "the share volume control should be rendered inside its matching video tile"
  );
  assert.equal(remoteShareAudio.controls.dataset.peerId, "peer");
  assert.equal(remoteShareAudio.controls.dataset.shareSlot, String(sources[1].slot));
  const remoteShareTileForVolume = remoteShareAudio.controls.closest(".share-tile");
  remoteShareTileForVolume.listeners.click[0]({});
  assert.equal(remoteShareTileForVolume.classList.contains("selected"), true,
    "selecting a share tile should expose its own audio controls");
  const shareVolume = remoteShareAudio.controls.children.find((child) => child.type === "range");
  assert.equal(shareVolume.min, "0");
  assert.equal(shareVolume.max, "100", "share volume should be adjustable from 0 to 100");
  const microphoneVolume = app.remoteAudio.get("peer").volume;
  shareVolume.value = "40";
  shareVolume.listeners.input[0]();
  assert.equal(remoteShareAudio.audio.volume, 0.4, "share volume should be independently adjustable");
  assert.equal(app.remoteAudio.get("peer").volume, microphoneVolume,
    "changing share volume must not change participant microphone volume");
  assert.equal(
    remoteShareAudio.controls.children.find((child) => child.classList.contains("share-audio-volume-value")).textContent,
    "40%"
  );
  const shareMute = remoteShareAudio.controls.children.find((child) => child.type === "button");
  shareMute.listeners.click[0]();
  assert.equal(remoteShareAudio.audio.muted, true, "share mute should affect only this share audio");
  assert.equal(app.remoteAudio.get("peer").muted, false, "share mute must not alter participant microphone audio");
  const otherShareTrack = new MediaTrack("video", "other-remote-share");
  app.peers.get("peer").ontrack({
    track: otherShareTrack,
    streams: [],
    transceiver: { sender: app.shareSenders.get("peer")[0] },
  });
  const otherShareAudioTrack = new MediaTrack("audio", "other-remote-share-audio");
  app.peers.get("peer").ontrack({
    track: otherShareAudioTrack,
    streams: [],
    transceiver: { sender: app.shareAudioSenders.get("peer")[0] },
  });
  const otherRemoteShareAudio = app.remoteShareAudio.get("peer").get(0);
  const otherShareTileForVolume = otherRemoteShareAudio.controls.closest(".share-tile");
  otherShareTileForVolume.listeners.click[0]({});
  assert.equal(otherShareTileForVolume.classList.contains("selected"), true);
  assert.equal(remoteShareTileForVolume.classList.contains("selected"), false,
    "selecting another share should select only that source tile");
  const otherShareVolume = otherRemoteShareAudio.controls.children.find((child) => child.type === "range");
  otherShareVolume.value = "80";
  otherShareVolume.listeners.input[0]();
  assert.equal(otherRemoteShareAudio.audio.volume, 0.8);
  assert.equal(remoteShareAudio.audio.volume, 0.4, "changing one share volume must not change another share");
  assert.equal(app.elements.get("video-grid").children.length, 2);
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
  assert.equal(app.elements.get("video-grid").children.length, 1);
  assert.equal(app.remoteShareAudio.get("peer").has(sources[1].slot), false, "ending a share should remove its associated remote audio");
  app.handleSignal("peer", { type: "share-ended", slot: 0 });
  assert.equal(app.elements.get("video-grid").children.length, 0);

  await app.stopScreenShare(sources[1].id);
  app.setDisplayAudioAvailable(false);
  await app.startScreenShare();
  assert.equal(app.shareSources.size, 1, "video capture should continue when requested system audio is unavailable");
  assert.equal(app.shareSources.values().next().value.audioTrack, null);
  assert.match(app.screenShareNotice(), /aucun audio système/);
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
    app.elements.get("call-avatar-idle-preview").src,
    "data:image/gif;base64,R0lGODlh",
    "home avatar imports should update the in-call settings preview"
  );
  const callTalkingInput = app.elements.get("call-avatar-talking-input");
  callTalkingInput.files = [{
    type: "image/gif",
    size: 50,
    arrayBuffer: async () => Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer,
  }];
  await callTalkingInput.listeners.change[0]();
  assert.equal(app.localAvatarProfile.talking, "data:image/gif;base64,R0lGODlh");
  assert.equal(app.elements.get("avatar-talking-preview").src, "data:image/gif;base64,R0lGODlh");
  assert.match(app.elements.get("call-avatar-status").textContent, /chargé/);
  assert.equal(JSON.parse(app.savedValues.get("webrtc-call-avatar-v1")).talking, "data:image/gif;base64,R0lGODlh");
  assert(
    app.emitted.some(({ name, payload }) =>
      name === "signal" && payload.data.type === "avatar-profile" &&
      payload.data.talking === "data:image/gif;base64,R0lGODlh"
    ),
    "avatar imports in call settings should propagate to peers"
  );
  app.loadAvatarProfile();
  assert.equal(
    app.elements.get("call-avatar-talking-preview").src,
    "data:image/gif;base64,R0lGODlh",
    "saved avatar imports should return to the settings preview after reload"
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
