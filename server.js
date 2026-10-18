const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const PORT = process.env.PORT || 3000;
const MAX_PEERS = parseInt(process.env.MAX_PEERS || "8", 10);
const MAX_NAME = 20;
const MAX_CHAT = 500;
const MAX_CHAT_HISTORY = 50;
const MAX_IMAGE_CHARS = 20_000_000; // avatar (data URL ou URL) : large pour les webp/gif animés

const app = express();
const server = http.createServer(app);

// Le client est servi par ce même serveur : pas besoin de CORS ouvert.
// Limite relevée (25 Mo) pour que les avatars animés (webp/gif) passent sans coupure.
const io = new Server(server, { maxHttpBufferSize: 25 * 1024 * 1024 });

app.use(express.static(path.join(__dirname, "public")));

// Configuration ICE envoyée au client.
// Pour ajouter un serveur TURN (recommandé), lance le serveur avec :
//   TURN_URL="turn:mon-serveur:3478,turns:mon-serveur:5349" TURN_USERNAME=... TURN_CREDENTIAL=... node server.js
app.get("/ice-config", (req, res) => {
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || "",
      credential: process.env.TURN_CREDENTIAL || "",
    });
  }
  res.set("Cache-Control", "no-store");
  res.json({ iceServers });
});

const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { peers: new Map(), chat: [], createdAt: Date.now() });
  }
  return rooms.get(code);
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && room.peers.size === 0) {
    rooms.delete(code);
  }
}

// ---------- Validation ----------

function cleanName(value) {
  const name = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_NAME);
  return name || "Anonyme";
}

function cleanImage(value) {
  if (typeof value !== "string" || value.length > MAX_IMAGE_CHARS) return "";
  const v = value.trim();
  if (!v || /^(javascript|vbscript):/i.test(v) || /^data:(?!image\/)/i.test(v)) return "";
  return v;
}

function cleanAvatar(avatar) {
  if (!avatar || typeof avatar !== "object") return { idle: "", talking: "" };
  return { idle: cleanImage(avatar.idle), talking: cleanImage(avatar.talking) };
}

function cleanSignal(data) {
  if (!data || typeof data !== "object") return null;

  if (data.type === "sdp") {
    const sdp = data.sdp;
    if (
      sdp &&
      typeof sdp === "object" &&
      (sdp.type === "offer" || sdp.type === "answer") &&
      typeof sdp.sdp === "string" &&
      sdp.sdp.length < 200_000
    ) {
      return { type: "sdp", sdp: { type: sdp.type, sdp: sdp.sdp } };
    }
    return null;
  }

  if (data.type === "ice") {
    const candidate = data.candidate;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    if (typeof candidate.candidate !== "string" || candidate.candidate.length > 10_000) return null;
    const sdpMid = candidate.sdpMid == null ? null : candidate.sdpMid;
    const sdpMLineIndex = candidate.sdpMLineIndex == null ? null : candidate.sdpMLineIndex;
    const usernameFragment = candidate.usernameFragment == null ? null : candidate.usernameFragment;
    if (sdpMid !== null && (typeof sdpMid !== "string" || sdpMid.length > 256)) return null;
    if (sdpMLineIndex !== null && (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 65_535)) return null;
    if (usernameFragment !== null && (typeof usernameFragment !== "string" || usernameFragment.length > 256)) return null;

    // Ne relayer que les champs ICE attendus, jamais un objet arbitraire fourni par le client.
    return {
      type: "ice",
      candidate: { candidate: candidate.candidate, sdpMid, sdpMLineIndex, usernameFragment },
    };
  }

  if (data.type === "screen") {
    return {
      type: "screen",
      sharing: !!data.sharing,
      streamId: typeof data.streamId === "string" ? data.streamId.slice(0, 100) : "",
    };
  }

  return null;
}

function makeLimiter(max, windowMs) {
  let times = [];
  return () => {
    const now = Date.now();
    times = times.filter((t) => now - t < windowMs);
    if (times.length >= max) return false;
    times.push(now);
    return true;
  };
}

// ---------- Socket.IO ----------

