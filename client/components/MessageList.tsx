import React, { useMemo, useState } from 'react';
import { CheckCheck, Reply, Edit2, Star, StarOff, MoreVertical, Users, Video, Check, Phone, Search, Eye, Forward, Trash2, Pin, PinOff, X, Archive, ArchiveRestore, VolumeX, Volume2, Hourglass, Smile, Copy, Info, CheckCircle2 } from 'lucide-react';
import { extractMessageText } from '../utils/messageUtils';
import { shouldShowDateSeparator } from '../utils/dateUtils';
import DateSeparator from './DateSeparator';
import MessageStatus from './MessageStatus';
import MediaMessage from './MediaMessage';
import MessageError from './MessageError';
import { useAutoScroll } from '../hooks/useAutoScroll';

interface Chat {
  id: string;
  name: string;
  verifiedName?: string | null;
  profilePicture?: string;
  archived?: boolean;
  unreadCount?: number;
  pinned?: Date | null;
  isMuted?: boolean;
  ephemeralDuration?: number | null;
}

interface Message {
  id?: string;
  key?: {
    fromMe?: boolean;
    id?: string;
    remoteJid?: string;
    participant?: string;
  };
  message?: any;
  pushName?: string;
  body?: string;
  text?: string;
  timestamp?: number;
  fromMe?: boolean;
  from?: string;
  type?: string;
  participant?: string;
  starred?: boolean;
  messageTimestamp?: number;
  quotedMessage?: {
    id?: string;
    from?: string;
    text?: string;
  };
  reactions?: any; // Mesaj reaksiyonları
}

interface MessageListProps {
  selectedChat: Chat | null;
  messages: Message[];
  selectedMessage: Message | null;
  editingMessage: Message | null;
  editingText: string;
  showMessageMenu: boolean;
  activeAccountId?: string;
  onSelectMessage: (msg: Message) => void;
  onShowMessageMenu: (show: boolean) => void;
  onSetReplyingTo: (msg: Message | null) => void;
  onSetEditingMessage: (msg: Message | null) => void;
  onSetEditingText: (text: string) => void;
  onEditMessage: (msg: Message, newText: string) => void;
  onStarMessage: (msg: Message, star: boolean) => void;
  onDeleteMessage: (msg: Message, deleteForEveryone: boolean) => void;
  onForwardMessage: (msg: Message) => void;
  onLoadContacts: (sessionId: string) => void;
  onOpenContactSelector?: () => void;
  onMarkAsRead: () => void;
  onRetryMessage?: (msg: Message) => void;
  onPinMessage?: (msg: Message, type: number, time?: number) => void;
  onRejectCall?: (callId: string, callFrom: string) => void;
  onDeleteMessageForMe?: (msg: Message) => void;
  onSendReaction?: (msg: Message, emoji: string) => void;
  onCopyMessage?: (msg: Message) => void;
  onShowMessageInfo?: (msg: Message) => void;
  onSelectMessages?: () => void;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  // Chat modify handlers
  onArchiveChat?: (chat: Chat, archive: boolean) => void;
  onMuteChat?: (chat: Chat, durationMs: number | null) => void;
  onMarkChatRead?: (chat: Chat, markRead: boolean) => void;
  onPinChat?: (chat: Chat, pin: boolean) => void;
  onDeleteChat?: (chat: Chat) => void;
  onSetDisappearingMessages?: (chat: Chat, duration: number) => void;
}

