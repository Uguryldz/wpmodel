import React, { useState, useRef, useEffect } from 'react';
import { X, Smile, Paperclip, Mic, Send, Square } from 'lucide-react';

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
}: MessageInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          <div className="absolute bottom-16 left-3 bg-white rounded-lg shadow-2xl p-4 w-80 max-h-64 overflow-y-auto z-50">
            <div className="grid grid-cols-8 gap-2">
              {emojis.map((emoji, index) => (
                <button
                  key={index}
                  onClick={() => onInsertEmoji(emoji)}
                  className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {showAttachMenu && (
          <div className="absolute bottom-16 left-14 bg-white rounded-lg shadow-2xl p-3 w-56 z-50">
            <div className="space-y-2">
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
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              if (replyingTo) {
                onReplyMessage(replyingTo);
              } else {
                onSendMessage();
              }
            }
          }}
          onFocus={() => {
            onSetShowEmojiPicker(false);
            onSetShowAttachMenu(false);
          }}
          placeholder="Bir mesaj yazın"
          className="flex-1 bg-white rounded-lg px-4 py-2 outline-none"
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
        ) : message ? (
          <button 
            onClick={onSendMessage}
            className="text-green-600 hover:text-green-700"
          >
            <Send size={24} />
          </button>
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
