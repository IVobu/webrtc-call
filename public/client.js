const socket = io();

const homeScreen = document.getElementById("home-screen");
const callScreen = document.getElementById("call-screen");
const nameInput = document.getElementById("name-input");
const createBtn = document.getElementById("create-btn");
const joinCodeInput = document.getElementById("join-code-input");
const joinBtn = document.getElementById("join-btn");
const homeError = document.getElementById("home-error");

const roomLabel = document.getElementById("room-label");
const copyLinkBtn = document.getElementById("copy-link-btn");
const leaveBtn = document.getElementById("leave-btn");
const videoGrid = document.getElementById("video-grid");
const localVideo = document.getElementById("local-video");
const localLabel = document.getElementById("local-label");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const screenBtn = document.getElementById("screen-btn");
const participantCount = document.getElementById("participant-count");

const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsClose = document.getElementById("settings-close");
const micSelect = document.getElementById("mic-select");
const camSelect = document.getElementById("cam-select");
const speakerSelect = document.getElementById("speaker-select");

let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let micEnabled = true;
let camEnabled = true;
let roomCode = null;
let peerName = "";
const peers = new Map();
const peerScreenSharing = new Map();
let selectedMic = null;
let selectedCam = null;
let selectedSpeaker = null;

function generateRoomCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");
    const cams = devices.filter(d => d.kind === "videoinput");
    const speakers = devices.filter(d => d.kind === "audiooutput");

    micSelect.innerHTML = "";
    mics.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${mics.indexOf(d) + 1}`;
      micSelect.appendChild(opt);
    });

    camSelect.innerHTML = "";
    cams.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Caméra ${cams.indexOf(d) + 1}`;
      camSelect.appendChild(opt);
    });

    speakerSelect.innerHTML = "";
    speakers.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Haut-parleur ${speakers.indexOf(d) + 1}`;
      speakerSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Erreur enumerateDevices:", err);
  }
}

async function getLocalStream() {
  try {
    const constraints = {
      audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      video: selectedCam
        ? { deviceId: { exact: selectedCam }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    updateControls();
  } catch (err) {
    console.error("Erreur getUserMedia:", err);
    alert("Impossible d'accéder au micro/caméra. Vérifie les permissions.");
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
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: peerId, data: { type: "ice", candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    const video = document.getElementById(`video-${peerId}`);
    if (video) {
      video.srcObject = event.streams[0];
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      removePeer(peerId);
    }
  };

  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const sender = pc.addTrack(videoTrack, localStream);
      if (isScreenSharing && screenStream) {
        const screenTrack = screenStream.getVideoTracks()[0];
        if (screenTrack) sender.replaceTrack(screenTrack);
      }
    }
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      pc.addTrack(audioTrack, localStream);
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
    <video id="video-${peerId}" autoplay playsinline></video>
    <span class="video-label">${name || peerId.slice(0, 6)}</span>
  `;
  videoGrid.appendChild(tile);
  updateParticipantCount();
}

function removePeer(peerId) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
  }
  peerScreenSharing.delete(peerId);
  const tile = document.getElementById(`tile-${peerId}`);
  if (tile) tile.remove();
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = peers.size + 1;
  participantCount.textContent = `${count} participant${count > 1 ? "s" : ""}`;
}

async function callPeer(peerId) {
  const pc = createPeerConnection(peerId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: peerId, data: { type: "sdp", sdp: pc.localDescription } });
  } catch (err) {
    console.error("Erreur création offer:", err);
  }
}

async function handleSignal(from, data) {
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
      audio: true,
    });

    const screenTrack = screenStream.getVideoTracks()[0];

    for (const [pid, pc] of peers) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
      if (sender) {
        sender.replaceTrack(screenTrack);
      } else {
        pc.addTrack(screenTrack, screenStream);
      }
    }

    localVideo.srcObject = screenStream;
    localVideo.classList.add("screen-share");
    isScreenSharing = true;
    updateControls();
    socket.emit("screen-share-start");

    screenTrack.onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    console.error("Erreur partage écran:", err);
  }
}

