const socket = io();

const $ = (id) => document.getElementById(id);

// ---------- DOM ----------
const homeScreen = $("home-screen");
const callScreen = $("call-screen");
const nameInput = $("name-input");
const createBtn = $("create-btn");
const joinCodeInput = $("join-code-input");
const joinBtn = $("join-btn");
const homeError = $("home-error");

const avatarIdleInput = $("avatar-idle-input");
const avatarTalkingInput = $("avatar-talking-input");
const avatarIdleFile = $("avatar-idle-file");
const avatarTalkingFile = $("avatar-talking-file");

const roomLabel = $("room-label");
const settingsBtn = $("settings-btn");
const chatBtn = $("chat-btn");
const chatBadge = $("chat-badge");
const audioUnlockBtn = $("audio-unlock");
const copyLinkBtn = $("copy-link-btn");
const leaveBtn = $("leave-btn");
const videoGrid = $("video-grid");
const localTile = $("local-tile");
const localVideo = $("local-video");
const localAvatar = $("local-avatar");
const localLabel = $("local-label");
const micBtn = $("mic-btn");
const camBtn = $("cam-btn");
const screenBtn = $("screen-btn");
const participantCount = $("participant-count");
const participantCountSide = $("participant-count-side");
const participantsList = $("participants-list");
const avatarStrip = $("avatar-strip");
const showNamesToggle = $("show-names-toggle");
const panelToggle = $("panel-toggle");
const panelClose = $("panel-close");
const rightPanel = $("right-panel");
const stageEmpty = $("stage-empty");
const settingsBtnSecondary = $("settings-btn-secondary");
const renameInput = $("rename-input");
const renameSave = $("rename-save");
const echoCancelToggle = $("echo-cancel-toggle");
const noiseSuppressionToggle = $("noise-suppression-toggle");
const videoQualitySelect = $("video-quality-select");
const videoFpsSelect = $("video-fps-select");
const panelAvatarIdle = $("panel-avatar-idle");
const panelAvatarTalking = $("panel-avatar-talking");
const avatarSave = $("avatar-save");

const settingsModal = $("settings-modal");
const bounceEnabledInput = $("bounce-enabled");
const bounceIntensityInput = $("bounce-intensity");
const bounceIntensityValue = $("bounce-intensity-value");
const speakingThresholdInput = $("speaking-threshold");
const speakingThresholdValue = $("speaking-threshold-value");
const settingsClose = $("settings-close");

const chatPanel = $("chat-panel");
const chatClose = $("chat-close");
const chatMessages = $("chat-messages");
const chatInput = $("chat-input");
const chatSend = $("chat-send");

// ---------- Constantes / état ----------
const SETTINGS_VERSION = 2;

let rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const iceReady = fetch("/ice-config", { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    if (cfg && Array.isArray(cfg.iceServers)) rtcConfig = cfg;
  })
  .catch(() => {});

// Réglages : le bounce est DÉSACTIVÉ par défaut.
const SETTINGS = {
  bounceEnabled: false,
  bounceIntensity: 1.15,
  speakingThreshold: 18,
  echoCancellation: true,
  noiseSuppression: true,
  videoHeight: 720,
  videoFps: 24,
};

let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let micEnabled = true;
let camEnabled = false;
let roomCode = null;
let peerName = "";
let localSpeaking = false;
let avatarIdle = "";
let avatarTalking = "";
let unreadCount = 0;

// peerId -> { pc, polite, makingOffer, ignoreOffer, pendingCandidates, queue, screenSender, iceRestarts }
const peers = new Map();
// peerId -> { name, avatar, speaking, screenStreamId, camStream, screenStream }
const peerInfo = new Map();
const peerAudioSettings = new Map();

let audioContext = null;
let analyser = null;
let micInterval = null;

// ---------- Utilitaires ----------
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn("localStorage indisponible ou plein :", e);
    return false;
  }
}

function cleanImageValue(value) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v || /^(javascript|vbscript):/i.test(v) || /^data:(?!image\/)/i.test(v)) return "";
  return v;
}

function cleanAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") return { idle: "", talking: "" };
  return { idle: cleanImageValue(avatar.idle), talking: cleanImageValue(avatar.talking) };
}

function getInfo(peerId) {
  if (!peerAudioSettings.has(peerId)) peerAudioSettings.set(peerId, { volume: 1, muted: false });
  let info = peerInfo.get(peerId);
  if (!info) {
    info = {
      name: "",
      avatar: { idle: "", talking: "" },
      speaking: false,
      screenStreamId: null,
      screenActive: false,
      camStream: null,
      screenStream: null,
    };
    peerInfo.set(peerId, info);
  }
  return info;
}

function generateRoomCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// ---------- Réglages ----------
function loadSettings() {
  try {
    const saved = JSON.parse(storageGet("webrtcSettings") || "{}");
    // Le bounce n'est repris que s'il a été enregistré avec la version actuelle
    // (évite qu'une ancienne valeur "activé" reste en mémoire).
    if (saved.v === SETTINGS_VERSION && typeof saved.bounceEnabled === "boolean") {
      SETTINGS.bounceEnabled = saved.bounceEnabled;
    }
    if (typeof saved.bounceIntensity === "number") SETTINGS.bounceIntensity = saved.bounceIntensity;
    if (typeof saved.speakingThreshold === "number") SETTINGS.speakingThreshold = saved.speakingThreshold;
    if (typeof saved.echoCancellation === "boolean") SETTINGS.echoCancellation = saved.echoCancellation;
    if (typeof saved.noiseSuppression === "boolean") SETTINGS.noiseSuppression = saved.noiseSuppression;
    if ([360, 720, 1080].includes(Number(saved.videoHeight))) SETTINGS.videoHeight = Number(saved.videoHeight);
    if ([10, 15, 24, 30].includes(Number(saved.videoFps))) SETTINGS.videoFps = Number(saved.videoFps);
  } catch (e) {
    console.error(e);
  }

  avatarIdle = cleanImageValue(storageGet("webrtcAvatarIdle") || "");
  avatarTalking = cleanImageValue(storageGet("webrtcAvatarTalking") || "");
  if (avatarIdle) avatarIdleInput.value = avatarIdle;
  if (avatarTalking) avatarTalkingInput.value = avatarTalking;

  bounceEnabledInput.checked = SETTINGS.bounceEnabled;
  bounceIntensityInput.value = SETTINGS.bounceIntensity;
  bounceIntensityValue.textContent = SETTINGS.bounceIntensity.toFixed(2);
  speakingThresholdInput.value = SETTINGS.speakingThreshold;
  speakingThresholdValue.textContent = SETTINGS.speakingThreshold;
  if (echoCancelToggle) echoCancelToggle.checked = SETTINGS.echoCancellation;
  if (noiseSuppressionToggle) noiseSuppressionToggle.checked = SETTINGS.noiseSuppression;
  if (videoQualitySelect) videoQualitySelect.value = String(SETTINGS.videoHeight);
  if (videoFpsSelect) videoFpsSelect.value = String(SETTINGS.videoFps);
  if (panelAvatarIdle) panelAvatarIdle.value = avatarIdle;
  if (panelAvatarTalking) panelAvatarTalking.value = avatarTalking;
  if (renameInput) renameInput.value = peerName;
}

function saveSettings() {
  storageSet("webrtcSettings", JSON.stringify({ v: SETTINGS_VERSION, ...SETTINGS }));
}

// ---------- Médias locaux ----------
async function getLocalStream() {
  const audio = { echoCancellation: SETTINGS.echoCancellation, noiseSuppression: SETTINGS.noiseSuppression };
  const height = SETTINGS.videoHeight;
  const width = Math.round(height * 16 / 9);
  const attempts = [
    { video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: SETTINGS.videoFps, max: SETTINGS.videoFps } }, audio },
    { video: false, audio }, // repli : micro seul si pas de caméra
  ];

  for (const constraints of attempts) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (err) {
      console.error("Erreur getUserMedia:", err);
    }
  }

  if (!localStream) {
    alert("Impossible d'accéder au micro/caméra. Tu rejoins sans média (tu pourras voir et entendre les autres). Vérifie les permissions.");
    return false;
  }

  // Applique l'état courant des boutons aux nouvelles pistes.
  localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  localStream.getVideoTracks().forEach((t) => (t.enabled = camEnabled));

  localVideo.srcObject = localStream;
  applyLocalMediaSettings();
  updateControls();
  startSpeakingDetection();
  return true;
}

async function applyLocalMediaSettings() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  const videoTrack = localStream.getVideoTracks()[0];
  if (audioTrack && audioTrack.applyConstraints) {
    try {
      await audioTrack.applyConstraints({
        echoCancellation: SETTINGS.echoCancellation,
        noiseSuppression: SETTINGS.noiseSuppression
      });
    } catch (err) { console.warn("Filtres micro non pris en charge :", err); }
  }
  if (videoTrack && videoTrack.applyConstraints) {
    const h = SETTINGS.videoHeight;
    try {
      await videoTrack.applyConstraints({
        width: { ideal: Math.round(h * 16 / 9) },
        height: { ideal: h },
        frameRate: { ideal: SETTINGS.videoFps, max: SETTINGS.videoFps }
      });
    } catch (err) { console.warn("Qualité vidéo non prise en charge :", err); }
  }
  for (const state of peers.values()) {
    const sender = state.videoSender;
    if (!sender || !sender.getParameters || !sender.setParameters) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = SETTINGS.videoHeight <= 360 ? 450000 : SETTINGS.videoHeight <= 720 ? 1200000 : 2500000;
      await sender.setParameters(params);
    } catch (err) { console.warn("Limite de débit vidéo non appliquée :", err); }
  }
}

