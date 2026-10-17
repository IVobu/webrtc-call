const socket = io();

const homeScreen = document.getElementById("home-screen");
const callScreen = document.getElementById("call-screen");
const nameInput = document.getElementById("name-input");
const createBtn = document.getElementById("create-btn");
const joinCodeInput = document.getElementById("join-code-input");
const joinBtn = document.getElementById("join-btn");
const homeError = document.getElementById("home-error");
const mediaStatus = document.getElementById("media-status");

const roomLabel = document.getElementById("room-label");
const copyLinkBtn = document.getElementById("copy-link-btn");
const copyCodeBtn = document.getElementById("copy-code-btn");
const copyOverlayLinkBtn = document.getElementById("copy-overlay-link-btn");
const leaveBtn = document.getElementById("leave-btn");
const videoGrid = document.getElementById("video-grid");
const avatarStrip = document.getElementById("avatar-strip");
const participantsList = document.getElementById("participants-list");
const callLayout = document.querySelector(".call-layout");
const participantsResizer = document.getElementById("participants-resizer");
const settingsResizer = document.getElementById("settings-resizer");
const participantsDockBtn = document.getElementById("participants-dock-btn");
const settingsDockBtn = document.getElementById("settings-dock-btn");
const showAvatarsInput = document.getElementById("show-avatars");
const localVideo = document.getElementById("local-video");
const localShares = document.getElementById("local-shares");
const localAvatar = document.getElementById("local-avatar");
const localAvatarFallback = document.getElementById("local-avatar-fallback");
const avatarIdleInput = document.getElementById("avatar-idle-input");
const avatarTalkingInput = document.getElementById("avatar-talking-input");
const avatarIdlePreview = document.getElementById("avatar-idle-preview");
const avatarTalkingPreview = document.getElementById("avatar-talking-preview");
const avatarStatus = document.getElementById("avatar-status");
const callAvatarIdleInput = document.getElementById("call-avatar-idle-input");
const callAvatarTalkingInput = document.getElementById("call-avatar-talking-input");
const callAvatarIdlePreview = document.getElementById("call-avatar-idle-preview");
const callAvatarTalkingPreview = document.getElementById("call-avatar-talking-preview");
const callAvatarStatus = document.getElementById("call-avatar-status");
const avatarBounceInput = document.getElementById("avatar-bounce");
const avatarDimIdleInput = document.getElementById("avatar-dim-idle");
const localLabel = document.getElementById("local-label");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const screenBtn = document.getElementById("screen-btn");
const participantCount = document.getElementById("participant-count");
const audioSettingsStatus = document.getElementById("audio-settings-status");
const audioDeviceSelect = document.getElementById("audio-device-select");
const cameraDeviceSelect = document.getElementById("camera-device-select");
const audioFilterControls = [
  { key: "echoCancellation", label: "annulation de l'écho", input: document.getElementById("echo-cancellation") },
  { key: "noiseSuppression", label: "réduction du bruit", input: document.getElementById("noise-suppression") },
  { key: "autoGainControl", label: "volume automatique", input: document.getElementById("auto-gain-control") },
];
const screenResolutionInput = document.getElementById("screen-resolution");
const screenFrameRateInput = document.getElementById("screen-frame-rate");
const screenShareStatus = document.getElementById("screen-share-status");

const supportedAudioConstraints = navigator.mediaDevices &&
  typeof navigator.mediaDevices.getSupportedConstraints === "function"
  ? navigator.mediaDevices.getSupportedConstraints()
  : {};

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

