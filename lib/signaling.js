"use strict";

// Validation et normalisation des messages de signalisation WebRTC non fiables.
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


module.exports = { cleanSignal };
