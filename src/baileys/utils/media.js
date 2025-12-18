// Media utility functions
// README'ye göre Stream veya URL kullanılması öneriliyor (memory optimization)
export const buildMediaContent = ({ buffer, stream, url, mimetype, caption, viewOnce, gifPlayback, ptv, ptt }) => {
  if (!mimetype) {
    throw new Error("mimetype alanı zorunludur.");
  }

  // Base content object
  let baseContent = {};

  // URL kullan (README'ye göre best practice - memory optimization)
  if (url) {
    if (mimetype.startsWith("image/")) {
      baseContent = { image: { url }, mimetype, caption };
    } else if (mimetype.startsWith("video/")) {
      baseContent = { video: { url }, mimetype, caption, ptv: ptv || false };
    } else if (mimetype.startsWith("audio/")) {
      baseContent = { audio: { url }, mimetype, ptt: ptt || false };
    } else {
      baseContent = { document: { url }, mimetype, fileName: caption || "dosya" };
    }
  }
  // Stream kullan (README'ye göre best practice - memory optimization)
  else if (stream) {
    if (mimetype.startsWith("image/")) {
      baseContent = { image: stream, mimetype, caption };
    } else if (mimetype.startsWith("video/")) {
      baseContent = { video: stream, mimetype, caption, ptv: ptv || false };
    } else if (mimetype.startsWith("audio/")) {
      baseContent = { audio: stream, mimetype, ptt: ptt || false };
    } else {
      baseContent = { document: stream, mimetype, fileName: caption || "dosya" };
    }
  }
  // Buffer kullan (fallback - eski uyumluluk için)
  else if (buffer) {
    if (mimetype.startsWith("image/")) {
      baseContent = { image: buffer, mimetype, caption };
    } else if (mimetype.startsWith("video/")) {
      baseContent = { video: buffer, mimetype, caption, ptv: ptv || false };
    } else if (mimetype.startsWith("audio/")) {
      baseContent = { audio: buffer, mimetype, ptt: ptt || false };
    } else {
      baseContent = { document: buffer, mimetype, fileName: caption || "dosya" };
    }
  } else {
    throw new Error("buffer, stream veya url alanlarından biri zorunludur.");
  }

  // README'ye göre: View Once desteği (works with video, audio too)
  if (viewOnce === true) {
    baseContent.viewOnce = true;
  }

  // README'ye göre: Gif Message desteği (WhatsApp doesn't support .gif files, send as .mp4 video with gifPlayback flag)
  if (gifPlayback === true && mimetype.startsWith("video/")) {
    baseContent.gifPlayback = true;
  }

  return baseContent;
};



