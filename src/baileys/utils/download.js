// Download utility functions
import { 
  downloadExternalBlob,
  downloadExternalPatch,
  downloadEncryptedContent,
} from "baileys";
import { logger } from "../../shared.js";
import { ensureSocket } from "../shared.js";

/**
 * External blob indir
 */
export const downloadExternalBlobUtil = async (blob, options = {}) => {
  const sock = ensureSocket(options.accountId || "default");

  if (!blob) {
    throw new Error("blob gereklidir");
  }

  try {
    const result = await downloadExternalBlob(blob, sock, options);
    return { status: "success", data: result };
  } catch (error) {
    logger.error({ error }, "External blob indirilemedi");
    throw new Error(`External blob indirilemedi: ${error.message}`);
  }
};

/**
 * External patch indir
 */
export const downloadExternalPatchUtil = async (patch, options = {}) => {
  const sock = ensureSocket(options.accountId || "default");

  if (!patch) {
    throw new Error("patch gereklidir");
  }

  try {
    const result = await downloadExternalPatch(patch, sock, options);
    return { status: "success", data: result };
  } catch (error) {
    logger.error({ error }, "External patch indirilemedi");
    throw new Error(`External patch indirilemedi: ${error.message}`);
  }
};

/**
 * Encrypted content indir
 */
export const downloadEncryptedContentUtil = async (content, options = {}) => {
  const sock = ensureSocket(options.accountId || "default");

  if (!content) {
    throw new Error("content gereklidir");
  }

  try {
    const result = await downloadEncryptedContent(content, sock, options);
    return { status: "success", data: result };
  } catch (error) {
    logger.error({ error }, "Encrypted content indirilemedi");
    throw new Error(`Encrypted content indirilemedi: ${error.message}`);
  }
};



