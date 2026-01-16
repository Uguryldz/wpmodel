// ============================================
// Message Input Component
// ============================================

import React, { useState, useRef } from 'react';
import { Smile, Paperclip, Send, X, Image, Video, FileText, Music } from 'lucide-react';
import { cn } from '../utils';
import { EMOJIS } from '../constants';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onMediaSend?: (file: File, type: 'image' | 'video' | 'audio' | 'document', caption?: string) => Promise<void>;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  replyingTo?: { text: string; onCancel: () => void } | null;
}

const attachmentOptions = [
  { icon: Image, label: 'Fotoğraf', color: 'bg-purple-500', accept: 'image/*', type: 'image' as const },
  { icon: Video, label: 'Video', color: 'bg-pink-500', accept: 'video/*', type: 'video' as const },
  { icon: Music, label: 'Ses', color: 'bg-orange-500', accept: 'audio/*', type: 'audio' as const },
  { icon: FileText, label: 'Belge', color: 'bg-blue-500', accept: '*/*', type: 'document' as const },
];

export function MessageInput({
  value,
  onChange,
  onSend,
  onMediaSend,
  disabled = false,
  isSending = false,
  placeholder = 'Mesaj yazın...',
  replyingTo,
}: MessageInputProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<keyof typeof EMOJIS>('smileys');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [sendingMedia, setSendingMedia] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFileType, setCurrentFileType] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isSending) {
        onSend();
      }
    }
  };
  
  const handleFileSelect = (accept: string, type: 'image' | 'video' | 'audio' | 'document') => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
      setCurrentFileType(type);
    }
    setShowAttach(false);
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    // Preview oluştur
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
    
    e.target.value = '';
  };
  
  const handleMediaSend = async () => {
    if (!selectedFile || !onMediaSend || sendingMedia) return;
    
    setSendingMedia(true);
    try {
      await onMediaSend(selectedFile, currentFileType, mediaCaption || undefined);
      
      // Temizle
      setSelectedFile(null);
      setFilePreview(null);
      setMediaCaption('');
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    } catch (error) {
      console.error('Medya gönderme hatası:', error);
      alert('Medya gönderilemedi: ' + (error as Error).message);
    } finally {
      setSendingMedia(false);
    }
  };
  
  const cancelMediaPreview = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setMediaCaption('');
  };
  
  const insertEmoji = (emoji: string) => {
    if (selectedFile) {
      setMediaCaption(mediaCaption + emoji);
    } else {
      onChange(value + emoji);
    }
    inputRef.current?.focus();
  };
  
  return (
    <div className="bg-[#f0f2f5] border-t">
      {/* Media Preview Modal - WhatsApp Style */}
      {selectedFile && (
        <div className="fixed inset-0 bg-gray-800 z-50 flex flex-col">
          {/* Header */}
          <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={cancelMediaPreview}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={24} className="text-white" />
              </button>
              <div className="flex-1">
                <h3 className="font-medium text-white text-lg">Medya Önizleme</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedFile.name} • {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          </div>
          
          {/* Preview Area */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            {filePreview ? (
              currentFileType === 'image' ? (
                <img
                  src={filePreview}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                />
              ) : currentFileType === 'video' ? (
                <video
                  src={filePreview}
                  controls
                  className="max-w-full max-h-full rounded-lg shadow-2xl"
                  autoPlay
                  muted
                />
              ) : null
            ) : (
              <div className="bg-[#202c33] rounded-2xl p-12 text-center">
                <div className="w-24 h-24 mx-auto mb-4 bg-[#00a884]/20 rounded-full flex items-center justify-center">
                  <FileText size={48} className="text-[#00a884]" />
                </div>
                <p className="text-white font-medium mb-1">{selectedFile.name}</p>
                <p className="text-gray-400 text-sm">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#00a884]/10 rounded-full">
                  <div className="w-2 h-2 bg-[#00a884] rounded-full animate-pulse" />
                  <span className="text-[#00a884] text-sm font-medium">Belge hazır</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Bottom Bar - Caption & Send */}
          <div className="bg-[#202c33] border-t border-[#2a3942]">
            {/* Caption Input */}
            <div className="px-4 py-3">
              <div className="relative">
                <input
                  type="text"
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  placeholder="Bir şeyler yazın..."
                  className="w-full bg-[#2a3942] text-black placeholder-gray-400 px-4 py-3 pr-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884] transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !sendingMedia) {
                      handleMediaSend();
                    }
                  }}
                />
                {/* Emoji button in caption */}
                <button
                  onClick={() => {
                    setShowEmoji(!showEmoji);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Smile size={20} className="text-gray-400" />
                </button>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="px-4 pb-4 flex items-center justify-between">
              <div className="text-gray-400 text-sm">
                {currentFileType === 'image' && '📷 Fotoğraf'}
                {currentFileType === 'video' && '🎥 Video'}
                {currentFileType === 'audio' && '🎵 Ses'}
                {currentFileType === 'document' && '📄 Belge'}
              </div>
              
              <button
                onClick={handleMediaSend}
                disabled={sendingMedia}
                className="flex items-center gap-2 px-6 py-3 bg-[#00a884] hover:bg-[#06cf9c] text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                {sendingMedia ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    <span className="font-medium">Gönderiliyor...</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span className="font-medium">Gönder</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Reply Preview */}
      {replyingTo && (
        <div className="bg-white border-b p-2 mx-3 mt-3 rounded-t-lg flex items-center justify-between">
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
      <div className="flex items-center gap-2 p-3">
        {/* Emoji Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowEmoji(!showEmoji);
              setShowAttach(false);
            }}
            className="p-2 hover:bg-white/50 rounded-full transition-colors"
            disabled={disabled}
          >
            <Smile size={24} className="text-[#54656f]" />
          </button>
          
          {/* Emoji Picker */}
          {showEmoji && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowEmoji(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl p-4 w-80 z-50">
                {/* Category Tabs */}
                <div className="flex gap-2 mb-3 border-b pb-3">
                  {Object.keys(EMOJIS).map((category) => (
                    <button
                      key={category}
                      onClick={() => setActiveEmojiCategory(category as keyof typeof EMOJIS)}
                      className={cn(
                        'px-3 py-1 text-sm rounded transition-colors',
                        activeEmojiCategory === category
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200'
                      )}
                    >
                      {category === 'smileys' ? '😊' :
                       category === 'gestures' ? '👍' :
                       category === 'hearts' ? '❤️' : '🎉'}
                    </button>
                  ))}
                </div>
                
                {/* Emoji Grid */}
                <div className="grid grid-cols-8 gap-1 max-h-64 overflow-y-auto">
                  {EMOJIS[activeEmojiCategory].map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        insertEmoji(emoji);
                        setShowEmoji(false);
                      }}
                      className="p-2 hover:bg-gray-100 rounded text-xl transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Attachment Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowAttach(!showAttach);
              setShowEmoji(false);
            }}
            className="p-2 hover:bg-white/50 rounded-full transition-colors"
            disabled={disabled}
          >
            <Paperclip size={24} className="text-[#54656f]" />
          </button>
          
          {/* Attachment Menu */}
          {showAttach && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowAttach(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-xl p-4 z-50 w-64">
                <div className="grid grid-cols-2 gap-3">
                  {attachmentOptions.map(({ icon: Icon, label, color, accept, type }) => (
                    <button
                      key={label}
                      onClick={() => handleFileSelect(accept, type)}
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
            </>
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
          className="flex-1 px-4 py-3 bg-white rounded-lg focus:outline-none disabled:opacity-50 text-[15px]"
        />
        
        {/* Send Button */}
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled || isSending}
          className={cn(
            'p-3 rounded-full transition-colors',
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