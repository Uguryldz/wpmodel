import React from 'react';
import { CheckCheck, Reply, Edit2, Star, StarOff, MoreVertical, Users, Video, Phone, Search, Eye, Forward, Trash2 } from 'lucide-react';
import { extractMessageText } from '../utils/messageUtils';

interface Chat {
  id: string;
  name: string;
  verifiedName?: string | null;
  profilePicture?: string;
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
  onOpenContactSelector: () => void;
  onMarkAsRead: () => void;
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
  onOpenContactSelector,
  onMarkAsRead,
}: MessageListProps) {
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
      <div className="bg-gray-100 p-3 flex items-center justify-between border-b">
        <div className="flex items-center space-x-3">
          <div className="relative">
            {selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' ? (
              <img
                src={selectedChat.profilePicture}
                alt={selectedChat.name}
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = parent.querySelector('.chat-header-fallback') as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl chat-header-fallback ${
                selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' ? 'hidden' : ''
              }`}
              style={{
                backgroundColor: selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' 
                  ? 'transparent' 
                  : `hsl(${(selectedChat.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
              }}
            >
              {selectedChat.name[0]?.toUpperCase() || '?'}
            </div>
          </div>
          <div>
            <div className="font-semibold">{selectedChat.verifiedName || selectedChat.name}</div>
            <div className="text-xs text-gray-500">çevrimiçi</div>
          </div>
        </div>
        <div className="flex space-x-4 text-gray-600">
          <button 
            onClick={onOpenContactSelector}
            className="hover:text-gray-800"
            title="Kişi Seç"
          >
            <Users size={20} />
          </button>
          <button className="hover:text-gray-800"><Video size={20} /></button>
          <button className="hover:text-gray-800"><Phone size={20} /></button>
          <button className="hover:text-gray-800"><Search size={20} /></button>
          <button 
            onClick={onMarkAsRead}
            className="hover:text-gray-800"
            title="Okundu olarak işaretle"
          >
            <Eye size={20} />
          </button>
          <button className="hover:text-gray-800"><MoreVertical size={20} /></button>
        </div>
      </div>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,.03) 10px, rgba(0,0,0,.03) 20px)'
      }}>
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 text-sm">
              Henüz mesaj yok
            </div>
          ) : (
            messages.map((msg, index) => {
              const fromMe = msg.fromMe !== undefined 
                ? Boolean(msg.fromMe) 
                : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
              
              // Mesaj metnini çıkar - backend'den gelen text'i öncelikle kullan
              let text = msg.text || msg.body || '';
              
              // Eğer text yoksa ve message objesi varsa, extractMessageText kullan
              if (!text && msg.message) {
                text = extractMessageText(msg);
              }
              
              // Protocol mesajları için özel işleme
              const isProtocolMessage = msg.messageStubType || msg.type?.startsWith('protocol_');
              if (isProtocolMessage && !text) {
                // Backend'den gelen text'i kullan (formatMessage zaten protocol mesajını formatlamış olmalı)
                text = msg.text || 'Sistem mesajı';
              }
              
              // Eğer hala text yoksa ve type varsa, type'a göre varsayılan mesaj göster
              if (!text) {
                const messageType = msg.type || (msg.message ? Object.keys(msg.message)[0] : 'unknown');
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

              const messageType = msg.type || (msg.message ? Object.keys(msg.message)[0] : 'unknown');
              const isProtocol = isProtocolMessage || messageType?.startsWith('protocol_');

              const isEditing = editingMessage?.id === msg.id;

              return (
                <div
                  key={msg.id || msg.key?.id || index}
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
                    className={`max-w-[65%] md:max-w-[70%] px-2 py-1.5 text-sm relative ${
                      isProtocol
                        ? 'bg-transparent text-gray-500 italic text-center w-full max-w-none'
                        : fromMe 
                          ? 'bg-[#d9fdd3] text-gray-900 rounded-[7.5px] rounded-tr-[4px]' 
                          : 'bg-white text-gray-900 rounded-[7.5px] rounded-tl-[4px]'
                    }`}
                    style={isProtocol ? {} : {
                      boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
                    }}
                  >
                    {!isProtocol && !fromMe && msg.participant && (
                      <div className="text-xs font-semibold text-gray-600 mb-0.5">
                        {msg.pushName || msg.participant.split('@')[0]}
                      </div>
                    )}
                    
                    {!isProtocol && msg.quotedMessage && (
                      <div className="border-l-2 border-blue-500 pl-2 mb-1 text-xs text-gray-600 bg-gray-100 rounded">
                        <div className="font-semibold">{msg.quotedMessage.from || 'Kişi'}</div>
                        <div className="truncate">{msg.quotedMessage.text || 'Mesaj'}</div>
                      </div>
                    )}
                    
                    {!isProtocol && isEditing ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => onSetEditingText(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              onEditMessage(msg, editingText);
                            } else if (e.key === 'Escape') {
                              onSetEditingMessage(null);
                              onSetEditingText('');
                            }
                          }}
                          className="flex-1 px-2 py-1 border rounded"
                          autoFocus
                        />
                        <button
                          onClick={() => onEditMessage(msg, editingText)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Kaydet
                        </button>
                        <button
                          onClick={() => {
                            onSetEditingMessage(null);
                            onSetEditingText('');
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <div className="break-words whitespace-pre-wrap leading-relaxed">
                        {text || '⟨desteksiz mesaj tipi⟩'}
                      </div>
                    )}
                    
                    {!isProtocol && ts && (
                      <div className={`text-[11px] text-gray-500 mt-0.5 flex items-end ${
                        fromMe ? 'justify-end' : 'justify-start'
                      }`}>
                        <span className="opacity-70">{ts}</span>
                        {msg.edited && (
                          <span className="ml-1 opacity-70 italic">Düzenlendi</span>
                        )}
                        {fromMe && (
                          <span className="ml-1">
                            <CheckCheck size={12} className="text-blue-500" />
                          </span>
                        )}
                      </div>
                    )}

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
                        <>
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
                          <button
                            onClick={() => onStarMessage(msg, !msg.starred)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title={msg.starred ? "Yıldızı kaldır" : "Yıldızla"}
                          >
                            {msg.starred ? <StarOff size={14} className="text-yellow-500" /> : <Star size={14} />}
                          </button>
                        </>
                      )}
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
              );
            })
          )}
        </div>
      </div>

      {/* Mesaj Context Menüsü */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50" onClick={() => onShowMessageMenu(false)}>
          <div 
            className="absolute bg-white rounded-lg shadow-xl p-2 min-w-[200px] z-50"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onSetReplyingTo(selectedMessage);
                onShowMessageMenu(false);
                onSelectMessage(null as any);
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
            >
              <Reply size={16} />
              <span>Yanıtla</span>
            </button>
            <button
              onClick={() => {
                onForwardMessage(selectedMessage);
                onShowMessageMenu(false);
                onSelectMessage(null as any);
                if (activeAccountId) {
                  onLoadContacts(activeAccountId);
                }
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
            >
              <MoreVertical size={16} />
              <span>İlet</span>
            </button>
            {selectedMessage.fromMe && (
              <>
                <button
                  onClick={() => {
                    onSetEditingMessage(selectedMessage);
                    onSetEditingText(selectedMessage.text || selectedMessage.body || '');
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                >
                  <Edit2 size={16} />
                  <span>Düzenle</span>
                </button>
                <button
                  onClick={() => {
                    onStarMessage(selectedMessage, !selectedMessage.starred);
                    onShowMessageMenu(false);
                    onSelectMessage(null as any);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                >
                  {selectedMessage.starred ? (
                    <>
                      <StarOff size={16} className="text-yellow-500" />
                      <span>Yıldızı kaldır</span>
                    </>
                  ) : (
                    <>
                      <Star size={16} />
                      <span>Yıldızla</span>
                    </>
                  )}
                </button>
              </>
            )}
            <hr className="my-1" />
            <button
              onClick={() => {
                onDeleteMessage(selectedMessage, false);
                onShowMessageMenu(false);
                onSelectMessage(null as any);
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2 text-red-600"
            >
              <Trash2 size={16} />
              <span>Sil</span>
            </button>
            {selectedMessage.fromMe && (
              <button
                onClick={() => {
                  onDeleteMessage(selectedMessage, true);
                  onShowMessageMenu(false);
                  onSelectMessage(null as any);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2 text-red-600"
              >
                <Trash2 size={16} />
                <span>Herkes için sil</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
