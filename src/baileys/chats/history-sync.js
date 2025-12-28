// History sync notification processing functions
import { ensureSocket, getAccountId } from "../shared.js";
import { downloadHistory } from "baileys";
import { logger } from "../../shared.js";

/**
 * History sync notification'ı indir ve işle
 */
export const downloadAndProcessHistorySyncNotificationUtil = async (accountId, notification, options = {}) => {
  const sock = ensureSocket(accountId);

  if (!notification) {
    throw new Error("notification gereklidir");
  }

  try {
    const history = await downloadHistory(notification, options);
    return { status: "success", data: history };
  } catch (error) {
    logger.error({ error, accountId }, "History sync notification işlenemedi");
    throw new Error(`History sync notification işlenemedi: ${error.message}`);
  }
};





