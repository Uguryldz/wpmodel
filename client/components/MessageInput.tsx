import React from 'react';
import { X, Smile, Paperclip, Mic, Send } from 'lucide-react';

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
}: MessageInputProps) {
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
        {message ? (
          <button 
            onClick={onSendMessage}
            className="text-green-600 hover:text-green-700"
          >
            <Send size={24} />
          </button>
        ) : (
          <button className="text-gray-600 hover:text-gray-800">
            <Mic size={24} />
          </button>
        )}
      </div>
    </>
  );
}
