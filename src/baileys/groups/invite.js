// Group invite link functions
import { ensureSocket, normalizeJid } from "../shared.js";

/**
 * Grup davet linki al
 */
export const getGroupInviteLink = async (accountId, groupJid, reset = false) => {
  if (!groupJid) {
    throw new Error("Grup JID'i gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  const inviteCode = await sock.groupInviteCode(normalizedGroup);
  
  if (reset) {
    // Link'i sıfırla
    await sock.groupRevokeInvite(normalizedGroup);
    const newInviteCode = await sock.groupInviteCode(normalizedGroup);
    return { 
      status: "reset", 
      groupJid: normalizedGroup, 
      inviteCode: newInviteCode,
      inviteLink: `https://chat.whatsapp.com/${newInviteCode}`
    };
  }

  return { 
    status: "success", 
    groupJid: normalizedGroup, 
    inviteCode,
    inviteLink: `https://chat.whatsapp.com/${inviteCode}`
  };
};

/**
 * Grup davet linkini sıfırla
 */
export const resetGroupInviteLink = async (accountId, groupJid) => {
  if (!groupJid) {
    throw new Error("Grup JID'i gereklidir.");
  }

  const normalizedGroup = normalizeJid(groupJid);
  const sock = ensureSocket(accountId);

  await sock.groupRevokeInvite(normalizedGroup);
  const newInviteCode = await sock.groupInviteCode(normalizedGroup);

  return { 
    status: "reset", 
    groupJid: normalizedGroup, 
    inviteCode: newInviteCode,
    inviteLink: `https://chat.whatsapp.com/${newInviteCode}`
  };
};