let localStream = null;
const shareSources = new Map();
const MAX_SCREEN_SHARES = 2;
let nextShareId = 1;
let pendingScreenShares = 0;
let screenShareNotice = "";
let isScreenSharing = false;
let micEnabled = true;
let camEnabled = true;
let roomCode = null;
let peerName = "";
let localPeerId = "";
let audioTrackCapabilities = null;
let audioFiltersApplying = false;
let audioSettingsNotice = "";
const peers = new Map();
const audioSenders = new Map();
const videoSenders = new Map();
const shareSenders = new Map();
const shareAudioSenders = new Map();
const shareSetup = new Map();
const remoteVideos = new Map();
const remoteTiles = new Map();
const remoteAudio = new Map();
const remoteShareAudio = new Map();
const participantRows = new Map();
let localParticipantRow = null;
let activeAudioDeviceId = "";
let activeCameraDeviceId = "";
let switchingAudioDevice = false;
let switchingCameraDevice = false;
const MAX_AVATAR_FILE_BYTES = 250 * 1024;
const AVATAR_STORAGE_KEY = "webrtc-call-avatar-v1";
const NAME_STORAGE_KEY = "webrtc-call-name-v1";
const LAYOUT_STORAGE_KEY = "webrtc-call-layout-v1";
const AVATARS_STORAGE_KEY = "webrtc-call-show-avatars-v1";
const LEGACY_PSEUDONYMS_STORAGE_KEY = "webrtc-call-show-pseudonyms-v1";
const DEFAULT_LAYOUT = { participantsWidth: 220, settingsWidth: 260, participantsDocked: false, settingsDocked: false };
let layoutPreferences = { ...DEFAULT_LAYOUT };
const allowedAvatarTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const avatarSignatures = {
  "image/png": (bytes) =>
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  "image/jpeg": (bytes) =>
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/gif": (bytes) => {
    if (bytes.length < 6) return false;
    const header = String.fromCharCode(...bytes.subarray(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  },
  "image/webp": (bytes) =>
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP",
};
let localAvatarProfile = { idle: "", talking: "", bounce: true, dimIdle: true };
let localSpeaking = false;
let speakingContext = null;
let speakingSource = null;
let speakingAnalyser = null;
let speakingTimer = null;
const remoteAvatarProfiles = new Map();
const remoteSpeakingStates = new Map();
const remoteCameraStates = new Map();

function isValidAvatarDataUrl(value) {
  return typeof value === "string" &&
    value.length <= 350_000 &&
    /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function setAvatarImage(image, fallback, source) {
  if (source && isValidAvatarDataUrl(source)) {
    image.src = source;
    image.classList.remove("hidden");
    fallback.classList.add("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    fallback.classList.remove("hidden");
  }
}

function updateLocalAvatar() {
  localAvatar.classList.toggle("avatar-bounce", localSpeaking && localAvatarProfile.bounce);
  localAvatar.classList.toggle("avatar-idle-dim", !localSpeaking && localAvatarProfile.dimIdle);
  localAvatarFallback.classList.toggle("avatar-bounce", localSpeaking && localAvatarProfile.bounce);
  localAvatarFallback.classList.toggle("avatar-idle-dim", !localSpeaking && localAvatarProfile.dimIdle);
  if (camEnabled) {
    localAvatar.classList.add("hidden");
    localAvatarFallback.classList.add("hidden");
    const activeTile = document.getElementById("local-tile");
    if (activeTile) activeTile.classList.toggle("speaking", localSpeaking);
    return;
  }
  const source = localSpeaking
    ? localAvatarProfile.talking || localAvatarProfile.idle
    : localAvatarProfile.idle || localAvatarProfile.talking;
  setAvatarImage(localAvatar, localAvatarFallback, source);
  const localTile = document.getElementById("local-tile");
  if (localTile) localTile.classList.toggle("speaking", localSpeaking);
}

function updateRemoteAvatar(peerId) {
  const videos = remoteVideos.get(peerId);
  if (!videos) return;
  const primaryVideo = videos.get("primary") || videos.get("camera");
  if (!primaryVideo) return;
  const tile = primaryVideo.closest(".video-tile");
  const image = tile.querySelector(".avatar-view");
  const fallback = tile.querySelector(".avatar-fallback");
  if (!image || !fallback) return;
  const profile = remoteAvatarProfiles.get(peerId) || { idle: "", talking: "" };
  const speaking = remoteSpeakingStates.get(peerId) || false;
  image.classList.toggle("avatar-bounce", speaking && profile.bounce);
  image.classList.toggle("avatar-idle-dim", !speaking && profile.dimIdle);
  fallback.classList.toggle("avatar-bounce", speaking && profile.bounce);
  fallback.classList.toggle("avatar-idle-dim", !speaking && profile.dimIdle);
  const cameraEnabled = Boolean(remoteCameraStates.get(peerId) && primaryVideo.srcObject);
  if (cameraEnabled) {
    image.classList.add("hidden");
    fallback.classList.add("hidden");
    tile.classList.toggle("speaking", speaking);
    return;
  }
  setAvatarImage(
    image,
    fallback,
    speaking ? profile.talking || profile.idle : profile.idle || profile.talking
  );
  tile.classList.toggle("speaking", speaking);
}

function emitToPeers(data) {
  peers.forEach((_pc, peerId) => {
    socket.emit("signal", { to: peerId, data });
  });
}

function sendAvatarProfile(to) {
  const data = {
    type: "avatar-profile",
    idle: localAvatarProfile.idle,
    talking: localAvatarProfile.talking,
    bounce: localAvatarProfile.bounce,
    dimIdle: localAvatarProfile.dimIdle,
    speaking: localSpeaking,
    camera: camEnabled,
  };
  socket.emit("overlay-state-update", data);
  if (to) socket.emit("signal", { to, data });
  else emitToPeers(data);
}

function setRemoteSpeaking(peerId, speaking) {
  remoteSpeakingStates.set(peerId, speaking);
  updateRemoteAvatar(peerId);
}

function setRemoteCameraState(peerId, enabled) {
  remoteCameraStates.set(peerId, enabled);
  const videos = remoteVideos.get(peerId);
  const video = videos && (videos.get("camera") || videos.get("primary"));
  if (!video) return;
  video.classList.toggle("hidden", !enabled || !video.srcObject);
  updateRemoteAvatar(peerId);
}

function publishCameraState(enabled) {
  emitToPeers({ type: "camera-state", enabled });
}

function setLocalSpeaking(speaking) {
  if (localSpeaking === speaking) return;
  localSpeaking = speaking;
  updateLocalAvatar();
  socket.emit("overlay-state-update", { speaking });
  emitToPeers({ type: "avatar-state", speaking });
}

function stopVoiceDetection() {
  if (speakingTimer !== null) clearInterval(speakingTimer);
  speakingTimer = null;
  if (speakingAnalyser) {
    try {
      speakingAnalyser.disconnect();
    } catch (error) {
      console.error("Erreur d'arrêt de la détection vocale:", error);
    }
  }
  speakingAnalyser = null;
  if (speakingSource) {
    try {
      speakingSource.disconnect();
    } catch (error) {
      console.error("Erreur de déconnexion du micro pour la détection vocale:", error);
    }
  }
  speakingSource = null;
  setLocalSpeaking(false);
  if (speakingContext) {
    speakingContext.close().catch((error) => {
      console.error("Erreur de fermeture du contexte audio:", error);
    });
  }
  speakingContext = null;
}

async function startVoiceDetection(track) {
  stopVoiceDetection();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !track) return;

  try {
    speakingContext = new AudioContextClass();
    speakingAnalyser = speakingContext.createAnalyser();
    speakingAnalyser.fftSize = 256;
    speakingAnalyser.smoothingTimeConstant = 0;
    speakingSource = speakingContext.createMediaStreamSource(new MediaStream([track]));
    speakingSource.connect(speakingAnalyser);
    await speakingContext.resume();
    const samples = new Uint8Array(speakingAnalyser.fftSize);
    let aboveThreshold = 0;
    let belowThreshold = 0;
    speakingTimer = setInterval(() => {
      if (!track.enabled || track.readyState === "ended") {
        aboveThreshold = 0;
        belowThreshold = 2;
      } else {
        speakingAnalyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const amplitude = (samples[index] - 128) / 128;
          sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / samples.length);
        if (rms > (localSpeaking ? 0.025 : 0.04)) {
          aboveThreshold += 1;
          belowThreshold = 0;
        } else {
          belowThreshold += 1;
          aboveThreshold = 0;
        }
      }
      if (aboveThreshold >= 2) setLocalSpeaking(true);
      if (belowThreshold >= 2) setLocalSpeaking(false);
    }, 120);
  } catch (error) {
    console.error("Détection du niveau vocal indisponible:", error);
    stopVoiceDetection();
  }
}

function renderAvatarPreviews() {
  for (const [preview, source] of [
    [avatarIdlePreview, localAvatarProfile.idle],
    [callAvatarIdlePreview, localAvatarProfile.idle],
    [avatarTalkingPreview, localAvatarProfile.talking],
    [callAvatarTalkingPreview, localAvatarProfile.talking],
  ]) {
    if (source) {
      preview.src = source;
      preview.classList.remove("hidden");
    } else {
      preview.removeAttribute("src");
      preview.classList.add("hidden");
    }
  }
  updateLocalAvatar();
}

function loadAvatarProfile() {
  try {
    const stored = JSON.parse(localStorage.getItem(AVATAR_STORAGE_KEY) || "{}");
    localAvatarProfile = {
      idle: isValidAvatarDataUrl(stored.idle) ? stored.idle : "",
      talking: isValidAvatarDataUrl(stored.talking) ? stored.talking : "",
      bounce: typeof stored.bounce === "boolean" ? stored.bounce : true,
      dimIdle: typeof stored.dimIdle === "boolean" ? stored.dimIdle : true,
    };
  } catch (error) {
    console.error("Impossible de charger les avatars enregistrés:", error);
    localAvatarProfile = { idle: "", talking: "", bounce: true, dimIdle: true };
  }
  avatarBounceInput.checked = localAvatarProfile.bounce;
  avatarDimIdleInput.checked = localAvatarProfile.dimIdle;
  renderAvatarPreviews();
}

function saveAvatarPreferences() {
  localAvatarProfile.bounce = avatarBounceInput.checked;
  localAvatarProfile.dimIdle = avatarDimIdleInput.checked;
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(localAvatarProfile));
  } catch (error) {
    console.error("Impossible d'enregistrer les préférences d'avatar:", error);
    avatarStatus.textContent = "Préférence appliquée, mais impossible à enregistrer sur cet appareil.";
  }
  updateLocalAvatar();
  sendAvatarProfile();
}

async function importAvatar(input, profileKey, preview, statusElement = avatarStatus) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!allowedAvatarTypes.has(file.type) || file.size > MAX_AVATAR_FILE_BYTES) {
    statusElement.textContent = "Choisis un PNG, JPEG, GIF ou WebP de 250 Ko maximum. Les SVG et autres formats ne sont pas acceptés.";
    input.value = "";
    return;
  }

  try {
    if (typeof file.arrayBuffer !== "function") {
      throw new Error("Lecture binaire du fichier non disponible.");
    }
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (!avatarSignatures[file.type](fileBytes)) {
      throw new Error("Le contenu du fichier ne correspond pas à son type image.");
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Lecture du fichier impossible."));
      reader.readAsDataURL(file);
    });
    if (!isValidAvatarDataUrl(dataUrl)) throw new Error("Format d'image non reconnu.");
    localAvatarProfile[profileKey] = dataUrl;
    preview.src = dataUrl;
    preview.classList.remove("hidden");
    renderAvatarPreviews();
    let saved = true;
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(localAvatarProfile));
    } catch (storageError) {
      console.error("Impossible de sauvegarder les avatars localement:", storageError);
      saved = false;
    }
    statusElement.textContent = !saved
      ? "Avatar chargé pour cet appel, mais impossible à enregistrer sur cet appareil."
      : peers.size
        ? "Avatar chargé et partagé avec les participants de l'appel."
        : "Avatar chargé. Il sera partagé au début de l'appel.";
    sendAvatarProfile();
    input.value = "";
  } catch (error) {
    console.error("Erreur d'import de l'avatar:", error);
    statusElement.textContent = "Fichier image invalide ou illisible. Essaie un PNG, JPEG, GIF ou WebP exporté.";
  }
}

function generateRoomCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoomCodeFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("room");
  return code && /^[a-z0-9]{3,10}$/i.test(code) ? code : "";
}

function makeRoomLink(code = roomCode) {
  const url = new URL("/", window.location.origin);
  if (code) url.hash = new URLSearchParams({ room: code }).toString();
  return url.toString();
}

function makeOverlayLink(code = roomCode, peerId = "") {
  const url = new URL("/overlay.html", window.location.origin);
  if (code) {
    const params = new URLSearchParams({ room: code });
    if (peerId) params.set("peer", peerId);
    url.hash = params.toString();
  }
  return url.toString();
}

function clearRoomCodeFromAddress() {
  if (!window.location.hash || !window.history || typeof window.history.replaceState !== "function") return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function saveName() {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, nameInput.value);
  } catch (error) {
    console.error("Impossible d'enregistrer le pseudo localement:", error);
    homeError.textContent = "Pseudo conservé uniquement pour cette visite.";
  }
}

function loadName() {
  try {
    nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) || "";
  } catch (error) {
    console.error("Impossible de charger le pseudo enregistré:", error);
  }
}

function clampPanelWidth(value, minimum, maximum) {
  const width = Number(value);
  return Number.isFinite(width) ? Math.min(maximum, Math.max(minimum, width)) : minimum;
}

