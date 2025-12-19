import React, { useState, useRef, useEffect } from 'react';
import { X, Smile, Paperclip, Mic, Send, Square, FileText, Loader2 } from 'lucide-react';

interface Message {
  id?: string;
  fromMe?: boolean;
  pushName?: string;
  text?: string;
  body?: string;
}

interface MessageInputProps {
  message: string;
  setMessage: (text: string) => void;
  replyingTo: Message | null;
  showEmojiPicker: boolean;
  showAttachMenu: boolean;
  emojis: string[];
  attachmentOptions: Array<{ icon: string; label: string; color: string }>;
  onSendMessage: () => void;
  onReplyMessage: (msg: Message) => void;
  onSetReplyingTo: (msg: Message | null) => void;
  onSetShowEmojiPicker: (show: boolean) => void;
  onSetShowAttachMenu: (show: boolean) => void;
  onInsertEmoji: (emoji: string) => void;
  onHandleAttachment: (type: string) => void;
  onSendVoiceMessage?: (audioBlob: Blob) => void;
  activeAccountId?: string;
  onOpenTemplates?: () => void;
  isSending?: boolean;
  onSendMedia?: (file: File, type: 'image' | 'video' | 'document') => void;
}

export default function MessageInput({
  message,
  setMessage,
  replyingTo,
  showEmojiPicker,
  showAttachMenu,
  emojis,
  attachmentOptions,
  onSendMessage,
  onReplyMessage,
  onSetReplyingTo,
  onSetShowEmojiPicker,
  onSetShowAttachMenu,
  onInsertEmoji,
  onHandleAttachment,
  onSendVoiceMessage,
  activeAccountId,
  onOpenTemplates,
  isSending = false,
  onSendMedia,
}: MessageInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mikrofon izni kontrolü
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => setHasPermission(true))
      .catch(() => setHasPermission(false));
  }, []);

  // Kayıt süresini güncelle
  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isRecording]);

  // Kayıt başlat
  const startRecording = async () => {
    try {
      if (hasPermission === false) {
        alert('Mikrofon erişimi reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini verin.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // MediaRecorder için tarayıcının desteklediği formatı bul
      let mimeType = 'audio/webm'; // Varsayılan format
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/mpeg'
      ];
      
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      // MediaRecorder oluştur
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Kayıt durdurulduğunda blob oluştur
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Stream'i durdur
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Ses mesajını gönder
        if (onSendVoiceMessage && audioBlob.size > 0) {
          onSendVoiceMessage(audioBlob);
        }

        // State'i sıfırla
        audioChunksRef.current = [];
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      // Ses kaydı başlatılamadı
      alert('Mikrofon erişimi alınamadı. Lütfen tarayıcı ayarlarını kontrol edin.');
    }
  };

  // Kayıt durdur
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Kayıt iptal et
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stream'i durdur
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // State'i sıfırla
      audioChunksRef.current = [];
      setRecordingTime(0);
    }
  };

  // Component unmount olduğunda temizle
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  // Kayıt süresini formatla (mm:ss)
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Yanıtlanan mesaj gösterimi */}
      {replyingTo && (
        <div className="bg-gray-200 px-3 py-2 flex items-center justify-between border-l-4 border-blue-500">
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-600">
              {replyingTo.fromMe ? 'Sen' : (replyingTo.pushName || 'Kişi')} mesajına yanıt veriyorsun
            </div>
            <div className="text-xs text-gray-500 truncate">{replyingTo.text || replyingTo.body || 'Mesaj'}</div>
          </div>
          <button
            onClick={() => onSetReplyingTo(null)}
            className="text-gray-500 hover:text-gray-700 ml-2"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Mesaj Giriş Alanı */}
      <div className="bg-gray-100 p-3 flex items-center space-x-3 relative">
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-3 bg-white rounded-lg shadow-2xl w-80 max-h-80 flex flex-col z-50">
            {/* Emoji kategorileri */}
            <div className="flex border-b px-2 py-1 overflow-x-auto">
              {['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😶‍🌫️', '😵', '😵‍💫', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'].slice(0, 8).map((emoji, index) => (
                <button
                  key={index}
                  onClick={() => onInsertEmoji(emoji)}
                  className="text-xl hover:bg-gray-100 rounded p-1 transition-colors flex-shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-8 gap-2">
                {emojis.map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => onInsertEmoji(emoji)}
                    className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            {/* Arama */}
            <div className="border-t px-2 py-2">
              <input
                type="text"
                placeholder="Emoji ara..."
                className="w-full px-2 py-1 border rounded text-sm"
                onChange={(e) => {
                  // Basit filtreleme - gerçek bir emoji arama kütüphanesi kullanılabilir
                  const searchTerm = e.target.value.toLowerCase();
                  // Bu basit bir örnek, gerçek uygulamada emoji veritabanı kullanılmalı
                }}
              />
            </div>
          </div>
        )}

        {showAttachMenu && (
          <div className="absolute bottom-16 left-14 bg-white rounded-lg shadow-2xl p-3 w-56 z-50">
            <div className="space-y-2">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  onSetShowAttachMenu(false);
                }}
                className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl">
                  📎
                </div>
                <span className="font-medium text-gray-700">Dosya Seç</span>
              </button>
              {attachmentOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => onHandleAttachment(option.label)}
                  className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className={`w-10 h-10 ${option.color} rounded-full flex items-center justify-center text-white text-xl`}>
                    {option.icon}
                  </div>
                  <span className="font-medium text-gray-700">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button 
          onClick={() => {
            onSetShowEmojiPicker(!showEmojiPicker);
            onSetShowAttachMenu(false);
          }}
          className="text-gray-600 hover:text-gray-800"
        >
          <Smile size={24} />
        </button>
        <button 
          onClick={() => {
            onSetShowAttachMenu(!showAttachMenu);
            onSetShowEmojiPicker(false);
          }}
          className="text-gray-600 hover:text-gray-800"
        >
          <Paperclip size={24} />
        </button>
        {onOpenTemplates && (
          <button 
            onClick={() => {
              onOpenTemplates();
              onSetShowEmojiPicker(false);
              onSetShowAttachMenu(false);
            }}
            className="text-gray-600 hover:text-gray-800"
            title="Hazır Mesaj Şablonları"
          >
            <FileText size={24} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            // Otomatik yükseklik ayarla
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
            }
          }}
          onKeyDown={(e) => {
            // Shift+Enter ile yeni satır, Enter ile gönder
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isSending && message.trim()) {
                if (replyingTo) {
                  onReplyMessage(replyingTo);
                } else {
                  onSendMessage();
                }
              }
            }
          }}
          onFocus={() => {
            onSetShowEmojiPicker(false);
            onSetShowAttachMenu(false);
          }}
              placeholder="Bir mesaj yazın (Shift+Enter ile yeni satır)"
              className="flex-1 bg-white rounded-lg px-4 py-2 outline-none resize-none overflow-y-auto max-h-[120px]"
              rows={1}
              disabled={isSending}
              maxLength={4096}
            />
        {/* Gizli file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onSendMedia) {
              if (file.type.startsWith('image/')) {
                onSendMedia(file, 'image');
              } else if (file.type.startsWith('video/')) {
                onSendMedia(file, 'video');
              } else {
                onSendMedia(file, 'document');
              }
            }
            // Reset input
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        />
        {isRecording ? (
          <div className="flex items-center space-x-2 bg-red-100 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-red-700">{formatRecordingTime(recordingTime)}</span>
            <button
              onClick={stopRecording}
              className="text-red-600 hover:text-red-700 p-1"
              title="Gönder"
            >
              <Send size={20} />
            </button>
            <button
              onClick={cancelRecording}
              className="text-red-600 hover:text-red-700 p-1"
              title="İptal"
            >
              <X size={20} />
            </button>
          </div>
        ) : isSending ? (
          <div className="flex items-center space-x-2 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-xs">Gönderiliyor...</span>
          </div>
        ) : message ? (
          <div className="flex flex-col items-end space-y-1">
            <button 
              onClick={onSendMessage}
              className="text-green-600 hover:text-green-700"
              disabled={isSending}
            >
              <Send size={24} />
            </button>
            {message.length > 0 && (
              <span className={`text-xs ${message.length > 4000 ? 'text-red-500' : message.length > 3500 ? 'text-orange-500' : 'text-gray-400'}`}>
                {message.length}/4096
              </span>
            )}
          </div>
        ) : (
          <button 
            onClick={() => {
              if (isRecording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            className={`text-gray-600 hover:text-gray-800 ${hasPermission === false ? 'opacity-50 cursor-not-allowed' : ''} ${isRecording ? 'text-red-600' : ''}`}
            title={hasPermission === false ? 'Mikrofon izni gerekli' : isRecording ? 'Kaydı durdur' : 'Ses kaydı başlat'}
            disabled={hasPermission === false}
          >
            <Mic size={24} />
          </button>
        )}
      </div>
    </>
  );
}