function updateControls() {
  micBtn.classList.toggle("active", micEnabled);
  micBtn.classList.toggle("danger", !micEnabled);
  camBtn.classList.toggle("active", camEnabled);
  camBtn.classList.toggle("danger", !camEnabled);
  screenBtn.classList.toggle("active", isScreenSharing);
  screenBtn.classList.toggle("danger", isScreenSharing);
  renderParticipants();
}

function toggleMic() {
  micEnabled = !micEnabled;
  if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  if (!micEnabled && localSpeaking) {
    localSpeaking = false;
    updateTile("local");
    broadcast({ type: "speaking", speaking: false });
  }
  updateControls();
}

function toggleCam() {
  camEnabled = !camEnabled;
  if (localStream) localStream.getVideoTracks().forEach((t) => (t.enabled = camEnabled));
  updateControls();
}

// ---------- Tuiles ----------
function getTileElements(peerId) {
  if (peerId === "local") return { tile: localTile, img: localAvatar, video: localVideo };
  const tile = $(`tile-${peerId}`);
  if (!tile) return null;
  return { tile, img: tile.querySelector(".avatar-img"), video: tile.querySelector("video") };
}

function ensureRemoteTile(peerId, name) {
  const info = getInfo(peerId);
  if (name) info.name = name;

  let tile = $(`tile-${peerId}`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = `tile-${peerId}`;

    // La vidéo est muette : le son passe par un <audio> dédié, indépendant
    // de l'affichage (avatar, partage d'écran, caméra coupée...).
    const video = document.createElement("video");
    video.className = "cam-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    const audio = document.createElement("audio");
    audio.autoplay = true;

    const img = document.createElement("img");
    img.className = "avatar-img hidden";
    img.alt = "";

    const label = document.createElement("span");
    label.className = "video-label";

    tile.append(video, audio, img, label);
    videoGrid.appendChild(tile);
  }

  tile.querySelector(".video-label").textContent = info.name || peerId.slice(0, 6);
  updateTile(peerId);
  updateParticipantCount();
  return tile;
}

function pickAvatar(avatars, speaking) {
  const idle = (avatars && avatars.idle) || "";
  const talking = (avatars && avatars.talking) || "";
  return speaking && talking ? talking : idle || talking;
}

function updateTile(peerId) {
  const els = getTileElements(peerId);
  if (!els) return;
  const { tile, img, video } = els;

  const isLocal = peerId === "local";
  const info = isLocal ? null : peerInfo.get(peerId);
  if (!isLocal && !info) return;

  const speaking = isLocal ? localSpeaking : info.speaking;
  const avatars = isLocal ? { idle: avatarIdle, talking: avatarTalking } : info.avatar;

  tile.classList.toggle("speaking", !!speaking);

  // Partage d'écran : affiché dans la tuile de la personne, puis retour à l'état précédent.
  const sharedStream = isLocal
    ? (isScreenSharing ? screenStream : null)
    : (info.screenActive ? info.screenStream || info.camStream : null);
  const camStream = isLocal ? localStream : info.camStream;
  tile.classList.toggle("is-sharing", !!sharedStream);

  if (sharedStream) {
    if (video.srcObject !== sharedStream) video.srcObject = sharedStream;
    img.classList.add("hidden");
    img.classList.remove("bouncing");
    video.classList.remove("hidden");
    video.classList.add("screen-share");
    if (!isLocal) playMedia(video);
    updateStageEmpty();
    renderParticipants();
    return;
  }

  video.classList.remove("screen-share");
  if (video.srcObject !== camStream) video.srcObject = camStream || null;

  const src = pickAvatar(avatars, speaking);
  if (src) {
    video.classList.add("hidden");
    if (img._src !== src) {
      img._src = src;
      img.src = src;
    }
    img.classList.remove("hidden");
    img.style.setProperty("--bounce-scale", SETTINGS.bounceIntensity);
    img.classList.toggle("bouncing", !!(speaking && SETTINGS.bounceEnabled));
  } else {
    img.classList.add("hidden");
    img.classList.remove("bouncing");
    video.classList.add("hidden");
  }
  updateStageEmpty();
  renderParticipants();
}

function updateAllTiles() {
  updateTile("local");
  for (const id of peerInfo.keys()) updateTile(id);
}

function updateParticipantCount() {
  const count = peerInfo.size + 1;
  participantCount.textContent = `${count} participant${count > 1 ? "s" : ""}`;
  if (participantCountSide) participantCountSide.textContent = String(count);
  renderParticipants();
}

function getParticipantAvatar(avatar, speaking) {
  return pickAvatar(avatar, speaking) || "";
}

