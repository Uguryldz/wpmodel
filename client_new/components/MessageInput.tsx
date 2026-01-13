// ============================================
// Message Input Component
// ============================================

import React, { useState, useRef } from 'react';
import { Smile, Paperclip, Send, Mic, X, Image, Video, FileText, MapPin, User, Music } from 'lucide-react';
import { cn } from '../utils';
import { EMOJIS } from '../constants';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttachment?: (type: string, file: File) => void;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  replyingTo?: { text: string; onCancel: () => void } | null;
}

const attachmentOptions = [
  { icon: Image, label: 'Fotoğraf', color: 'bg-purple-500', accept: 'image/*' },
  { icon: Video, label: 'Video', color: 'bg-pink-500', accept: 'video/*' },
  { icon: Music, label: 'Ses', color: 'bg-orange-500', accept: 'audio/*' },
  { icon: FileText, label: 'Belge', color: 'bg-blue-500', accept: '*/*' },
];

export function MessageInput({
  value,
  onChange,
  onSend,
  onAttachment,
  disabled = false,
  isSending = false,
  placeholder = 'Mesaj yazın...',
  replyingTo,
}: MessageInputProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<keyof typeof EMOJIS>('smileys');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isSending) {
        onSend();
      }
    }
  };
  
  const handleFileSelect = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
    setShowAttach(false);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAttachment) {
      const type = file.type.startsWith('image/') ? 'image' :
                   file.type.startsWith('video/') ? 'video' :
                   file.type.startsWith('audio/') ? 'audio' : 'document';
      onAttachment(type, file);
    }
    e.target.value = '';
  };
  
  const insertEmoji = (emoji: string) => {
    onChange(value + emoji);
    inputRef.current?.focus();
  };
  
  return (
    <div className="bg-gray-100 p-3 border-t">
      {/* Reply Preview */}
      {replyingTo && (
        <div className="bg-white rounded-lg p-2 mb-2 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-green-600 font-medium">Yanıtlanıyor</div>
            <p className="text-sm text-gray-600 truncate">{replyingTo.text}</p>
          </div>
          <button
            onClick={replyingTo.onCancel}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      )}
      
      {/* Input Area */}
      <div className="flex items-center gap-2">
        {/* Emoji Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowEmoji(!showEmoji);
              setShowAttach(false);
            }}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            disabled={disabled}
          >
            <Smile size={22} className="text-gray-500" />
          </button>
          
          {/* Emoji Picker */}
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl p-4 w-64 z-50">
              {/* Category Tabs */}
              <div className="flex flex-wrap gap-2 mb-3 border-b pb-3">
                {Object.keys(EMOJIS).map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveEmojiCategory(category as keyof typeof EMOJIS)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      activeEmojiCategory === category
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    )}
                  >
                    {category === 'smileys' ? '😀' :
                     category === 'gestures' ? '👍' :
                     category === 'hearts' ? '❤️' : '🎉'}
                  </button>
                ))}
              </div>
              
              {/* Emoji Grid */}
              <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                {EMOJIS[activeEmojiCategory].map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => insertEmoji(emoji)}
                    className="p-1.5 hover:bg-gray-100 rounded text-lg transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Attachment Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowAttach(!showAttach);
              setShowEmoji(false);
            }}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            disabled={disabled}
          >
            <Paperclip size={22} className="text-gray-500" />
          </button>
          
          {/* Attachment Menu */}
          {showAttach && (
            <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl p-4 z-50 w-64">
              <div className="grid grid-cols-2 gap-3">
                {attachmentOptions.map(({ icon: Icon, label, color, accept }) => (
                  <button
                    key={label}
                    onClick={() => handleFileSelect(accept)}
                    className="flex flex-col items-center gap-2 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className={cn('p-3 rounded-full', color)}>
                      <Icon size={24} className="text-white" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        
        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          className="flex-1 px-4 py-2 bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
        
        {/* Send Button */}
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled || isSending}
          className={cn(
            'p-2 rounded-full transition-colors',
            value.trim() && !disabled && !isSending
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
        >
          {isSending ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <Send size={20} />
          )}
        </button>
      </div>
    </div>
  );
}

