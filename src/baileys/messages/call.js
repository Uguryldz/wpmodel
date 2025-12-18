// Call management functions
import { ensureSocket, getAccountId } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Arama reddet (Reject Call)
 * README'ye göre: callId ve callFrom call event'inden alınabilir
 */
export const rejectCall = async (accountId, callId, callFrom) => {
  if (!callId || !callFrom) {
    throw new Error("Arama reddetmek için callId ve callFrom gereklidir.");
  }

  try {
    const sock = ensureSocket(accountId);
    await sock.rejectCall(callId, callFrom);
    
    logger.info({ accountId, callId, callFrom }, "Arama reddedildi");
    return { status: "rejected", callId, callFrom };
  } catch (error) {
    logger.error({ error, accountId, callId, callFrom }, "Arama reddedilemedi");
    throw new Error(`Arama reddedilemedi: ${error.message}`);
  }
};
