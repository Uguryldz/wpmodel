// ============================================
// Message List Component
// ============================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Edit2, Star, StarOff, MoreVertical, Reply, Forward, Trash2, Copy, Download, Search, X, Pin, Users, Video, Phone, Eye, Archive, ArchiveRestore, VolumeX, Volume2, Hourglass, Smile, Info, CheckCircle2, PinOff } from 'lucide-react';
import type { Chat, Message } from '../types';
import { cn } from '../utils';
import { formatTime, formatDate, isSameDay } from '../utils/date';
import { getMessageId, extractMessageText } from '../utils/message';
import MediaMessage from './MediaMessage';

interface MessageListProps {
  chat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  sessionId?: string;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message, forEveryone?: boolean) => void;
  onForward?: (message: Message) => void;
  onStar?: (message: Message, star: boolean) => void;
  onCopy?: (message: Message) => void;
  onReaction?: (message: Message, emoji: string) => void;
  onPin?: (message: Message, type: number, time?: number) => void;
  onDeleteForMe?: (message: Message) => void;
  onShowInfo?: (message: Message) => void;
  onRetry?: (message: Message) => void;
  
  // Chat Actions
  onArchiveChat?: (chat: Chat, archive: boolean) => void;
  onMuteChat?: (chat: Chat, durationMs: number | null) => void;
  onMarkChatRead?: (chat: Chat, markRead: boolean) => void;
  onPinChat?: (chat: Chat, pin: boolean) => void;
  onDeleteChat?: (chat: Chat) => void;
  onSetDisappearingMessages?: (chat: Chat, duration: number) => void;
  onMarkAsRead?: () => void;

  // Editing
  editingMessage?: Message | null;
  editingText?: string;
  onSetEditingMessage?: (msg: Message | null) => void;
  onSetEditingText?: (text: string) => void;
  onEditMessage?: (msg: Message, newText: string) => void;
}

