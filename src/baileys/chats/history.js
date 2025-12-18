// Chat history functions
import { ensureSocket, normalizeJid, getAccountId } from "../shared.js";
import { downloadHistory } from "baileys";
import { logger } from "../../shared.js";

/**
 * Chat geçmişi indir
 */
export const downloadChatHistory = async (accountId, historySyncNotification, options = {}) => {
  const sock = ensureSocket(accountId);

  if (!historySyncNotification) {
    throw new Error("historySyncNotification gereklidir");
  }

  try {
    const history = await downloadHistory(historySyncNotification, options);
    return { status: "success", data: history };
  } catch (error) {
    logger.error({ error, accountId }, "Chat geçmişi indirilemedi");
    throw new Error(`Chat geçmişi indirilemedi: ${error.message}`);
  }
};



