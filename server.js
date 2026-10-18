const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { peers: new Map(), createdAt: Date.now() });
  }
  return rooms.get(code);
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && room.peers.size === 0) {
    rooms.delete(code);
  }
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let peerId = null;

  socket.on("join-room", ({ roomCode, peerName }, callback) => {
    const code = (roomCode || "").trim();
    if (!code || code.length < 3) {
      return callback({ success: false, error: "Code de salle invalide." });
    }

    const room = getRoom(code);
    peerId = socket.id;
    currentRoom = code;

    socket.join(code);
    room.peers.set(peerId, { socketId: peerId, name: peerName || "Anonyme" });

    const otherPeers = [...room.peers.values()]
      .filter((p) => p.socketId !== peerId)
      .map((p) => ({ id: p.socketId, name: p.name }));

    socket.to(code).emit("peer-joined", { id: peerId, name: peerName || "Anonyme" });

    console.log(`[+] ${peerName || peerId} a rejoint ${code} (${room.peers.size} en ligne)`);
    callback({ success: true, peerId, otherPeers });
  });

  socket.on("signal", ({ to, data }) => {
    if (!currentRoom) return;
    io.to(to).emit("signal", { from: peerId, data });
  });

  socket.on("broadcast", (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("broadcast", { from: peerId, data });
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
      cleanupRoom(currentRoom);
    }
    console.log(`[-] ${peerId} a quitte ${currentRoom}`);
    currentRoom = null;
    peerId = null;
  }
});

server.listen(PORT, () => {
  console.log(`\n  Serveur WebRTC demarre sur http://localhost:${PORT}`);
  console.log(`  Ouvre cette URL dans ton navigateur pour creer un appel.\n`);
});