function renderParticipants() {
  if (!participantsList || !avatarStrip) return;
  const people = [{
    id: "local", name: peerName || "Toi",
    avatar: { idle: avatarIdle, talking: avatarTalking },
    speaking: localSpeaking, local: true
  }, ...Array.from(peerInfo.entries()).map(([id, info]) => ({
    id, name: info.name || id.slice(0, 6), avatar: info.avatar, speaking: !!info.speaking, local: false
  }))];

  participantsList.replaceChildren();
  avatarStrip.replaceChildren();
  for (const person of people) {
    const src = getParticipantAvatar(person.avatar, person.speaking);
    const row = document.createElement("div");
    row.className = "participant-row" + (person.speaking ? " speaking" : "");
    const rowAvatar = src ? document.createElement("img") : document.createElement("span");
    rowAvatar.className = "participant-row-avatar" + (src ? "" : " participant-row-initial");
    if (src) { rowAvatar.src = src; rowAvatar.alt = ""; }
    else rowAvatar.textContent = (person.name || "?").slice(0, 1).toUpperCase();
    const rowName = document.createElement("span");
    rowName.className = "participant-row-name participant-name";
    rowName.textContent = person.local ? `${person.name} (toi)` : person.name;
    const status = document.createElement("span");
    status.className = "participant-status";
    status.textContent = person.speaking ? "Parle" : (person.local ? (micEnabled ? "Micro actif" : "Micro coupé") : "Connecté");
    row.append(rowAvatar, rowName, status);

    if (!person.local) {
      const audioSettings = peerAudioSettings.get(person.id) || { volume: 1, muted: false };
      const controls = document.createElement("div");
      controls.className = "participant-audio-controls";
      const muteLabel = document.createElement("label");
      const mute = document.createElement("input");
      mute.type = "checkbox";
      mute.className = "mute-toggle";
      mute.checked = audioSettings.muted;
      mute.addEventListener("click", (event) => event.stopPropagation());
      mute.addEventListener("change", () => {
        audioSettings.muted = mute.checked;
        peerAudioSettings.set(person.id, audioSettings);
        const audio = $(`tile-${person.id}`)?.querySelector("audio");
        if (audio) audio.muted = audioSettings.muted;
        muteLabel.lastChild.textContent = mute.checked ? " Participant en sourdine" : " Son du participant";
      });
      muteLabel.append(mute, document.createTextNode(audioSettings.muted ? " Participant en sourdine" : " Son du participant"));

      const volumeLabel = document.createElement("label");
      volumeLabel.textContent = `Volume : ${Math.round(audioSettings.volume * 100)} %`;
      const volume = document.createElement("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "200";
      volume.step = "5";
      volume.value = String(Math.round(audioSettings.volume * 100));
      volume.setAttribute("aria-label", `Volume de ${person.name}`);
      volume.addEventListener("click", (event) => event.stopPropagation());
      volume.addEventListener("input", () => {
        audioSettings.volume = Number(volume.value) / 100;
        peerAudioSettings.set(person.id, audioSettings);
        const audio = $(`tile-${person.id}`)?.querySelector("audio");
        if (audio) audio.volume = audioSettings.volume;
        volumeLabel.textContent = `Volume : ${volume.value} %`;
      });
      controls.append(muteLabel, volumeLabel, volume);
      row.appendChild(controls);
      row.addEventListener("click", () => row.classList.toggle("audio-controls-open"));
      row.title = "Cliquer pour régler le son de ce participant";
    }
    participantsList.appendChild(row);

    const chip = document.createElement("div");
    chip.className = "avatar-chip" + (person.speaking ? " speaking" : "");
    const chipAvatar = src ? document.createElement("img") : document.createElement("span");
    chipAvatar.className = src ? "avatar-chip-image" : "avatar-placeholder";
    if (src) { chipAvatar.src = src; chipAvatar.alt = ""; }
    else chipAvatar.textContent = (person.name || "?").slice(0, 1).toUpperCase();
    const chipName = document.createElement("span");
    chipName.className = "avatar-name";
    chipName.textContent = person.local ? `${person.name} (toi)` : person.name;
    chip.append(chipAvatar, chipName);
    avatarStrip.appendChild(chip);
  }
}

function updateStageEmpty() {
  if (!stageEmpty || !videoGrid) return;
  stageEmpty.classList.toggle("hidden", !!videoGrid.querySelector(".video-tile.is-sharing"));
}

function playMedia(el) {
  const p = el.play();
  if (p && p.catch) {
    p.catch((err) => {
      if (err && err.name === "NotAllowedError") audioUnlockBtn.classList.remove("hidden");
    });
  }
}

function attachCamStream(peerId, stream) {
  const info = getInfo(peerId);
  info.camStream = stream;
  const tile = ensureRemoteTile(peerId);
  const audio = tile.querySelector("audio");
  const audioSettings = peerAudioSettings.get(peerId) || { volume: 1, muted: false };
  audio.volume = audioSettings.volume;
  audio.muted = audioSettings.muted;
  if (audio.srcObject !== stream) audio.srcObject = stream;
  updateTile(peerId);
  playMedia(tile.querySelector("video"));
  playMedia(audio);
}

function routeRemoteStream(peerId, stream) {
  const info = getInfo(peerId);
  // Le flux d'écran est annoncé par un signal "screen" (avec l'id du flux).
  // Repli : un second flux différent du flux caméra est traité comme un écran.
  const isScreen =
    stream.id === info.screenStreamId || (!!info.camStream && info.camStream.id !== stream.id);

  if (isScreen) {
    info.screenStream = stream;
    updateTile(peerId);
  } else {
    attachCamStream(peerId, stream);
  }
}

// ---------- WebRTC (négociation parfaite) ----------
function sendSignal(to, data) {
  socket.emit("signal", { to, data });
}

// Comme à l'origine : la tuile de la personne passe de la caméra (ou de l'avatar)
// à l'écran partagé, puis revient. On remplace la piste de l'émetteur vidéo existant :
// pas de seconde vidéo, pas de renégociation, donc pas d'écran noir.
function applyScreenToPeer(state) {
  const track = screenStream && screenStream.getVideoTracks()[0];
  if (!track) return;
  if (state.videoSender) {
    state.videoSender
      .replaceTrack(track)
      .catch((err) => console.error("replaceTrack (écran):", err));
  } else {
    // Pas de caméra : il n'y a aucun émetteur vidéo à réutiliser.
    state.screenSender = state.pc.addTrack(track, screenStream);
  }
}

function restoreCameraForPeer(state) {
  if (state.videoSender) {
    const cam = localStream ? localStream.getVideoTracks()[0] : null;
    state.videoSender
      .replaceTrack(cam || null)
      .catch((err) => console.error("replaceTrack (caméra):", err));
  } else if (state.screenSender) {
    try {
      state.pc.removeTrack(state.screenSender);
    } catch (err) {
      console.warn("removeTrack:", err);
    }
    state.screenSender = null;
  }
}

function createPeerConnection(peerId, isOfferer) {
  const pc = new RTCPeerConnection(rtcConfig);
  const state = {
    pc,
    // Les deux côtés calculent le même résultat : un seul est "poli".
    polite: String(socket.id) > String(peerId),
    makingOffer: false,
    ignoreOffer: false,
    pendingCandidates: [],
    queue: Promise.resolve(),
    videoSender: null, // émetteur de la caméra (réutilisé pour l'écran)
    screenSender: null, // seulement si la personne n'a pas de caméra
    iceRestarts: 0,
  };
  peers.set(peerId, state);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) sendSignal(peerId, { type: "ice", candidate });
  };

  pc.onnegotiationneeded = async () => {
    try {
      state.makingOffer = true;
      await pc.setLocalDescription();
      sendSignal(peerId, { type: "sdp", sdp: pc.localDescription });
    } catch (err) {
      console.error("Erreur négociation:", err);
    } finally {
      state.makingOffer = false;
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    routeRemoteStream(peerId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      state.iceRestarts = 0;
    } else if (pc.connectionState === "failed" && state.iceRestarts < 3) {
      // On ne supprime plus le participant : on retente la connexion.
      // La suppression se fait uniquement quand le serveur signale son départ.
      state.iceRestarts++;
      pc.restartIce();
    }
  };

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, localStream);
      if (track.kind === "video") state.videoSender = sender;
    });
  }
  if (isScreenSharing && screenStream) applyScreenToPeer(state);

  // Sans micro/caméra, on veut quand même recevoir l'audio et la vidéo.
  if (isOfferer) {
    if (!localStream || localStream.getAudioTracks().length === 0) {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }
    if (!localStream || localStream.getVideoTracks().length === 0) {
      pc.addTransceiver("video", { direction: "recvonly" });
    }
  }

  return state;
}

