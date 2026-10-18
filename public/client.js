const socket = io();

const homeScreen = document.getElementById("home-screen");
const callScreen = document.getElementById("call-screen");
const nameInput = document.getElementById("name-input");
const createBtn = document.getElementById("create-btn");
const joinCodeInput = document.getElementById("join-code-input");
const joinBtn = document.getElementById("join-btn");
const homeError = document.getElementById("home-error");

const avatarIdleInput = document.getElementById("avatar-idle-input");
const avatarTalkingInput = document.getElementById("avatar-talking-input");
const avatarIdleFile = document.getElementById("avatar-idle-file");
const avatarTalkingFile = document.getElementById("avatar-talking-file");

const roomLabel = document.getElementById("room-label");
const settingsBtn = document.getElementById("settings-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const leaveBtn = document.getElementById("leave-btn");
const videoGrid = document.getElementById("video-grid");
const localVideo = document.getElementById("local-video");
const localAvatar = document.getElementById("local-avatar");
const localLabel = document.getElementById("local-label");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const screenBtn = document.getElementById("screen-btn");
const participantCount = document.getElementById("participant-count");

const settingsModal = document.getElementById("settings-modal");
const bounceEnabledInput = document.getElementById("bounce-enabled");
const bounceIntensityInput = document.getElementById("bounce-intensity");
const bounceIntensityValue = document.getElementById("bounce-intensity-value");
const speakingThresholdInput = document.getElementById("speaking-threshold");
const speakingThresholdValue = document.getElementById("speaking-threshold-value");
const settingsClose = document.getElementById("settings-close");

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

const SETTINGS = {
  bounceEnabled: false,
  bounceIntensity: 1.15,
  speakingThreshold: 18,
};

let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let micEnabled = true;
let camEnabled = true;
let roomCode = null;
let peerName = "";
let localSpeaking = false;
let avatarIdle = "";
let avatarTalking = "";

const peers = new Map();
const peerNames = new Map();
const peerAvatars = new Map();
const peerSpeaking = new Map();
const peerScreen = new Map();
const screenSenders = new Map();

let audioContext = null;
let analyser = null;
let micInterval = null;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("webrtcSettings") || "{}");
    if (typeof saved.bounceEnabled === "boolean") SETTINGS.bounceEnabled = saved.bounceEnabled;
    if (typeof saved.bounceIntensity === "number") SETTINGS.bounceIntensity = saved.bounceIntensity;
    if (typeof saved.speakingThreshold === "number") SETTINGS.speakingThreshold = saved.speakingThreshold;
  } catch (e) {
    console.error(e);
  }

  avatarIdle = localStorage.getItem("webrtcAvatarIdle") || "";
  avatarTalking = localStorage.getItem("webrtcAvatarTalking") || "";

  if (avatarIdle) avatarIdleInput.value = avatarIdle;
  if (avatarTalking) avatarTalkingInput.value = avatarTalking;

  bounceEnabledInput.checked = SETTINGS.bounceEnabled;
  bounceIntensityInput.value = SETTINGS.bounceIntensity;
  bounceIntensityValue.textContent = SETTINGS.bounceIntensity.toFixed(2);
  speakingThresholdInput.value = SETTINGS.speakingThreshold;
  speakingThresholdValue.textContent = SETTINGS.speakingThreshold;
}

function saveSettings() {
  localStorage.setItem("webrtcSettings", JSON.stringify(SETTINGS));
}

function generateRoomCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    localVideo.srcObject = localStream;
    updateControls();
    startSpeakingDetection();
  } catch (err) {
    console.error("Erreur getUserMedia:", err);
    alert("Impossible d'acceder au micro/camera. Verifie les permissions.");
  }
}

