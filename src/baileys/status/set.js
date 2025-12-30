// Status (Story) sending functions
import { ensureSocket, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Status gönder
 */
export const setStatus = async (accountId, statusContent) => {
  const sock = ensureSocket(accountId);
  const sessionId = getAccountId(accountId);
  const { getWebSocketBroadcast } = await import("../shared.js");

  if (!statusContent) {
    throw new Error("statusContent gereklidir");
  }

  try {
    await sock.setStatus(statusContent);
    
    // WebSocket'e bildir
    const wsBroadcastFn = getWebSocketBroadcast();
    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: "status.update",
        sessionId,
        action: "sent",
        statusContent,
      });
    }
    
    return { status: "sent", message: "Status gönderildi" };
  } catch (error) {
    logger.error({ error, accountId }, "Status gönderilemedi");
    throw new Error(`Status gönderilemedi: ${error.message}`);
  }
};







