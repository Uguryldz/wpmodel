// Broadcast lists functions
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Broadcast list bilgilerini al (README'ye göre)
 */
export const getBroadcastListInfo = async (accountId, broadcastId) => {
  const sock = ensureSocket(accountId);
  const normalized = normalizeJid(broadcastId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");
  
  try {
    const bList = await sock.getBroadcastListInfo(normalized);
    
    // WebSocket'e bildir (query sonucu)
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "broadcast.query",
        sessionId,
        broadcastId: normalized,
        data: bList,
      });
    }
    
    return { status: "success", data: bList };
  } catch (error) {
    logger.error({ error, accountId, broadcastId }, "Broadcast list bilgisi alınamadı");
    throw error;
  }
};

