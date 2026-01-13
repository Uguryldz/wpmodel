// ============================================
// Message List Component
// ============================================

import React, { useEffect, useRef } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Edit2, Star, MoreVertical, Reply, Forward, Trash2, Copy } from 'lucide-react';
import type { Chat, Message } from '../types';
import { cn } from '../utils';
import { formatTime, formatDate, isSameDay } from '../utils/date';
import { getMessageId, extractMessageText } from '../utils/message';

interface MessageListProps {
  chat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message, forEveryone?: boolean) => void;
  onForward?: (message: Message) => void;
  onStar?: (message: Message, star: boolean) => void;
  onCopy?: (message: Message) => void;
  onReaction?: (message: Message, emoji: string) => void;
}

export function MessageList({
  chat,
  messages,
  isLoading,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onStar,
  onCopy,
  onReaction,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [menuMessageId, setMenuMessageId] = React.useState<string | null>(null);
  
  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-lg">Bir sohbet seçin</p>
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }
  
  return (
    <div className="flex-1 overflow-y-auto bg-[#e5ddd5] p-4 min-h-0">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          <p>Henüz mesaj yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((message, index) => {
            const messageId = getMessageId(message);
            const prevMessage = messages[index - 1];
            const showDateSeparator = index === 0 || !isSameDay(
              message.timestamp || message.messageTimestamp,
              prevMessage?.timestamp || prevMessage?.messageTimestamp
            );
            
            return (
              <React.Fragment key={messageId || index}>
                {/* Date Separator */}
                {showDateSeparator && (
                  <div className="flex justify-center my-4">
                    <span className="bg-white/80 text-gray-600 text-xs px-3 py-1 rounded-full shadow-sm">
                      {formatDate(message.timestamp || message.messageTimestamp)}
                    </span>
                  </div>
                )}
                
                {/* Message Bubble */}
                <div
                  className={cn(
                    'flex rounded-lg',
                    message.fromMe ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'relative max-w-[70%] min-w-0 rounded-lg px-3 py-2 shadow-sm',
                      message.fromMe
                        ? 'bg-green-500 rounded-tr-none'
                        : 'bg-white rounded-tl-none'
                    )}
                  >
                    {/* Message Content */}
                    <p className="text-gray-800 whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {message.text || message.body || extractMessageText(message)}
                    </p>
                    
                    {/* Footer */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {message.edited && (
                        <span className="text-xs text-gray-500">
                          <Edit2 size={10} />
                        </span>
                      )}
                      {message.starred && (
                        <Star size={10} className="text-yellow-500 fill-yellow-500" />
                      )}
                      <span className="text-xs text-gray-500">
                        {formatTime(message.timestamp || message.messageTimestamp)}
                      </span>
                      {message.fromMe && false && (
                        <MessageStatus status={message.status} />
                      )}
                    </div>
                    
                    {/* Reactions */}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {message.reactions.map((reaction: any, idx: number) => (
                          <span
                            key={idx}
                            className="bg-white/80 rounded-full px-1.5 py-0.5 text-xs shadow-sm"
                          >
                            {reaction.emoji || reaction.text}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Menu Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuMessageId(menuMessageId === messageId ? null : messageId);
                      }}
                      className={cn(
                        'absolute top-1 p-1 rounded opacity-0 hover:opacity-100 transition-opacity',
                        message.fromMe ? 'left-1' : 'right-1'
                      )}
                    >
                      <MoreVertical size={14} className="text-gray-500" />
                    </button>
                    
                    {/* Context Menu */}
                    {menuMessageId === messageId && (
                      <div
                        className={cn(
                          'absolute top-8 bg-white rounded-lg shadow-xl py-1 z-50 min-w-[140px]',
                          message.fromMe ? 'left-0' : 'right-0'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {onReply && (
                          <button
                            onClick={() => {
                              onReply(message);
                              setMenuMessageId(null);
                            }}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Reply size={14} />
                            Yanıtla
                          </button>
                        )}
                        {onForward && (
                          <button
                            onClick={() => {
                              onForward(message);
                              setMenuMessageId(null);
                            }}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Forward size={14} />
                            İlet
                          </button>
                        )}
                        {onCopy && (
                          <button
                            onClick={() => {
                              onCopy(message);
                              setMenuMessageId(null);
                            }}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Copy size={14} />
                            Kopyala
                          </button>
                        )}
                        {message.fromMe && onEdit && (
                          <button
                            onClick={() => {
                              onEdit(message);
                              setMenuMessageId(null);
                            }}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Edit2 size={14} />
                            Düzenle
                          </button>
                        )}
                        {onStar && (
                          <button
                            onClick={() => {
                              onStar(message, !message.starred);
                              setMenuMessageId(null);
                            }}
                            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Star size={14} />
                            {message.starred ? 'Yıldızı Kaldır' : 'Yıldızla'}
                          </button>
                        )}
                        {onDelete && (
                          <>
                            <button
                              onClick={() => {
                                onDelete(message, false);
                                setMenuMessageId(null);
                              }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-2"
                            >
                              <Trash2 size={14} />
                              Benim için sil
                            </button>
                            {message.fromMe && (
                              <button
                                onClick={() => {
                                  onDelete(message, true);
                                  setMenuMessageId(null);
                                }}
                                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-2"
                              >
                                <Trash2 size={14} />
                                Herkes için sil
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}

// Message Status Component
function MessageStatus({ status }: { status?: string }) {
  switch (status) {
    case 'read':
      return <CheckCheck size={14} className="text-blue-500" />;
    case 'delivered':
      return <CheckCheck size={14} className="text-gray-500" />;
    case 'sent':
      return <Check size={14} className="text-gray-500" />;
    case 'pending':
      return <Clock size={14} className="text-gray-400" />;
    case 'error':
      return <AlertCircle size={14} className="text-red-500" />;
    default:
      return <Check size={14} className="text-gray-500" />;
  }
}

