import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageCircle, Plus, Search, MoreVertical, Users, Phone, Video, Smile, Paperclip, Mic, Send, Check, CheckCheck, X, Edit2, Loader2, LogOut, Volume2, VolumeX, RefreshCcw, Reply, Forward, Trash2, Star, StarOff, Eye } from 'lucide-react';
import * as api from './api';
import * as QRCode from 'qrcode';
import AddAccountModal from './components/AddAccountModal';
import ContactsModal from './components/ContactsModal';
import ContactSelector from './components/ContactSelector';
import AccountSidebar from './components/AccountSidebar';
import ChatList from './components/ChatList';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import { normalizePhoneNumber, extractPhoneFromJid } from './utils/contactUtils';
import { extractMessageText } from './utils/messageUtils';
import { COLORS, EMOJIS, ATTACHMENT_OPTIONS, CONTACTS_CACHE_TTL, PROFILE_PICTURE_BATCH_SIZE, PROFILE_PICTURE_DEBOUNCE_MS, PROFILE_PICTURE_BATCH_DELAY_MS } from './constants/appConstants';
import { Account, Chat, Message } from './types';
import { useAccounts } from './hooks/useAccounts';
import { useProfilePictures } from './hooks/useProfilePictures';
import { useChats } from './hooks/useChats';
import { useMessages } from './hooks/useMessages';
import { useContacts } from './hooks/useContacts';
import { useWebSocket } from './hooks/useWebSocket';

// Chat ve Message interface'leri artık types.ts'den import ediliyor

