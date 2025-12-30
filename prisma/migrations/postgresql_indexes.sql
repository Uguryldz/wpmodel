-- PostgreSQL için ek index'ler (JSONB sorguları için)
-- Bu index'ler migration sonrası manuel olarak eklenebilir

-- ============================================
-- MESSAGE JSONB INDEX'LERİ
-- ============================================

-- Message type'a göre index (imageMessage, videoMessage, vb.)
CREATE INDEX IF NOT EXISTS idx_messages_message_type 
ON messages USING GIN ((message->>'type'));

-- Message içeriğinde arama için (text mesajları)
CREATE INDEX IF NOT EXISTS idx_messages_message_text 
ON messages USING GIN (message jsonb_path_ops)
WHERE message->>'type' IN ('conversation', 'extendedTextMessage');

-- Reaction'lar için index
CREATE INDEX IF NOT EXISTS idx_messages_reactions 
ON messages USING GIN (reactions)
WHERE reactions IS NOT NULL;

-- Key içeriği için index (fromMe, participant sorguları için)
CREATE INDEX IF NOT EXISTS idx_messages_key_fromme 
ON messages ((key->>'fromMe'))
WHERE (key->>'fromMe')::boolean = true;

-- ============================================
-- CHAT JSONB INDEX'LERİ
-- ============================================

-- Participant sorguları için (grup chat'leri)
CREATE INDEX IF NOT EXISTS idx_chats_participant 
ON chats USING GIN (participant)
WHERE participant IS NOT NULL;

-- ============================================
-- CONTACT JSONB INDEX'LERİ
-- ============================================

-- Business profile sorguları için
CREATE INDEX IF NOT EXISTS idx_contacts_business_profile 
ON contacts USING GIN (business_profile)
WHERE business_profile IS NOT NULL;

-- ============================================
-- GROUP METADATA JSONB INDEX'LERİ
-- ============================================

-- Participant sorguları için
CREATE INDEX IF NOT EXISTS idx_group_metadata_participants 
ON group_metadata USING GIN (participants);

-- ============================================
-- PERFORMANS İYİLEŞTİRMELERİ
-- ============================================

-- Partial index'ler (sadece aktif chat'ler için)
CREATE INDEX IF NOT EXISTS idx_chats_active 
ON chats (session_id, conversation_timestamp DESC)
WHERE archived = false;

-- Partial index'ler (sadece okunmamış mesajlar için)
CREATE INDEX IF NOT EXISTS idx_messages_unread 
ON messages (session_id, remote_jid, message_timestamp DESC)
WHERE status < 3; -- 0: pending, 1: server_ack, 2: delivery, 3: read

-- Partial index'ler (sadece yıldızlı mesajlar için)
CREATE INDEX IF NOT EXISTS idx_messages_starred 
ON messages (session_id, remote_jid, message_timestamp DESC)
WHERE starred = true;

-- ============================================
-- FULL TEXT SEARCH INDEX'LERİ (İsteğe Bağlı)
-- ============================================

-- Mesaj içeriğinde full text search için
-- CREATE INDEX IF NOT EXISTS idx_messages_text_search 
-- ON messages USING GIN (to_tsvector('english', message::text));

-- Chat isimlerinde full text search için
-- CREATE INDEX IF NOT EXISTS idx_chats_name_search 
-- ON chats USING GIN (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(display_name, '')));