io.on("connection", (socket) => {
  let currentRoom = null;
  let peerId = null;

  const signalLimiter = makeLimiter(400, 10_000);
  const broadcastLimiter = makeLimiter(200, 10_000);
  const chatLimiter = makeLimiter(5, 5_000);

  socket.on("join-room", (payload, callback) => {
    if (typeof callback !== "function") return;
    const { roomCode, peerName, avatar } = payload || {};

    const code = String(roomCode || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{6,32}$/.test(code)) {
      return callback({
        success: false,
        error: "Code de salle invalide (6 à 32 caractères : lettres, chiffres, - ou _).",
      });
    }

    if (currentRoom) handleLeave();

    const room = getRoom(code);
    if (room.peers.size >= MAX_PEERS) {
      return callback({ success: false, error: "Cette salle est pleine." });
    }

    const name = cleanName(peerName);
    const cleanedAvatar = cleanAvatar(avatar);

    peerId = socket.id;
    currentRoom = code;
    socket.join(code);

    const otherPeers = [...room.peers.values()].map((p) => ({
      id: p.socketId,
      name: p.name,
      avatar: p.avatar,
      cameraEnabled: !!p.cameraEnabled,
    }));

    room.peers.set(peerId, { socketId: peerId, name, avatar: cleanedAvatar, cameraEnabled: false });

    socket.to(code).emit("peer-joined", { id: peerId, name, avatar: cleanedAvatar, cameraEnabled: false });

    console.log(`[+] ${name} a rejoint ${code} (${room.peers.size} en ligne)`);
    callback({ success: true, peerId, roomCode: code, otherPeers, history: room.chat });
  });

  socket.on("signal", (payload) => {
    if (!currentRoom || !payload || typeof payload.to !== "string") return;
    if (!signalLimiter()) return;

    const room = rooms.get(currentRoom);
    // On ne relaie qu'entre membres de la même salle.
    if (!room || payload.to === peerId || !room.peers.has(payload.to)) return;

    const data = cleanSignal(payload.data);
    if (!data) return;

    io.to(payload.to).emit("signal", { from: peerId, data });
  });

  socket.on("update-profile", (payload, callback) => {
    if (!currentRoom || !peerId || !payload || typeof payload !== "object") return;
    if (!broadcastLimiter()) return;
    const room = rooms.get(currentRoom);
    const peer = room && room.peers.get(peerId);
    if (!peer) return;
    const name = cleanName(payload.name);
    const avatar = cleanAvatar(payload.avatar);
    const cameraEnabled = typeof payload.cameraEnabled === "boolean" ? payload.cameraEnabled : !!peer.cameraEnabled;
    peer.name = name;
    peer.avatar = avatar;
    peer.cameraEnabled = cameraEnabled;
    socket.to(currentRoom).emit("peer-updated", { id: peerId, name, avatar, cameraEnabled });
    if (typeof callback === "function") callback({ success: true, name, avatar, cameraEnabled });
  });

  socket.on("broadcast", (data) => {
    if (!currentRoom || !data || typeof data !== "object") return;
    if (!broadcastLimiter()) return;

    const room = rooms.get(currentRoom);
    const peer = room && room.peers.get(peerId);
    if (!peer) return;

    if (data.type === "speaking") {
      socket.to(currentRoom).emit("broadcast", {
        from: peerId,
        data: { type: "speaking", speaking: !!data.speaking },
      });
    } else if (data.type === "avatar") {
      peer.avatar = cleanAvatar(data.avatar);
      socket.to(currentRoom).emit("broadcast", {
        from: peerId,
        data: { type: "avatar", avatar: peer.avatar },
      });
    }
  });

  socket.on("chat", (text) => {
    if (!currentRoom || typeof text !== "string") return;
    if (!chatLimiter()) return;

    const room = rooms.get(currentRoom);
    const peer = room && room.peers.get(peerId);
    if (!peer) return;

    const clean = text
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, MAX_CHAT);
    if (!clean) return;

    // Le nom vient du serveur : impossible d'usurper un autre participant.
    const message = { from: peerId, name: peer.name, text: clean, ts: Date.now() };
    room.chat.push(message);
    if (room.chat.length > MAX_CHAT_HISTORY) room.chat.shift();

    io.to(currentRoom).emit("chat", message);
  });

  socket.on("leave-room", () => {
    handleLeave();
  });

  socket.on("disconnect", () => {
    handleLeave();
  });

  function handleLeave() {
    if (!currentRoom || !peerId) return;
    const code = currentRoom;
    const room = rooms.get(code);
    if (room) {
      room.peers.delete(peerId);
      socket.to(code).emit("peer-left", { id: peerId });
      cleanupRoom(code);
    }
    socket.leave(code);
    console.log(`[-] ${peerId} a quitté ${code}`);
    currentRoom = null;
    peerId = null;
  }
});

server.listen(PORT, () => {
  console.log(`\n  Serveur WebRTC démarré sur http://localhost:${PORT}`);
  console.log(`  Ouvre cette URL dans ton navigateur pour créer un appel.`);
  if (!process.env.TURN_URL) {
    console.log(`  (Aucun serveur TURN configuré : certaines connexions distantes peuvent échouer.)`);
  }
  console.log("");
});
