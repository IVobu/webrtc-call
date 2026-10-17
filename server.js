const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self)");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { peers: new Map(), createdAt: Date.now() });
  }
  return rooms.get(code);
}

function getOverlayRoom(code) {
  return `overlay:${code}`;
}

function getOverlayPeer(peer) {
  return {
    id: peer.socketId,
    name: peer.name,
    avatar: peer.avatar || { idle: "", talking: "", bounce: true, dimIdle: true },
    speaking: Boolean(peer.speaking),
  };
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && room.peers.size === 0) {
    io.to(getOverlayRoom(code)).emit("overlay-ended");
    rooms.delete(code);
  }
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let peerId = null;

  socket.on("overlay-watch", (payload, callback) => {
    const respond = typeof callback === "function" ? callback : () => {};
    const code = typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "";
    const room = rooms.get(code);
    if (!/^[a-z0-9]{6,10}$/i.test(code) || !room || room.peers.size === 0) {
      return respond({ success: false, error: "Cette salle n'est pas active." });
    }

    socket.join(getOverlayRoom(code));
    respond({
      success: true,
      peers: [...room.peers.values()].map(getOverlayPeer),
    });
  });

  socket.on("overlay-state-update", (payload) => {
    if (!currentRoom || !peerId || !payload || typeof payload !== "object") return;
    const room = rooms.get(currentRoom);
    const peer = room && room.peers.get(peerId);
    if (!peer) return;

    if (typeof payload.idle === "string" && payload.idle.length <= 350_000 &&
        /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(payload.idle)) {
      peer.avatar.idle = payload.idle;
    } else if (payload.idle === "") {
      peer.avatar.idle = "";
    }
    if (typeof payload.talking === "string" && payload.talking.length <= 350_000 &&
        /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(payload.talking)) {
      peer.avatar.talking = payload.talking;
    } else if (payload.talking === "") {
      peer.avatar.talking = "";
    }
    if (typeof payload.bounce === "boolean") peer.avatar.bounce = payload.bounce;
    if (typeof payload.dimIdle === "boolean") peer.avatar.dimIdle = payload.dimIdle;
    if (typeof payload.speaking === "boolean") peer.speaking = payload.speaking;

    io.to(getOverlayRoom(currentRoom)).emit("overlay-peer", getOverlayPeer(peer));
  });

  socket.on("join-room", (payload, callback) => {
    const respond = typeof callback === "function" ? callback : () => {};
    const { roomCode, peerName } = payload || {};
    const code = typeof roomCode === "string" ? roomCode.trim() : "";
    if (!code || code.length < 3) {
      return respond({ success: false, error: "Code de salle invalide." });
    }

    const room = getRoom(code);
    peerId = socket.id;
    currentRoom = code;

    socket.join(code);
    room.peers.set(peerId, {
      socketId: peerId,
      name: typeof peerName === "string" ? peerName.slice(0, 20) : "Anonyme",
      avatar: { idle: "", talking: "", bounce: true, dimIdle: true },
      speaking: false,
    });

    const otherPeers = [...room.peers.values()]
      .filter((p) => p.socketId !== peerId)
      .map((p) => ({ id: p.socketId, name: p.name }));

    socket.to(code).emit("peer-joined", { id: peerId, name: room.peers.get(peerId).name });
    io.to(getOverlayRoom(code)).emit("overlay-peer", getOverlayPeer(room.peers.get(peerId)));

    console.log(`[+] Participant rejoint (${room.peers.size} en ligne)`);
    respond({ success: true, peerId, otherPeers });
  });

  socket.on("signal", (payload) => {
    if (!currentRoom) return;
    const { to, data } = payload || {};
    if (to && data) io.to(to).emit("signal", { from: peerId, data });
  });

  socket.on("leave-room", () => {
    handleLeave();
  });

  socket.on("disconnect", () => {
    handleLeave();
  });

  function handleLeave() {
    if (!currentRoom || !peerId) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.peers.delete(peerId);
      socket.to(currentRoom).emit("peer-left", { id: peerId });
      io.to(getOverlayRoom(currentRoom)).emit("overlay-peer-left", { id: peerId });
      cleanupRoom(currentRoom);
    }
    console.log("[-] Participant quitte une salle");
    currentRoom = null;
    peerId = null;
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Serveur WebRTC demarre sur http://localhost:${PORT}`);
  console.log(`  Ouvre cette URL dans ton navigateur pour creer un appel.\n`);
});