function callPeer(peerId) {
  // On annonce le partage d'écran AVANT l'offre pour que le pair
  // sache classer le flux d'écran à sa réception.
  if (isScreenSharing && screenStream) {
    sendSignal(peerId, { type: "screen", sharing: true, streamId: screenStream.id });
  }
  createPeerConnection(peerId, true);
}

async function processNegotiation(peerId, state, data) {
  const pc = state.pc;

  if (data.type === "sdp") {
    const description = data.sdp;
    const collision =
      description.type === "offer" && (state.makingOffer || pc.signalingState !== "stable");
    state.ignoreOffer = !state.polite && collision;
    if (state.ignoreOffer) return;

    await pc.setRemoteDescription(description);

    for (const candidate of state.pendingCandidates.splice(0)) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn("addIceCandidate (file d'attente):", err);
      }
    }

    if (description.type === "offer") {
      await pc.setLocalDescription();
      sendSignal(peerId, { type: "sdp", sdp: pc.localDescription });
    }
  } else if (data.type === "ice") {
    if (!data.candidate) return;
    if (!pc.remoteDescription) {
      state.pendingCandidates.push(data.candidate);
      return;
    }
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (err) {
      if (!state.ignoreOffer) console.warn("addIceCandidate:", err);
    }
  }
}

function handleSignal(from, data) {
  if (!data || typeof data !== "object") return;

  if (data.type === "screen") {
    const info = getInfo(from);
    ensureRemoteTile(from);
    if (data.sharing) {
      info.screenStreamId = data.streamId || null;
      info.screenActive = true;
    } else {
      info.screenStreamId = null;
      info.screenActive = false;
      info.screenStream = null;
    }
    updateTile(from);
    return;
  }

  if (data.type !== "sdp" && data.type !== "ice") return;

  let state = peers.get(from);
  if (!state) {
    if (data.type !== "sdp") return; // ICE sans connexion connue : ignoré
    ensureRemoteTile(from);
    state = createPeerConnection(from, false);
  }

  // Traitement strictement dans l'ordre d'arrivée, pair par pair.
  state.queue = state.queue
    .then(() => processNegotiation(from, state, data))
    .catch((err) => console.error("Erreur signalisation:", err));
}