async function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }

  const camTrack = localStream?.getVideoTracks()[0];
  for (const [pid, pc] of peers) {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) {
      sender.replaceTrack(camTrack || null);
    }
  }

  localVideo.srcObject = localStream;
  localVideo.classList.remove("screen-share");
  isScreenSharing = false;
  updateControls();
  socket.emit("screen-share-stop");
}

function toggleMic() {
  micEnabled = !micEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => (t.enabled = micEnabled));
  }
  updateControls();
}

function toggleCam() {
  camEnabled = !camEnabled;
  if (localStream) {
    localStream.getVideoTracks().forEach(t => (t.enabled = camEnabled));
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

function leaveCall() {
  peers.forEach((pc) => pc.close());
  peers.clear();
  peerScreenSharing.clear();
  document.querySelectorAll(".video-tile:not(#local-tile)").forEach((t) => t.remove());

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

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
  if (selectedSpeaker && localVideo.setSinkId) {
    localVideo.setSinkId(selectedSpeaker).catch(console.error);
  }
}

function registerForRoom(code) {
  socket.emit("join-room", { roomCode: code, peerName: peerName }, (response) => {
    if (response.success) {
      roomCode = code;

      response.otherPeers.forEach((p) => {
        addRemoteVideo(p.id, p.name);
      });

      (response.sharingPeers || []).forEach((peerId) => {
        peerScreenSharing.set(peerId, true);
        updateRemoteScreenUI(peerId);
      });

      updateParticipantCount();
      enterCall();
    } else {
      homeError.textContent = response.error || "Impossible de rejoindre.";
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
    }
  });
}

function updateRemoteScreenUI(peerId) {
  const tile = document.getElementById(`tile-${peerId}`);
  const video = document.getElementById(`video-${peerId}`);
  if (!tile || !video) return;

  if (peerScreenSharing.get(peerId)) {
    video.classList.add("screen-share");
    video.classList.remove("hidden");
  } else {
    video.classList.remove("screen-share");
  }
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

micSelect.addEventListener("change", async () => {
  selectedMic = micSelect.value || null;
  if (localStream) {
    const newStream = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
    const newAudioTrack = newStream.getAudioTracks()[0];
    localStream.getAudioTracks().forEach(t => t.stop());
    localStream.addTrack(newAudioTrack);
    for (const [pid, pc] of peers) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === "audio");
      if (sender) sender.replaceTrack(newAudioTrack);
    }
  }
});

camSelect.addEventListener("change", async () => {
  selectedCam = camSelect.value || null;
  if (localStream) {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: selectedCam ? { deviceId: { exact: selectedCam } } : true });
    const newVideoTrack = newStream.getVideoTracks()[0];
    localStream.getVideoTracks().forEach(t => t.stop());
    localStream.addTrack(newVideoTrack);
    for (const [pid, pc] of peers) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(newVideoTrack);
    }
    localVideo.srcObject = localStream;
  }
});

speakerSelect.addEventListener("change", () => {
  selectedSpeaker = speakerSelect.value || null;
  if (selectedSpeaker && localVideo.setSinkId) {
    localVideo.setSinkId(selectedSpeaker).catch(console.error);
  }
});

settingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("hidden");
  getDevices();
});
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
    copyLinkBtn.textContent = "Copié!";
    setTimeout(() => (copyLinkBtn.textContent = "Copier le lien"), 2000);
  });
});

socket.on("connect", () => {
  console.log("Connecté au serveur de signalisation");
});

socket.on("peer-joined", async ({ id, name }) => {
  addRemoteVideo(id, name);
  updateParticipantCount();
  await callPeer(id);
});

socket.on("peer-left", ({ id }) => {
  removePeer(id);
});

socket.on("peer-screen-share", ({ id, sharing }) => {
  peerScreenSharing.set(id, sharing);
  updateRemoteScreenUI(id);
  if (!sharing) {
    const pc = peers.get(id);
    const video = document.getElementById(`video-${id}`);
    if (pc && video) {
      const receivers = pc.getReceivers();
      const videoReceiver = receivers.find(r => r.track && r.track.kind === "video");
      if (videoReceiver) video.srcObject = new MediaStream([videoReceiver.track]);
    }
  }
});

socket.on("signal", ({ from, data }) => {
  handleSignal(from, data);
});

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
if (roomParam) {
  joinCodeInput.value = roomParam;
}