export default function MessageList({
  selectedChat,
  messages,
  selectedMessage,
  editingMessage,
  editingText,
  showMessageMenu,
  activeAccountId,
  onSelectMessage,
  onShowMessageMenu,
  onSetReplyingTo,
  onSetEditingMessage,
  onSetEditingText,
  onEditMessage,
  onStarMessage,
  onDeleteMessage,
  onForwardMessage,
  onLoadContacts,
  //onOpenContactSelector,
  onMarkAsRead,
  onRetryMessage,
  onPinMessage,
  onRejectCall,
  onDeleteMessageForMe,
  searchTerm = '',
  onSearchChange,
  onArchiveChat,
  onMuteChat,
  onMarkChatRead,
  onPinChat,
  onDeleteChat,
  onSetDisappearingMessages,
  onSendReaction,
  onCopyMessage,
  onShowMessageInfo,
  onSelectMessages,
}: MessageListProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [emojiPopupMessageId, setEmojiPopupMessageId] = useState<string | null>(null);
  
  // Mesajları filtrele ve reaction mesajlarını tespit et
  const filteredMessages = useMemo(() => {
    let msgs = messages;
    
    // Reaction mesajlarını tespit et ve filtrele
    // Eğer mesaj reactionMessage içeriyorsa, bu bir reaction mesajıdır
    msgs = msgs.filter(msg => {
      // Reaction mesajı mı kontrol et
      const isReactionMessage = msg.message?.reactionMessage || msg.type === 'reactionMessage' || msg.type === 'react';
      
      // Eğer reaction mesajı ise, filtrele (ayrı mesaj olarak gösterme)
      if (isReactionMessage) {
        return false;
      }
      
      return true;
    });
    
    // Arama terimi varsa filtrele
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      msgs = msgs.filter(msg => {
        const text = extractMessageText(msg.message || msg) || msg.text || msg.body || '';
        return text.toLowerCase().includes(term);
      });
    }
    
    return msgs;
  }, [messages, searchTerm]);
  // Otomatik scroll hook'u
  const { messagesEndRef, messagesContainerRef, scrollToBottom } = useAutoScroll({
    messages,
    selectedChatId: selectedChat?.id || null,
    enabled: !!selectedChat,
  });

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Bir sohbet seçin
      </div>
    );
  }

  return (
    <>
      {/* Chat Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Sol Taraf - Profil Bilgileri */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              {selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' ? (
                <img
                  src={selectedChat.profilePicture}
                  alt={selectedChat.name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow-md"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      const fallback = parent.querySelector('.chat-header-fallback') as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }
                  }}
                />
              ) : null}
              <div 
                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white chat-header-fallback shadow-md ${
                  selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' ? 'hidden' : ''
                }`}
                style={{
                  backgroundColor: selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' 
                    ? 'transparent' 
                    : `hsl(${(selectedChat.id.charCodeAt(0) * 137.508) % 360}, 65%, 55%)`
                }}
              >
                {selectedChat.name[0]?.toUpperCase() || '?'}
              </div>
              {/* Online göstergesi */}
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {selectedChat.verifiedName || selectedChat.name}
              </div>
              {/* <div className="flex items-center space-x-1 text-xs text-green-600 font-medium">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>çevrimiçi</span>
              </div> */}
            </div>
          </div>

          {/* Sağ Taraf - Aksiyon Butonları */}
          <div className="flex items-center space-x-2">
            {/* <button 
              onClick={onOpenContactSelector}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-blue-600 group relative"
              title="Kişi Seç"
            >
              <Users size={20} className="transition-colors" />
            </button> */}

            <button 
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors group relative ${
                showSearch ? 'bg-gray-100 text-green-600' : 'text-gray-600 hover:text-green-600'
              }`}
              title="Mesajlarda ara"
            >
              <Search size={20} className="transition-colors" />
            </button>

            {/* <button 
              onClick={onMarkAsRead}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-green-600 group relative"
              title="Okundu olarak işaretle"
            >
              <Eye size={20} className="transition-colors" />
            </button> */}

            {/* Video Call (isteğe bağlı) */}
            {/* <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-blue-600">
              <Video size={20} />
            </button> */}

            {/* Phone Call (isteğe bağlı) */}
            {/* <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-green-600">
              <Phone size={20} />
            </button> */}

            {/* More Menu - Chat Modify Özellikleri */}
            <div className="relative">
              <button 
                onClick={() => setShowChatMenu(!showChatMenu)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-800"
                title="Sohbet ayarları"
              >
                <MoreVertical size={20} />
              </button>

              {/* Chat Menu Dropdown */}
              {showChatMenu && selectedChat && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowChatMenu(false)}
                  />
                  
                  {/* Menu */}
                  <div 
                    className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl py-2 w-56 z-50 border border-gray-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sohbet İşlemleri</p>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      {onArchiveChat && (
                        <button
                          onClick={() => {
                            onArchiveChat(selectedChat, !selectedChat.archived);
                            setShowChatMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                            {selectedChat.archived ? (
                              <ArchiveRestore size={16} className="text-gray-600" />
                            ) : (
                              <Archive size={16} className="text-gray-600" />
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            {selectedChat.archived ? 'Arşivden Çıkar' : 'Arşivle'}
                          </span>
                        </button>
                      )}

                      {onMarkChatRead && (
                        <button
                          onClick={() => {
                            onMarkChatRead(selectedChat, (selectedChat.unreadCount || 0) === 0);
                            setShowChatMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                            {(selectedChat.unreadCount || 0) > 0 ? (
                              <CheckCheck size={16} className="text-gray-600" />
                            ) : (
                              <X size={16} className="text-gray-600" />
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            {(selectedChat.unreadCount || 0) > 0 
                              ? 'Okundu İşaretle' 
                              : 'Okunmadı İşaretle'}
                          </span>
                        </button>
                      )}

                      {onPinChat && (
                        <button
                          onClick={() => {
                            onPinChat(selectedChat, !selectedChat.pinned);
                            setShowChatMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                            {selectedChat.pinned ? (
                              <PinOff size={16} className="text-gray-600" />
                            ) : (
                              <Pin size={16} className="text-gray-600" />
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            {selectedChat.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                          </span>
                        </button>
                      )}

                      {onMuteChat && (
                        <button
                          onClick={() => {
                            if (selectedChat.isMuted) {
                              onMuteChat(selectedChat, null);
                            } else {
                              onMuteChat(selectedChat, 8 * 60 * 60 * 1000);
                            }
                            setShowChatMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                            {selectedChat.isMuted ? (
                              <Volume2 size={16} className="text-gray-600" />
                            ) : (
                              <VolumeX size={16} className="text-gray-600" />
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            {selectedChat.isMuted ? 'Sessizliği Kaldır' : 'Sessize Al (8 saat)'}
                          </span>
                        </button>
                      )}

                      {onSetDisappearingMessages && (
                        <button
                          onClick={() => {
                            // Şu anki süreyi kontrol et (varsa 7 gün, yoksa 0)
                            const currentDuration = selectedChat.ephemeralDuration || 0;
                            // Eğer açıksa kapat (0), kapalıysa 7 gün aç (604800 saniye)
                            const newDuration = currentDuration > 0 ? 0 : 604800; // 7 gün = 604800 saniye
                            onSetDisappearingMessages(selectedChat, newDuration);
                            setShowChatMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                            <Hourglass size={16} className="text-gray-600" />
                          </div>
                          <span className="text-sm font-medium">
                            {(selectedChat.ephemeralDuration || 0) > 0 
                              ? 'Geçici Mesajları Kapat' 
                              : 'Geçici Mesajları Aç (7 gün)'}
                          </span>
                        </button>
                      )}

                      {/* Divider */}
                      {(onDeleteChat) && (
                        <div className="my-1 border-t border-gray-100"></div>
                      )}

                      {onDeleteChat && (
                        <button
                          onClick={() => {
                            if (confirm('Bu sohbeti silmek istediğinizden emin misiniz?')) {
                              onDeleteChat(selectedChat);
                            }
                            setShowChatMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-red-50 flex items-center space-x-3 text-red-600 transition-colors group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100 transition-colors">
                            <Trash2 size={16} className="text-red-600" />
                          </div>
                          <span className="text-sm font-medium">Sohbeti Sil</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mesaj Arama */}
      {showSearch && (
        <div className="bg-white border-b border-gray-200 p-3 shadow-sm">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Mesajlarda ara..."
              className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-green-500 rounded-lg pl-10 pr-10 py-2.5 outline-none text-sm transition-all duration-200 placeholder:text-gray-400 focus:ring-2 focus:ring-green-100"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => {
                  onSearchChange?.('');
                  setShowSearch(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-300 hover:bg-gray-400 text-white transition-colors"
                title="Temizle ve kapat"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          {searchTerm && filteredMessages.length > 0 && (
            <div className="mt-2 text-xs text-gray-500 flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              <span>
                <span className="font-semibold text-green-600">{filteredMessages.length}</span> mesaj bulundu
              </span>
            </div>
          )}
          
          {searchTerm && filteredMessages.length === 0 && (
            <div className="mt-2 text-center text-xs text-gray-500 bg-yellow-50 py-2 rounded-lg">
              Sonuç bulunamadı
            </div>
          )}
        </div>
      )}

      {/* Mesajlar */}
      <div 
        ref={messagesContainerRef}
        className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto bg-[#efeae2]" 
        // style={{
        // backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,.03) 10px, rgba(0,0,0,.03) 20px)'
        // }}
      >
        <div className="space-y-2">
          {filteredMessages.length === 0 ? (
            <div className="text-center text-gray-500 text-sm">
              {searchTerm ? 'Arama sonucu bulunamadı' : 'Henüz mesaj yok'}
            </div>
          ) : (
            filteredMessages.map((msg, index) => {
              const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
              const showDateSeparator = shouldShowDateSeparator(
                prevMsg?.timestamp || prevMsg?.messageTimestamp,
                msg.timestamp || msg.messageTimestamp
              );
              const fromMe = msg.fromMe !== undefined 
                ? Boolean(msg.fromMe) 
                : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
              
              // Mesaj metnini çıkar - backend'den gelen text'i öncelikle kullan
              let text = msg.text || msg.body || '';
              
              // Eğer text yoksa ve message objesi varsa, extractMessageText kullan
              if (!text && msg.message) {
                text = extractMessageText(msg);
              }
              
              // Arama terimini highlight et
              const highlightText = (text: string, term: string) => {
                if (!term.trim()) return text;
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = text.split(regex);
                return parts.map((part, i) => 
                  regex.test(part) ? (
                    <mark key={i} className="bg-yellow-200 px-1 rounded">{part}</mark>
                  ) : (
                    part
                  )
                );
              };
              
              // Protocol mesajları için özel işleme
              const isProtocolMessage = msg.messageStubType || msg.type?.startsWith('protocol_');
              if (isProtocolMessage && !text) {
                // Backend'den gelen text'i kullan (formatMessage zaten protocol mesajını formatlamış olmalı)
                text = msg.text || 'Sistem mesajı';
              }
              
              // Mesaj tipini belirle (bir kez tanımla)
              const messageType = msg.type || (msg.message ? Object.keys(msg.message)[0] : 'unknown');
              
              // Eğer hala text yoksa ve type varsa, type'a göre varsayılan mesaj göster
              if (!text) {
                if (messageType && messageType !== 'unknown') {
                  // Protocol mesajları için backend'den gelen text'i kullan
                  if (messageType.startsWith('protocol_')) {
                    text = msg.text || 'Sistem mesajı';
                  } else {
                    text = extractMessageText(msg) || '';
                  }
                }
              }
              
              // Boş mesaj kontrolü - en azından bir şey göster
              if (!text || text.trim() === '') {
                text = 'Mesaj';
              }
              
              let timestampMs = 0;
              if (msg.timestamp) {
                timestampMs = msg.timestamp > 1000000000000 ? msg.timestamp : msg.timestamp * 1000;
              } else if (msg.messageTimestamp) {
                timestampMs = msg.messageTimestamp > 1000000000000 ? msg.messageTimestamp : msg.messageTimestamp * 1000;
              }
              
              const ts = timestampMs > 0
                ? new Date(timestampMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : '';

              const isProtocol = isProtocolMessage || messageType?.startsWith('protocol_');
              const isEditing = editingMessage?.id === msg.id;
              
              // Medya mesajı mı?
              const isMediaMessage = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 
                                      'image', 'video', 'audio', 'document', 'sticker', 'ptt'].includes(messageType);

              return (
                <React.Fragment key={msg.id || msg.key?.id || index}>
                  {/* Tarih ayırıcı */}
                  {showDateSeparator && (
                    <DateSeparator timestamp={msg.timestamp || msg.messageTimestamp} />
                  )}
                  
                  <div
                  className={`flex w-full ${
                    isProtocol 
                      ? 'justify-center' 
                      : fromMe ? 'justify-end' : 'justify-start'
                  } mb-0.5 group relative`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isProtocol) {
                      onSelectMessage(msg);
                      onShowMessageMenu(true);
                    }
                  }}
                >
                  <div
                    className={`max-w-[65%] md:max-w-[70%] px-2 py-1.5 text-sm relative transition-all ${
                      isProtocol
                        ? 'bg-transparent text-gray-500 italic text-center w-full max-w-none'
                        : fromMe 
                          ? 'bg-[#d9fdd3] text-gray-900 rounded-[7.5px] rounded-tr-[4px]' 
                          : 'bg-white text-gray-900 rounded-[7.5px] rounded-tl-[4px]'
                    } ${msg.status === 'sending' 
                      ? 'opacity-75 scale-95 animate-slide-in' 
                      : 'opacity-100 scale-100 animate-fade-in'}`}
                    style={isProtocol ? {} : {
                      boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
                    }}
                  >
                    {!isProtocol && !fromMe && (msg.participant || (selectedChat?.id.includes('@g.us') && msg.from)) && (
                      <div className="text-xs font-semibold text-gray-600 mb-0.5 flex items-center space-x-1">
                        {selectedChat?.id.includes('@g.us') && msg.from && !msg.participant && (
                          <span>{msg.pushName || msg.from.split('@')[0]}</span>
                        )}
                        {msg.participant && (
                          <span>{msg.pushName || msg.participant.split('@')[0]}</span>
                        )}
                      </div>
                    )}
                    
                    {/* Forward edilen mesaj göstergesi */}
                    {!isProtocol && (() => {
                      // Forward edilen mesajı tespit et
                      const isForwarded = msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
                                         msg.message?.imageMessage?.contextInfo?.isForwarded ||
                                         msg.message?.videoMessage?.contextInfo?.isForwarded ||
                                         msg.message?.audioMessage?.contextInfo?.isForwarded ||
                                         msg.message?.documentMessage?.contextInfo?.isForwarded ||
                                         msg.message?.forwardedMessage ||
                                         msg.isForwarded;
                      
                      if (isForwarded) {
                        return (
                          <div className="text-xs text-gray-500 mb-1 flex items-center space-x-1">
                            <Forward size={12} className="text-gray-400" />
                            <span>İletildi</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {!isProtocol && msg.quotedMessage && (
                      <div className="border-l-4 border-blue-500 pl-2 mb-1 text-xs text-gray-600 bg-gray-100 rounded py-1">
                        <div className="font-semibold text-blue-600">{msg.quotedMessage.from || 'Kişi'}</div>
                        <div className="truncate text-gray-700">{msg.quotedMessage.text || msg.quotedMessage.body || 'Mesaj'}</div>
                        {msg.quotedMessage.id && (
                          <div className="text-[10px] text-gray-400 mt-0.5">Yanıtlanan mesaj</div>
                        )}
                      </div>
                    )}
                    {!isProtocol && isEditing ? (
                      <div className="bg-white p-2 rounded-lg border-2 border-green-300 shadow-md">
                        <textarea
                          value={editingText}
                          onChange={(e) => onSetEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              onEditMessage(msg, editingText);
                            } else if (e.key === 'Escape') {
                              onSetEditingMessage(null);
                              onSetEditingText('');
                            }
                          }}
                          className="w-full px-2 py-1.5 border-0 focus:outline-none resize-none text-sm"
                          rows={2}
                          autoFocus
                          placeholder="Mesajı düzenle..."
                        />
                        <div className="flex items-center justify-end space-x-1 mt-1 pt-1 border-t border-gray-200">
                          <button
                            onClick={() => {
                              onSetEditingMessage(null);
                              onSetEditingText('');
                            }}
                            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            title="İptal (Esc)"
                          >
                            <X size={16} />
                          </button>
                          <button
                            onClick={() => onEditMessage(msg, editingText)}
                            className="p-1.5 text-white bg-green-500 hover:bg-green-600 rounded transition-colors"
                            title="Kaydet"
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="break-words whitespace-pre-wrap leading-relaxed">
                        {isMediaMessage ? (
                          <MediaMessage message={msg} fromMe={fromMe} sessionId={activeAccountId} />
                        ) : (
                          searchTerm.trim() ? highlightText(text || '⟨desteksiz mesaj tipi⟩', searchTerm) : (text || '⟨desteksiz mesaj tipi⟩')
                        )}
                      </div>
                    )}
                    
                    {!isProtocol && ts && (
                      <div className={`text-[11px] text-gray-500 mt-0.5 flex items-end ${
                        fromMe ? 'justify-end' : 'justify-start'
                      }`}>
                        <span className="opacity-70">{ts}</span>
                        {(msg.edited || msg.editedAt) && (
                          <span className="ml-1 opacity-70 italic" title={msg.editedAt ? new Date(msg.editedAt).toLocaleString('tr-TR') : ''}>
                            Düzenlendi
                          </span>
                        )}
                        {msg.starred && (
                          <Star size={12} className="ml-1 text-yellow-500 fill-yellow-500" />
                        )}
                        {fromMe && (
                          <>
                            <MessageStatus message={msg} />
                            {msg.status === 'error' && onRetryMessage && (
                              <MessageError message={msg} onRetry={() => onRetryMessage(msg)} />
                            )}
                          </>
                        )}
                      </div>
                    )}
                    
                    {/* Reaction'ları göster - mesajın altında küçük emoji bubble'ları (WhatsApp tarzı) */}
                    {!isProtocol && (() => {
                      // Reaction'ları al - önce msg.reactions, yoksa msg.message.reactions
                      const reactions = msg.reactions || msg.message?.reactions;
                      if (!reactions) return null;
                      
                      return (
                        <div className={`flex flex-wrap gap-1.5 mt-1 ${fromMe ? 'justify-end' : 'justify-start'}`}>
                          {Array.isArray(reactions) ? (
                            // Array formatı
                            reactions.map((reaction: any, reactionIndex: number) => {
                              const emoji = reaction?.emoji || reaction?.text || '👍';
                              const key = reaction?.key || reaction?.id || `reaction-${reactionIndex}`;
                              return (
                                <div
                                  key={key}
                                  className="bg-gray-800 dark:bg-gray-700 rounded-lg px-2 py-1 flex items-center gap-1 shadow-md"
                                  style={{ 
                                    marginBottom: '2px',
                                    marginTop: '2px'
                                  }}
                                >
                                  <span className="text-base leading-none">{emoji}</span>
                                </div>
                              );
                            })
                          ) : typeof reactions === 'object' && reactions !== null ? (
                            // Object formatı - key-value pairs veya emoji: count formatı
                            Object.entries(reactions).map(([key, reaction]: [string, any]) => {
                              // Eğer reaction bir obje ise
                              if (typeof reaction === 'object' && reaction !== null) {
                                const emoji = reaction?.emoji || reaction?.text || key;
                                const count = reaction?.count || 1;
                                return (
                                  <div
                                    key={key}
                                    className="bg-gray-800 dark:bg-gray-700 rounded-lg px-2 py-1 flex items-center gap-1 shadow-md"
                                    style={{ 
                                      marginBottom: '2px',
                                      marginTop: '2px'
                                    }}
                                  >
                                    <span className="text-base leading-none">{emoji}</span>
                                    {count > 1 && <span className="text-gray-300 text-[10px] font-medium">{count}</span>}
                                  </div>
                                );
                              } else {
                                // Direkt emoji string ise
                                return (
                                  <div
                                    key={key}
                                    className="bg-gray-800 dark:bg-gray-700 rounded-lg px-2 py-1 flex items-center gap-1 shadow-md"
                                    style={{ 
                                      marginBottom: '2px',
                                      marginTop: '2px'
                                    }}
                                  >
                                    <span className="text-base leading-none">{key}</span>
                                  </div>
                                );
                              }
                            })
                          ) : null}
                        </div>
                      );
                    })()}

                    {!isProtocol && (
                      <div className={`absolute ${fromMe ? 'left-0' : 'right-0'} -top-8 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded shadow-lg p-1 z-10`}>
                      {!fromMe && (
                        <button
                          onClick={() => {
                            onSetReplyingTo(msg);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Yanıtla"
                        >
                          <Reply size={14} />
                        </button>
                      )}
                      {fromMe && (
                        <button
                          onClick={() => {
                            onSetEditingMessage(msg);
                            onSetEditingText(msg.text || msg.body || '');
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Düzenle"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {onSendReaction && (() => {
                        const msgId = `${msg.id || msg.key?.id || `msg-${index}`}-${msg.timestamp || index}`;
                        const isOpen = emojiPopupMessageId === msgId;
                        
                        return (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEmojiPopupMessageId(isOpen ? null : msgId);
                              }}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Reaksiyon"
                            >
                              <Smile size={14} />
                            </button>
                            {isOpen && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => {
                                    setEmojiPopupMessageId(null);
                                  }}
                                />
                                <div 
                                  className={`absolute bottom-full mb-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 ${
                                    fromMe ? 'right-0' : 'left-0'
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ 
                                    width: '220px',
                                    maxWidth: 'calc(100vw - 20px)'
                                  }}
                                >
                                  <div className="grid grid-cols-6 gap-1">
                                    {['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '💯', '😍', '🤔', '😴', '👎', '💔', '😊', '😎', '🤗', '😋', '🤩', '😭', '😡', '🤯', '🥳'].map((emoji, emojiIndex) => (
                                      <button
                                        key={`${msg.id || msg.key?.id || index}-${emoji}-${emojiIndex}`}
                                        onClick={() => {
                                          if (onSendReaction) {
                                            onSendReaction(msg, emoji);
                                            setEmojiPopupMessageId(null);
                                          }
                                        }}
                                        className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded transition-colors text-lg hover:scale-110"
                                        title={emoji}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      <button
                        onClick={() => {
                          onSelectMessage(msg);
                          onShowMessageMenu(true);
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Daha fazla"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                    )}
                  </div>
                </div>
                </React.Fragment>
              );
            })
          )}
          {/* Scroll için boş div */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Mesaj Context Menüsü */}
      {selectedMessage && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40" 
            onClick={() => {
              onShowMessageMenu(false);
              onSelectMessage(null as any);
            }}
          />
          
          {/* Menu */}
          <div 
            className="fixed bg-white rounded-xl shadow-2xl py-2 w-56 z-50 border border-gray-200 animate-fade-in"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mesaj İşlemleri</p>
            </div>

            {/* Menu Items - Resimdeki sıraya göre */}
            <div className="py-1">
              {/* 1. Cevapla (Reply) */}
              <button
                onClick={() => {
                  onSetReplyingTo(selectedMessage);
                  onShowMessageMenu(false);
                  onSelectMessage(null as any);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
              >
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                  <Reply size={16} className="text-gray-600" />
                </div>
                <span className="text-sm font-medium">Cevapla</span>
              </button>

              {/* 3. Yıldız Ekle (Star) */}
              {onStarMessage && (
                <button
                  onClick={() => {
                    onStarMessage(selectedMessage, !selectedMessage.starred);
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    selectedMessage.starred 
                      ? 'bg-yellow-50 group-hover:bg-yellow-100' 
                      : 'bg-gray-100 group-hover:bg-gray-200'
                  }`}>
                    {selectedMessage.starred ? (
                      <StarOff size={16} className="text-yellow-600" />
                    ) : (
                      <Star size={16} className="text-gray-600" />
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {selectedMessage.starred ? 'Yıldızı Kaldır' : 'Yıldız Ekle'}
                  </span>
                </button>
              )}

              {/* 4. Sabitle (Pin Message) */}
              {onPinMessage && (
                <button
                  onClick={() => {
                    if (selectedMessage.key || selectedMessage.id) {
                      // Eğer zaten pinliyse kaldır, değilse pinle
                      const isPinned = false; // TODO: pinned state kontrolü
                      onPinMessage(selectedMessage, isPinned ? 0 : 1, 86400);
                    }
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    <Pin size={16} className="text-gray-600" />
                  </div>
                  <span className="text-sm font-medium">Sabitle</span>
                </button>
              )}

              {/* 5. İlet (Forward) */}
              <button
                onClick={() => {
                  onForwardMessage(selectedMessage);
                  onShowMessageMenu(false);
                  onSelectMessage(null as any);
                  if (activeAccountId) {
                    onLoadContacts(activeAccountId);
                  }
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
              >
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                  <Forward size={16} className="text-gray-600" />
                </div>
                <span className="text-sm font-medium">İlet</span>
              </button>

              {/* 6. Kopyala (Copy) */}
              {onCopyMessage && (
                <button
                  onClick={() => {
                    onCopyMessage(selectedMessage);
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    <Copy size={16} className="text-gray-600" />
                  </div>
                  <span className="text-sm font-medium">Kopyala</span>
                </button>
              )}

              {/* 7. Bilgi (Info) */}
              {onShowMessageInfo && (
                <>
                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={() => {
                      onShowMessageInfo(selectedMessage);
                      onShowMessageMenu(false);
                      onSelectMessage(null as any);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                      <Info size={16} className="text-gray-600" />
                    </div>
                    <span className="text-sm font-medium">Bilgi</span>
                  </button>
                </>
              )}

              {/* 8. Benden Sil (Delete for Me) - Sadece benden siler */}
              <div className="my-1 border-t border-gray-100"></div>
              {onDeleteMessageForMe ? (
                <button
                  onClick={() => {
                    onDeleteMessageForMe(selectedMessage);
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-red-50 flex items-center space-x-3 text-red-600 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100 transition-colors">
                    <Trash2 size={16} className="text-red-600" />
                  </div>
                  <span className="text-sm font-medium">Benden Sil</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    onDeleteMessage(selectedMessage, false);
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-red-50 flex items-center space-x-3 text-red-600 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100 transition-colors">
                    <Trash2 size={16} className="text-red-600" />
                  </div>
                  <span className="text-sm font-medium">Benden Sil</span>
                </button>
              )}

              {/* 9. Herkesten Sil (Delete for Everyone) */}
              {(() => {
                // Seçili mesajın zamanını bul
                let messageTime = 0;
                
                if (selectedMessage) {
                  if (selectedMessage.timestamp) {
                    messageTime = selectedMessage.timestamp > 1000000000000 
                      ? selectedMessage.timestamp 
                      : selectedMessage.timestamp * 1000;
                  } else if (selectedMessage.messageTimestamp) {
                    messageTime = selectedMessage.messageTimestamp > 1000000000000 
                      ? selectedMessage.messageTimestamp 
                      : selectedMessage.messageTimestamp * 1000;
                  }
                }
                
                // 48 saat = 172800000 ms
                const hours48 = 48 * 60 * 60 * 1000;
                const isOlderThan48Hours = messageTime > 0 
                  ? (Date.now() - messageTime) > hours48 
                  : false;
                
                return (
                  <button
                    onClick={() => {
                      onDeleteMessage(selectedMessage, true);
                      onShowMessageMenu(false);
                      onSelectMessage(null as any);
                    }}
                    disabled={isOlderThan48Hours}
                    className={`w-full text-left px-4 py-2.5 flex items-center space-x-3 transition-colors group ${
                      isOlderThan48Hours 
                        ? 'text-gray-400 cursor-not-allowed opacity-50' 
                        : 'hover:bg-red-50 text-red-600'
                    }`}
                    title={isOlderThan48Hours ? 'Mesaj üzerinden 48 saat geçtiği için bu işlem yapılamaz' : 'Bu mesajı herkesten sil'}
                  >
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                      isOlderThan48Hours 
                        ? 'bg-gray-100' 
                        : 'bg-red-50 group-hover:bg-red-100'
                    }`}>
                      <Trash2 size={16} className={isOlderThan48Hours ? 'text-gray-400' : 'text-red-600'} />
                    </div>
                    <span className="text-sm font-medium">Herkesten Sil</span>
                  </button>
                );
              })()}

              {/* 10. Mesajları seç (Select Messages) */}
              {onSelectMessages && (
                <>
                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={() => {
                      onSelectMessages();
                      onShowMessageMenu(false);
                      onSelectMessage(null as any);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                      <CheckCircle2 size={16} className="text-gray-600" />
                    </div>
                    <span className="text-sm font-medium">Mesajları seç</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