function removePeer(peerId) {
  const state = peers.get(peerId);
  if (state) {
    state.pc.onconnectionstatechange = null;
    state.pc.close();
    peers.delete(peerId);
  }
  peerInfo.delete(peerId);
  peerAudioSettings.delete(peerId);
  const tile = $(`tile-${peerId}`);
  if (tile) {
    tile.querySelectorAll("video, audio").forEach((el) => (el.srcObject = null));
    tile.remove();
  }
  updateParticipantCount();
}

// ---------- Partage d'écran ----------
async function startScreenShare() {
  if (isScreenSharing) return;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    screenStream = stream;

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.contentHint = "detail";
      track.onended = () => stopScreenShare();
    }

    isScreenSharing = true;

    // On prévient chaque pair, puis on bascule sa piste vidéo sur l'écran.
    for (const [peerId, state] of peers) {
      sendSignal(peerId, { type: "screen", sharing: true, streamId: stream.id });
      applyScreenToPeer(state);
    }

    updateTile("local");
    updateControls();
  } catch (err) {
    console.error("Erreur partage écran:", err);
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return;
  isScreenSharing = false;

  for (const [peerId, state] of peers) {
    restoreCameraForPeer(state);
    sendSignal(peerId, { type: "screen", sharing: false });
  }

  if (screenStream) {
    screenStream.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    screenStream = null;
  }

  updateTile("local");
  updateControls();
}

function toggleScreenShare() {
  if (isScreenSharing) stopScreenShare();
  else startScreenShare();
}

// ---------- Détection de parole ----------
function startSpeakingDetection() {
  if (!localStream || micInterval) return;
  if (localStream.getAudioTracks().length === 0) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const source = audioContext.createMediaStreamSource(localStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    micInterval = setInterval(() => {
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = sum / data.length;
      const speaking = micEnabled && level > SETTINGS.speakingThreshold;
      if (speaking !== localSpeaking) {
        localSpeaking = speaking;
        updateTile("local");
        broadcast({ type: "speaking", speaking });
      }
    }, 120);
  } catch (err) {
    console.error("Erreur détection parole:", err);
  }
}

function stopSpeakingDetection() {
  if (micInterval) {
    clearInterval(micInterval);
    micInterval = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
}

function broadcast(data) {
  if (roomCode) socket.emit("broadcast", data);
}

function sendAvatar() {
  broadcast({ type: "avatar", avatar: { idle: avatarIdle, talking: avatarTalking } });
}

// ---------- Chat ----------
function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

function updateChatBadge() {
  chatBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
  chatBadge.classList.toggle("hidden", unreadCount === 0);
}

function isChatOpen() {
  return !chatPanel.classList.contains("hidden");
}

function addChatMessage(msg, silent) {
  if (!msg || typeof msg.text !== "string") return;

  const mine = msg.from === socket.id;
  const row = document.createElement("div");
  row.className = "chat-msg" + (mine ? " mine" : "");

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  meta.textContent = `${mine ? "Toi" : msg.name || "Anonyme"} · ${formatTime(msg.ts)}`;

  const body = document.createElement("div");
  body.className = "chat-text";
  body.textContent = msg.text; // textContent : pas d'injection HTML possible

  row.append(meta, body);
  chatMessages.appendChild(row);
  while (chatMessages.children.length > 200) chatMessages.firstChild.remove();
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!silent && !mine && !isChatOpen()) {
    unreadCount++;
    updateChatBadge();
  }
}

function openChat() {
  chatPanel.classList.remove("hidden");
  unreadCount = 0;
  updateChatBadge();
  chatMessages.scrollTop = chatMessages.scrollHeight;
  chatInput.focus();
}