function loadLayoutPreferences() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("Impossible de charger la disposition enregistrée:", error);
  }
  const layout = {
    participantsWidth: clampPanelWidth(
      saved.participantsWidth === undefined ? DEFAULT_LAYOUT.participantsWidth : saved.participantsWidth,
      190,
      360
    ),
    settingsWidth: clampPanelWidth(
      saved.settingsWidth === undefined ? DEFAULT_LAYOUT.settingsWidth : saved.settingsWidth,
      220,
      380
    ),
    participantsDocked: saved.participantsDocked === true,
    settingsDocked: saved.settingsDocked === true,
  };
  applyLayoutPreferences(layout);
  return layout;
}

function saveLayoutPreferences() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutPreferences));
  } catch (error) {
    console.error("Impossible d'enregistrer la disposition:", error);
  }
}

function applyLayoutPreferences(layout = layoutPreferences) {
  layoutPreferences = {
    participantsWidth: clampPanelWidth(layout.participantsWidth, 190, 360),
    settingsWidth: clampPanelWidth(layout.settingsWidth, 220, 380),
    participantsDocked: layout.participantsDocked === true,
    settingsDocked: layout.settingsDocked === true,
  };
  callLayout.style.setProperty(
    "--participants-width",
    `${layoutPreferences.participantsDocked ? 54 : layoutPreferences.participantsWidth}px`
  );
  callLayout.style.setProperty(
    "--settings-width",
    `${layoutPreferences.settingsDocked ? 54 : layoutPreferences.settingsWidth}px`
  );
  callLayout.classList.toggle("participants-docked", layoutPreferences.participantsDocked);
  callLayout.classList.toggle("settings-docked", layoutPreferences.settingsDocked);
  participantsDockBtn.textContent = layoutPreferences.participantsDocked ? "Déployer" : "Ancrer";
  participantsDockBtn.title = layoutPreferences.participantsDocked
    ? "Déployer le panneau depuis le bord gauche"
    : "Ancrer le panneau au bord gauche";
  participantsDockBtn.setAttribute("aria-pressed", String(layoutPreferences.participantsDocked));
  settingsDockBtn.textContent = layoutPreferences.settingsDocked ? "Déployer" : "Ancrer";
  settingsDockBtn.title = layoutPreferences.settingsDocked
    ? "Déployer le panneau depuis le bord droit"
    : "Ancrer le panneau au bord droit";
  settingsDockBtn.setAttribute("aria-pressed", String(layoutPreferences.settingsDocked));
}

function resizePanelFromPointer(event, panelName, resizer) {
  if (window.innerWidth <= 1000 || event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = panelName === "participants"
    ? layoutPreferences.participantsWidth
    : layoutPreferences.settingsWidth;
  const direction = panelName === "participants" ? 1 : -1;
  const minimum = panelName === "participants" ? 190 : 220;
  const maximum = panelName === "participants" ? 360 : 380;
  resizer.classList.add("dragging");
  const move = (moveEvent) => {
    const width = clampPanelWidth(startWidth + (moveEvent.clientX - startX) * direction, minimum, maximum);
    if (panelName === "participants") layoutPreferences.participantsWidth = width;
    else layoutPreferences.settingsWidth = width;
    applyLayoutPreferences();
  };
  const end = () => {
    resizer.classList.remove("dragging");
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    saveLayoutPreferences();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end, { once: true });
}

function resizePanelFromKeyboard(event, panelName) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const delta = event.key === "ArrowRight" ? 16 : -16;
  if (panelName === "participants") {
    layoutPreferences.participantsWidth = clampPanelWidth(
      layoutPreferences.participantsWidth + delta,
      190,
      360
    );
  } else {
    layoutPreferences.settingsWidth = clampPanelWidth(
      layoutPreferences.settingsWidth - delta,
      220,
      380
    );
  }
  applyLayoutPreferences();
  saveLayoutPreferences();
}

function setAvatarsVisible(visible, persist = true) {
  showAvatarsInput.checked = visible;
  callScreen.classList.toggle("avatars-hidden", !visible);
  if (!persist) return;
  try {
    localStorage.setItem(AVATARS_STORAGE_KEY, String(visible));
  } catch (error) {
    console.error("Impossible d'enregistrer la préférence d'affichage des avatars:", error);
  }
}

function loadAvatarVisibilityPreference() {
  let visible = true;
  try {
    const stored = localStorage.getItem(AVATARS_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_PSEUDONYMS_STORAGE_KEY);
    if (stored === "false") visible = false;
  } catch (error) {
    console.error("Impossible de lire la préférence d'affichage des avatars:", error);
  }
  setAvatarsVisible(visible, false);
}

function isAudioFilterSupported(key) {
  return Boolean(supportedAudioConstraints[key]) &&
    (!audioTrackCapabilities || Object.prototype.hasOwnProperty.call(audioTrackCapabilities, key));
}

function getAudioFilterConstraints() {
  const constraints = {};
  audioFilterControls.forEach(({ key, input }) => {
    if (isAudioFilterSupported(key)) {
      constraints[key] = { ideal: input.checked };
    }
  });
  return constraints;
}

function addPreferredDevice(constraints, deviceId) {
  if (deviceId) constraints.deviceId = { exact: deviceId };
  return constraints;
}

function getSelectedCameraConstraints() {
  const deviceId = cameraDeviceSelect.value;
  if (deviceId === "__off__") return false;
  const constraints = getVideoConstraints();
  return deviceId && deviceId !== "__default__"
    ? addPreferredDevice(constraints, deviceId)
    : constraints;
}

function replaceSelectOptions(select, devices, defaultOption) {
  const selectedValue = select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = defaultOption.value;
  placeholder.textContent = defaultOption.label;
  select.appendChild(placeholder);
  if (defaultOption.secondary) {
    const secondary = document.createElement("option");
    secondary.value = defaultOption.secondary.value;
    secondary.textContent = defaultOption.secondary.label;
    select.appendChild(secondary);
  }

  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `${defaultOption.deviceLabel} ${index + 1}`;
    select.appendChild(option);
  });

  const available = devices.some((device) => device.deviceId === selectedValue);
  const isSecondary = defaultOption.secondary && selectedValue === defaultOption.secondary.value;
  select.value = available || isSecondary ? selectedValue : defaultOption.value;
  return available;
}

async function refreshInputDevices() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
    mediaStatus.textContent = "La liste des périphériques n'est pas disponible dans ce navigateur.";
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter((device) => device.kind === "audioinput");
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const audioSelectedAvailable = replaceSelectOptions(audioDeviceSelect, audioDevices, {
      value: "",
      label: "Microphone par défaut",
      deviceLabel: "Microphone",
    });
    const cameraSelectedAvailable = replaceSelectOptions(cameraDeviceSelect, videoDevices, {
      value: "__default__",
      label: "Caméra par défaut",
      deviceLabel: "Caméra",
      secondary: { value: "__off__", label: "Caméra désactivée" },
    });

    if (activeAudioDeviceId && !audioDevices.some((device) => device.deviceId === activeAudioDeviceId)) {
      mediaStatus.textContent = "Le microphone actif a été débranché. Choisis un autre périphérique d'entrée.";
    } else if (activeCameraDeviceId && !videoDevices.some((device) => device.deviceId === activeCameraDeviceId)) {
      mediaStatus.textContent = "La caméra active a été débranchée. Choisis une autre caméra ou désactive-la.";
    } else if ((!audioSelectedAvailable && audioDeviceSelect.value) ||
               (!cameraSelectedAvailable && cameraDeviceSelect.value !== "__default__" &&
                cameraDeviceSelect.value !== "__off__")) {
      mediaStatus.textContent = "Un périphérique sélectionné n'est plus disponible. Choisis-en un autre.";
    }
  } catch (error) {
    console.error("Erreur de liste des périphériques:", error);
    mediaStatus.textContent = "Impossible de lire la liste des périphériques. Vérifie les permissions et réessaie.";
  }
}