export default function WhatsAppMultiAccount() {
  // Profile Pictures Hook
  const { chatProfilePictures, setChatProfilePictures, queueProfilePicture, profilePictureFailedRef } = useProfilePictures();
  
  // Accounts Hook
  const accountsHook = useAccounts();
  
  // Messages Hook
  const messagesHook = useMessages();
  
  // Contacts Hook
  // activeAccount'i useMemo ile memoize et - her render'da yeni referans oluşturmasın
  const activeAccount = useMemo(() => {
    return accountsHook.accounts.find(acc => acc.active) || accountsHook.accounts[0];
  }, [accountsHook.accounts]);
  
  const contactsHook = useContacts({
    activeAccountId: activeAccount?.id,
    chatProfilePictures,
    queueProfilePicture,
    profilePictureFailedRef,
  });
  
  // contactsMap'i her render'da ref'ten al - useChats hook'u içinde ref kullanıldığı için sorun yok
  // useChats hook'u içinde useEffect ile contactsMap değişikliklerini dinliyoruz
  const contactsMap = useMemo(() => {
    if (!activeAccount?.id) return new Map();
    const cached = contactsHook.contactsCacheRef.current.get(activeAccount.id);
    return cached?.data || new Map();
  }, [activeAccount?.id]);
  
  // Chats Hook
  const chatsHook = useChats({
    activeAccountId: activeAccount?.id,
    contactsMap: contactsMap,
    chatProfilePictures,
    setChatProfilePictures,
    queueProfilePicture,
  });
  
  // Account oluşturulduğunda contact ve chat'leri yükle
  useEffect(() => {
    if (accountsHook.accounts.length > 0) {
      const newAccount = accountsHook.accounts[accountsHook.accounts.length - 1];
      if (newAccount.status === 'open') {
        setTimeout(() => {
          contactsHook.loadContacts(newAccount.id).then(() => {
            chatsHook.loadChats(newAccount.id, 50);
          });
        }, 1000);
      }
    }
  }, [accountsHook.accounts.length]);
  
  // Local state (modals, UI)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [showForwardSelector, setShowForwardSelector] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  // Refs (WebSocket ve diğer)
  const chatsPollRef = useRef<NodeJS.Timeout | null>(null);
  const activeAccountRef = useRef<Account | undefined>(undefined);
  // sseRef ve qrIntervalRef artık useAccounts hook'unda
  // wsRef artık useWebSocket hook'unda

  // Profil resmi yükleme artık useProfilePictures hook'unda yönetiliyor

  // Hesap listesini yükle
  useEffect(() => {
    console.log('=== Component mount - loadAccounts çağrılıyor ===');
    accountsHook.loadAccounts();
  }, []);


  // Aktif hesap değiştiğinde sohbetleri yükle
  // activeAccount zaten yukarıda tanımlı (accountsHook.accounts'den)
  
  // Ref'leri güncelle
  useEffect(() => {
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);
  
  useEffect(() => {
    chatsHook.selectedChatRef.current = chatsHook.selectedChat;
  }, [chatsHook.selectedChat]);

  useEffect(() => {
    console.log('=== activeAccount değişti ===', activeAccount);
    if (activeAccount) {
      const sessionId = activeAccount.id;
      const hasInitialLoad = chatsHook.chatsInitialLoadRef.current.get(sessionId);
      
      // Sadece ilk bağlantıda veya bağlantı durumu değiştiğinde yükle
      if (activeAccount.status === 'open' && !hasInitialLoad) {
        console.log('İlk bağlantı - sohbetler yükleniyor, sessionId:', sessionId);
        chatsHook.chatsInitialLoadRef.current.set(sessionId, true);
        chatsHook.chatsLoadedRef.current.set(sessionId, false);
        
        // İlk bağlantıda contact'ları da yükle
        contactsHook.loadContacts(sessionId).then(() => {
          // Sadece sohbet listesi boşsa yükle
          if (chatsHook.chats.length === 0) {
            chatsHook.loadChats(sessionId, 50, true);
          }
        });
      } else if (activeAccount.status !== 'open' && chatsHook.chats.length === 0 && !hasInitialLoad) {
        // Bağlı değilse de DB'den yükle (uygulama yeniden başladığında sohbetler görünsün)
        console.log('Hesap bağlı değil ama sohbetler yok - DB\'den yükleniyor');
        chatsHook.chatsInitialLoadRef.current.set(sessionId, true);
        chatsHook.loadChats(sessionId, 50, true);
      }
    } else {
      console.log('activeAccount yok, loadChats çağrılmıyor');
    }
  }, [activeAccount?.id, activeAccount?.status]);

  // loadAccounts artık useAccounts hook'unda yönetiliyor

  // Mesajdan text çıkarma fonksiyonu (yeniden kullanılabilir)
  // extractMessageText artık utils'den import ediliyor

  // loadContacts, handleLoadContacts, handleRefreshContacts, handleOpenContactSelector 
  // artık useContacts hook'unda yönetiliyor

  // extractPhoneFromJid artık utils'den import ediliyor

  // Contact arama artık useContacts hook'unda yönetiliyor

  // Profil resimleri güncellendiğinde chat listesini ve selectedChat'i güncelle
  useEffect(() => {
    if (chatProfilePictures.size > 0 && chatsHook.chats.length > 0) {
      chatsHook.setChats(prevChats => prevChats.map(chat => {
        const pictureUrl = chatProfilePictures.get(chat.id);
        if (pictureUrl && pictureUrl !== '' && pictureUrl !== chat.profilePicture) {
          return { ...chat, profilePicture: pictureUrl };
        }
        return chat;
      }));
      
      // Eğer seçili sohbet varsa, profil resmini güncelle
      if (chatsHook.selectedChat) {
        const pictureUrl = chatProfilePictures.get(chatsHook.selectedChat.id);
        if (pictureUrl && pictureUrl !== '' && pictureUrl !== chatsHook.selectedChat.profilePicture) {
          chatsHook.setSelectedChat(prev => prev ? { ...prev, profilePicture: pictureUrl } : null);
        }
      }
    }
  }, [chatProfilePictures, chatsHook.chats.length, chatsHook.selectedChat?.id]);

  // Profil resmi yükleme artık useChats ve useContacts hook'larında yönetiliyor
  // Sadece ilk yüklemede çekilecek, tekrar tekrar denemeyecek

  // Seçilen kişiye mesaj gönder
  const handleSelectContactForMessage = async (contact: api.Contact) => {
    if (!activeAccount) return;
    
    try {
      // Yeni bir chat oluştur veya mevcut chat'i aç
      const chatId = contact.id;
      
      // Mesaj gönderme işlemi için chat'i seç
      const newChat: Chat = {
        id: chatId,
        name: contact.name || contact.notify || contact.id,
        unreadCount: 0,
        conversationTimestamp: null,
        isMuted: false
      };
      
      chatsHook.setSelectedChat(newChat);
      setShowContactSelector(false);
      contactsHook.setContactSearchTerm('');
      
      // Mesajları yükle
      await messagesHook.loadMessages(activeAccount.id, chatId);
      
      // Sohbet listesini de yenile (yeni chat eklenmiş olabilir) - force ile
      chatsHook.loadChats(activeAccount.id, 50, true);
    } catch (error) {
      console.error('Kişi seçilemedi:', error);
      alert('Kişi seçilemedi');
    }
  };

  // loadChats ve loadMessages artık hook'larda yönetiliyor

  // switchAccount artık useAccounts hook'unda yönetiliyor

  // generateAccountId, handleAddAccount, createAccount, handleRenameAccount, startEditingAccount
  // artık useAccounts hook'unda yönetiliyor

  // Ses kaydı gönderme handler'ı
  const handleSendVoiceMessage = async (audioBlob: Blob) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    // Optimistik UI: Ses mesajını hemen ekle
    const tempMessageId = `temp-voice-${Date.now()}`;

    try {
      // Blob'un mimetype'ini al (MediaRecorder'dan gelen format)
      // BaileyTipREADME.md'ye göre: audio mesajı için mimetype 'audio/mp4' kullanılabilir
      // Örnekte audio.mp3 dosyası için bile 'audio/mp4' mimetype kullanılıyor
      const originalMimetype = audioBlob.type || 'audio/webm';
      // BaileyTipREADME.md örneğine göre: audio/mp4 kullan (PTT için de çalışır)
      const mimetype = 'audio/mp4'; // BaileyTipREADME.md'deki örneğe göre
      const optimisticMessage: Message = {
        id: tempMessageId,
        text: '🎤 Ses mesajı',
        body: '🎤 Ses mesajı',
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        from: chatsHook.selectedChat.id,
        status: 'sending',
        type: 'audioMessage',
        message: {
          audioMessage: {
            mimetype: mimetype,
            ptt: true, // Push to Talk
          }
        }
      };

      messagesHook.setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id || m.key?.id));
        if (existingIds.has(optimisticMessage.id)) {
          return prev;
        }
        
        const merged = [...prev, optimisticMessage];
        merged.sort((a, b) => {
          const normalizeTimestamp = (ts: number | undefined) => {
            if (!ts) return 0;
            return ts > 1000000000000 ? ts : ts * 1000;
          };
          const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
          const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
          return aTime - bTime;
        });
        return merged;
      });

      // Ses mesajını gönder (PTT - Push to Talk)
      // api.sendMediaMessage Blob'u otomatik olarak base64'e çevirir
      await api.sendMediaMessage(
        activeAccount.id,
        chatsHook.selectedChat.id,
        audioBlob, // Blob'u direkt gönder, api.sendMediaMessage base64'e çevirecek
        mimetype,
        undefined,
        { ptt: true } // Push to Talk (sesli mesaj)
      );

      // Chat listesini güncelle
      chatsHook.setChats(prevChats => {
        const index = prevChats.findIndex(c => c.id === chatsHook.selectedChat!.id);
        if (index >= 0) {
          const updatedChats = [...prevChats];
          const now = Math.floor(Date.now() / 1000);
          updatedChats[index] = {
            ...updatedChats[index],
            conversationTimestamp: now,
            lastMsgTimestamp: now,
          };
          return updatedChats.sort((a, b) => {
            const aTime = a.conversationTimestamp || a.lastMsgTimestamp || 0;
            const bTime = b.conversationTimestamp || b.lastMsgTimestamp || 0;
            return Number(bTime) - Number(aTime);
          });
        }
        return prevChats;
      });
      
      // Mesajları yeniden yükle (gerçek mesajı almak için)
      setTimeout(() => {
        messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat!.id, 50, false);
      }, 1000);
    } catch (error) {
      console.error('Ses mesajı gönderilemedi:', error);
      alert('Ses mesajı gönderilemedi');
      
      // Hata durumunda temp mesajı kaldır
      const finalTempMessageId = tempMessageId;
      messagesHook.setMessages(prev => prev.filter(m => m.id !== finalTempMessageId));
    }
  };

  const sendMessage = async () => {
    if (!messagesHook.message.trim() || !activeAccount || !chatsHook.selectedChat) return;
    
    const messageText = messagesHook.message.trim();
    const tempMessageId = `temp-${Date.now()}`;
    
    // Optimistik UI güncellemesi: Mesajı hemen ekle (gönderiliyor durumu ile)
      const optimisticMessage: Message = {
      id: tempMessageId,
        text: messageText,
        body: messageText,
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        from: chatsHook.selectedChat.id,
      status: 'sending',
      };
      
    // Mesajı hemen ekle (gönderiliyor durumu ile)
      messagesHook.setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id || m.key?.id));
        if (existingIds.has(optimisticMessage.id)) {
          return prev;
        }
        
        const merged = [...prev, optimisticMessage];
        merged.sort((a, b) => {
          const normalizeTimestamp = (ts: number | undefined) => {
            if (!ts) return 0;
            return ts > 1000000000000 ? ts : ts * 1000;
          };
          const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
          const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
          return aTime - bTime;
        });
        return merged;
      });
    
    // Mesaj girişini temizle
    messagesHook.setMessage('');
    setShowEmojiPicker(false);
    
    try {
      const response = await api.sendMessage(activeAccount.id, chatsHook.selectedChat.id, messageText);
      
      // Chat listesindeki ilgili chat'i güncelle
      chatsHook.setChats(prevChats => {
        const index = prevChats.findIndex(c => c.id === chatsHook.selectedChat!.id);
        if (index >= 0) {
          const updatedChats = [...prevChats];
          const now = Math.floor(Date.now() / 1000);
          updatedChats[index] = {
            ...updatedChats[index],
            conversationTimestamp: now,
            lastMessage: messageText,
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          };
          return updatedChats;
        }
        return prevChats;
      });
      
      // Optimistik mesajı güncelle (gönderildi durumuna)
      messagesHook.setMessages(prev => 
        prev.map(m => {
          if (m.id === tempMessageId) {
            return {
              ...m,
              status: 'sent',
              // Gerçek mesaj ID'si varsa güncelle
              id: response?.id || m.id,
            };
          }
          return m;
        })
      );
      
      // WebSocket'ten gerçek mesaj geldiğinde optimistic mesaj replace edilecek
    } catch (error: any) {
      console.error('Mesaj gönderilemedi:', error);
      
      // Optimistik mesajı hata durumuna güncelle
      messagesHook.setMessages(prev => 
        prev.map(m => {
          if (m.id === tempMessageId) {
            return {
              ...m,
              status: 'error',
              error: error.message || 'Mesaj gönderilemedi',
            };
          }
          return m;
        })
      );
      
      // Kullanıcıya bilgi ver
      alert(`Mesaj gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  // Mesaj İşlemleri Handler'ları
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  const handleReplyMessage = async (msg: Message, replyText?: string) => {
    if (!activeAccount || !chatsHook.selectedChat || !msg) return;
    
    const textToSend = replyText || messagesHook.message;
    if (!textToSend.trim()) return;
    
    try {
      await api.replyToMessage(activeAccount.id, chatsHook.selectedChat.id, msg.id || '', textToSend);
      messagesHook.setMessage('');
      setReplyingTo(null);
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
      
      // Chat listesindeki ilgili chat'i güncelle (yeniden sıralama yapmadan)
      chatsHook.setChats(prevChats => {
        const index = prevChats.findIndex(c => c.id === chatsHook.selectedChat!.id);
        if (index >= 0) {
          const updatedChats = [...prevChats];
          const now = Math.floor(Date.now() / 1000);
          updatedChats[index] = {
            ...updatedChats[index],
            conversationTimestamp: now,
            lastMessage: textToSend,
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          };
          return updatedChats;
        }
        return prevChats;
      });
    } catch (error) {
      console.error('Mesaj yanıtlanamadı:', error);
      alert('Mesaj yanıtlanamadı');
    }
  };

  const handleForwardMessage = async (msg: Message, toJid: string) => {
    if (!activeAccount || !msg) return;
    
    try {
      await api.forwardMessage(activeAccount.id, chatsHook.selectedChat?.id || '', toJid, msg.id || '');
      setShowForwardSelector(false);
      setForwardingMessage(null);
      if (chatsHook.selectedChat) {
        messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
      }
    } catch (error) {
      console.error('Mesaj iletilemedi:', error);
      alert('Mesaj iletilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleEditMessage = async (msg: Message, newText: string) => {
    if (!activeAccount || !chatsHook.selectedChat || !newText.trim()) return;
    
    const messageId = msg.id || msg.key?.id;
    if (!messageId) {
      alert('Mesaj ID\'si bulunamadı');
      return;
    }
    
    try {
      console.log('[handleEditMessage] Mesaj düzenleniyor:', { messageId, newText, jid: chatsHook.selectedChat.id });
      
      await api.editMessage(activeAccount.id, chatsHook.selectedChat.id, messageId, newText);
      
      // Mesajları yeniden yüklemek yerine, sadece düzenlenen mesajı güncelle
      messagesHook.setMessages(prevMessages => 
        prevMessages.map(m => {
          const mId = m.id || m.key?.id;
          if (mId === messageId) {
            return {
              ...m,
              text: newText,
              body: newText,
              edited: true,
              editedAt: Date.now(),
            };
          }
          return m;
        })
      );
      
      setEditingMessage(null);
      setEditingText('');
      
      console.log('[handleEditMessage] ✅ Mesaj başarıyla güncellendi');
    } catch (error) {
      console.error('[handleEditMessage] ❌ Mesaj düzenlenemedi:', error);
      alert('Mesaj düzenlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteMessage = async (msg: Message, deleteForEveryone: boolean = false) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    if (!confirm(deleteForEveryone ? 'Bu mesajı herkes için silmek istediğinizden emin misiniz?' : 'Bu mesajı silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      await api.deleteMessage(activeAccount.id, chatsHook.selectedChat.id, msg.id || '', deleteForEveryone);
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    } catch (error) {
      console.error('Mesaj silinemedi:', error);
      alert('Mesaj silinemedi');
    }
  };

  const handleStarMessage = async (msg: Message, star: boolean) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    try {
      await api.starMessage(activeAccount.id, chatsHook.selectedChat.id, msg.id || '', star);
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    } catch (error) {
      console.error('Mesaj yıldızlanamadı:', error);
      alert('Mesaj yıldızlanamadı');
    }
  };

  const handleMarkAsRead = async () => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    try {
      await api.markMessagesAsRead(activeAccount.id, chatsHook.selectedChat.id);
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
      chatsHook.loadChats(activeAccount.id, 50);
    } catch (error) {
      console.error('Mesajlar okundu olarak işaretlenemedi:', error);
      alert('Mesajlar okundu olarak işaretlenemedi');
    }
  };

  const handlePinMessage = async (msg: Message, type: number, time: number = 86400) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    try {
      await api.pinMessage(activeAccount.id, chatsHook.selectedChat.id, msg.key || { id: msg.id }, type, time);
      alert(type === 1 ? 'Mesaj sabitlendi' : 'Mesaj sabitlemesi kaldırıldı');
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    } catch (error) {
      console.error('Mesaj pinlenemedi:', error);
      alert('Mesaj pinlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleRejectCall = async (callId: string, callFrom: string) => {
    if (!activeAccount) return;
    
    try {
      await api.rejectCall(activeAccount.id, callId, callFrom);
      alert('Arama reddedildi');
    } catch (error) {
      console.error('Arama reddedilemedi:', error);
      alert('Arama reddedilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleArchiveChat = async (chat: Chat, archive: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.archiveChat(activeAccount.id, chat.id, archive);
      chatsHook.loadChats(activeAccount.id, 50);
      if (archive && chatsHook.selectedChat?.id === chat.id) {
        chatsHook.setSelectedChat(null);
      }
    } catch (error) {
      console.error('Sohbet arşivlenemedi:', error);
      alert('Sohbet arşivlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    if (!activeAccount) return;
    
    if (!confirm('Bu sohbeti silmek istediğinizden emin misiniz? Tüm mesajlar silinecektir.')) {
      return;
    }
    
    try {
      await api.deleteChat(activeAccount.id, chat.id);
      chatsHook.loadChats(activeAccount.id, 50);
      if (chatsHook.selectedChat?.id === chat.id) {
        chatsHook.setSelectedChat(null);
        messagesHook.setMessages([]);
      }
    } catch (error) {
      console.error('Sohbet silinemedi:', error);
      alert('Sohbet silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleMarkChatRead = async (chat: Chat, markRead: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.markChatRead(activeAccount.id, chat.id, markRead);
      chatsHook.loadChats(activeAccount.id, 50);
    } catch (error) {
      console.error('Sohbet okundu olarak işaretlenemedi:', error);
      alert('Sohbet okundu olarak işaretlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteMessageForMe = async (msg: Message) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    try {
      await api.deleteMessageForMe(activeAccount.id, chatsHook.selectedChat.id, msg.id || '', msg.fromMe || false);
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    } catch (error) {
      console.error('Mesaj silinemedi:', error);
      alert('Mesaj silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const insertEmoji = (emoji: string) => {
    messagesHook.setMessage(messagesHook.message + emoji);
  };

  const handleAttachment = (type: string) => {
    console.log(`${type} seçildi`);
    setShowAttachMenu(false);
  };

  // EMOJIS ve ATTACHMENT_OPTIONS artık constants'tan import ediliyor

  // WebSocket bağlantısı artık useWebSocket hook'unda yönetiliyor
  useWebSocket({
    activeAccountRef,
    selectedChatRef: chatsHook.selectedChatRef,
    contactsCacheRef: contactsHook.contactsCacheRef,
    chatsLoadedRef: chatsHook.chatsLoadedRef,
    chatsInitialLoadRef: chatsHook.chatsInitialLoadRef,
    messagesInitialLoadRef: messagesHook.messagesInitialLoadRef,
    chatProfilePictures,
    chats: chatsHook.chats,
    selectedChat: chatsHook.selectedChat,
    setChats: chatsHook.setChats,
    setMessages: messagesHook.setMessages,
    setChatProfilePictures,
    setSelectedChat: chatsHook.setSelectedChat,
    queueProfilePicture,
    loadChats: chatsHook.loadChats,
    updateMessagesCache: messagesHook.updateMessagesCache,
  });

  // Cleanup - useAccounts ve useWebSocket hook'ları kendi cleanup'larını yapıyor
  useEffect(() => {
    return () => {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
      }
    };
  }, []);

  // Aktif hesap durumu değiştiğinde mesajları temizle (bağlantı kopup bağlanınca)
  useEffect(() => {
    if (activeAccount) {
      // Bağlantı durumu değiştiğinde mesajları temizle
      if (activeAccount.status !== 'open') {
        messagesHook.setMessages([]);
      }
    }
  }, [activeAccount?.status]);

  // loadMessages fonksiyonunu ref ile sakla
  const loadMessagesRef = useRef(messagesHook.loadMessages);
  useEffect(() => {
    loadMessagesRef.current = messagesHook.loadMessages;
  }, [messagesHook.loadMessages]);

  // handleLoadContacts ve handleOpenContactSelector fonksiyonlarını ref ile sakla
  const handleLoadContactsRef = useRef(contactsHook.handleLoadContacts);
  const handleOpenContactSelectorRef = useRef(contactsHook.handleOpenContactSelector);
  useEffect(() => {
    handleLoadContactsRef.current = contactsHook.handleLoadContacts;
    handleOpenContactSelectorRef.current = contactsHook.handleOpenContactSelector;
  }, [contactsHook.handleLoadContacts, contactsHook.handleOpenContactSelector]);

  // ContactsModal açıldığında kişi listesini yükle
  useEffect(() => {
    if (showContactsModal && activeAccount?.id) {
      handleLoadContactsRef.current();
    }
  }, [showContactsModal, activeAccount?.id]);

  // ContactSelector açıldığında kişi listesini yükle
  useEffect(() => {
    if (showContactSelector && activeAccount?.id) {
      handleOpenContactSelectorRef.current();
    }
  }, [showContactSelector, activeAccount?.id]);

  // ForwardSelector açıldığında kişi listesini yükle
  useEffect(() => {
    if (showForwardSelector && activeAccount?.id) {
      handleOpenContactSelectorRef.current();
    }
  }, [showForwardSelector, activeAccount?.id]);

  // Seçili sohbet değiştiğinde mesajları yükle ve profil resmini güncelle
  useEffect(() => {
    if (activeAccount && chatsHook.selectedChat) {
      const selectedChatId = chatsHook.selectedChat.id;
      
      // Önce cache'den yükle (hızlı gösterim için)
      const loadedFromCache = messagesHook.loadMessagesFromCache(activeAccount.id, selectedChatId);
      
      // Seçili sohbet değiştiğinde mesajları yükle (cache'den yüklenmiş olsa bile güncelle)
      const messagesKey = `${activeAccount.id}-${selectedChatId}`;
      if (!loadedFromCache) {
        // Cache'de yoksa, ilk yükleme flag'ini sıfırla
        messagesHook.messagesInitialLoadRef.current.delete(messagesKey);
      }
      
      // Arka planda mesajları yükle (cache'den yüklenmiş olsa bile güncelle)
      loadMessagesRef.current(activeAccount.id, selectedChatId, 50, false);
      
      // Profil resmini chatProfilePictures Map'inden al ve selectedChat'e ekle
      // Not: chatProfilePictures dependency array'den çıkarıldı - sadece selectedChat değiştiğinde çalışır
      const profilePicture = chatProfilePictures.get(selectedChatId);
      if (profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE' && chatsHook.selectedChat.profilePicture !== profilePicture) {
        chatsHook.setSelectedChat(prev => prev ? { ...prev, profilePicture } : null);
      } else if ((!profilePicture || profilePicture === 'NO_PICTURE') && !chatsHook.selectedChat.profilePicture && !selectedChatId.includes('@g.us')) {
        // Profil resmi yoksa ve henüz yüklenmemişse, contact cache'den kontrol et
        const cached = contactsHook.contactsCacheRef.current.get(activeAccount.id);
        if (cached) {
          const contact = cached.data.get(selectedChatId);
          if (contact && contact.imgUrl) {
            setChatProfilePictures(prev => new Map(prev).set(selectedChatId, contact.imgUrl));
            chatsHook.setSelectedChat(prev => prev ? { ...prev, profilePicture: contact.imgUrl } : null);
          } else {
            // API'den yükle - öncelikli olarak hemen yükle (selectedChat için)
            api.getProfilePicture(activeAccount.id, selectedChatId).then(pictureUrl => {
              if (pictureUrl) {
                setChatProfilePictures(prev => new Map(prev).set(selectedChatId, pictureUrl));
                chatsHook.setSelectedChat(prev => prev ? { ...prev, profilePicture: pictureUrl } : null);
              }
            }).catch(() => {
              // Hata durumunda sessizce devam et
            });
          }
        }
      }
    } else {
      messagesHook.setMessages([]);
    }
  }, [activeAccount?.id, chatsHook.selectedChat?.id]); // chatProfilePictures dependency array'den çıkarıldı

  // Sohbet listesini websocket benzeri periyodik olarak yenile
  // loadChats fonksiyonunu ref ile sakla - sonsuz döngüyü önlemek için
  const loadChatsRef = useRef(chatsHook.loadChats);
  useEffect(() => {
    loadChatsRef.current = chatsHook.loadChats;
  }, [chatsHook.loadChats]);

  useEffect(() => {
    const accountId = activeAccount?.id;
    const accountStatus = activeAccount?.status;
    
    if (!accountId || accountStatus !== 'open') {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
        chatsPollRef.current = null;
      }
      return;
    }

    // ilk yükleme
    loadChatsRef.current(accountId, 50);

    // Interval'i temizle (eğer varsa)
    if (chatsPollRef.current) {
      clearInterval(chatsPollRef.current);
    }

    chatsPollRef.current = setInterval(() => {
      // activeAccountRef kullanarak güncel değeri al
      const currentAccount = activeAccountRef.current;
      if (currentAccount && currentAccount.status === 'open' && currentAccount.id === accountId) {
        // Ref'ten güncel fonksiyonu kullan
        loadChatsRef.current(accountId, 50);
      } else {
        // Hesap değişti veya kapandı, interval'i temizle
        if (chatsPollRef.current) {
          clearInterval(chatsPollRef.current);
          chatsPollRef.current = null;
        }
      }
    }, 10000); // 10 saniyede bir yenile

    return () => {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
        chatsPollRef.current = null;
      }
    };
  }, [activeAccount?.id, activeAccount?.status]); // Sadece id ve status değiştiğinde tetiklenir

  // handleCloseModal artık useAccounts hook'unda yönetiliyor


  // Hesap yoksa göster
  if (accountsHook.accounts.length === 0) {
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
                accountsHook.loadAccounts();
              }}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Yeniden Dene
            </button>
            <button
              onClick={accountsHook.handleAddAccount}
              className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Hesap Ekle
            </button>
          </div>
        </div>
        <AddAccountModal
          isOpen={accountsHook.showAddAccountModal}
          newAccountName={accountsHook.newAccountName}
          setNewAccountName={accountsHook.setNewAccountName}
          qrCode={accountsHook.qrCode}
          isLoadingQR={accountsHook.isLoadingQR}
          pendingAccountId={accountsHook.pendingAccountId}
          onCreateAccount={accountsHook.createAccount}
          onGenerateQR={accountsHook.generateQR}
          onClose={accountsHook.handleCloseModal}
        />
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
      <AccountSidebar
        accounts={accountsHook.accounts}
        onSwitchAccount={accountsHook.switchAccount}
        onAddAccount={accountsHook.handleAddAccount}
        onDeleteAccount={async (accountId) => {
          try {
            await api.deleteSession(accountId);
            const updatedAccounts = accountsHook.accounts.filter(acc => acc.id !== accountId);
            accountsHook.setAccounts(updatedAccounts);
            
            const deletedAccount = accountsHook.accounts.find(acc => acc.id === accountId);
            if (deletedAccount?.active && updatedAccounts.length > 0) {
              accountsHook.switchAccount(updatedAccounts[0].id);
            } else if (updatedAccounts.length === 0) {
              chatsHook.setChats([]);
              messagesHook.setMessages([]);
              chatsHook.setSelectedChat(null);
            }
          } catch (error) {
            console.error('Hesap silinemedi:', error);
            alert('Hesap silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
          }
        }}
      />

      {/* Ana WhatsApp Arayüzü */}
      <div className="flex-1 flex">
        <ChatList
          activeAccount={activeAccount}
          chats={chatsHook.chats}
          selectedChat={chatsHook.selectedChat}
          chatFilter={chatsHook.chatFilter}
          chatSearchTerm={chatsHook.chatSearchTerm}
          editingAccountId={accountsHook.editingAccountId}
          editingAccountName={accountsHook.editingAccountName}
          showAccountMenu={showAccountMenu}
          onSelectChat={chatsHook.setSelectedChat}
          onChatFilterChange={chatsHook.setChatFilter}
          onChatSearchChange={chatsHook.setChatSearchTerm}
          onStartEditingAccount={accountsHook.startEditingAccount}
          onEditingAccountNameChange={accountsHook.setEditingAccountName}
          onRenameAccount={accountsHook.handleRenameAccount}
          onOpenContactSelector={contactsHook.handleOpenContactSelector}
          onOpenContactsModal={() => setShowContactsModal(true)}
          onShowAccountMenu={setShowAccountMenu}
          onLogout={async () => {
            if (!activeAccount) return;
            try {
              await api.deleteSession(activeAccount.id);
              setShowAccountMenu(false);
              accountsHook.loadAccounts();
            } catch (error) {
              console.error('Çıkış yapılamadı:', error);
              alert('Çıkış yapılamadı');
            }
          }}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
          onMarkChatRead={handleMarkChatRead}
        />

        <div className="flex-1 flex flex-col">
          <MessageList
            selectedChat={chatsHook.selectedChat}
            messages={messagesHook.messages}
            selectedMessage={selectedMessage}
            editingMessage={editingMessage}
            editingText={editingText}
            showMessageMenu={showMessageMenu}
            activeAccountId={activeAccount?.id}
            onSelectMessage={setSelectedMessage}
            onShowMessageMenu={setShowMessageMenu}
            onSetReplyingTo={setReplyingTo}
            onSetEditingMessage={setEditingMessage}
            onSetEditingText={setEditingText}
            onEditMessage={handleEditMessage}
            onStarMessage={handleStarMessage}
            onDeleteMessage={handleDeleteMessage}
            onForwardMessage={(msg) => {
              setForwardingMessage(msg);
              setShowForwardSelector(true);
            }}
            onLoadContacts={contactsHook.loadContacts}
            onOpenContactSelector={contactsHook.handleOpenContactSelector}
            onMarkAsRead={handleMarkAsRead}
            onRetryMessage={async (msg) => {
              if (!activeAccount || !chatsHook.selectedChat || !msg.text) return;
              try {
                await api.sendMessage(activeAccount.id, chatsHook.selectedChat.id, msg.text);
                // Mesaj durumunu güncelle
                messagesHook.setMessages(prev => 
                  prev.map(m => {
                    if (m.id === msg.id) {
                      return { ...m, status: 'sent', error: undefined };
                    }
                    return m;
                  })
                );
              } catch (error: any) {
                console.error('Mesaj tekrar gönderilemedi:', error);
                alert(`Mesaj tekrar gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
              }
            }}
            onPinMessage={handlePinMessage}
            onRejectCall={handleRejectCall}
            onDeleteMessageForMe={handleDeleteMessageForMe}
          />
          {chatsHook.selectedChat && (
            <MessageInput
              message={messagesHook.message}
              setMessage={messagesHook.setMessage}
              replyingTo={replyingTo}
              showEmojiPicker={showEmojiPicker}
              showAttachMenu={showAttachMenu}
              emojis={EMOJIS}
              attachmentOptions={ATTACHMENT_OPTIONS}
              onSendMessage={sendMessage}
              onReplyMessage={handleReplyMessage}
              onSetReplyingTo={setReplyingTo}
              onSetShowEmojiPicker={setShowEmojiPicker}
              onSetShowAttachMenu={setShowAttachMenu}
              onInsertEmoji={insertEmoji}
              onHandleAttachment={handleAttachment}
              onSendVoiceMessage={handleSendVoiceMessage}
            />
          )}
        </div>
      </div>


      <ContactsModal
        isOpen={showContactsModal}
        contacts={contactsHook.contacts}
        filteredContacts={contactsHook.filteredContacts}
        contactSearchTerm={contactsHook.contactSearchTerm}
        setContactSearchTerm={contactsHook.setContactSearchTerm}
        isLoadingContacts={contactsHook.isLoadingContacts}
        chatProfilePictures={chatProfilePictures}
        onRefresh={contactsHook.handleRefreshContacts}
        onClose={() => {
          setShowContactsModal(false);
          contactsHook.setContacts([]);
          contactsHook.setFilteredContacts([]);
          contactsHook.setContactSearchTerm('');
        }}
      />

      <ContactSelector
        isOpen={showForwardSelector && !!forwardingMessage}
        contacts={contactsHook.contacts}
        filteredContacts={contactsHook.filteredContacts}
        contactSearchTerm={contactsHook.contactSearchTerm}
        setContactSearchTerm={contactsHook.setContactSearchTerm}
        isLoadingContacts={contactsHook.isLoadingContacts}
        chatProfilePictures={chatProfilePictures}
        forwardingMessage={forwardingMessage}
        chats={chatsHook.chats}
        selectedChat={chatsHook.selectedChat}
        onRefresh={contactsHook.handleRefreshContacts}
        onSelectContact={(contact) => {
          if (forwardingMessage) {
            handleForwardMessage(forwardingMessage, contact.id);
          }
        }}
        onSelectChat={(chatId) => {
          if (forwardingMessage) {
            handleForwardMessage(forwardingMessage, chatId);
          }
        }}
        onClose={() => {
          setShowForwardSelector(false);
          setForwardingMessage(null);
          contactsHook.setContacts([]);
          contactsHook.setFilteredContacts([]);
          contactsHook.setContactSearchTerm('');
        }}
      />

      <ContactSelector
        isOpen={showContactSelector}
        contacts={contactsHook.contacts}
        filteredContacts={contactsHook.filteredContacts}
        contactSearchTerm={contactsHook.contactSearchTerm}
        setContactSearchTerm={contactsHook.setContactSearchTerm}
        isLoadingContacts={contactsHook.isLoadingContacts}
        chatProfilePictures={chatProfilePictures}
        onRefresh={contactsHook.handleRefreshContacts}
        onSelectContact={handleSelectContactForMessage}
        onClose={() => {
          setShowContactSelector(false);
          contactsHook.setContacts([]);
          contactsHook.setFilteredContacts([]);
          contactsHook.setContactSearchTerm('');
        }}
      />
    </div>
  );
}