function updateControls() {
  micBtn.classList.toggle("active", micEnabled);
  micBtn.classList.toggle("danger", !micEnabled);
  camBtn.classList.toggle("active", camEnabled);
  camBtn.classList.toggle("danger", !camEnabled);
  screenBtn.classList.toggle("active", isScreenSharing);
  screenBtn.classList.toggle("danger", isScreenSharing);
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: peerId, data: { type: "ice", candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    const video = document.getElementById(`video-${peerId}`);
    if (video) {
      video.srcObject = stream;
    }
    updateTile(peerId);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      removePeer(peerId);
    }
  };

  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      pc.addTrack(audioTrack, localStream);
    }

    if (isScreenSharing && screenStream) {
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack) {
        const sender = pc.addTrack(screenTrack, screenStream);
        screenSenders.set(peerId, sender);
      }
    } else {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        pc.addTrack(videoTrack, localStream);
      }
    }
  }

  peers.set(peerId, pc);
  return pc;
}

function addRemoteVideo(peerId, name) {
  if (document.getElementById(`tile-${peerId}`)) return;

  const tile = document.createElement("div");
  tile.className = "video-tile";
  tile.id = `tile-${peerId}`;
  tile.innerHTML = `
    <video id="video-${peerId}" class="cam-video" autoplay playsinline></video>
    <img id="avatar-${peerId}" class="avatar-img hidden" alt="">
    <span class="video-label">${escapeHtml(name || peerId.slice(0, 6))}</span>
  `;
  videoGrid.appendChild(tile);
  peerNames.set(peerId, name);
  updateTile(peerId);
  updateParticipantCount();
}

function removePeer(peerId) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
  }
  peerNames.delete(peerId);
  peerAvatars.delete(peerId);
  peerSpeaking.delete(peerId);
  peerScreen.delete(peerId);
  screenSenders.delete(peerId);
  const tile = document.getElementById(`tile-${peerId}`);
  if (tile) tile.remove();
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = peers.size + 1;
  participantCount.textContent = `${count} participant${count > 1 ? "s" : ""}`;
}

function getTileElements(peerId) {
  const tile = peerId === "local"
    ? document.getElementById("local-tile")
    : document.getElementById(`tile-${peerId}`);
  if (!tile) return null;
  const img = peerId === "local"
    ? localAvatar
    : tile.querySelector(".avatar-img");
  const video = peerId === "local"
    ? localVideo
    : tile.querySelector("video");
  return { tile, img, video };
}

function updateTile(peerId) {
  const elements = getTileElements(peerId);
  if (!elements) return;
  const { tile, img, video } = elements;

  const isLocal = peerId === "local";
  const speaking = isLocal ? localSpeaking : peerSpeaking.get(peerId);
  const screenActive = isLocal ? isScreenSharing : peerScreen.get(peerId);
  const avatars = isLocal
    ? { idle: avatarIdle, talking: avatarTalking }
    : (peerAvatars.get(peerId) || {});

  tile.classList.toggle("speaking", !!speaking);

  if (screenActive) {
    if (img) img.classList.add("hidden");
    video.classList.remove("hidden");
    video.classList.add("screen-share");
    return;
  }

  video.classList.remove("screen-share");

  if (avatars.idle || avatars.talking) {
    video.classList.add("hidden");
    img.classList.remove("hidden");
    img.src = speaking && avatars.talking ? avatars.talking : avatars.idle;
    img.style.setProperty("--bounce-scale", SETTINGS.bounceIntensity);
    img.classList.toggle("bouncing", !!(speaking && SETTINGS.bounceEnabled));
  } else {
    if (img) img.classList.add("hidden");
    video.classList.remove("hidden");
  }
}

async function callPeer(peerId) {
  const pc = createPeerConnection(peerId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: peerId, data: { type: "sdp", sdp: pc.localDescription } });
  } catch (err) {
    console.error("Erreur creation offer:", err);
  }
}

async function renegotiate(pc, peerId) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: peerId, data: { type: "sdp", sdp: pc.localDescription } });
  } catch (err) {
    console.error("Erreur renegotiation:", err);
  }
}

