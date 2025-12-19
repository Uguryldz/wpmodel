// Status (Story) reading functions
import { ensureSocket } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Status mesajlarını al
 */
export const getStatus = async (accountId) => {
  const sock = ensureSocket(accountId);

  try {
    const status = await sock.getStatus();
    return { status: "success", data: status };
  } catch (error) {
    logger.error({ error, accountId }, "Status mesajları alınamadı");
    throw new Error(`Status mesajları alınamadı: ${error.message}`);
  }
};