function refreshAudioFilterControls() {
  const unsupported = [];
  audioFilterControls.forEach(({ key, label, input }) => {
    const supported = isAudioFilterSupported(key);
    input.disabled = audioFiltersApplying || !supported;
    if (!supported) unsupported.push(label);
  });

  const track = localStream && localStream.getAudioTracks()[0];
  const settings = track && typeof track.getSettings === "function" ? track.getSettings() : {};
  const filterStates = audioFilterControls
    .filter(({ key }) => isAudioFilterSupported(key))
    .map(({ key, label, input }) => {
      const enabled = typeof settings[key] === "boolean" ? settings[key] : input.checked;
      return `${label} ${enabled ? "activé" : "désactivé"}`;
    });
  const status = track
    ? `État du navigateur : ${filterStates.join(", ")}.`
    : localStream
      ? "Aucune piste micro n'est active ; les filtres audio ne s'appliquent pas à cet appel."
      : "Les options cochées seront demandées au navigateur au démarrage.";
  const unavailable = unsupported.length
    ? ` Non disponible : ${unsupported.join(", ")}.`
    : "";
  audioSettingsStatus.textContent = `${status}${unavailable} ${audioSettingsNotice}`.trim();
}

async function applyAudioFilterChanges(event) {
  const track = localStream && localStream.getAudioTracks()[0];
  if (!track) {
    audioSettingsNotice = "";
    refreshAudioFilterControls();
    return;
  }

  const input = event.currentTarget;
  const previousValue = !input.checked;
  if (typeof track.applyConstraints !== "function") {
    input.checked = previousValue;
    audioSettingsNotice = "Ce navigateur ne permet pas de modifier les filtres pendant l'appel.";
    refreshAudioFilterControls();
    return;
  }

  audioFiltersApplying = true;
  audioSettingsNotice = "";
  refreshAudioFilterControls();
  try {
    await track.applyConstraints(getAudioFilterConstraints());
  } catch (err) {
    input.checked = previousValue;
    audioSettingsNotice = `Modification impossible : ${err.message}`;
    console.error("Erreur application des filtres audio:", err);
  } finally {
    audioFiltersApplying = false;
    refreshAudioFilterControls();
  }
}

function getVideoConstraints() {
  return { width: { ideal: 1280 }, height: { ideal: 720 } };
}

async function acquireLocalMedia() {
  const audioConstraints = addPreferredDevice(
    getAudioFilterConstraints(),
    audioDeviceSelect.value
  );
  const audioStream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: false,
  });
  const audioTracks = audioStream.getAudioTracks();
  if (!audioTracks.length) {
    audioStream.getTracks().forEach((track) => track.stop());
    throw new Error("Le navigateur n'a fourni aucune piste micro.");
  }

  activeAudioDeviceId = audioTracks[0].getSettings().deviceId || audioDeviceSelect.value;
  await refreshInputDevices();
  if (activeAudioDeviceId) audioDeviceSelect.value = activeAudioDeviceId;

  await refreshInputDevices();

  return {
    stream: new MediaStream(audioTracks),
    warning: "Caméra désactivée par défaut. Active-la avec « Caméra » si tu en as besoin.",
  };
}

function getMediaAccessErrorMessage(error, device = "microphone") {
  const deviceLabel = device === "caméra" ? "la caméra" : "le microphone";
  const devicePreposition = device === "caméra" ? "à la caméra" : "au microphone";
  const deviceBusyMessage = device === "caméra"
    ? "La caméra est occupée ou bloquée par le système."
    : "Le microphone est occupé ou bloqué par le système.";
  const unsupportedDeviceMessage = device === "caméra"
    ? "La caméra ne prend pas en charge les réglages demandés."
    : "Le microphone ne prend pas en charge les réglages demandés.";
  if (window.isSecureContext === false || !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function") {
    return `Accès ${devicePreposition} indisponible : ouvre l'adresse HTTPS dans un navigateur récent.`;
  }

  switch (error && error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return `L'accès ${devicePreposition} a été refusé par le navigateur ou le système. Vérifie les permissions de cet appareil pour le site.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `Aucun appareil compatible pour ${deviceLabel} n'a été détecté. Branche ou active-le, puis réessaie.`;
    case "NotReadableError":
    case "TrackStartError":
      return `${deviceBusyMessage} Ferme les autres applications qui l'utilisent, puis réessaie.`;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return `${unsupportedDeviceMessage} Essaie un autre appareil ou navigateur.`;
    case "SecurityError":
      return `Le navigateur a bloqué l'accès ${devicePreposition}. Utilise l'adresse HTTPS et vérifie les permissions du site.`;
    default:
      return `Impossible d'ouvrir ${deviceLabel} (${error && error.name ? error.name : "erreur inconnue"}). Vérifie les permissions du navigateur et du système.`;
  }
}

async function getLocalStream() {
  try {
    if (window.isSecureContext === false || !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw new Error("Le navigateur ne fournit pas getUserMedia dans ce contexte.");
    }

    const result = await acquireLocalMedia();
    localStream = result.stream;
    mediaStatus.textContent = result.warning;
    micEnabled = true;
    camEnabled = false;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) watchInputTrack(audioTrack, "audio");
    localStream.getVideoTracks().forEach((track) => watchInputTrack(track, "video"));
    startVoiceDetection(audioTrack);
    audioTrackCapabilities = audioTrack && typeof audioTrack.getCapabilities === "function"
      ? audioTrack.getCapabilities()
      : null;
    audioSettingsNotice = "";
    homeError.textContent = "";
    refreshAudioFilterControls();
    localVideo.srcObject = localStream;
    updateControls();
    return true;
  } catch (err) {
    console.error("Erreur getUserMedia:", err);
    audioSettingsNotice = getMediaAccessErrorMessage(err, "micro");
    homeError.textContent = audioSettingsNotice;
    refreshAudioFilterControls();
    return false;
  }
}

function updateControls() {
  micBtn.classList.toggle("active", micEnabled);
  micBtn.classList.toggle("danger", !micEnabled);
  micBtn.title = micEnabled ? "Couper le micro" : "Activer le micro";
  micBtn.setAttribute("aria-label", micBtn.title);
  micBtn.setAttribute("aria-pressed", String(micEnabled));
  camBtn.classList.toggle("active", camEnabled);
  camBtn.classList.toggle("danger", !camEnabled);
  camBtn.title = camEnabled ? "Désactiver la caméra" : "Activer la caméra";
  camBtn.setAttribute("aria-label", camBtn.title);
  camBtn.setAttribute("aria-pressed", String(camEnabled));
  screenBtn.classList.toggle("active", isScreenSharing);
  screenBtn.classList.toggle("danger", isScreenSharing);
  screenBtn.title = isScreenSharing ? "Arrêter le partage d'écran" : "Partager un écran ou une fenêtre";
  screenBtn.setAttribute("aria-label", screenBtn.title);
  screenBtn.setAttribute("aria-pressed", String(isScreenSharing));
  localVideo.classList.toggle("hidden", !camEnabled);
  updateLocalAvatar();
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: peerId, data: { type: "ice", candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    if (event.track.kind === "audio") {
      const peerShareAudioSenders = shareAudioSenders.get(peerId) || [];
      const shareAudioSlot = event.transceiver
        ? peerShareAudioSenders.indexOf(event.transceiver.sender)
        : -1;
      if (shareAudioSlot >= 0) {
        attachRemoteShareAudio(peerId, shareAudioSlot, event.track);
      } else {
        const audio = remoteAudio.get(peerId);
        if (audio) audio.srcObject = new MediaStream([event.track]);
      }
      return;
    }
    if (event.track.kind !== "video") return;
    const stream = event.streams[0] || new MediaStream([event.track]);
    const peerStreamVideos = remoteVideos.get(peerId);
    if (!peerStreamVideos) return;
    const peerShareSlots = shareSenders.get(peerId) || [];
    const shareSlot = event.transceiver
      ? peerShareSlots.indexOf(event.transceiver.sender)
      : -1;
    const streamKey = shareSlot >= 0 ? `share-${shareSlot}` : "camera";
    let video = peerStreamVideos.get(streamKey);
    if (!video) {
      if (shareSlot >= 0) {
        const tile = document.createElement("div");
        tile.className = "video-tile share-tile";
        const extraVideo = document.createElement("video");
        extraVideo.autoplay = true;
        extraVideo.playsInline = true;
        extraVideo.muted = false;
        extraVideo.classList.add("screen-share");
        const label = document.createElement("span");
        label.className = "video-label share-label";
        label.textContent = `Partage ${shareSlot + 1}`;
        const visibilityButton = document.createElement("button");
        visibilityButton.type = "button";
        visibilityButton.className = "share-visibility-btn";
        visibilityButton.textContent = "Masquer";
        visibilityButton.setAttribute("aria-pressed", "false");
        visibilityButton.addEventListener("click", () => {
          const hidden = extraVideo.classList.toggle("hidden");
          visibilityButton.textContent = hidden ? "Afficher" : "Masquer";
          visibilityButton.setAttribute("aria-pressed", String(hidden));
        });
        tile.append(extraVideo, label, visibilityButton);
        ensureRemoteShareAudioControls(peerId, shareSlot, tile);
        videoGrid.appendChild(tile);
        remoteTiles.get(peerId).push(tile);
        video = extraVideo;
      } else {
        video = peerStreamVideos.get("camera") || peerStreamVideos.get("primary");
      }
      peerStreamVideos.set(streamKey, video);
    }
    video.srcObject = stream;
    if (shareSlot < 0) {
      video.classList.toggle("hidden", !remoteCameraStates.get(peerId));
      updateRemoteAvatar(peerId);
    }
    event.track.addEventListener("ended", () => {
      if (video.srcObject !== stream) return;
      video.srcObject = null;
      const currentVideos = remoteVideos.get(peerId);
      if (!currentVideos || video !== currentVideos.get(streamKey)) return;
      if (shareSlot >= 0) {
        removeRemoteShare(peerId, shareSlot);
        return;
      }
      currentVideos.delete(streamKey);
      const tile = video.closest(".video-tile");
      if (tile && tile !== remoteTiles.get(peerId)[0]) {
        tile.remove();
        const tiles = remoteTiles.get(peerId);
        tiles.splice(tiles.indexOf(tile), 1);
      }
    }, { once: true });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      removePeer(peerId);
    }
  };

  const cameraTrack = localStream && localStream.getVideoTracks()[0];
  const audioTrack = localStream && localStream.getAudioTracks()[0];
  const audioSender = audioTrack
    ? pc.addTrack(audioTrack, localStream)
    : pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
  const videoSender = cameraTrack
    ? pc.addTrack(cameraTrack, localStream)
    : pc.addTransceiver("video", { direction: "sendrecv" }).sender;
  const peerShareSenders = Array.from({ length: MAX_SCREEN_SHARES }, () =>
    pc.addTransceiver("video", { direction: "sendrecv" }).sender
  );
  const peerShareAudioSenders = Array.from({ length: MAX_SCREEN_SHARES }, () =>
    pc.addTransceiver("audio", { direction: "sendrecv" }).sender
  );

  peers.set(peerId, pc);
  audioSenders.set(peerId, audioSender);
  videoSenders.set(peerId, videoSender);
  shareSenders.set(peerId, peerShareSenders);
  shareAudioSenders.set(peerId, peerShareAudioSenders);
  shareSetup.set(peerId, Promise.all(Array.from(shareSources.values()).flatMap((source) => [
    peerShareSenders[source.slot].replaceTrack(source.track),
    peerShareAudioSenders[source.slot].replaceTrack(source.audioTrack || null),
  ])));
  return pc;
}

