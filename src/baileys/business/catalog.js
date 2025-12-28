// Business catalog functions
import { ensureSocket, normalizeJid } from "../shared.js";
import { logger } from "../../shared.js";

/**
 * Katalog bilgilerini al
 */
export const getCatalog = async (accountId, jid) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  try {
    const catalog = await sock.getCatalog(normalizedJid);
    return { status: "success", data: catalog };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Katalog alınamadı");
    throw new Error(`Katalog alınamadı: ${error.message}`);
  }
};

/**
 * Ürün bilgilerini al
 */
export const getProduct = async (accountId, jid, productIds) => {
  const sock = ensureSocket(accountId);
  const normalizedJid = normalizeJid(jid);

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw new Error("productIds array gereklidir");
  }

  try {
    const products = await sock.getProduct(normalizedJid, productIds);
    return { status: "success", data: products };
  } catch (error) {
    logger.error({ error, accountId, jid: normalizedJid }, "Ürün bilgileri alınamadı");
    throw new Error(`Ürün bilgileri alınamadı: ${error.message}`);
  }
};

/**
 * Sipariş detaylarını al
 */
export const getOrderDetails = async (accountId, orderId, token) => {
  const sock = ensureSocket(accountId);

  if (!orderId || !token) {
    throw new Error("orderId ve token gereklidir");
  }

  try {
    const order = await sock.getOrderDetails(orderId, token);
    return { status: "success", data: order };
  } catch (error) {
    logger.error({ error, accountId, orderId }, "Sipariş detayları alınamadı");
    throw new Error(`Sipariş detayları alınamadı: ${error.message}`);
  }
};





