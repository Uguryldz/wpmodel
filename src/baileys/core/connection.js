// Connection state management
import { getAccountId, instances } from "../shared.js";

/**
 * Connection state'i al
 */
export const getConnectionState = (accountId) => {
  const id = getAccountId(accountId);
  const instance = instances.get(id);
  if (!instance) return null;

  return {
    accountId: instance.id,
    ...instance.connectionState,
    socketReady: Boolean(instance.sock),
  };
};

/**
 * Son QR kodunu al
 */
export const getLastQr = (accountId) => {
  const id = getAccountId(accountId);
  const instance = instances.get(id);
  if (!instance) return null;
  return instance.connectionState.lastQr;
};