function closeChat() {
  chatPanel.classList.add("hidden");
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !roomCode) return;
  socket.emit("chat", text);
  chatInput.value = "";
  chatInput.focus();
}

// ---------- Entrée / sortie d'appel ----------
function leaveCall() {
  if (isScreenSharing) stopScreenShare();

  peers.forEach((state) => {
    state.pc.onconnectionstatechange = null;
    state.pc.close();
  });
  peers.clear();
  peerInfo.clear();
  document.querySelectorAll(".video-tile:not(#local-tile)").forEach((t) => {
    t.querySelectorAll("video, audio").forEach((el) => (el.srcObject = null));
    t.remove();
  });

  stopSpeakingDetection();

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  localVideo.srcObject = null;

  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  isScreenSharing = false;
  localSpeaking = false;
  micEnabled = true;
  camEnabled = true;
  updateControls();

  if (socket.connected) socket.emit("leave-room");
  roomCode = null;

  chatMessages.textContent = "";
  closeChat();
  unreadCount = 0;
  updateChatBadge();
  audioUnlockBtn.classList.add("hidden");

  callScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
}

function enterCall() {
  homeScreen.classList.add("hidden");
  callScreen.classList.remove("hidden");
  roomLabel.textContent = `Salle: ${roomCode}`;
  localLabel.textContent = `${peerName} (Toi)`;
  if (renameInput) renameInput.value = peerName;
  updateParticipantCount();
  updateTile("local");
}

function releaseLocalMedia() {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  stopSpeakingDetection();
}

function registerForRoom(code) {
  const payload = {
    roomCode: code,
    peerName,
    avatar: { idle: avatarIdle, talking: avatarTalking },
  };

  socket.emit("join-room", payload, (response) => {
    if (!response || !response.success) {
      homeError.textContent = (response && response.error) || "Impossible de rejoindre.";
      releaseLocalMedia();
      return;
    }

    roomCode = response.roomCode || code;

    // Les avatars arrivent avec la liste des participants : plus de "avatar non défini".
    response.otherPeers.forEach((p) => {
      const info = getInfo(p.id);
      info.avatar = cleanAvatar(p.avatar);
      ensureRemoteTile(p.id, p.name);
    });

    (response.history || []).forEach((m) => addChatMessage(m, true));

    enterCall();
  });
}

async function createRoom() {
  homeError.textContent = "";
  peerName = nameInput.value.trim() || "Anonyme";
  await iceReady;
  await getLocalStream();
  registerForRoom(generateRoomCode());
}

async function joinRoom(code) {
  homeError.textContent = "";
  if (!code) {
    homeError.textContent = "Entre un code de salle.";
    return;
  }
  peerName = nameInput.value.trim() || "Anonyme";
  await iceReady;
  await getLocalStream();
  registerForRoom(code.toLowerCase());
}

// ---------- Avatars ----------
function readAvatarFile(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

function setAvatar(kind, value) {
  if (kind === "idle") {
    avatarIdle = value;
    storageSet("webrtcAvatarIdle", value);
  } else {
    avatarTalking = value;
    storageSet("webrtcAvatarTalking", value);
  }
  if (panelAvatarIdle && kind === "idle") panelAvatarIdle.value = value;
  if (panelAvatarTalking && kind === "talking") panelAvatarTalking.value = value;
  updateTile("local");
  sendAvatar();
}

avatarIdleFile.addEventListener("change", () => {
  readAvatarFile(avatarIdleFile.files[0], (dataUrl) => setAvatar("idle", dataUrl));
});

avatarTalkingFile.addEventListener("change", () => {
  readAvatarFile(avatarTalkingFile.files[0], (dataUrl) => setAvatar("talking", dataUrl));
});

avatarIdleInput.addEventListener("change", () => {
  setAvatar("idle", avatarIdleInput.value.trim());
});

avatarTalkingInput.addEventListener("change", () => {
  setAvatar("talking", avatarTalkingInput.value.trim());
});

// ---------- Événements UI ----------
bounceEnabledInput.addEventListener("change", () => {
  SETTINGS.bounceEnabled = bounceEnabledInput.checked;
  saveSettings();
  updateAllTiles();
});

bounceIntensityInput.addEventListener("input", () => {
  SETTINGS.bounceIntensity = parseFloat(bounceIntensityInput.value);
  bounceIntensityValue.textContent = SETTINGS.bounceIntensity.toFixed(2);
  saveSettings();
  updateAllTiles();
});

speakingThresholdInput.addEventListener("input", () => {
  SETTINGS.speakingThreshold = parseInt(speakingThresholdInput.value, 10);
  speakingThresholdValue.textContent = SETTINGS.speakingThreshold;
  saveSettings();
});

settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
if (settingsBtnSecondary) settingsBtnSecondary.addEventListener("click", () => settingsModal.classList.remove("hidden"));
if (panelToggle) panelToggle.addEventListener("click", () => rightPanel.classList.toggle("collapsed"));
if (panelClose) panelClose.addEventListener("click", () => rightPanel.classList.add("collapsed"));
if (showNamesToggle) {
  showNamesToggle.addEventListener("change", () => {
    callScreen.classList.toggle("hide-participant-names", !showNamesToggle.checked);
  });
}
settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));

