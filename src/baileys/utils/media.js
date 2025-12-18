// Media utility functions
export const buildMediaContent = ({ buffer, mimetype, caption }) => {
  if (!mimetype) {
    throw new Error("mimetype alanı zorunludur.");
  }

  if (mimetype.startsWith("image/")) {
    return { image: buffer, mimetype, caption };
  }

  if (mimetype.startsWith("video/")) {
    return { video: buffer, mimetype, caption };
  }

  if (mimetype.startsWith("audio/")) {
    return { audio: buffer, mimetype, ptt: false };
  }

  return { document: buffer, mimetype, fileName: caption || "dosya" };
};



