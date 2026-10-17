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
let screenStream = null;
let isScreenSharing = false;
let micEnabled = true;
let camEnabled = true;
let roomCode = null;
let peerName = "";
const peers = new Map();

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
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  peers.set(peerId, pc);
  return pc;
}

function addRemoteVideo(peerId, name) {
  const existing = document.getElementById(`video-${peerId}`);
  if (existing) return;

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
    console.error("Erreur creation offer:", err);
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

    peers.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) {
        sender.replaceTrack(screenTrack);
      }
    });

    localVideo.srcObject = screenStream;
    localVideo.classList.add("screen-share");
    isScreenSharing = true;
    updateControls();

    screenTrack.onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    console.error("Erreur partage ecran:", err);
  }
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  const camTrack = localStream && localStream.getVideoTracks()[0];
  peers.forEach((pc) => {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
    if (sender && camTrack) {
      sender.replaceTrack(camTrack);
    }
  });

  localVideo.srcObject = localStream;
  localVideo.classList.remove("screen-share");
  isScreenSharing = false;
  updateControls();
}

function toggleMic() {
  micEnabled = !micEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
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

function leaveCall() {
  peers.forEach((pc) => pc.close());
  peers.clear();
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
    } else {
      homeError.textContent = response.error || "Impossible de rejoindre.";
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
      }
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

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
if (roomParam) {
  joinCodeInput.value = roomParam;
}