if (renameSave) renameSave.addEventListener("click", () => {
  const nextName = (renameInput.value || "").trim().slice(0, 20) || "Anonyme";
  peerName = nextName;
  nameInput.value = nextName;
  localLabel.textContent = `${peerName} (Toi)`;
  renderParticipants();
  if (roomCode) {
    socket.emit("update-profile", { name: peerName, avatar: { idle: avatarIdle, talking: avatarTalking } }, (result) => {
      if (!result || !result.success) console.warn("Le changement de pseudo n'a pas été confirmé par le serveur.");
    });
  }
});

if (echoCancelToggle) echoCancelToggle.addEventListener("change", async () => {
  SETTINGS.echoCancellation = echoCancelToggle.checked;
  saveSettings();
  await applyLocalMediaSettings();
});
if (noiseSuppressionToggle) noiseSuppressionToggle.addEventListener("change", async () => {
  SETTINGS.noiseSuppression = noiseSuppressionToggle.checked;
  saveSettings();
  await applyLocalMediaSettings();
});
if (videoQualitySelect) videoQualitySelect.addEventListener("change", async () => {
  SETTINGS.videoHeight = Number(videoQualitySelect.value) || 720;
  saveSettings();
  await applyLocalMediaSettings();
});
if (videoFpsSelect) videoFpsSelect.addEventListener("change", async () => {
  SETTINGS.videoFps = Number(videoFpsSelect.value) || 24;
  saveSettings();
  await applyLocalMediaSettings();
});
if (avatarSave) avatarSave.addEventListener("click", () => {
  setAvatar("idle", (panelAvatarIdle.value || "").trim());
  setAvatar("talking", (panelAvatarTalking.value || "").trim());
});
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

chatBtn.addEventListener("click", () => (isChatOpen() ? closeChat() : openChat()));
chatClose.addEventListener("click", closeChat);
chatSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

audioUnlockBtn.addEventListener("click", () => {
  document.querySelectorAll("#video-grid audio, #video-grid video").forEach((el) => playMedia(el));
  if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(() => {});
  audioUnlockBtn.classList.add("hidden");
});

createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", () => joinRoom(joinCodeInput.value.trim()));

leaveBtn.addEventListener("click", leaveCall);
micBtn.addEventListener("click", toggleMic);
camBtn.addEventListener("click", toggleCam);
screenBtn.addEventListener("click", toggleScreenShare);

copyLinkBtn.addEventListener("click", () => {
  const url = `${window.location.origin}/?room=${roomCode}`;
  const done = () => {
    copyLinkBtn.textContent = "Copié !";
    setTimeout(() => (copyLinkBtn.textContent = "Copier le lien"), 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => window.prompt("Copie ce lien :", url));
  } else {
    window.prompt("Copie ce lien :", url);
  }
});

// ---------- Socket ----------
socket.on("connect", () => {
  console.log("Connecté au serveur de signalisation");
});

socket.on("disconnect", () => {
  if (roomCode) {
    leaveCall();
    homeError.textContent = "Connexion au serveur perdue. Rejoins l'appel à nouveau.";
  }
});

socket.on("peer-joined", ({ id, name, avatar }) => {
  const info = getInfo(id);
  info.avatar = cleanAvatar(avatar);
  ensureRemoteTile(id, name);
  callPeer(id);
});

socket.on("peer-left", ({ id }) => removePeer(id));

socket.on("peer-updated", ({ id, name, avatar }) => {
  const info = getInfo(id);
  info.name = name || info.name;
  if (avatar) info.avatar = cleanAvatar(avatar);
  const tile = $(`tile-${id}`);
  if (tile) {
    const label = tile.querySelector(".video-label");
    if (label) label.textContent = info.name;
  }
  updateTile(id);
  renderParticipants();
});

socket.on("signal", ({ from, data }) => handleSignal(from, data));

socket.on("broadcast", ({ from, data }) => {
  const info = peerInfo.get(from);
  if (!info || !data) return;
  if (data.type === "speaking") {
    info.speaking = !!data.speaking;
    updateTile(from);
  } else if (data.type === "avatar") {
    info.avatar = cleanAvatar(data.avatar);
    updateTile(from);
  }
});

socket.on("chat", (msg) => addChatMessage(msg, false));

// ---------- Démarrage ----------
loadSettings();
callScreen.classList.toggle("hide-participant-names", !showNamesToggle.checked);
updateStageEmpty();

const roomParam = new URLSearchParams(window.location.search).get("room");
if (roomParam) joinCodeInput.value = roomParam;