function attachRemoteShareAudio(peerId, slot, track) {
  let peerAudios = remoteShareAudio.get(peerId);
  if (!peerAudios) {
    peerAudios = new Map();
    remoteShareAudio.set(peerId, peerAudios);
  }
  let shareAudio = peerAudios.get(slot);
  if (!shareAudio) {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.volume = 1;
    audio.hidden = true;
    shareAudio = { audio, controls: null };
    peerAudios.set(slot, shareAudio);
  }
  const mediaStream = new MediaStream([track]);
  shareAudio.audio.srcObject = mediaStream;
  const video = remoteVideos.get(peerId)?.get(`share-${slot}`);
  const tile = video && video.closest(".share-tile");
  if (tile) ensureRemoteShareAudioControls(peerId, slot, tile);
  track.addEventListener("ended", () => {
    if (shareAudio.audio.srcObject !== mediaStream) return;
    shareAudio.audio.srcObject = null;
    if (shareAudio.controls) shareAudio.controls.remove();
    const current = remoteShareAudio.get(peerId);
    if (current && current.get(slot) === shareAudio) {
      current.delete(slot);
      if (current.size === 0) remoteShareAudio.delete(peerId);
    }
  }, { once: true });
}

function ensureRemoteShareAudioControls(peerId, slot, tile) {
  const shareAudio = remoteShareAudio.get(peerId)?.get(slot);
  if (!shareAudio || shareAudio.controls) return;
  const controls = document.createElement("div");
  controls.className = "share-audio-controls";
  controls.dataset.peerId = peerId;
  controls.dataset.shareSlot = String(slot);
  controls.setAttribute("aria-label", `Commandes audio du partage ${slot + 1}`);
  const label = document.createElement("label");
  label.textContent = `Son ${slot + 1}`;
  label.setAttribute("for", `share-audio-volume-${peerId}-${slot}`);
  const muteButton = document.createElement("button");
  muteButton.type = "button";
  muteButton.textContent = "Couper";
  muteButton.setAttribute("aria-label", `Couper l'audio du partage ${slot + 1}`);
  muteButton.setAttribute("aria-pressed", "false");
  muteButton.addEventListener("click", () => {
    shareAudio.audio.muted = !shareAudio.audio.muted;
    muteButton.textContent = shareAudio.audio.muted ? "Réactiver" : "Couper";
    muteButton.setAttribute(
      "aria-label",
      `${shareAudio.audio.muted ? "Réactiver" : "Couper"} l'audio du partage ${slot + 1}`
    );
    muteButton.setAttribute("aria-pressed", String(shareAudio.audio.muted));
  });
  const volume = document.createElement("input");
  volume.id = `share-audio-volume-${peerId}-${slot}`;
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.05";
  volume.value = String(shareAudio.audio.volume);
  volume.setAttribute("aria-label", `Volume de l'audio du partage ${slot + 1}`);
  volume.addEventListener("input", () => {
    shareAudio.audio.volume = Number(volume.value);
  });
  controls.append(label, muteButton, volume, shareAudio.audio);
  tile.appendChild(controls);
  shareAudio.controls = controls;
}

function addRemoteVideo(peerId, name) {
  if (remoteVideos.has(peerId)) return;
  ensureLocalParticipantRow();

  const tile = document.createElement("div");
  tile.className = "video-tile avatar-tile";
  tile.id = `tile-${peerId}`;
  const video = document.createElement("video");
  video.id = `video-${peerId}`;
  video.autoplay = true;
  video.playsInline = true;
  video.classList.add("hidden");
  const avatarFallback = document.createElement("div");
  avatarFallback.className = "avatar-fallback";
  avatarFallback.textContent = "Avatar non défini";
  const avatarImage = document.createElement("img");
  avatarImage.className = "avatar-view hidden";
  avatarImage.alt = "Avatar du participant";

  const label = document.createElement("span");
  label.className = "video-label";
  label.textContent = name || peerId.slice(0, 6);

  tile.append(avatarFallback, avatarImage, video, label);
  avatarStrip.appendChild(tile);
  remoteVideos.set(peerId, new Map([["primary", video], ["camera", video]]));
  remoteTiles.set(peerId, [tile]);
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  audio.volume = 1;
  audio.hidden = true;
  remoteAudio.set(peerId, audio);
  const row = createParticipantRow(peerId, name || peerId.slice(0, 6), audio);
  participantRows.set(peerId, row);
  participantsList.appendChild(row);
  updateRemoteAvatar(peerId);
  setRemoteCameraState(peerId, remoteCameraStates.get(peerId) || false);
  updateParticipantCount();
}

function removePeer(peerId) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
    audioSenders.delete(peerId);
    videoSenders.delete(peerId);
    shareSenders.delete(peerId);
    shareSetup.delete(peerId);
    shareAudioSenders.delete(peerId);
  }
  (remoteTiles.get(peerId) || []).forEach((tile) => tile.remove());
  remoteTiles.delete(peerId);
  remoteVideos.delete(peerId);
  remoteAvatarProfiles.delete(peerId);
  remoteSpeakingStates.delete(peerId);
  remoteCameraStates.delete(peerId);
  const audio = remoteAudio.get(peerId);
  if (audio) audio.srcObject = null;
  remoteAudio.delete(peerId);
  const shareAudio = remoteShareAudio.get(peerId);
  if (shareAudio) {
    shareAudio.forEach(({ audio, controls }) => {
      audio.srcObject = null;
      if (controls) controls.remove();
    });
  }
  remoteShareAudio.delete(peerId);
  const participantRow = participantRows.get(peerId);
  if (participantRow) participantRow.remove();
  participantRows.delete(peerId);
  updateParticipantCount();
}

async function replaceSenderTracks(senders, newTrack, rollbackTrack) {
  const changed = [];
  try {
    for (const sender of senders) {
      await sender.replaceTrack(newTrack);
      changed.push(sender);
    }
  } catch (error) {
    await Promise.all(changed.map((sender) =>
      sender.replaceTrack(rollbackTrack).catch((rollbackError) => {
        console.error("Erreur de restauration d'une piste WebRTC:", rollbackError);
      })
    ));
    throw error;
  }
}

