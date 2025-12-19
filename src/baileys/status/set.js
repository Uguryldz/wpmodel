// Status (Story) sending functions
import { ensureSocket } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Status gönder
 */
export const setStatus = async (accountId, statusContent) => {
  const sock = ensureSocket(accountId);

  if (!statusContent) {
    throw new Error("statusContent gereklidir");
  }

  try {
    await sock.setStatus(statusContent);
    return { status: "sent", message: "Status gönderildi" };
  } catch (error) {
    logger.error({ error, accountId }, "Status gönderilemedi");
    throw new Error(`Status gönderilemedi: ${error.message}`);
  }
};




