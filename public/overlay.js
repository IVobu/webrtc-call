const peersContainer = document.getElementById("overlay-peers");
const statusLabel = document.getElementById("overlay-status");
const peers = new Map();
const socket = io();
const roomCode = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("room");
const isValidRoomCode = typeof roomCode === "string" && /^[a-z0-9]{3,10}$/i.test(roomCode);

function isValidAvatar(value) {
  return typeof value === "string" &&
    value.length <= 350_000 &&
    /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function updatePeer(peer) {
  if (!peer || typeof peer.id !== "string") return;
  let tile = peers.get(peer.id);
  if (!tile) {
    tile = document.createElement("article");
    tile.className = "overlay-peer";
    const image = document.createElement("img");
    image.className = "overlay-avatar";
    image.alt = "";
    const fallback = document.createElement("div");
    fallback.className = "overlay-avatar overlay-fallback";
    fallback.textContent = "Avatar";
    fallback.hidden = true;
    const name = document.createElement("div");
    name.className = "overlay-name";
    tile.append(image, fallback, name);
    peersContainer.appendChild(tile);
    peers.set(peer.id, tile);
  }

  const profile = peer.avatar || {};
  const speaking = peer.speaking === true;
  const image = tile.querySelector("img");
  const fallback = tile.querySelector(".overlay-fallback");
  const name = tile.querySelector(".overlay-name");
  const avatar = speaking
    ? (profile.talking || profile.idle)
    : (profile.idle || profile.talking);
  name.textContent = typeof peer.name === "string" ? peer.name : "Anonyme";
  if (isValidAvatar(avatar)) {
    image.src = avatar;
    image.hidden = false;
    fallback.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    fallback.hidden = false;
  }
  for (const element of [image, fallback]) {
    element.classList.toggle("avatar-bounce", speaking && profile.bounce === true);
    element.classList.toggle("avatar-idle-dim", !speaking && profile.dimIdle === true);
  }
}

function removePeer(peerId) {
  const tile = peers.get(peerId);
  if (tile) tile.remove();
  peers.delete(peerId);
}

socket.on("connect", () => {
  if (!isValidRoomCode) {
    statusLabel.textContent = "Lien OBS invalide : code de salle absent.";
    return;
  }
  socket.emit("overlay-watch", { roomCode }, (response) => {
    if (!response || !response.success) {
      statusLabel.textContent = response && response.error
        ? response.error
        : "Impossible de rejoindre la source OBS.";
      return;
    }
    statusLabel.remove();
    response.peers.forEach(updatePeer);
  });
});

socket.on("overlay-peer", updatePeer);
socket.on("overlay-peer-left", ({ id }) => removePeer(id));
socket.on("overlay-ended", () => {
  peers.clear();
  peersContainer.replaceChildren();
  statusLabel.textContent = "L'appel est terminé.";
  peersContainer.appendChild(statusLabel);
});
