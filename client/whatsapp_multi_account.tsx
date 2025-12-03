import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Plus, Search, MoreVertical, Users, Phone, Video, Smile, Paperclip, Mic, Send, Check, CheckCheck, X, Edit2, Loader2, LogOut, Volume2, VolumeX } from 'lucide-react';
import * as api from './api';
import * as QRCode from 'qrcode';

interface Account {
  id: string;
  name: string;
  status?: string;
  color: string;
  active: boolean;
}

interface Chat {
  id: string;
  name: string;
  unreadCount?: number;
  conversationTimestamp?: number | null;
  isMuted?: boolean;
  lastMessage?: string;
  time?: string;
}

export default function WhatsAppMultiAccount() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState('');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sseRef = useRef<(() => void) | null>(null);

  const colors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-red-500', 'bg-yellow-500', 'bg-indigo-500'];

  // Hesap listesini yükle
  useEffect(() => {
    console.log('=== Component mount - loadAccounts çağrılıyor ===');
    loadAccounts();
  }, []);


  // Aktif hesap değiştiğinde sohbetleri yükle
  const activeAccount = accounts.find(acc => acc.active) || accounts[0];
  useEffect(() => {
    console.log('=== activeAccount değişti ===', activeAccount);
    if (activeAccount) {
      console.log('loadChats çağrılıyor, sessionId:', activeAccount.id);
      loadChats(activeAccount.id);
    } else {
      console.log('activeAccount yok, loadChats çağrılmıyor');
    }
  }, [activeAccount?.id]);

  const loadAccounts = async () => {
    try {
      console.log('Hesaplar yükleniyor...');
      const sessions = await api.getSessions();
      console.log('Sessions alındı:', sessions);
      
      if (!sessions || sessions.length === 0) {
        console.log('Session bulunamadı');
        setAccounts([]);
        return;
      }

      const accountsWithStatus = await Promise.all(
        sessions.map(async (session, index) => {
          try {
            const status = await api.getSessionStatus(session.id);
            return {
              id: session.id,
              name: session.id, // Varsayılan isim sessionId
              status: status.status || session.status || 'unknown',
              color: colors[index % colors.length],
              active: index === 0, // İlk hesap aktif
            };
          } catch (error) {
            console.warn(`Session ${session.id} status alınamadı:`, error);
            // Status alınamazsa session'dan gelen status'u kullan
            return {
              id: session.id,
              name: session.id,
              status: session.status || 'unknown',
              color: colors[index % colors.length],
              active: index === 0,
            };
          }
        })
      );
      
      console.log('Hesaplar oluşturuldu:', accountsWithStatus);
      
      // Aktif hesap yoksa ilkini aktif yap
      const hasActive = accountsWithStatus.some(acc => acc.active);
      if (!hasActive && accountsWithStatus.length > 0) {
        accountsWithStatus[0].active = true;
      }
      
      setAccounts(accountsWithStatus);
    } catch (error) {
      console.error('Hesaplar yüklenemedi:', error);
      // Hata durumunda boş liste göster
      setAccounts([]);
    }
  };

  const loadChats = async (sessionId: string) => {
    try {
      console.log('=== Sohbetler yükleniyor ===');
      console.log('SessionId:', sessionId);
      console.log('Aktif hesap:', activeAccount);
      
      const chatsData = await api.getChats(sessionId);
      console.log('Sohbetler alındı (ham data):', chatsData);
      console.log('Sohbet sayısı:', chatsData?.length || 0);
      
      if (!chatsData || chatsData.length === 0) {
        console.warn('Sohbet listesi boş! SessionId doğru mu kontrol edin.');
        setChats([]);
        return;
      }
      
      const formattedChats = chatsData.map(chat => ({
        ...chat,
        lastMessage: '',
        time: chat.conversationTimestamp 
          ? new Date(chat.conversationTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          : '',
      }));
      console.log('Formatlanmış sohbetler:', formattedChats);
      setChats(formattedChats);
      if (formattedChats.length > 0 && !selectedChat) {
        setSelectedChat(formattedChats[0]);
      }
    } catch (error: any) {
      console.error('Sohbetler yüklenemedi:', error);
      console.error('Hata detayı:', error.message);
      console.error('SessionId:', sessionId);
      setChats([]); // Hata durumunda boş liste göster
      // Kullanıcıya hata göster
      alert(`Sohbetler yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  const switchAccount = (accountId: string) => {
    setAccounts(accounts.map(acc => ({
      ...acc,
      active: acc.id === accountId
    })));
  };

  const handleAddAccount = () => {
    setShowAddAccountModal(true);
    setNewAccountName('');
    setNewAccountId('');
    setQrCode(null);
  };

  const createAccount = async () => {
    if (!newAccountId.trim()) {
      alert('Hesap ID gerekli');
      return;
    }

    const accountName = newAccountName.trim() || newAccountId;
    setIsLoadingQR(true);
    setQrCode(null);

    try {
      // Session oluştur
      await api.createSession(newAccountId);
      
      // Hesap listesine ekle
      const newAccount: Account = {
        id: newAccountId,
        name: accountName,
        status: 'connecting',
        color: colors[accounts.length % colors.length],
        active: accounts.length === 0, // İlk hesap aktif
      };
      setAccounts([...accounts, newAccount]);

      // SSE ile QR kod dinle
      sseRef.current = api.subscribeToQR(newAccountId, (data) => {
        if (data.qr) {
          // QR kod string'ini görsel QR kod'a çevir
          QRCode.toDataURL(data.qr)
            .then(url => {
              setQrCode(url);
              setIsLoadingQR(false);
            })
            .catch(err => {
              console.error('QR kod oluşturulamadı:', err);
              setIsLoadingQR(false);
            });
        }
        if (data.status === 'open') {
          // Bağlantı başarılı
          if (sseRef.current) {
            sseRef.current();
            sseRef.current = null;
          }
          setQrCode(null);
          setIsLoadingQR(false);
          setShowAddAccountModal(false);
          loadAccounts(); // Hesap listesini yenile
        }
      });

      // Alternatif: QR kod'u direkt çek
      setTimeout(async () => {
        try {
          const qr = await api.getQRCode(newAccountId);
          if (qr) {
            QRCode.toDataURL(qr)
              .then(url => {
                setQrCode(url);
                setIsLoadingQR(false);
              })
              .catch(err => console.error('QR kod oluşturulamadı:', err));
          }
        } catch (error) {
          console.error('QR kod alınamadı:', error);
        }
      }, 2000);

    } catch (error: any) {
      console.error('Hesap oluşturulamadı:', error);
      alert(error.message || 'Hesap oluşturulamadı');
      setIsLoadingQR(false);
    }
  };

  const handleRenameAccount = (accountId: string, newName: string) => {
    setAccounts(accounts.map(acc => 
      acc.id === accountId ? { ...acc, name: newName } : acc
    ));
    setEditingAccountId(null);
    setEditingAccountName('');
  };

  const startEditingAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setEditingAccountName(account.name);
  };

  const sendMessage = async () => {
    if (!message.trim() || !activeAccount || !selectedChat) return;
    
    try {
      await api.sendMessage(activeAccount.id, selectedChat.id, message);
      setMessage('');
      setShowEmojiPicker(false);
      // Mesajları yenile
      if (selectedChat) {
        loadChats(activeAccount.id);
      }
    } catch (error) {
      console.error('Mesaj gönderilemedi:', error);
      alert('Mesaj gönderilemedi');
    }
  };

  const insertEmoji = (emoji: string) => {
    setMessage(message + emoji);
  };

  const handleAttachment = (type: string) => {
    console.log(`${type} seçildi`);
    setShowAttachMenu(false);
  };

  const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸'];

  const attachmentOptions = [
    { icon: '📄', label: 'Belge', color: 'bg-purple-500' },
    { icon: '📷', label: 'Fotoğraf', color: 'bg-pink-500' },
    { icon: '📹', label: 'Video', color: 'bg-red-500' },
    { icon: '🎵', label: 'Ses', color: 'bg-orange-500' },
    { icon: '👤', label: 'Kişi', color: 'bg-blue-500' },
    { icon: '📍', label: 'Konum', color: 'bg-green-500' }
  ];

  // Cleanup
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current();
      }
      if (qrIntervalRef.current) {
        clearInterval(qrIntervalRef.current);
      }
    };
  }, []);

  // Hesap yoksa göster
  if (accounts.length === 0) {
    return (
      <div className="flex h-screen bg-gray-100 items-center justify-center">
        <div className="text-center">
          <MessageCircle size={64} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 mb-4">Hesaplar yükleniyor veya henüz hesap eklenmemiş</p>
          <p className="text-gray-400 text-xs mb-4">Console'u kontrol edin (F12)</p>
          <div className="space-x-2">
            <button
              onClick={() => {
                console.log('Manuel yükleme başlatılıyor...');
                loadAccounts();
              }}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Yeniden Dene
            </button>
            <button
              onClick={handleAddAccount}
              className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Hesap Ekle
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Aktif hesap yoksa loading göster
  if (!activeAccount) {
    return (
      <div className="flex h-screen bg-gray-100 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto text-gray-400 mb-4 animate-spin" size={64} />
          <p className="text-gray-600">Hesap yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Hesap Seçici Sidebar */}
      <div className="w-20 bg-gray-800 flex flex-col items-center py-4 space-y-4">
        <div className="text-white text-2xl mb-4">
          <MessageCircle size={32} />
        </div>
        
        {accounts.map(account => (
          <div key={account.id} className="relative group">
            <button
              onClick={() => switchAccount(account.id)}
              className={`w-12 h-12 rounded-full ${account.color} flex items-center justify-center text-white font-bold relative hover:scale-110 transition-transform ${
                account.active ? 'ring-4 ring-white' : ''
              }`}
              title={account.name}
            >
              {account.name[0].toUpperCase()}
              {account.active && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-gray-800"></div>
              )}
            </button>
            {account.status === 'open' && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
            )}
          </div>
        ))}
        
        <button
          onClick={handleAddAccount}
          className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white hover:bg-gray-500 transition-colors"
          title="Hesap Ekle"
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
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className={`w-10 h-10 rounded-full ${activeAccount.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                {activeAccount.name[0].toUpperCase()}
              </div>
              <div className="text-sm flex-1 min-w-0">
                <div className="font-semibold truncate">{activeAccount.name}</div>
                <div className="text-gray-500 text-xs truncate" title={activeAccount.id}>
                  ID: {activeAccount.id}
                </div>
                {activeAccount.status === 'open' && (
                  <div className="text-gray-400 text-xs">Bağlı</div>
                )}
              </div>
              {editingAccountId === activeAccount.id ? (
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={editingAccountName}
                    onChange={(e) => setEditingAccountName(e.target.value)}
                    onBlur={() => handleRenameAccount(activeAccount.id, editingAccountName)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameAccount(activeAccount.id, editingAccountName);
                      }
                    }}
                    className="text-xs px-2 py-1 border rounded"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => startEditingAccount(activeAccount)}
                  className="text-gray-500 hover:text-gray-700 flex-shrink-0"
                  title="Yeniden Adlandır"
                >
                  <Edit2 size={16} />
                </button>
              )}
            </div>
            <div className="flex space-x-4 text-gray-600 relative account-menu-container">
              <button className="hover:text-gray-800"><Users size={20} /></button>
              <button 
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="hover:text-gray-800 relative account-menu-container"
              >
                <MoreVertical size={20} />
                {showAccountMenu && (
                  <div className="absolute right-0 top-8 bg-white rounded-lg shadow-2xl py-2 w-48 z-50 border">
                    <button
                      onClick={async () => {
                        try {
                          await api.deleteSession(activeAccount.id);
                          setShowAccountMenu(false);
                          loadAccounts(); // Hesap listesini yenile
                        } catch (error) {
                          console.error('Çıkış yapılamadı:', error);
                          alert('Çıkış yapılamadı');
                        }
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2 text-red-600"
                    >
                      <LogOut size={16} />
                      <span>Çıkış Yap</span>
                    </button>
                    <button
                      onClick={() => {
                        // Sessize al özelliği - şimdilik sadece console log
                        console.log('Sessize al:', activeAccount.id);
                        setShowAccountMenu(false);
                        alert('Sessize al özelliği yakında eklenecek');
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <VolumeX size={16} />
                      <span>Sessize Al</span>
                    </button>
                  </div>
                )}
              </button>
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
            {!activeAccount ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Hesap seçin
              </div>
            ) : activeAccount.status !== 'open' ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Hesap bağlantısı bekleniyor...
              </div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Henüz sohbet yok
              </div>
            ) : (
              chats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`p-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer border-b ${
                    selectedChat?.id === chat.id ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-2xl">
                      {chat.name[0]?.toUpperCase() || '?'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm truncate">{chat.name}</span>
                      {chat.time && <span className="text-xs text-gray-500">{chat.time}</span>}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm text-gray-600 truncate">{chat.lastMessage || ''}</span>
                      {chat.unreadCount && chat.unreadCount > 0 && (
                        <div className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs ml-2 flex-shrink-0">
                          {chat.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sohbet Alanı */}
        <div className="flex-1 flex flex-col">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="bg-gray-100 p-3 flex items-center justify-between border-b">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-2xl">
                    {selectedChat.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="font-semibold">{selectedChat.name}</div>
                    <div className="text-xs text-gray-500">çevrimiçi</div>
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
                  <div className="text-center text-gray-500 text-sm">
                    Mesajlar burada görünecek
                  </div>
                </div>
              </div>

              {/* Mesaj Giriş Alanı */}
              <div className="bg-gray-100 p-3 flex items-center space-x-3 relative">
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
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Bir sohbet seçin
            </div>
          )}
        </div>
      </div>

      {/* Hesap Ekleme Modalı */}
      {showAddAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Yeni Hesap Ekle</h2>
              <button
                onClick={() => {
                  setShowAddAccountModal(false);
                  setQrCode(null);
                  setIsLoadingQR(false);
                  if (sseRef.current) {
                    sseRef.current();
                    sseRef.current = null;
                  }
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hesap Adı
                </label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Örn: Kişisel, İş"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hesap ID
                </label>
                <input
                  type="text"
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  placeholder="Benzersiz bir ID girin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {qrCode && (
                <div className="flex flex-col items-center space-y-2">
                  <p className="text-sm text-gray-600">QR Kodu WhatsApp ile tarayın</p>
                  <img src={qrCode} alt="QR Code" className="w-64 h-64 border-2 border-gray-300 rounded" />
                </div>
              )}

              {isLoadingQR && !qrCode && (
                <div className="flex flex-col items-center space-y-2">
                  <Loader2 className="animate-spin text-green-500" size={32} />
                  <p className="text-sm text-gray-600">QR kod oluşturuluyor...</p>
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  onClick={createAccount}
                  disabled={!newAccountId.trim() || isLoadingQR}
                  className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {qrCode ? 'Yeniden Oluştur' : 'Hesap Oluştur'}
                </button>
                <button
                  onClick={() => {
                    setShowAddAccountModal(false);
                    setQrCode(null);
                    setIsLoadingQR(false);
                    if (sseRef.current) {
                      sseRef.current();
                      sseRef.current = null;
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