function watchInputTrack(track, kind) {
  track.addEventListener("ended", () => {
    if (!localStream || !localStream.getTracks().includes(track)) return;

    localStream.removeTrack(track);
    if (kind === "audio") {
      activeAudioDeviceId = "";
      mediaStatus.textContent = "Le microphone a été débranché. Choisis un autre microphone.";
      stopVoiceDetection();
      replaceSenderTracks(audioSenders.values(), null, track).catch((error) => {
        console.error("Erreur de désactivation du microphone WebRTC:", error);
        mediaStatus.textContent = "Le microphone a été débranché et sa piste distante n'a pas pu être arrêtée.";
      });
      refreshAudioFilterControls();
    } else {
      activeCameraDeviceId = "";
      camEnabled = false;
      publishCameraState(false);
      sendAvatarProfile();
      mediaStatus.textContent = "La caméra a été débranchée. Choisis une autre caméra ou désactive-la.";
      replaceSenderTracks(videoSenders.values(), null, track).catch((error) => {
        console.error("Erreur de désactivation de la caméra WebRTC:", error);
        mediaStatus.textContent = "La caméra a été débranchée et sa piste distante n'a pas pu être arrêtée.";
      });
      localVideo.srcObject = localStream;
      updateControls();
    }
    refreshInputDevices();
  }, { once: true });
}

async function switchAudioDevice() {
  if (switchingAudioDevice || !localStream) return;
  switchingAudioDevice = true;
  const previousTrack = localStream.getAudioTracks()[0] || null;
  let newTrack;
  mediaStatus.textContent = "Changement de microphone…";
  try {
    const constraints = addPreferredDevice(
      getAudioFilterConstraints(),
      audioDeviceSelect.value
    );
    const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
    newTrack = stream.getAudioTracks()[0];
    stream.getTracks().filter((track) => track !== newTrack).forEach((track) => track.stop());
    if (!newTrack) throw new Error("Aucune piste micro n'a été fournie.");

    newTrack.enabled = micEnabled;
    await replaceSenderTracks(audioSenders.values(), newTrack, previousTrack);
    if (previousTrack) localStream.removeTrack(previousTrack);
    localStream.addTrack(newTrack);
    activeAudioDeviceId = newTrack.getSettings().deviceId || audioDeviceSelect.value;
    if (activeAudioDeviceId) audioDeviceSelect.value = activeAudioDeviceId;
    watchInputTrack(newTrack, "audio");
    if (previousTrack) previousTrack.stop();
    audioTrackCapabilities = typeof newTrack.getCapabilities === "function"
      ? newTrack.getCapabilities()
      : null;
    await startVoiceDetection(newTrack);
    mediaStatus.textContent = "";
    refreshAudioFilterControls();
    await refreshInputDevices();
  } catch (error) {
    if (newTrack && !localStream.getTracks().includes(newTrack)) newTrack.stop();
    audioDeviceSelect.value = activeAudioDeviceId || "";
    console.error("Erreur de changement de microphone:", error);
    mediaStatus.textContent = `Microphone inchangé : ${getMediaAccessErrorMessage(error, "micro")}`;
  } finally {
    switchingAudioDevice = false;
  }
}

async function switchCameraDevice() {
  if (switchingCameraDevice || !localStream) return;
  switchingCameraDevice = true;
  const previousTrack = localStream.getVideoTracks()[0] || null;
  let newTrack = null;
  const constraints = getSelectedCameraConstraints();
  mediaStatus.textContent = constraints === false ? "Désactivation de la caméra…" : "Changement de caméra…";
  try {
    if (constraints !== false) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
      newTrack = stream.getVideoTracks()[0] || null;
      stream.getTracks().filter((track) => track !== newTrack).forEach((track) => track.stop());
      if (!newTrack) throw new Error("Aucune piste caméra n'a été fournie.");
      newTrack.enabled = previousTrack ? previousTrack.enabled : true;
    }

    await replaceSenderTracks(videoSenders.values(), newTrack, previousTrack);
    if (previousTrack) localStream.removeTrack(previousTrack);
    if (newTrack) {
      localStream.addTrack(newTrack);
      activeCameraDeviceId = newTrack.getSettings().deviceId || (
        cameraDeviceSelect.value === "__default__" ? "" : cameraDeviceSelect.value
      );
      watchInputTrack(newTrack, "video");
    } else {
      activeCameraDeviceId = "";
    }
    if (previousTrack) previousTrack.stop();
    camEnabled = Boolean(newTrack && newTrack.enabled);
    publishCameraState(camEnabled);
    sendAvatarProfile();
    if (activeCameraDeviceId) cameraDeviceSelect.value = activeCameraDeviceId;
    localVideo.srcObject = localStream;
    mediaStatus.textContent = "";
    updateControls();
    await refreshInputDevices();
  } catch (error) {
    if (newTrack && !localStream.getTracks().includes(newTrack)) newTrack.stop();
    cameraDeviceSelect.value = activeCameraDeviceId || "__default__";
    console.error("Erreur de changement de caméra:", error);
    mediaStatus.textContent = `Caméra inchangée : ${getMediaAccessErrorMessage(error, "caméra")}`;
  } finally {
    switchingCameraDevice = false;
  }
}

function updateParticipantCount() {
  const count = remoteVideos.size + 1;
  participantCount.textContent = `${count} participant${count > 1 ? "s" : ""}`;
}

function createParticipantRow(peerId, name, audio = null) {
  const row = document.createElement("div");
  row.className = "participant-row";
  row.dataset.peerId = peerId;
  const nameButton = document.createElement("button");
  nameButton.type = "button";
  nameButton.className = "participant-name-button";
  nameButton.setAttribute("aria-expanded", "false");
  const nameLabel = document.createElement("span");
  nameLabel.className = "participant-name";
  nameLabel.textContent = name || "Anonyme";
  nameButton.appendChild(nameLabel);
  const menu = document.createElement("div");
  menu.className = "participant-overlay-menu hidden";
  const ownOverlayButton = document.createElement("button");
  ownOverlayButton.type = "button";
  ownOverlayButton.textContent = "Copier lien OBS individuel";
  ownOverlayButton.disabled = !peerId;
  ownOverlayButton.addEventListener("click", () =>
    copyText(makeOverlayLink(roomCode, peerId), ownOverlayButton, "Lien individuel copié")
  );
  const groupOverlayButton = document.createElement("button");
  groupOverlayButton.type = "button";
  groupOverlayButton.textContent = "Copier lien OBS du groupe";
  groupOverlayButton.addEventListener("click", () =>
    copyText(makeOverlayLink(), groupOverlayButton, "Lien de groupe copié")
  );
  menu.append(ownOverlayButton, groupOverlayButton);
  nameButton.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("hidden");
    nameButton.setAttribute("aria-expanded", String(!isOpen));
  });
  row.append(nameButton, menu);

  if (audio) {
    const muteButton = document.createElement("button");
    muteButton.type = "button";
    muteButton.className = "participant-mute";
    muteButton.textContent = "Couper";
    muteButton.title = `Couper l'audio de ${name || "ce participant"}`;
    muteButton.addEventListener("click", () => {
      audio.muted = !audio.muted;
      muteButton.textContent = audio.muted ? "Réactiver" : "Couper";
      muteButton.setAttribute("aria-pressed", String(audio.muted));
    });
    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = String(audio.volume);
    volume.setAttribute("aria-label", `Volume de ${name || "ce participant"}`);
    volume.addEventListener("input", () => {
      audio.volume = Number(volume.value);
    });
    row.append(muteButton, volume, audio);
  }
  return row;
}

function ensureLocalParticipantRow() {
  if (!localParticipantRow) {
    localParticipantRow = createParticipantRow(localPeerId, `${peerName || "Toi"} (Toi)`);
  }
  if (localParticipantRow.parentNode !== participantsList) {
    participantsList.appendChild(localParticipantRow);
  }
}

async function callPeer(peerId) {
  const pc = createPeerConnection(peerId);
  try {
    await shareSetup.get(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: peerId, data: { type: "sdp", sdp: pc.localDescription } });
  } catch (err) {
    console.error("Erreur creation offer:", err);
  }
}