async function handleSignal(from, data) {
  if (data.type === "state") {
    peerSpeaking.set(from, !!data.speaking);
    peerScreen.set(from, !!data.screen);
    if (data.avatar) peerAvatars.set(from, data.avatar);
    updateTile(from);
    return;
  }

  let pc = peers.get(from);

  if (data.type === "sdp") {
    if (!pc) {
      pc = createPeerConnection(from);
    }

    if (data.sdp.type === "offer") {
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

async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.contentHint = "detail";
    }

    for (const [peerId, pc] of peers) {
      if (screenTrack) {
        const sender = pc.addTrack(screenTrack, screenStream);
        screenSenders.set(peerId, sender);
      }
      await renegotiate(pc, peerId);
    }

    isScreenSharing = true;
    localVideo.srcObject = screenStream;
    updateControls();
    updateTile("local");
    broadcast({ type: "screen", sharing: true });

    if (screenTrack) {
      screenTrack.onended = () => stopScreenShare();
    }
  } catch (err) {
    console.error("Erreur partage ecran:", err);
  }
}

function stopScreenShare() {
  const camTrack = localStream && localStream.getVideoTracks()[0];

  for (const [peerId, pc] of peers) {
    const sender = screenSenders.get(peerId);
    if (sender) {
      sender.replaceTrack(camTrack || null);
      screenSenders.delete(peerId);
    }
  }

  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  isScreenSharing = false;
  localVideo.srcObject = localStream;
  updateControls();
  updateTile("local");
  broadcast({ type: "screen", sharing: false });
}

function toggleMic() {
  micEnabled = !micEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  }
  if (!micEnabled && localSpeaking) {
    localSpeaking = false;
    updateTile("local");
    broadcast({ type: "speaking", speaking: false });
  }
  updateControls();
}

function toggleCam() {
  camEnabled = !camEnabled;
  if (localStream) {
    localStream.getVideoTracks().forEach((t) => (t.enabled = camEnabled));
  }
  updateControls();
}

function toggleScreenShare() {
  if (isScreenSharing) {
    stopScreenShare();
  } else {
    startScreenShare();
  }
}

function startSpeakingDetection() {
  if (!localStream || micInterval) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
    console.error("Erreur detection parole:", err);
  }
}

