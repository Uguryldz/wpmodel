# Backend WebSocket Event'leri - Frontend Kullanım Durumu

## Backend'de Tanımlı WebSocket Event'leri

Backend'de (`src/baileys/core/events.js`) WebSocket'e broadcast edilen tüm event'ler:

### ✅ Frontend'de Kullanılan Event'ler

1. **`chats.set`** ✅
   - Backend: `wsBroadcastFn({ type: "chats.set", ... })`
   - Frontend: `handleChatsSet` (client/websocket/handlers/chatHandlers.ts)
   - Durum: Kullanılıyor

2. **`chats.upsert`** ✅
   - Backend: `wsBroadcastFn({ type: "chats.upsert", ... })`
   - Frontend: `handleChatsUpsert` (client/websocket/handlers/chatHandlers.ts)
   - Durum: Kullanılıyor

3. **`chats.update`** ✅
   - Backend: `wsBroadcastFn({ type: "chats.update", ... })`
   - Frontend: `handleChatsUpdate` (client/websocket/handlers/chatHandlers.ts)
   - Durum: Kullanılıyor

4. **`contacts.set`** ✅
   - Backend: `wsBroadcastFn({ type: "contacts.set", ... })`
   - Frontend: `handleContactsSet` (client/websocket/handlers/contactHandlers.ts)
   - Durum: Kullanılıyor

5. **`contacts.upsert`** ✅
   - Backend: `wsBroadcastFn({ type: "contacts.upsert", ... })`
   - Frontend: `handleContactsUpsert` (client/websocket/handlers/contactHandlers.ts)
   - Durum: Kullanılıyor

6. **`messages.set`** ✅
   - Backend: `wsBroadcastFn({ type: "messages.set", ... })`
   - Frontend: `handleMessagesSet` (client/websocket/handlers/messageHandlers.ts)
   - Durum: Kullanılıyor

7. **`messages.upsert`** ✅
   - Backend: `wsBroadcastFn({ type: "messages.upsert", ... })`
   - Frontend: `handleMessagesUpsert` (client/websocket/handlers/messageHandlers.ts)
   - Durum: Kullanılıyor

8. **`messages.update`** ✅
   - Backend: `wsBroadcastFn({ type: "messages.update", ... })`
   - Frontend: `handleMessagesUpdate` (client/websocket/handlers/messageHandlers.ts)
   - Durum: Kullanılıyor

9. **`presence.update`** ✅
   - Backend: `wsBroadcastFn({ type: "presence.update", ... })`
   - Frontend: `handlePresenceUpdate` (client/websocket/handlers/presenceHandlers.ts)
   - Durum: Kullanılıyor

10. **`groups.update`** ✅
    - Backend: `wsBroadcastFn({ type: "groups.update", ... })`
    - Frontend: `handleGroupsUpdate` (client/websocket/handlers/groupHandlers.ts)
    - Durum: Kullanılıyor

11. **`group-participants.update`** ✅
    - Backend: `wsBroadcastFn({ type: "group-participants.update", ... })`
    - Frontend: `handleGroupParticipantsUpdate` (client/websocket/handlers/groupHandlers.ts)
    - Durum: Kullanılıyor

12. **`connection.update`** ✅
    - Backend: `wsBroadcastFn({ type: "connection.update", ... })`
    - Frontend: `handleConnectionUpdate` (client/websocket/handlers/connectionHandlers.ts)
    - Durum: Kullanılıyor

### ❌ Frontend'de Kullanılmayan Event'ler

**Hiçbir event kullanılmıyor değil!** Tüm backend WebSocket event'leri frontend'de handler'lara sahip.

### ⚠️ Özel Durumlar

1. **`messaging-history.set`** (Backend'de event dinleniyor ama WebSocket'e `messages.set` olarak broadcast ediliyor)
   - Backend: `sock.ev.on("messaging-history.set", ...)` event'i dinleniyor
   - Backend: WebSocket'e `messages.set` olarak broadcast ediliyor (source: "messaging-history.set")
   - Frontend: `handleMessagesSet` ile işleniyor (zaten `messages.set` event'i olarak geliyor)
   - Durum: Dolaylı olarak kullanılıyor (messages.set üzerinden)

2. **`creds.update`** (Backend'de event dinleniyor ama WebSocket'e broadcast edilmiyor)
   - Backend: `sock.ev.on("creds.update", ...)` event'i dinleniyor
   - Backend: WebSocket'e broadcast edilmiyor (sadece local olarak işleniyor)
   - Frontend: Kullanılmıyor (backend'de zaten broadcast edilmiyor)
   - Durum: Normal (backend'de broadcast edilmediği için frontend'de kullanılmıyor)

## Sonuç

**Tüm backend WebSocket event'leri frontend'de kullanılıyor!** 

Backend'de WebSocket'e broadcast edilen 12 event'in tamamı frontend'de handler'lara sahip ve kullanılıyor.