async function handleSignal(from, data) {
  let pc = peers.get(from);

  if (data.type === "share-ended") {
    removeRemoteShare(from, data.slot);
    return;
  }
  if (data.type === "avatar-profile") {
    remoteAvatarProfiles.set(from, {
      idle: isValidAvatarDataUrl(data.idle) ? data.idle : "",
      talking: isValidAvatarDataUrl(data.talking) ? data.talking : "",
      bounce: data.bounce !== false,
      dimIdle: data.dimIdle !== false,
    });
    remoteSpeakingStates.set(from, Boolean(data.speaking));
    setRemoteCameraState(from, Boolean(data.camera));
    updateRemoteAvatar(from);
    return;
  }
  if (data.type === "avatar-state") {
    setRemoteSpeaking(from, Boolean(data.speaking));
    return;
  }
  if (data.type === "camera-state") {
    setRemoteCameraState(from, Boolean(data.enabled));
    return;
  }

  if (data.type === "sdp") {
    if (!pc) {
      pc = createPeerConnection(from);
    }

    if (data.sdp.type === "offer") {
      await shareSetup.get(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { type: "sdp", sdp: pc.localDescription } });
    } else if (data.sdp.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
  } else if (data.type === "ice") {
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error("Erreur addIceCandidate:", err);
      }
    }
  }
}

function removeRemoteShare(peerId, slot) {
  const videos = remoteVideos.get(peerId);
  const key = `share-${slot}`;
  const video = videos && videos.get(key);
  if (video) {
    videos.delete(key);
    video.srcObject = null;
  }
  const tile = video && video.closest(".video-tile");
  const tiles = remoteTiles.get(peerId);
  if (tile && tiles && tile !== tiles[0]) {
    tile.remove();
    const tileIndex = tiles.indexOf(tile);
    if (tileIndex !== -1) tiles.splice(tileIndex, 1);
  }
  const peerAudios = remoteShareAudio.get(peerId);
  const shareAudio = peerAudios && peerAudios.get(slot);
  if (shareAudio) {
    shareAudio.audio.srcObject = null;
    if (shareAudio.controls) shareAudio.controls.remove();
    peerAudios.delete(slot);
    if (peerAudios.size === 0) remoteShareAudio.delete(peerId);
  }
}

function getScreenTrackConstraints() {
  const resolution = Number(screenResolutionInput.value);
  const dimensions = {
    540: { width: 960, height: 540 },
    720: { width: 1280, height: 720 },
    1080: { width: 1920, height: 1080 },
  }[resolution];

  return {
    width: { max: dimensions.width },
    height: { max: dimensions.height },
    frameRate: { max: Number(screenFrameRateInput.value) },
  };
}

function refreshScreenShareStatus(notice = "") {
  const resolution = Number(screenResolutionInput.value);
  const frameRate = Number(screenFrameRateInput.value);
  const state = shareSources.size
    ? `${shareSources.size}/${MAX_SCREEN_SHARES} partages actifs. Limite demandée : ${resolution}p / ${frameRate} FPS.`
    : `Prochain partage : maximum ${resolution}p / ${frameRate} FPS.`;
  screenShareStatus.textContent = `${state} ${notice || screenShareNotice}`.trim();
  screenBtn.disabled = shareSources.size + pendingScreenShares >= MAX_SCREEN_SHARES;
  screenBtn.title = shareSources.size + pendingScreenShares >= MAX_SCREEN_SHARES
    ? `Maximum ${MAX_SCREEN_SHARES} partages simultanés`
    : "Partager un écran ou une fenêtre";
}

async function applyScreenShareSettings() {
  const tracks = Array.from(shareSources.values(), (source) => source.track);
  if (!tracks.length) {
    refreshScreenShareStatus();
    return;
  }
  if (tracks.some((track) => typeof track.applyConstraints !== "function")) {
    refreshScreenShareStatus("Ce navigateur ne permet pas de modifier la capture en cours.");
    return;
  }

  screenResolutionInput.disabled = true;
  screenFrameRateInput.disabled = true;
  try {
    await Promise.all(tracks.map((track) => track.applyConstraints(getScreenTrackConstraints())));
    refreshScreenShareStatus();
  } catch (err) {
    console.error("Erreur de réglage du partage d'écran:", err);
    refreshScreenShareStatus(`Réglage impossible : ${err.message}`);
  } finally {
    screenResolutionInput.disabled = false;
    screenFrameRateInput.disabled = false;
  }
}

async function startScreenShare() {
  if (shareSources.size + pendingScreenShares >= MAX_SCREEN_SHARES) {
    refreshScreenShareStatus(`La limite de ${MAX_SCREEN_SHARES} sources simultanées est atteinte.`);
    return;
  }

  pendingScreenShares += 1;
  refreshScreenShareStatus();
  let capturedStream = null;
  let source = null;
  let senderCleanupFailed = false;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { ...getScreenTrackConstraints(), cursor: "always" },
      audio: true,
    });
    capturedStream = stream;

    const screenTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0] || null;
    if (!screenTrack) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Aucune piste vidéo disponible pour le partage.");
    }

    const usedSlots = new Set(Array.from(shareSources.values(), (source) => source.slot));
    const slot = Array.from({ length: MAX_SCREEN_SHARES }, (_, index) => index)
      .find((index) => !usedSlots.has(index));
    if (slot === undefined) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Aucune voie de partage disponible.");
    }

    const id = `share-${nextShareId++}`;
    const tile = document.createElement("div");
    tile.className = "local-share-tile";
    const preview = document.createElement("video");
    preview.autoplay = true;
    preview.muted = true;
    preview.playsInline = true;
    preview.srcObject = stream;
    const label = document.createElement("span");
    label.className = "share-label";
    label.textContent = `Partage ${slot + 1}`;
    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.className = "btn btn-small btn-danger";
    stopButton.textContent = "Arrêter ce partage";
    stopButton.addEventListener("click", () => stopScreenShare(id));
    const visibilityButton = document.createElement("button");
    visibilityButton.type = "button";
    visibilityButton.className = "share-visibility-btn";
    visibilityButton.textContent = "Masquer";
    visibilityButton.addEventListener("click", () => {
      const hidden = preview.classList.toggle("hidden");
      visibilityButton.textContent = hidden ? "Afficher" : "Masquer";
      visibilityButton.setAttribute("aria-pressed", String(hidden));
    });
    tile.append(preview, label, visibilityButton, stopButton);
    localShares.appendChild(tile);

    source = { id, slot, stream, track: screenTrack, audioTrack, tile };
    shareSources.set(id, source);
    await replaceSenderTracks(
      Array.from(shareSenders.values(), (senders) => senders[slot]),
      screenTrack,
      null
    );
    await replaceSenderTracks(
      Array.from(shareAudioSenders.values(), (senders) => senders[slot]),
      audioTrack,
      null
    );

    isScreenSharing = true;
    screenShareNotice = !audioTrack
      ? "Vidéo partagée, mais ce navigateur n'a fourni aucun audio système."
      : audioTrack
        ? "Audio système transmis pour ce partage."
        : "";
    updateControls();
    refreshScreenShareStatus();

    screenTrack.onended = () => {
      stopScreenShare(id);
    };
    if (audioTrack) {
      audioTrack.addEventListener("ended", () => {
        if (shareSources.get(id) !== source || source.audioTrack !== audioTrack) return;
        source.audioTrack = null;
        replaceSenderTracks(
          Array.from(shareAudioSenders.values(), (senders) => senders[slot]),
          null,
          audioTrack
        ).then(() => {
          screenShareNotice = "La piste audio système s'est arrêtée; la vidéo continue.";
          refreshScreenShareStatus();
        }).catch((error) => {
          console.error("Erreur d'arrêt de l'audio du partage:", error);
          refreshScreenShareStatus("La piste audio s'est arrêtée, mais un pair peut encore la recevoir.");
        });
      }, { once: true });
    }
  } catch (err) {
    if (source) {
      shareSources.delete(source.id);
      try {
        await replaceSenderTracks(
          Array.from(shareSenders.values(), (senders) => senders[source.slot]),
          null,
          source.track
        );
        await replaceSenderTracks(
          Array.from(shareAudioSenders.values(), (senders) => senders[source.slot]),
          null,
          source.audioTrack
        );
      } catch (cleanupError) {
        console.error("Erreur de nettoyage du partage incomplet:", cleanupError);
        senderCleanupFailed = true;
      }
      source.tile.remove();
    }
    if (capturedStream) capturedStream.getTracks().forEach((track) => track.stop());
    console.error("Erreur partage ecran:", err);
    screenShareNotice = `Capture avec audio impossible (${err.message}). Vérifie l'autorisation audio dans le sélecteur du navigateur et réessaie.`;
    if (senderCleanupFailed) {
      screenShareNotice += " Une piste distante peut nécessiter un nouvel essai.";
    }
    refreshScreenShareStatus();
  } finally {
    pendingScreenShares -= 1;
    refreshScreenShareStatus();
  }
}

