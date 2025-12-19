// Pairing utility functions
import { ensureSocket } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Başarılı pairing yapılandırması
 */
export const configureSuccessfulPairingUtil = async (accountId, pairingData) => {
  const sock = ensureSocket(accountId);

  if (!pairingData) {
    throw new Error("pairingData gereklidir");
  }

  try {
    await sock.configureSuccessfulPairing(pairingData);
    return { status: "success", message: "Pairing yapılandırıldı" };
  } catch (error) {
    logger.error({ error, accountId }, "Pairing yapılandırılamadı");
    throw new Error(`Pairing yapılandırılamadı: ${error.message}`);
  }
};




