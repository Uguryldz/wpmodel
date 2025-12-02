import React, { useState } from 'react';
import { MessageCircle, Plus, Search, MoreVertical, Menu, Users, Phone, Video, Smile, Paperclip, Mic, Send, Check, CheckCheck } from 'lucide-react';

interface Account {
  id: number;
  name: string;
  phone: string;
  color: string;
  active: boolean;
}

interface Chat {
  id: number;
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
  avatar: string;
  online?: boolean;
  status?: 'check' | 'double-check';
  isGroup?: boolean;
}

export default function WhatsAppMultiAccount() {
  const [accounts, setAccounts] = useState<Account[]>([
    { id: 1, name: 'Kişisel', phone: '+90 555 123 4567', color: 'bg-green-500', active: true },
    { id: 2, name: 'İş', phone: '+90 555 987 6543', color: 'bg-blue-500', active: false },
    { id: 3, name: 'Aile', phone: '+90 555 456 7890', color: 'bg-purple-500', active: false }
  ]);

  const [chats, setChats] = useState<Chat[]>([
    { id: 1, name: 'Ahmet Yılmaz', lastMessage: 'Toplantı saat kaçta?', time: '14:32', unread: 2, avatar: '👨', online: true },
    { id: 2, name: 'Ayşe Demir', lastMessage: 'Teşekkürler!', time: '13:15', unread: 0, avatar: '👩', status: 'double-check' },
    { id: 3, name: 'Proje Ekibi', lastMessage: 'Mehmet: Rapor hazır', time: '12:45', unread: 5, avatar: '👥', isGroup: true },
    { id: 4, name: 'Fatma Kaya', lastMessage: 'Yarın görüşürüz', time: '11:20', unread: 0, avatar: '👩‍💼', status: 'check' },
    { id: 5, name: 'Can Özkan', lastMessage: 'Dosyaları gönderdim', time: 'Dün', unread: 0, avatar: '👨‍💻', status: 'double-check' }
  ]);

  const [selectedChat, setSelectedChat] = useState<Chat>(chats[0]);
  const [message, setMessage] = useState('');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸'];

  const attachmentOptions = [
    { icon: '📄', label: 'Belge', color: 'bg-purple-500' },
    { icon: '📷', label: 'Fotoğraf', color: 'bg-pink-500' },
    { icon: '📹', label: 'Video', color: 'bg-red-500' },
    { icon: '🎵', label: 'Ses', color: 'bg-orange-500' },
    { icon: '👤', label: 'Kişi', color: 'bg-blue-500' },
    { icon: '📍', label: 'Konum', color: 'bg-green-500' }
  ];

  const activeAccount = accounts.find(acc => acc.active) || accounts[0];

  const switchAccount = (accountId: number) => {
    setAccounts(accounts.map(acc => ({
      ...acc,
      active: acc.id === accountId
    })));
    setShowAccountMenu(false);
  };

  const addAccount = () => {
    const newAccount: Account = {
      id: accounts.length + 1,
      name: `Hesap ${accounts.length + 1}`,
      phone: '+90 555 000 0000',
      color: 'bg-orange-500',
      active: false
    };
    setAccounts([...accounts, newAccount]);
  };

  const sendMessage = () => {
    if (message.trim()) {
      setMessage('');
      setShowEmojiPicker(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    setMessage(message + emoji);
  };

  const handleAttachment = (type: string) => {
    console.log(`${type} seçildi`);
    setShowAttachMenu(false);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Hesap Seçici Sidebar */}
      <div className="w-20 bg-gray-800 flex flex-col items-center py-4 space-y-4">
        <div className="text-white text-2xl mb-4">
          <MessageCircle size={32} />
        </div>
        
        {accounts.map(account => (
          <button
            key={account.id}
            onClick={() => switchAccount(account.id)}
            className={`w-12 h-12 rounded-full ${account.color} flex items-center justify-center text-white font-bold relative hover:scale-110 transition-transform ${
              account.active ? 'ring-4 ring-white' : ''
            }`}
            title={account.name}
          >
            {account.name[0]}
            {account.active && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-gray-800"></div>
            )}
          </button>
        ))}
        
        <button
          onClick={addAccount}
          className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white hover:bg-gray-500 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Ana WhatsApp Arayüzü */}
      <div className="flex-1 flex">
        {/* Sohbet Listesi */}
        <div className="w-96 bg-white border-r flex flex-col">
          {/* Header */}
          <div className="bg-gray-100 p-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full ${activeAccount.color} flex items-center justify-center text-white font-bold`}>
                {activeAccount.name[0]}
              </div>
              <div className="text-sm">
                <div className="font-semibold">{activeAccount.name}</div>
                <div className="text-gray-500 text-xs">{activeAccount.phone}</div>
              </div>
            </div>
            <div className="flex space-x-4 text-gray-600">
              <button className="hover:text-gray-800"><Users size={20} /></button>
              <button className="hover:text-gray-800"><MoreVertical size={20} /></button>
            </div>
          </div>

          {/* Arama */}
          <div className="p-2 bg-white">
            <div className="bg-gray-100 rounded-lg px-4 py-2 flex items-center">
              <Search size={18} className="text-gray-500" />
              <input
                type="text"
                placeholder="Ara veya yeni sohbet başlat"
                className="bg-transparent ml-3 outline-none flex-1 text-sm"
              />
            </div>
          </div>

          {/* Sohbet Listesi */}
          <div className="flex-1 overflow-y-auto">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer border-b ${
                  selectedChat.id === chat.id ? 'bg-gray-100' : ''
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-2xl">
                    {chat.avatar}
                  </div>
                  {chat.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm truncate">{chat.name}</span>
                    <span className="text-xs text-gray-500">{chat.time}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div className="flex items-center space-x-1 flex-1 min-w-0">
                      {chat.status === 'check' && <Check size={14} className="text-gray-400 flex-shrink-0" />}
                      {chat.status === 'double-check' && <CheckCheck size={14} className="text-blue-500 flex-shrink-0" />}
                      <span className="text-sm text-gray-600 truncate">{chat.lastMessage}</span>
                    </div>
                    {chat.unread > 0 && (
                      <div className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs ml-2 flex-shrink-0">
                        {chat.unread}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sohbet Alanı */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-gray-100 p-3 flex items-center justify-between border-b">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-2xl">
                {selectedChat.avatar}
              </div>
              <div>
                <div className="font-semibold">{selectedChat.name}</div>
                <div className="text-xs text-gray-500">
                  {selectedChat.online ? 'çevrimiçi' : 'son görülme bugün 12:30'}
                </div>
              </div>
            </div>
            <div className="flex space-x-4 text-gray-600">
              <button className="hover:text-gray-800"><Video size={20} /></button>
              <button className="hover:text-gray-800"><Phone size={20} /></button>
              <button className="hover:text-gray-800"><Search size={20} /></button>
              <button className="hover:text-gray-800"><MoreVertical size={20} /></button>
            </div>
          </div>

          {/* Mesajlar */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,.03) 10px, rgba(0,0,0,.03) 20px)'
          }}>
            <div className="space-y-3">
              <div className="flex justify-start">
                <div className="bg-white rounded-lg p-3 max-w-md shadow">
                  <p className="text-sm">Merhaba! Nasılsın?</p>
                  <span className="text-xs text-gray-500 mt-1 block">10:30</span>
                </div>
              </div>
              
              <div className="flex justify-end">
                <div className="bg-[#d9fdd3] rounded-lg p-3 max-w-md shadow">
                  <p className="text-sm">İyiyim, teşekkürler! Sen nasılsın?</p>
                  <div className="flex items-center justify-end space-x-1 mt-1">
                    <span className="text-xs text-gray-500">10:32</span>
                    <CheckCheck size={14} className="text-blue-500" />
                  </div>
                </div>
              </div>

              <div className="flex justify-start">
                <div className="bg-white rounded-lg p-3 max-w-md shadow">
                  <p className="text-sm">{selectedChat.lastMessage}</p>
                  <span className="text-xs text-gray-500 mt-1 block">{selectedChat.time}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mesaj Giriş Alanı */}
          <div className="bg-gray-100 p-3 flex items-center space-x-3 relative">
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-16 left-3 bg-white rounded-lg shadow-2xl p-4 w-80 max-h-64 overflow-y-auto z-50">
                <div className="grid grid-cols-8 gap-2">
                  {emojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => insertEmoji(emoji)}
                      className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Attachment Menu */}
            {showAttachMenu && (
              <div className="absolute bottom-16 left-14 bg-white rounded-lg shadow-2xl p-3 w-56 z-50">
                <div className="space-y-2">
                  {attachmentOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAttachment(option.label)}
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
                setShowEmojiPicker(!showEmojiPicker);
                setShowAttachMenu(false);
              }}
              className="text-gray-600 hover:text-gray-800"
            >
              <Smile size={24} />
            </button>
            <button 
              onClick={() => {
                setShowAttachMenu(!showAttachMenu);
                setShowEmojiPicker(false);
              }}
              className="text-gray-600 hover:text-gray-800"
            >
              <Paperclip size={24} />
            </button>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              onFocus={() => {
                setShowEmojiPicker(false);
                setShowAttachMenu(false);
              }}
              placeholder="Bir mesaj yazın"
              className="flex-1 bg-white rounded-lg px-4 py-2 outline-none"
            />
            {message ? (
              <button 
                onClick={sendMessage}
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
        </div>
      </div>
    </div>
  );
}