async function stopScreenShare(sourceId) {
  const source = shareSources.get(sourceId);
  if (!source) return;

  const senders = Array.from(shareSenders.values(), (peerSenders) => peerSenders[source.slot])
    .filter(Boolean);
  try {
    await replaceSenderTracks(senders, null, source.track);
    await replaceSenderTracks(
      Array.from(shareAudioSenders.values(), (peerSenders) => peerSenders[source.slot]).filter(Boolean),
      null,
      source.audioTrack
    );
  } catch (error) {
    console.error("Erreur d'arrêt du partage distant:", error);
    refreshScreenShareStatus("Une source distante n'a pas pu être arrêtée correctement.");
    return;
  }
  shareSources.delete(sourceId);
  source.tile.remove();
  peers.forEach((_pc, peerId) => {
    socket.emit("signal", { to: peerId, data: { type: "share-ended", slot: source.slot } });
  });
  source.stream.getTracks().forEach((track) => track.stop());
  if (!shareSources.size) screenShareNotice = "";
  isScreenSharing = shareSources.size > 0;
  updateControls();
  refreshScreenShareStatus();
}

function toggleMic() {
  micEnabled = !micEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  }
  if (!micEnabled) setLocalSpeaking(false);
  updateControls();
}

async function toggleCam() {
  const cameraTrack = localStream && localStream.getVideoTracks()[0];
  if (!cameraTrack) {
    if (cameraDeviceSelect.value === "__off__") cameraDeviceSelect.value = "__default__";
    camBtn.disabled = true;
    mediaStatus.textContent = "Activation de la caméra…";
    await switchCameraDevice();
    camBtn.disabled = false;
    return;
  }

  camEnabled = !camEnabled;
  cameraTrack.enabled = camEnabled;
  publishCameraState(camEnabled);
  updateControls();
  sendAvatarProfile();
}

function leaveCall() {
  peers.forEach((pc) => pc.close());
  peers.clear();
  audioSenders.clear();
  videoSenders.clear();
  shareSenders.clear();
  shareAudioSenders.clear();
  document.querySelectorAll(".video-tile:not(#local-tile)").forEach((t) => t.remove());

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  stopVoiceDetection();
  shareSources.forEach((source) => {
    source.stream.getTracks().forEach((track) => track.stop());
    source.tile.remove();
  });
  shareSources.clear();
  screenShareNotice = "";
  shareSetup.clear();
  shareSenders.clear();
  remoteVideos.clear();
  remoteTiles.clear();
  remoteAudio.clear();
  remoteShareAudio.clear();
  participantRows.clear();
  participantsList.replaceChildren();
  localParticipantRow = null;
  remoteAvatarProfiles.clear();
  remoteSpeakingStates.clear();
  remoteCameraStates.clear();
  isScreenSharing = false;
  audioTrackCapabilities = null;
  activeAudioDeviceId = "";
  activeCameraDeviceId = "";
  audioSettingsNotice = "";
  mediaStatus.textContent = "";
  refreshAudioFilterControls();
  updateControls();
  refreshScreenShareStatus();

  socket.emit("leave-room");
  roomCode = null;
  localPeerId = "";
  callScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
}

function enterCall() {
  homeScreen.classList.add("hidden");
  callScreen.classList.remove("hidden");
  roomLabel.textContent = `Salle ${roomCode}`;
  localLabel.textContent = `${peerName} (Toi)`;
  ensureLocalParticipantRow();
  clearRoomCodeFromAddress();
  updateParticipantCount();
  sendAvatarProfile();
}

async function copyText(text, button, successLabel) {
  const originalLabel = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = successLabel;
  } catch (err) {
    console.error("Erreur de copie:", err);
    button.textContent = "Copie impossible";
  }
  setTimeout(() => {
    button.textContent = originalLabel;
  }, 2000);
}

function registerForRoom(code) {
  socket.emit("join-room", { roomCode: code, peerName: peerName }, (response) => {
    if (response.success) {
      roomCode = code;
      localPeerId = response.peerId;

      response.otherPeers.forEach((p) => {
        addRemoteVideo(p.id, p.name);
      });

      updateParticipantCount();
      enterCall();
    } else {
      homeError.textContent = response.error || "Impossible de rejoindre.";
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
      activeAudioDeviceId = "";
      activeCameraDeviceId = "";
      audioTrackCapabilities = null;
      refreshAudioFilterControls();
    }
  });
}

async function createRoom() {
  peerName = nameInput.value.trim() || "Anonyme";
  saveName();
  roomCode = generateRoomCode();
  if (!(await getLocalStream())) return;
  registerForRoom(roomCode);
}

async function joinRoom(code) {
  if (!code) {
    homeError.textContent = "Entre un code de salle.";
    return;
  }
  peerName = nameInput.value.trim() || "Anonyme";
  saveName();
  if (!(await getLocalStream())) return;
  registerForRoom(code);
}

createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", () => joinRoom(joinCodeInput.value.trim()));

leaveBtn.addEventListener("click", leaveCall);
micBtn.addEventListener("click", toggleMic);
camBtn.addEventListener("click", toggleCam);
screenBtn.addEventListener("click", startScreenShare);
audioDeviceSelect.addEventListener("change", switchAudioDevice);
cameraDeviceSelect.addEventListener("change", switchCameraDevice);
avatarIdleInput.addEventListener("change", () =>
  importAvatar(avatarIdleInput, "idle", avatarIdlePreview)
);
avatarTalkingInput.addEventListener("change", () =>
  importAvatar(avatarTalkingInput, "talking", avatarTalkingPreview)
);
callAvatarIdleInput.addEventListener("change", () =>
  importAvatar(callAvatarIdleInput, "idle", callAvatarIdlePreview, callAvatarStatus)
);
callAvatarTalkingInput.addEventListener("change", () =>
  importAvatar(callAvatarTalkingInput, "talking", callAvatarTalkingPreview, callAvatarStatus)
);
avatarBounceInput.addEventListener("change", saveAvatarPreferences);
avatarDimIdleInput.addEventListener("change", saveAvatarPreferences);
if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === "function") {
  navigator.mediaDevices.addEventListener("devicechange", refreshInputDevices);
}
audioFilterControls.forEach(({ input }) => {
  input.addEventListener("change", applyAudioFilterChanges);
});
screenResolutionInput.addEventListener("change", applyScreenShareSettings);
screenFrameRateInput.addEventListener("change", applyScreenShareSettings);

copyLinkBtn.addEventListener("click", () => {
  copyText(makeRoomLink(), copyLinkBtn, "Lien copié");
});

copyCodeBtn.addEventListener("click", () => {
  copyText(roomCode, copyCodeBtn, "Code copié");
});

copyOverlayLinkBtn.addEventListener("click", () => {
  copyText(makeOverlayLink(), copyOverlayLinkBtn, "Lien OBS copié");
});

nameInput.addEventListener("input", saveName);
showAvatarsInput.addEventListener("change", () =>
  setAvatarsVisible(showAvatarsInput.checked)
);
participantsDockBtn.addEventListener("click", () => {
  layoutPreferences.participantsDocked = !layoutPreferences.participantsDocked;
  applyLayoutPreferences();
  saveLayoutPreferences();
});
settingsDockBtn.addEventListener("click", () => {
  layoutPreferences.settingsDocked = !layoutPreferences.settingsDocked;
  applyLayoutPreferences();
  saveLayoutPreferences();
});
participantsResizer.addEventListener("pointerdown", (event) =>
  resizePanelFromPointer(event, "participants", participantsResizer)
);
settingsResizer.addEventListener("pointerdown", (event) =>
  resizePanelFromPointer(event, "settings", settingsResizer)
);
participantsResizer.addEventListener("keydown", (event) =>
  resizePanelFromKeyboard(event, "participants")
);
settingsResizer.addEventListener("keydown", (event) =>
  resizePanelFromKeyboard(event, "settings")
);

socket.on("connect", () => {
  console.log("Connecte au serveur de signalisation");
});

socket.on("peer-joined", async ({ id, name }) => {
  addRemoteVideo(id, name);
  updateParticipantCount();
  sendAvatarProfile(id);
  await callPeer(id);
});

socket.on("peer-left", ({ id }) => {
  removePeer(id);
});

socket.on("signal", ({ from, data }) => {
  handleSignal(from, data);
});

refreshAudioFilterControls();
loadAvatarProfile();
loadName();
loadLayoutPreferences();
loadAvatarVisibilityPreference();
joinCodeInput.value = getRoomCodeFromHash();
refreshScreenShareStatus();