export function MessageList({
  chat,
  messages,
  isLoading,
  sessionId,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onStar,
  onCopy,
  onReaction,
  onPin,
  onDeleteForMe,
  onShowInfo,
  onRetry,
  onArchiveChat,
  onMuteChat,
  onMarkChatRead,
  onPinChat,
  onDeleteChat,
  onSetDisappearingMessages,
  onMarkAsRead,
  editingMessage,
  editingText,
  onSetEditingMessage,
  onSetEditingText,
  onEditMessage,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [emojiPopupMessageId, setEmojiPopupMessageId] = useState<string | null>(null);
  
  // Filter messages by search term and remove reaction messages
  const filteredMessages = useMemo(() => {
    let msgs = messages;
    
    // Filter out reaction messages
    msgs = msgs.filter(msg => {
      const isReactionMessage = msg.message?.reactionMessage || msg.type === 'reactionMessage' || msg.type === 'react';
      return !isReactionMessage;
    });
    
    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      msgs = msgs.filter(msg => {
        const text = msg.text || msg.body || extractMessageText(msg);
        return text.toLowerCase().includes(term);
      });
    }
    
    return msgs;
  }, [messages, searchTerm]);
  
  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setMenuMessageId(null);
      setShowChatMenu(false);
    };
    if (menuMessageId || showChatMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuMessageId, showChatMenu]);
  
  // Highlight search term
  const highlightText = (text: string, term: string) => {
    if (!term.trim()) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 px-1 rounded">{part}</mark>
      ) : part
    );
  };
  
  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#efeae2]">
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Mesajlaşmaya başlamak için sol taraftan bir sohbet seçin
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Chat Header */}
      <div className="bg-[#f0f2f5] border-b border-gray-300 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        {/* Left - Profile Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            {chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? (
              <img
                src={chat.profilePicture}
                alt={chat.name}
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const sibling = target.nextElementSibling as HTMLElement;
                  if (sibling) sibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold to-green-600  ${
                chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? 'hidden' : ''
              }`}
              style={{
                backgroundColor: `#16a34a `
              }}
            >
              {chat.name[0]?.toUpperCase() || '?'}
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate text-[15px]">
              {chat.verifiedName || chat.name}
            </div>
            <div className="text-xs text-gray-500">
              {chat.id.includes('@g.us') ? 'Grup' : 'Kişi'}
            </div>
          </div>
        </div>

        {/* Right - Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              'p-2 hover:bg-[#e9edef] rounded-full transition-colors',
              showSearch && 'bg-[#e9edef]'
            )}
            title="Mesajlarda ara"
          >
            <Search size={20} className="text-[#54656f]" />
          </button>

          {/* {onMarkAsRead && (
            <button 
              onClick={onMarkAsRead}
              className="p-2 hover:bg-[#e9edef] rounded-full transition-colors"
              title="Okundu olarak işaretle"
            >
              <Eye size={20} className="text-[#54656f]" />
            </button>
          )} */}

          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowChatMenu(!showChatMenu);
              }}
              className="p-2 hover:bg-[#e9edef] rounded-full transition-colors"
              title="Menü"
            >
              <MoreVertical size={20} className="text-[#54656f]" />
            </button>

            {/* Chat Menu */}
            {showChatMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowChatMenu(false)}
                />
                
                <div 
                  className="absolute right-0 top-full mt-1 bg-white rounded-md shadow-lg py-1 w-56 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onPinChat && (
                    <button
                      onClick={() => {
                        onPinChat(chat, !chat.pinned);
                        setShowChatMenu(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      {chat.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                      {chat.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                    </button>
                  )}
                  
                  {/* {onMuteChat && (
                    <button
                      onClick={() => {
                        onMuteChat(chat, chat.isMuted ? null : 8 * 60 * 60 * 1000);
                        setShowChatMenu(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      {chat.isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
                      {chat.isMuted ? 'Sessizliği Kaldır' : 'Sessize Al'}
                    </button>
                  )} */}
                  
                  {onArchiveChat && (
                    <button
                      onClick={() => {
                        onArchiveChat(chat, !chat.archived);
                        setShowChatMenu(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      {chat.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      {chat.archived ? 'Arşivden Çıkar' : 'Arşivle'}
                    </button>
                  )}
                  
                  {/* {onSetDisappearingMessages && (
                    <button
                      onClick={() => {
                        const newDuration = (chat.ephemeralDuration || 0) > 0 ? 0 : 604800;
                        onSetDisappearingMessages(chat, newDuration);
                        setShowChatMenu(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      <Hourglass size={16} />
                      {(chat.ephemeralDuration || 0) > 0 ? 'Geçici Mesajları Kapat' : 'Geçici Mesajları Aç'}
                    </button>
                  )} */}
                  
                  {onDeleteChat && (
                    <>
                      <div className="my-1 border-t border-gray-200" />
                      <button
                        onClick={() => {
                          if (confirm('Bu sohbeti silmek istediğinizden emin misiniz?')) {
                            onDeleteChat(chat);
                          }
                          setShowChatMenu(false);
                        }}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3 text-red-600"
                      >
                        <Trash2 size={16} />
                        Sohbeti Sil
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="bg-white border-b border-gray-200 p-3 flex-shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Mesajlarda ara..."
              className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-green-500 rounded-lg pl-10 pr-10 py-2 outline-none text-sm transition-all"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setShowSearch(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-300 hover:bg-gray-400 text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          {searchTerm && filteredMessages.length > 0 && (
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
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
  
      {/* Messages Area */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center bg-[#efeae2]">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-green-500" />
            <p className="text-sm text-gray-500">Mesajlar yükleniyor...</p>
          </div>
        </div>
      ) : (
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto bg-[#efeae2] p-4 min-h-0" 
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4d4d4' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        >
          {filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-32 h-32 mx-auto mb-4 bg-gray-300/30 rounded-full flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">
                  {searchTerm ? 'Arama sonucu bulunamadı' : 'Henüz mesaj yok'}
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-1">
              {filteredMessages.map((message, index) => {
                const messageId = getMessageId(message);
                const prevMessage = filteredMessages[index - 1];
                const showDateSeparator = index === 0 || !isSameDay(
                  message.timestamp || message.messageTimestamp,
                  prevMessage?.timestamp || prevMessage?.messageTimestamp
                );
                
                const isProtocolMessage = message.messageStubType || message.type?.startsWith('protocol_');
                const fromMe = message.fromMe;
                const text = message.text || message.body || extractMessageText(message);
                const timestamp = message.timestamp || message.messageTimestamp;
                
                // Medya mesajı kontrolü
                const messageType = message.type || (message.message ? Object.keys(message.message)[0] : 'unknown');
                const isMediaMessage = ['imageMessage', 'image', 'videoMessage', 'video', 'audioMessage', 'audio', 'ptt', 'documentMessage', 'document', 'stickerMessage', 'sticker'].includes(messageType);
                
                const nextMessage = filteredMessages[index + 1];
                const nextFromMe = nextMessage?.fromMe;
                const isLastInGroup = fromMe !== nextFromMe;
                const prevFromMe = prevMessage?.fromMe;
                const showTail = fromMe !== prevFromMe || showDateSeparator;
                
                const isEditing = editingMessage?.id === message.id;
                
                return (
                  <React.Fragment key={messageId || index}>
                    {/* Date Separator */}
                    {showDateSeparator && (
                      <div className="flex justify-center my-4">
                        <div className="bg-white/80 backdrop-blur-sm text-gray-700 text-xs px-4 py-1.5 rounded-full shadow-sm font-medium">
                          {formatDate(timestamp)}
                        </div>
                      </div>
                    )}
                    
                    {/* Protocol/System Messages */}
                    {isProtocolMessage ? (
                      <div className="flex justify-center my-2">
                        <div className="bg-[#f0f0f0]/80 backdrop-blur-sm text-gray-600 text-xs px-3 py-1.5 rounded-lg max-w-md text-center">
                          {text}
                        </div>
                      </div>
                    ) : (
                      /* Regular Message */
                      <div
                        className={cn(
                          'flex group relative',
                          fromMe ? 'justify-end' : 'justify-start',
                          isLastInGroup ? 'mb-2' : 'mb-0.5'
                        )}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenuMessageId(messageId);
                        }}
                      >
                        <div
                          className={cn(
                            'relative max-w-[65%] min-w-[100px] rounded-lg px-2 py-1.5 shadow-sm',
                            fromMe ? 'bg-[#d9fdd3]' : 'bg-white',
                            fromMe
                              ? showTail ? 'rounded-tr-none' : 'rounded-tr-lg'
                              : showTail ? 'rounded-tl-none' : 'rounded-tl-lg'
                          )}
                          style={{ boxShadow: '0 1px 0.5px rgba(11,20,26,.13)' }}
                        >
                          {/* Group Sender Name */}
                          {!fromMe && chat.id.includes('@g.us') && message.pushName && (
                            <div className="text-xs font-semibold mb-0.5" style={{ color: '#00a884' }}>
                              {message.pushName}
                            </div>
                          )}
                          
                          {/* Forwarded Indicator */}
                          {message.isForwarded && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                              <Forward size={12} />
                              <span className="italic">İletildi</span>
                            </div>
                          )}
                          
                          {/* Quoted Message */}
                          {message.quotedMessage && (
                            <div className={cn(
                              'mb-2 pl-2 py-1 pr-1 rounded border-l-4',
                              fromMe ? 'bg-[#cef2c5] border-green-600' : 'bg-gray-100 border-gray-500'
                            )}>
                              <div className="text-xs font-semibold text-green-700 mb-0.5">
                                {message.quotedMessage.from || 'Kişi'}
                              </div>
                              <div className="text-xs text-gray-600 line-clamp-2">
                                {message.quotedMessage.text || 'Mesaj'}
                              </div>
                            </div>
                          )}
                          
                          {/* Message Content */}
                          {isEditing ? (
                            <div className="bg-white p-2 rounded-lg border-2 border-green-300 shadow-md">
                              <textarea
                                value={editingText}
                                onChange={(e) => onSetEditingText?.(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onEditMessage?.(message, editingText || '');
                                  } else if (e.key === 'Escape') {
                                    onSetEditingMessage?.(null);
                                    onSetEditingText?.('');
                                  }
                                }}
                                className="w-full px-2 py-1.5 border-0 focus:outline-none resize-none text-sm"
                                rows={2}
                                autoFocus
                                placeholder="Mesajı düzenle..."
                              />
                              <div className="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-gray-200">
                                <button
                                  onClick={() => {
                                    onSetEditingMessage?.(null);
                                    onSetEditingText?.('');
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                >
                                  <X size={16} />
                                </button>
                                <button
                                  onClick={() => onEditMessage?.(message, editingText || '')}
                                  className="p-1.5 text-white bg-green-500 hover:bg-green-600 rounded"
                                >
                                  <Check size={16} />
                                </button>
                              </div>
                            </div>
                          ) : isMediaMessage ? (
                            <MediaMessage message={message} fromMe={fromMe} sessionId={sessionId} />
                          ) : (
                            <div className="text-[14.2px] leading-[19px] text-gray-900 break-words whitespace-pre-wrap" 
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            >
                              {searchTerm.trim() ? highlightText(text, searchTerm) : text}
                            </div>
                          )}
                          
                          {/* Message Footer */}
                          <div className="flex items-center justify-end gap-1 mt-1 float-right ml-2">
                            {message.edited && (
                              <span className="text-[11px] text-gray-500">düzenlendi</span>
                            )}
                            {message.starred && (
                              <Star size={12} className="text-yellow-600 fill-yellow-600" />
                            )}
                            <span className="text-[11px] text-gray-500">
                              {formatTime(timestamp)}
                            </span>
                            {fromMe && message.status && (
                              <MessageStatus status={message.status} />
                            )}
                          </div>
                          
                          {/* Reactions */}
                          {message.reactions && message.reactions.length > 0 && (
                            <div className="absolute -bottom-2 right-2 flex gap-1">
                              {message.reactions.slice(0, 3).map((reaction: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="bg-white rounded-full px-1.5 py-0.5 text-xs shadow-md border border-gray-200"
                                >
                                  {reaction.emoji || reaction.text}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Hover Actions */}
                          <div className={cn(
                            'absolute opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded shadow-lg p-1 z-10 flex gap-1',
                            fromMe ? 'left-0 -top-8' : 'right-0 -top-8'
                          )}>
                            {!fromMe && onReply && (
                              <button
                                onClick={() => onReply(message)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Yanıtla"
                              >
                                <Reply size={14} />
                              </button>
                            )}
                            {fromMe && onEdit && (
                              <button
                                onClick={() => {
                                  onSetEditingMessage?.(message);
                                  onSetEditingText?.(text);
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Düzenle"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {onReaction && (() => {
                              const msgId = `${messageId}-emoji`;
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
                                        onClick={() => setEmojiPopupMessageId(null)}
                                      />
                                      <div 
                                        className={cn(
                                          'absolute bottom-full mb-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50',
                                          fromMe ? 'right-0' : 'left-0'
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ width: '220px' }}
                                      >
                                        <div className="grid grid-cols-6 gap-1">
                                          {['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '💯', '😍', '🤔'].map((emoji, emojiIndex) => (
                                            <button
                                              key={`${messageId}-${emoji}-${emojiIndex}`}
                                              onClick={() => {
                                                onReaction(message, emoji);
                                                setEmojiPopupMessageId(null);
                                              }}
                                              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-lg hover:scale-110 transition"
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
                              onClick={() => setMenuMessageId(messageId)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Daha fazla"
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>
                          
                          {/* Context Menu */}
                          {menuMessageId === messageId && (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setMenuMessageId(null)}
                              />
                              <div
                                className={cn(
                                  'absolute top-8 bg-white rounded-lg shadow-2xl py-1 z-50 min-w-[180px] border border-gray-200',
                                  fromMe ? 'right-0' : 'left-0'
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {onReply && (
                                  <button
                                    onClick={() => {
                                      onReply(message);
                                      setMenuMessageId(null);
                                    }}
                                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                                  >
                                    <Reply size={16} />
                                    Yanıtla
                                  </button>
                                )}
                                {onForward && (
                                  <button
                                    onClick={() => {
                                      onForward(message);
                                      setMenuMessageId(null);
                                    }}
                                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                                  >
                                    <Forward size={16} />
                                    İlet
                                  </button>
                                )}
                                {onStar && (
                                  <button
                                    onClick={() => {
                                      onStar(message, !message.starred);
                                      setMenuMessageId(null);
                                    }}
                                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                                  >
                                    {message.starred ? <StarOff size={16} /> : <Star size={16} />}
                                    {message.starred ? 'Yıldızı Kaldır' : 'Yıldızla'}
                                  </button>
                                )}
                                {onPin && (
                                  <button
                                    onClick={() => {
                                      onPin(message, 1, 86400);
                                      setMenuMessageId(null);
                                    }}
                                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                                  >
                                    <Pin size={16} />
                                    Sabitle
                                  </button>
                                )}
                                {onCopy && (
                                  <button
                                    onClick={() => {
                                      onCopy(message);
                                      setMenuMessageId(null);
                                    }}
                                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                                  >
                                    <Copy size={16} />
                                    Kopyala
                                  </button>
                                )}
                                {onShowInfo && (
                                  <>
                                    <div className="my-1 border-t border-gray-200" />
                                    <button
                                      onClick={() => {
                                        onShowInfo(message);
                                        setMenuMessageId(null);
                                      }}
                                      className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-3"
                                    >
                                      <Info size={16} />
                                      Bilgi
                                    </button>
                                  </>
                                )}
                                {(onDeleteForMe || onDelete) && (
                                  <>
                                    <div className="my-1 border-t border-gray-200" />
                                    {onDeleteForMe ? (
                                      <button
                                        onClick={() => {
                                          onDeleteForMe(message);
                                          setMenuMessageId(null);
                                        }}
                                        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-3"
                                      >
                                        <Trash2 size={16} />
                                        Benden Sil
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          if (confirm('Bu mesajı silmek istediğinizden emin misiniz?')) {
                                            onDelete?.(message, false);
                                          }
                                          setMenuMessageId(null);
                                        }}
                                        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-3"
                                      >
                                        <Trash2 size={16} />
                                        Benim için sil
                                      </button>
                                    )}
                                    {fromMe && onDelete && (() => {
                                      const messageTime = timestamp ? (timestamp > 1000000000000 ? timestamp : timestamp * 1000) : 0;
                                      const hours48 = 48 * 60 * 60 * 1000;
                                      const isOlderThan48Hours = messageTime > 0 ? (Date.now() - messageTime) > hours48 : false;
                                      
                                      return (
                                        <button
                                          onClick={() => {
                                            if (confirm('Bu mesaj herkes için silinecek. Emin misiniz?')) {
                                              onDelete(message, true);
                                            }
                                            setMenuMessageId(null);
                                          }}
                                          disabled={isOlderThan48Hours}
                                          className={cn(
                                            'w-full px-4 py-2 text-sm text-left flex items-center gap-3',
                                            isOlderThan48Hours 
                                              ? 'text-gray-400 cursor-not-allowed' 
                                              : 'hover:bg-gray-100 text-red-600'
                                          )}
                                          title={isOlderThan48Hours ? '48 saat geçti' : ''}
                                        >
                                          <Trash2 size={16} />
                                          Herkes için sil
                                        </button>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Message Status Component
function MessageStatus({ status }: { status?: string }) {
  if (!status) return null;
  
  const statusConfig: Record<string, { icon: typeof Check, color: string, title: string, animate?: boolean }> = {
    read: { icon: CheckCheck, color: 'text-blue-500', title: 'Okundu' },
    delivered: { icon: CheckCheck, color: 'text-gray-500', title: 'Teslim edildi' },
    sent: { icon: Check, color: 'text-gray-400', title: 'Gönderildi' },
    pending: { icon: Clock, color: 'text-gray-400', title: 'Gönderiliyor...', animate: true },
    sending: { icon: Clock, color: 'text-gray-400', title: 'Gönderiliyor...', animate: true },
    error: { icon: AlertCircle, color: 'text-red-500', title: 'Gönderilemedi' },
  };
  
  const config = statusConfig[status.toLowerCase()];
  if (!config) return null;
  
  const Icon = config.icon;
  return (
    <span className="inline-flex items-center" title={config.title}>
      <Icon 
        size={12} 
        className={cn(config.color, config.animate && 'animate-pulse')} 
      />
    </span>
  );
}