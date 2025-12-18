// Main export file for Baileys modules
// This file re-exports all functions from various modules

// Core modules
export * from "./core/session.js";
export * from "./core/connection.js";
export * from "./core/socket.js";

// Messages modules
export * from "./messages/send.js";
export * from "./messages/manage.js";
export * from "./messages/edit.js";
export * from "./messages/reactions.js";
export * from "./messages/presence.js";
export * from "./messages/special.js";
export * from "./messages/link-preview.js";

// Groups modules
export * from "./groups/create.js";
export * from "./groups/manage.js";
export * from "./groups/invite.js";
export * from "./groups/list.js";

// Contacts modules
export * from "./contacts/list.js";
export * from "./contacts/block.js";
export * from "./contacts/profile.js";

// Chats modules
export * from "./chats/list.js";
export * from "./chats/messages.js";
export * from "./chats/manage.js";
export * from "./chats/search.js";
export * from "./chats/sync.js";
export * from "./chats/history.js";
export * from "./chats/history-sync.js";

// Media modules
export * from "./media/download.js";
export * from "./media/utils.js";

// Status modules
export * from "./status/get.js";
export * from "./status/set.js";

// Privacy modules
export * from "./privacy/disappearing.js";
export * from "./privacy/settings.js";

// Business modules
export * from "./business/profile.js";
export * from "./business/catalog.js";

// Newsletter modules
export * from "./newsletter/metadata.js";
export * from "./newsletter/subscribe.js";

// Utils modules
export * from "./utils/media.js";
export * from "./utils/jid.js";
export * from "./utils/message.js";
export * from "./utils/media-utils.js";
export * from "./utils/device.js";
export * from "./utils/message-utils.js";
export * from "./utils/download.js";
export * from "./utils/wa-version.js";
export * from "./utils/wamessage.js";
export * from "./utils/group.js";
export * from "./utils/transfer.js";
export * from "./utils/pairing.js";

// Note: Other modules will be added as they are created
// - messages/
// - groups/
// - contacts/
// - chats/
// - media/
// - status/
// - privacy/
// - business/
// - newsletter/
// - utils/