function stopSpeakingDetection() {
  if (micInterval) {
    clearInterval(micInterval);
    micInterval = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  analyser = null;
}

function broadcast(data) {
  socket.emit("broadcast", data);
}

function sendState(to) {
  socket.emit("signal", {
    to,
    data: {
      type: "state",
      speaking: localSpeaking,
      screen: isScreenSharing,
      avatar: { idle: avatarIdle, talking: avatarTalking },
    },
  });
}

function leaveCall() {
  peers.forEach((pc) => pc.close());
  peers.clear();
  peerNames.clear();
  peerAvatars.clear();
  peerSpeaking.clear();
  peerScreen.clear();
  screenSenders.clear();
  document.querySelectorAll(".video-tile:not(#local-tile)").forEach((t) => t.remove());

  stopSpeakingDetection();

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  isScreenSharing = false;
  localSpeaking = false;

  socket.emit("leave-room");
  roomCode = null;
  callScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
}

function enterCall() {
  homeScreen.classList.add("hidden");
  callScreen.classList.remove("hidden");
  roomLabel.textContent = `Salle: ${roomCode}`;
  localLabel.textContent = `${peerName} (Toi)`;
  updateParticipantCount();
  updateTile("local");
}

function registerForRoom(code) {
  socket.emit("join-room", { roomCode: code, peerName: peerName }, (response) => {
    if (response.success) {
      roomCode = code;

      response.otherPeers.forEach((p) => {
        addRemoteVideo(p.id, p.name);
      });

      updateParticipantCount();
      enterCall();

      broadcast({ type: "avatar", avatar: { idle: avatarIdle, talking: avatarTalking } });
      broadcast({ type: "sync-request" });
    } else {
      homeError.textContent = response.error || "Impossible de rejoindre.";
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
      stopSpeakingDetection();
    }
  });
}

async function createRoom() {
  peerName = nameInput.value.trim() || "Anonyme";
  roomCode = generateRoomCode();
  await getLocalStream();
  registerForRoom(roomCode);
}

async function joinRoom(code) {
  if (!code) {
    homeError.textContent = "Entre un code de salle.";
    return;
  }
  peerName = nameInput.value.trim() || "Anonyme";
  await getLocalStream();
  registerForRoom(code);
}

function readAvatarFile(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

avatarIdleFile.addEventListener("change", () => {
  readAvatarFile(avatarIdleFile.files[0], (dataUrl) => {
    avatarIdle = dataUrl;
    localStorage.setItem("webrtcAvatarIdle", dataUrl);
    updateTile("local");
    broadcast({ type: "avatar", avatar: { idle: avatarIdle, talking: avatarTalking } });
  });
});

avatarTalkingFile.addEventListener("change", () => {
  readAvatarFile(avatarTalkingFile.files[0], (dataUrl) => {
    avatarTalking = dataUrl;
    localStorage.setItem("webrtcAvatarTalking", dataUrl);
    updateTile("local");
    broadcast({ type: "avatar", avatar: { idle: avatarIdle, talking: avatarTalking } });
  });
});

avatarIdleInput.addEventListener("change", () => {
  avatarIdle = avatarIdleInput.value.trim();
  localStorage.setItem("webrtcAvatarIdle", avatarIdle);
  updateTile("local");
  broadcast({ type: "avatar", avatar: { idle: avatarIdle, talking: avatarTalking } });
});

avatarTalkingInput.addEventListener("change", () => {
  avatarTalking = avatarTalkingInput.value.trim();
  localStorage.setItem("webrtcAvatarTalking", avatarTalking);
  updateTile("local");
  broadcast({ type: "avatar", avatar: { idle: avatarIdle, talking: avatarTalking } });
});

bounceEnabledInput.addEventListener("change", () => {
  SETTINGS.bounceEnabled = bounceEnabledInput.checked;
  saveSettings();
  updateTile("local");
});

bounceIntensityInput.addEventListener("input", () => {
  SETTINGS.bounceIntensity = parseFloat(bounceIntensityInput.value);
  bounceIntensityValue.textContent = SETTINGS.bounceIntensity.toFixed(2);
  saveSettings();
  updateTile("local");
});

speakingThresholdInput.addEventListener("input", () => {
  SETTINGS.speakingThreshold = parseInt(speakingThresholdInput.value, 10);
  speakingThresholdValue.textContent = SETTINGS.speakingThreshold;
  saveSettings();
});

settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", () => joinRoom(joinCodeInput.value.trim()));

leaveBtn.addEventListener("click", leaveCall);
micBtn.addEventListener("click", toggleMic);
camBtn.addEventListener("click", toggleCam);
screenBtn.addEventListener("click", toggleScreenShare);

copyLinkBtn.addEventListener("click", () => {
  const url = `${window.location.origin}/?room=${roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    copyLinkBtn.textContent = "Copie!";
    setTimeout(() => (copyLinkBtn.textContent = "Copier le lien"), 2000);
  });
});

socket.on("connect", () => {
  console.log("Connecte au serveur de signalisation");
});

socket.on("peer-joined", async ({ id, name }) => {
  addRemoteVideo(id, name);
  updateParticipantCount();
  await callPeer(id);
});

socket.on("peer-left", ({ id }) => {
  removePeer(id);
});

socket.on("signal", ({ from, data }) => {
  handleSignal(from, data);
});

socket.on("broadcast", ({ from, data }) => {
  if (data.type === "speaking") {
    peerSpeaking.set(from, !!data.speaking);
    updateTile(from);
  } else if (data.type === "avatar") {
    peerAvatars.set(from, data.avatar);
    updateTile(from);
  } else if (data.type === "screen") {
    peerScreen.set(from, !!data.sharing);
    updateTile(from);
  } else if (data.type === "sync-request") {
    sendState(from);
  }
});

loadSettings();

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
if (roomParam) {
  joinCodeInput.value = roomParam;
}
