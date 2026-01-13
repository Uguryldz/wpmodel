import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageCircle, Plus, Search, MoreVertical, Users, Phone, Video, Smile, Paperclip, Mic, Send, Check, CheckCheck, X, Edit2, Loader2, LogOut, Volume2, VolumeX, RefreshCcw, Reply, Forward, Trash2, Star, StarOff, Eye } from 'lucide-react';
import * as api from './api';
import * as QRCode from 'qrcode';
import AddAccountModal from './components/AddAccountModal';
import ContactsModal from './components/ContactsModal';
import ContactSelector from './components/ContactSelector';
import TemplatesPage from './pages/TemplatesPage';
import TemplateSelectorModal from './components/TemplateSelectorModal';
import AccountSidebar from './components/AccountSidebar';
import ChatList from './components/ChatList';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import Toast from './components/Toast';
import ContactProfileModal from './components/ContactProfileModal';
import MediaPreviewModal from './components/MediaPreviewModal';
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
import { clearAllMediaCache } from './utils/mediaCache';

// Chat ve Message interface'leri artık types.ts'den import ediliyor

export default function WhatsAppMultiAccount() {
  // Profile Pictures Hook
  const { chatProfilePictures, setChatProfilePictures, queueProfilePicture, profilePictureFailedRef } = useProfilePictures();
  
  // Accounts Hook - sendRequest'i geç (useWebSocket'ten gelecek)
  const accountsHook = useAccounts();
  
  // Messages Hook - sendRequest önce undefined, sonra useWebSocket'ten gelecek
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
    messagesCacheRef: messagesHook.messagesCacheRef, // Mesaj cache'i için ref'i geç
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
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [currentPage, setCurrentPage] = useState<string>('main');
  const [isSending, setIsSending] = useState(false);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [showContactProfile, setShowContactProfile] = useState(false);
  const [selectedContactForProfile, setSelectedContactForProfile] = useState<api.Contact | null>(null);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | 'document'>('image');
  // Refs (WebSocket ve diğer)
  const chatsPollRef = useRef<NodeJS.Timeout | null>(null);
  const activeAccountRef = useRef<Account | undefined>(undefined);
  const sendRequestRef = useRef<((requestType: string, payload: any) => Promise<any>) | null>(null);
  // sseRef ve qrIntervalRef artık useAccounts hook'unda
  // wsRef artık useWebSocket hook'unda

  // Profil resmi yükleme artık useProfilePictures hook'unda yönetiliyor

  // Routing kontrolü
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/templates') {
      setCurrentPage('templates');
    } else {
      setCurrentPage('main');
    }
  }, []);

  // URL değişikliklerini dinle
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/templates') {
        setCurrentPage('templates');
      } else {
        setCurrentPage('main');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Hesap listesini yükle
  useEffect(() => {
    accountsHook.loadAccounts();
  }, []);


  // Aktif hesap değiştiğinde sohbetleri yükle
  // activeAccount zaten yukarıda tanımlı (accountsHook.accounts'den)
  
  // Ref'leri güncelle ve medya cache'ini temizle (session değiştiğinde)
  const prevActiveAccountIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevAccountId = prevActiveAccountIdRef.current;
    const currentAccountId = activeAccount?.id;
    
    // Eğer aktif hesap değiştiyse medya cache'ini temizle
    if (prevAccountId && currentAccountId && prevAccountId !== currentAccountId) {
      clearAllMediaCache();
    }
    
    prevActiveAccountIdRef.current = currentAccountId || null;
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);
  
  useEffect(() => {
    chatsHook.selectedChatRef.current = chatsHook.selectedChat;
  }, [chatsHook.selectedChat]);

  useEffect(() => {
    const prevAccountId = prevActiveAccountIdRef.current;
    const currentAccountId = activeAccount?.id;
    
    // Aktif hesap değiştiğinde chat'leri temizle ve yeni hesap için yükle
    if (prevAccountId && currentAccountId && prevAccountId !== currentAccountId) {
      console.log(`[Hesap Değişti] ${prevAccountId} -> ${currentAccountId}, chat'ler temizleniyor...`);
      
      // Chat'leri temizle
      chatsHook.setChats([]);
      chatsHook.setSelectedChat(null);
      
      // Flag'leri sıfırla (yeni hesap için chat'lerin yüklenmesini sağla)
      chatsHook.chatsInitialLoadRef.current.delete(prevAccountId);
      chatsHook.chatsLoadedRef.current.delete(prevAccountId);
    }
    
    // Ref'i güncelle (sonraki render için)
    if (currentAccountId !== prevActiveAccountIdRef.current) {
      prevActiveAccountIdRef.current = currentAccountId || null;
    }
    
    if (activeAccount) {
      const sessionId = activeAccount.id;
      
      // Temp session'lar için chat yükleme işlemini atla
      if (sessionId.startsWith('temp-') || sessionId.startsWith('account-')) {
        return;
      }
      
      const hasInitialLoad = chatsHook.chatsInitialLoadRef.current.get(sessionId);
      const isLoaded = chatsHook.chatsLoadedRef.current.get(sessionId);
      
      // Aktif hesap değiştiğinde veya chat'ler yüklenmemişse, yükle
      const accountChanged = prevAccountId && currentAccountId && prevAccountId !== currentAccountId;
      
      // Contact'ları her zaman yükle (DB senkronizasyonu için) - temp session'lar hariç
      if (!sessionId.startsWith('temp-') && !sessionId.startsWith('account-')) {
        const cachedContacts = contactsHook.contactsCacheRef.current.get(sessionId);
        if (!cachedContacts || cachedContacts.data.size === 0) {
          contactsHook.loadContacts(sessionId, false).catch(() => {
            // Hata durumunda sessizce devam et
          });
        }
      }
      
      // Hesap değiştiyse veya chat'ler yüklenmemişse, yükle
      if (accountChanged || (!hasInitialLoad && !isLoaded)) {
        // Flag'leri ayarla
        chatsHook.chatsInitialLoadRef.current.set(sessionId, false);
        chatsHook.chatsLoadedRef.current.set(sessionId, false);
        
        // Contact'ları yükle (eğer yüklenmemişse) - temp session'lar hariç
        if (!sessionId.startsWith('temp-') && !sessionId.startsWith('account-')) {
          contactsHook.loadContacts(sessionId, false).then(() => {
            // Chat'leri yükle (force ile)
            chatsHook.loadChats(sessionId, 50, true);
            
            // WebSocket üzerinden getChats request'i gönder (eğer sendRequest varsa)
            if (sendRequestRef.current) {
              setTimeout(async () => {
                try {
                  await sendRequestRef.current!('getChats', {
                    sessionId: sessionId,
                    limit: 50,
                  });
                  console.log(`[Hesap Değişti] ✅ getChats request'i gönderildi (sessionId: ${sessionId})`);
                } catch (error) {
                  console.error('[Hesap Değişti] ❌ getChats request hatası:', error);
                }
              }, 500); // Kısa bir gecikme ile gönder
            }
          }).catch(() => {
            // Hata durumunda da chat'leri yüklemeyi dene
            chatsHook.loadChats(sessionId, 50, true);
            
            if (sendRequest) {
              setTimeout(async () => {
                try {
                  await sendRequest('getChats', {
                    sessionId: sessionId,
                    limit: 50,
                  });
                } catch (error) {
                  console.error('[Hesap Değişti] ❌ getChats request hatası:', error);
                }
              }, 500);
            }
          });
        } else {
          // Contact yükleme gerekmiyorsa direkt chat'leri yükle
          chatsHook.loadChats(sessionId, 50, true);
          
          if (sendRequest) {
            setTimeout(async () => {
              try {
                await sendRequest('getChats', {
                  sessionId: sessionId,
                  limit: 50,
                });
              } catch (error) {
                console.error('[Hesap Değişti] ❌ getChats request hatası:', error);
              }
            }, 500);
          }
        }
      } else if (activeAccount.status === 'open' && !hasInitialLoad) {
        // Eski mantık: İlk bağlantıda yükle
        chatsHook.chatsInitialLoadRef.current.set(sessionId, true);
        chatsHook.chatsLoadedRef.current.set(sessionId, false);
        
        // İlk bağlantıda contact'ları da yükle (eğer yüklenmemişse) - temp session'lar hariç
        if (!sessionId.startsWith('temp-') && !sessionId.startsWith('account-')) {
          contactsHook.loadContacts(sessionId, false).then(() => {
            // Sadece sohbet listesi boşsa yükle
            if (chatsHook.chats.length === 0) {
              chatsHook.loadChats(sessionId, 50, true);
            }
          });
        }
      } else if (activeAccount.status !== 'open' && chatsHook.chats.length === 0 && !hasInitialLoad) {
        // Bağlı değilse de DB'den yükle (uygulama yeniden başladığında sohbetler görünsün)
        chatsHook.chatsInitialLoadRef.current.set(sessionId, true);
        chatsHook.loadChats(sessionId, 50, true);
      } else if (hasInitialLoad && chatsHook.chats.length === 0) {
        // DB'den tekrar yükle (senkronizasyon için)
        chatsHook.loadChats(sessionId, 50, true);
      }
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
      const chatId = contact.id;
      
      // Önce mevcut chat'lerde bu kişi için bir chat var mı kontrol et
      const existingChat = chatsHook.chats.find(chat => chat.id === chatId);
      
      if (existingChat) {
        // Mevcut chat'i aç
        chatsHook.setSelectedChat(existingChat);
        
        // Mesajları yükle
        await messagesHook.loadMessages(activeAccount.id, chatId);
      } else {
        // Yeni bir chat oluştur
        const contactFromMap = contactsMap.get(chatId);
        const displayName = contactFromMap?.verifiedName || contactFromMap?.name || contactFromMap?.notify || contact.name || contact.notify || contact.verifiedName || contact.id;
        
        const newChat: Chat = {
          id: chatId,
          name: displayName,
          verifiedName: contact.verifiedName || contactFromMap?.verifiedName,
          profilePicture: contact.imgUrl || contactFromMap?.imgUrl || chatProfilePictures.get(chatId),
          unreadCount: 0,
          conversationTimestamp: null,
          archived: false,
          pinned: null,
          lastMessage: '',
          time: '',
          isMuted: false
        };
        
        chatsHook.setSelectedChat(newChat);
        
        // Mesajları yükle (boş olabilir)
        await messagesHook.loadMessages(activeAccount.id, chatId);
        
        // Sohbet listesini de yenile (yeni chat eklenmiş olabilir) - force ile
        chatsHook.loadChats(activeAccount.id, 50, true);
      }
      
      // Modal'ları kapat
      setShowContactSelector(false);
      setShowContactsModal(false);
      contactsHook.setContactSearchTerm('');
    } catch (error) {
      alert('Kişi seçilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  // loadChats ve loadMessages artık hook'larda yönetiliyor

  // switchAccount artık useAccounts hook'unda yönetiliyor

  // generateAccountId, handleAddAccount, createAccount, handleRenameAccount, startEditingAccount
  // artık useAccounts hook'unda yönetiliyor

  // Ses kaydı gönderme handler'ı
  const handleSendVoiceMessage = async (audioBlob: Blob) => {
    if (!activeAccount || !chatsHook.selectedChat) return;

    try {
      // Blob'un mimetype'ini al (MediaRecorder'dan gelen format)
      // BaileyTipREADME.md'ye göre: audio mesajı için mimetype 'audio/mp4' kullanılabilir
      // Örnekte audio.mp3 dosyası için bile 'audio/mp4' mimetype kullanılıyor
      const originalMimetype = audioBlob.type || 'audio/webm';
      // BaileyTipREADME.md örneğine göre: audio/mp4 kullan (PTT için de çalışır)
      const mimetype = 'audio/mp4'; // BaileyTipREADME.md'deki örneğe göre

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
      
      // WebSocket'ten gerçek mesaj geldiğinde otomatik olarak eklenecek
    } catch (error) {
      alert('Ses mesajı gönderilemedi');
    }
  };

  const sendMessage = async () => {
    if (!messagesHook.message.trim() || !activeAccount || !chatsHook.selectedChat || isSending) return;
    
    // WebSocket yoksa mesaj gönderilemez
    if (!sendRequest) {
      alert('Mesaj gönderilemedi: WebSocket bağlantısı yok');
      return;
    }
    
    setIsSending(true);
    const messageText = messagesHook.message.trim();
    
    // Mesaj girişini temizle (WebSocket'ten gerçek mesaj geldiğinde otomatik eklenecek)
    messagesHook.setMessage('');
    setShowEmojiPicker(false);
    
    try {
      // WebSocket üzerinden sendMessage request'i gönder
      await sendRequest('sendMessage', {
        sessionId: activeAccount.id,
        jid: chatsHook.selectedChat.id,
        message: messageText,
      });
      
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
      
      // WebSocket'ten gerçek mesaj geldiğinde otomatik olarak eklenecek
    } catch (error: any) {
      // Kullanıcıya bilgi ver
      alert(`Mesaj gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setIsSending(false);
    }
  };

  // Medya mesajı gönderme handler'ı
  //const handleSendMedia = async (file: File, type: 'image' | 'video' | 'document') => {
  const handleSendMedia = async (file: File, type: 'image' | 'video' | 'document', caption?: string) => {

    if (!activeAccount || !chatsHook.selectedChat || isSending) return;
    
    setIsSending(true);
    
    try {
      // Mimetype belirle
      let mimetype = file.type || 'application/octet-stream';
      if (type === 'image' && !mimetype.startsWith('image/')) {
        mimetype = 'image/jpeg';
      } else if (type === 'video' && !mimetype.startsWith('video/')) {
        mimetype = 'video/mp4';
      }
      
      // Medya mesajını gönder
      await api.sendMediaMessage(
        activeAccount.id,
        chatsHook.selectedChat.id,
        file,
        mimetype,
        caption,
        type === 'video' ? { ptv: true } : undefined
      );
      setShowMediaPreview(false);
      setSelectedMediaFile(null);
      
      // WebSocket'ten gerçek mesaj geldiğinde otomatik olarak eklenecek
    } catch (error: any) {
      alert(`Medya gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setIsSending(false);
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
    
    // Mesajın key'ini al - önce key objesi, sonra key.id, sonra id
    const messageKey = msg.key || { 
      remoteJid: chatsHook.selectedChat.id, 
      id: msg.id || '', 
      fromMe: msg.fromMe || false 
    };
    
    const messageId = messageKey.id || msg.id || '';
    if (!messageId) {
      setToast({ 
        message: 'Yanıtlanacak mesaj ID\'si bulunamadı', 
        type: 'error' 
      });
      return;
    }
    
    setIsSending(true);
    
    try {
      // README'ye göre: await sock.sendMessage(jid, { text: 'hello word' }, { quoted: message })
      // Quoted mesaj objesi hazırla - backend'deki edit.js'deki gibi
      const quotedMessage = {
        key: {
          remoteJid: messageKey.remoteJid || chatsHook.selectedChat.id,
          id: messageId,
          fromMe: Boolean(messageKey.fromMe || msg.fromMe),
        },
        message: msg.message || {
          conversation: msg.text || msg.body || '',
        },
      };
      
      let response;
      
      // WebSocket varsa WebSocket kullan, yoksa API fallback
      if (sendRequest) {
        // WebSocket üzerinden sendMessage request'i gönder
        response = await sendRequest('sendMessage', {
          sessionId: activeAccount.id,
          jid: chatsHook.selectedChat.id,
          message: textToSend,
          options: { quoted: quotedMessage },
        });
      } else {
        // API fallback
        response = await api.sendMessage(
          activeAccount.id,
          chatsHook.selectedChat.id,
          textToSend,
          { quoted: quotedMessage }
        );
      }
      
      messagesHook.setMessage('');
      setReplyingTo(null);
      
      // Chat listesindeki ilgili chat'i güncelle
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
      
      // WebSocket'ten gerçek mesaj geldiğinde otomatik olarak eklenecek
    } catch (error) {
      setToast({ 
        message: 'Mesaj yanıtlanamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleForwardMessage = async (msg: Message, toJid: string) => {
    if (!activeAccount || !msg) return;
    
    const fromJid = chatsHook.selectedChat?.id || '';
    const messageId = msg.id || msg.key?.id || '';
    
    if (!fromJid || !toJid || !messageId) {
      setToast({ 
        message: 'Mesaj iletilemedi: Gerekli bilgiler eksik', 
        type: 'error' 
      });
      return;
    }
    
    try {
      let response;
      
      // WebSocket varsa WebSocket kullan, yoksa API fallback
      if (sendRequest) {
        try {
          response = await sendRequest('forwardMessage', {
            sessionId: activeAccount.id,
            fromJid: fromJid,
            toJid: toJid,
            messageId: messageId,
          });
        } catch (wsError) {
          throw wsError;
        }
      } else {
        response = await api.forwardMessage(activeAccount.id, fromJid, toJid, messageId);
      }
      
      // Response başarılı (hata fırlatılmadıysa), toast göster
      setShowForwardSelector(false);
      setForwardingMessage(null);
      
      // Toast'u setTimeout ile göster (state güncellemesi için)
      setTimeout(() => {
        setToast({ message: 'Mesaj iletildi', type: 'success' });
      }, 100);
      
      if (chatsHook.selectedChat) {
        setTimeout(() => {
          messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat!.id);
        }, 500);
      }
    } catch (error) {
      setShowForwardSelector(false);
      setForwardingMessage(null);
      
      // Hata toast'u da setTimeout ile göster
      setTimeout(() => {
        setToast({ 
          message: 'Mesaj iletilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
          type: 'error' 
        });
      }, 100);
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
      const result = await api.editMessage(activeAccount.id, chatsHook.selectedChat.id, messageId, newText);
      
      // Backend'den başarılı response geldi, mesajı optimistic olarak güncelle
      // WebSocket'ten messages.update event'i gelecek ve gerçek güncellemeyi yapacak
      let updated = false;
      messagesHook.setMessages(prevMessages => {
        const newMessages = prevMessages.map(m => {
          const mId = m.id || m.key?.id;
          // Hem tam eşleşme hem de string karşılaştırması
          if (String(mId) === String(messageId)) {
            updated = true;
            return {
              ...m,
              text: newText,
              body: newText,
              edited: true,
              editedAt: Date.now(),
            };
          }
          return m;
        });
        
        return newMessages;
      });
      
      setEditingMessage(null);
      setEditingText('');
    } catch (error: any) {
      // Hata mesajını daha detaylı göster
      const errorMessage = error?.message || error?.toString() || 'Bilinmeyen hata';
      
      // Eğer hata mesajı "Baileys edit API'si çalışmıyor" içeriyorsa, 
      // bu sadece bir uyarı olabilir - edit işlemi başarılı olmuş olabilir
      if (errorMessage.includes("Baileys edit API'si çalışmıyor")) {
        // Optimistic update yap ve WebSocket'ten gelen güncellemeyi bekle
        messagesHook.setMessages(prevMessages => 
          prevMessages.map(m => {
            const mId = m.id || m.key?.id;
            if (String(mId) === String(messageId)) {
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
      } else {
        alert('Mesaj düzenlenemedi: ' + errorMessage);
      }
    }
  };

  const handleDeleteMessage = async (msg: Message, deleteForEveryone: boolean = false) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    if (!confirm(deleteForEveryone ? 'Bu mesajı herkes için silmek istediğinizden emin misiniz?' : 'Bu mesajı silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      // Optimistic UI: Mesajı hemen kaldır
      const messageId = msg.id || msg.key?.id;
      if (messageId) {
        messagesHook.setMessages(prev => prev.filter(m => {
          const mId = m.id || m.key?.id;
          return mId !== messageId;
        }));
      }
      
      await api.deleteMessage(activeAccount.id, chatsHook.selectedChat.id, messageId || '', deleteForEveryone);
      
      // Toast notification göster
      setToast({ 
        message: deleteForEveryone ? 'Mesaj herkes için silindi' : 'Mesaj silindi', 
        type: 'success' 
      });
      
      // Mesajları yeniden yükle (güncel durumu görmek için)
      setTimeout(() => {
        messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat!.id);
      }, 500);
    } catch (error) {
      setToast({ 
        message: 'Mesaj silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
      // Hata durumunda mesajları yeniden yükle
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    }
  };

  const handleStarMessage = async (msg: Message, star: boolean) => {
    if (!activeAccount || !chatsHook.selectedChat || !sendRequest) return;
    
    try {
      await sendRequest('starMessage', {
        sessionId: activeAccount.id,
        jid: chatsHook.selectedChat.id,
        messageId: msg.id || '',
        fromMe: msg.fromMe !== undefined ? msg.fromMe : false, // Frontend'den fromMe bilgisini gönder
        star: star,
      });
      setToast({ message: star ? 'Mesaj yıldızlandı' : 'Yıldız kaldırıldı', type: 'success' });
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    } catch (error) {
      setToast({ 
        message: 'Mesaj yıldızlanamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    }
  };

  const handleMarkAsRead = async () => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    try {
      await api.markMessagesAsRead(activeAccount.id, chatsHook.selectedChat.id);
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
      chatsHook.loadChats(activeAccount.id, 50);
    } catch (error) {
      alert('Mesajlar okundu olarak işaretlenemedi');
    }
  };

  const handlePinMessage = async (msg: Message, type: number, time: number = 86400) => {
    if (!activeAccount || !chatsHook.selectedChat || !sendRequest) return;
    
    try {
      await sendRequest('pinMessage', {
        sessionId: activeAccount.id,
        jid: chatsHook.selectedChat.id,
        messageKey: msg.key || { id: msg.id, remoteJid: chatsHook.selectedChat.id },
        type: type,
        time: time,
      });
      setToast({ message: type === 1 ? 'Mesaj sabitlendi' : 'Mesaj sabitlemesi kaldırıldı', type: 'success' });
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    } catch (error) {
      setToast({ 
        message: 'Mesaj pinlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    }
  };

  const handleRejectCall = async (callId: string, callFrom: string) => {
    if (!activeAccount) return;
    
    try {
      await api.rejectCall(activeAccount.id, callId, callFrom);
      alert('Arama reddedildi');
    } catch (error) {
      alert('Arama reddedilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handlePinChat = async (chat: Chat, pin: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.pinChat(activeAccount.id, chat.id, pin);
      chatsHook.loadChats(activeAccount.id, 50);
    } catch (error) {
      alert('Chat pinlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleMuteChat = async (chat: Chat, durationMs: number | null) => {
    if (!activeAccount) return;
    
    try {
      await api.muteChat(activeAccount.id, chat.id, durationMs);
      chatsHook.loadChats(activeAccount.id, 50);
    } catch (error) {
      alert('Chat sessize alınamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
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
      alert('Sohbet arşivlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    if (!activeAccount) return;
    
    if (!confirm('Bu sohbeti silmek istediğinizden emin misiniz? Tüm mesajlar silinecektir.')) {
      return;
    }
    
    try {
      // Chat'i animasyonlu olarak kaldır
      const chatIndex = chatsHook.chats.findIndex(c => c.id === chat.id);
      if (chatIndex >= 0) {
        // Chat'i state'den kaldır (animasyon için)
        chatsHook.setChats(prevChats => {
          const updated = [...prevChats];
          updated.splice(chatIndex, 1);
          return updated;
        });
      }
      
      await api.deleteChat(activeAccount.id, chat.id);
      
      if (chatsHook.selectedChat?.id === chat.id) {
        chatsHook.setSelectedChat(null);
        messagesHook.setMessages([]);
      }
      
      // Toast notification göster
      setToast({ message: 'Sohbet başarıyla silindi', type: 'success' });
      
      // Chat listesini yenile
      setTimeout(() => {
        chatsHook.loadChats(activeAccount.id, 50);
      }, 300);
    } catch (error) {
      setToast({ 
        message: 'Sohbet silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
      // Hata durumunda chat listesini yenile
      chatsHook.loadChats(activeAccount.id, 50);
    }
  };

  const handleMarkChatRead = async (chat: Chat, markRead: boolean) => {
    if (!activeAccount) return;
    
    try {
      await api.markChatRead(activeAccount.id, chat.id, markRead);
      chatsHook.loadChats(activeAccount.id, 50);
    } catch (error) {
      alert('Sohbet okundu olarak işaretlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleSetDisappearingMessages = async (chat: Chat, duration: number) => {
    if (!activeAccount) return;
    
    try {
      await api.setDisappearingMessages(activeAccount.id, chat.id, duration);
      chatsHook.loadChats(activeAccount.id, 50);
      setToast({ 
        message: duration === 0 
          ? 'Geçici mesajlar kapatıldı' 
          : `Geçici mesajlar açıldı (${duration === 86400 ? '24 saat' : duration === 604800 ? '7 gün' : duration === 7776000 ? '90 gün' : 'özel'})`, 
        type: 'success' 
      });
    } catch (error) {
      setToast({ 
        message: 'Geçici mesajlar ayarlanamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    }
  };

  const handleDeleteMessageForMe = async (msg: Message) => {
    if (!activeAccount || !chatsHook.selectedChat) return;
    
    try {
      // Mesaj ID'sini al (önce key.id - WhatsApp mesaj ID'si, sonra id)
      // README'ye göre key.id kullanılmalı (WhatsApp mesaj ID'si)
      const messageId = msg.key?.id || msg.id || '';
      const fromMe = msg.fromMe !== undefined ? msg.fromMe : (msg.key?.fromMe || false);
      
      if (!messageId) {
        setToast({ message: 'Mesaj ID bulunamadı', type: 'error' });
        return;
      }
      
      // Optimistic UI: Mesajı hemen kaldır
      messagesHook.setMessages(prev => prev.filter(m => {
        const mId = m.id || m.key?.id;
        return mId !== messageId;
      }));
      
      await api.deleteMessageForMe(activeAccount.id, chatsHook.selectedChat.id, messageId, fromMe);
      
      // Toast notification göster
      setToast({ message: 'Mesaj silindi', type: 'success' });
      
      // Mesajları yeniden yükle (güncel durumu görmek için)
      setTimeout(() => {
        if (chatsHook.selectedChat) {
          messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
        }
      }, 500);
    } catch (error) {
      setToast({ 
        message: 'Mesaj silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
      // Hata durumunda mesajları yeniden yükle
      messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat.id);
    }
  };

  const handleSendReaction = async (msg: Message, emoji: string) => {
    if (!activeAccount || !chatsHook.selectedChat || !sendRequest) return;
    
    try {
      // Backend message.key.id bekliyor, önce key.id'yi dene, yoksa msg.id kullan
      const messageId = msg.key?.id || msg.id || '';
      
      await sendRequest('sendReaction', {
        sessionId: activeAccount.id,
        jid: chatsHook.selectedChat.id,
        messageId: messageId,
        emoji: emoji,
      });
      setToast({ message: 'Reaksiyon gönderildi', type: 'success' });
    } catch (error) {
      setToast({ 
        message: 'Reaksiyon gönderilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'), 
        type: 'error' 
      });
    }
  };

  const handleCopyMessage = (msg: Message) => {
    const text = msg.text || msg.body || extractMessageText(msg) || '';
    if (text) {
      navigator.clipboard.writeText(text);
      setToast({ message: 'Mesaj kopyalandı', type: 'success' });
    } else {
      setToast({ message: 'Kopyalanacak metin bulunamadı', type: 'error' });
    }
  };

  const handleShowMessageInfo = (msg: Message) => {
    // Mesaj bilgilerini göster (timestamp, status, etc.)
    const timestamp = msg.timestamp || msg.messageTimestamp;
    const info = `Mesaj ID: ${msg.id}\nTarih: ${timestamp ? new Date(timestamp).toLocaleString('tr-TR') : 'Bilinmiyor'}\nDurum: ${msg.status || 'Bilinmiyor'}`;
    alert(info);
  };

  const handleSelectMessages = () => {
    // Mesaj seçim modunu aktifleştir
    setToast({ message: 'Mesaj seçim modu yakında eklenecek', type: 'info' });
  };

  const insertEmoji = (emoji: string) => {
    messagesHook.setMessage(messagesHook.message + emoji);
  };

  const handleAttachment = async (type: string) => {
    if (!activeAccount || !chatsHook.selectedChat) {
      alert('Lütfen önce bir sohbet seçin');
      setShowAttachMenu(false);
      return;
    }

    setShowAttachMenu(false);

    try {
      // Dosya seçme input'u oluştur
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';

      // Tip'e göre accept ve multiple ayarları
      switch (type) {
        case 'Fotoğraf':
          input.accept = 'image/*';
          break;
        case 'Video':
          input.accept = 'video/*';
          break;
        case 'Ses':
          input.accept = 'audio/*';
          break;
        case 'Belge':
          input.accept = '*/*'; // Tüm dosya tipleri
          break;
        case 'Kişi':
          alert('Kişi gönderme özelliği henüz desteklenmiyor');
          return;
        case 'Konum':
          alert('Konum gönderme özelliği henüz desteklenmiyor');
          return;
        default:
          return;
      }

      // Dosya seçildiğinde
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          // Resim veya Video ise modal aç
          if (type === 'Fotoğraf') {
            setSelectedMediaFile(file);
            setSelectedMediaType('image');
            setShowMediaPreview(true);
          } else if (type === 'Video') {
            setSelectedMediaFile(file);
            setSelectedMediaType('video');
            setShowMediaPreview(true);
          } else {
            // Ses ve Belge için direkt gönder (mevcut mantık)
            let mimetype = file.type || 'application/octet-stream';
            
            if (!mimetype || mimetype === 'application/octet-stream') {
              const ext = file.name.split('.').pop()?.toLowerCase();
              const mimeMap: Record<string, string> = {
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'ogg': 'audio/ogg',
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              };
              mimetype = mimeMap[ext || ''] || 'application/octet-stream';
            }

            await api.sendMediaMessage(
              activeAccount.id,
              chatsHook.selectedChat!.id,
              file,
              mimetype,
              undefined,
              type === 'Ses' ? { ptt: true } : undefined
            );

            messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat!.id);
            
            chatsHook.setChats(prevChats => {
              const index = prevChats.findIndex(c => c.id === chatsHook.selectedChat!.id);
              if (index >= 0) {
                const updatedChats = [...prevChats];
                const now = Math.floor(Date.now() / 1000);
                updatedChats[index] = {
                  ...updatedChats[index],
                  conversationTimestamp: now,
                  lastMessage: type === 'Ses' ? '🎵 Ses' : '📄 Belge',
                  time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                };
                return updatedChats;
              }
              return prevChats;
            });
          }
        } catch (error: any) {
          alert(`Dosya gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
        } finally {
          document.body.removeChild(input);
        }
      };

      // Input'u DOM'a ekle ve tıkla
      document.body.appendChild(input);
      input.click();
    } catch (error: any) {
      alert(`Hata: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  // EMOJIS ve ATTACHMENT_OPTIONS artık constants'tan import ediliyor

  // WebSocket bağlantısı artık useWebSocket hook'unda yönetiliyor
  const { sendRequest, connectionState } = useWebSocket({
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
    messagesCacheRef: messagesHook.messagesCacheRef, // Mesaj cache'i için ref'i geç
    setAccounts: accountsHook.setAccounts,
  });

  // sendRequest'i ref'e kaydet
  useEffect(() => {
    if (sendRequest) {
      sendRequestRef.current = sendRequest;
    }
  }, [sendRequest]);
  
  // sendRequest'i useMessages hook'una geç (useEffect ile güncelle)
  useEffect(() => {
    if (sendRequest && messagesHook.setSendRequest) {
      messagesHook.setSendRequest(sendRequest);
    }
  }, [sendRequest]);
  
  // sendRequest'i useAccounts hook'una geç (useEffect ile güncelle) - opsiyonel ama eklendi
  // useAccounts zaten WebSocket sessions.update event'ini dinliyor, sendRequest ile de desteklenebilir
  useEffect(() => {
    if (sendRequest && accountsHook.setSendRequest) {
      accountsHook.setSendRequest(sendRequest);
    }
  }, [sendRequest]);

  // WebSocket bağlantısı kurulduğunda chat'leri yükle (sayfa yenileme sonrası için)
  // Backend'in sendInitialData'sı chat'leri göndermiş olabilir, ama Ubuntu'da timing farklı olabilir
  // Bu durumda bir timeout ile bekleyip, hala yüklenmemişse getChats request'i gönder
  useEffect(() => {
    if (connectionState.status === 'connected' && sendRequest && activeAccount) {
      const sessionId = activeAccount.id;
      
      // Temp session'lar için chat yükleme işlemini atla
      if (sessionId.startsWith('temp-') || sessionId.startsWith('account-')) {
        return;
      }
      
      const hasInitialLoad = chatsHook.chatsInitialLoadRef.current.get(sessionId);
      const isLoaded = chatsHook.chatsLoadedRef.current.get(sessionId);
      
      // Eğer chat'ler yüklenmemişse, bir timeout ile bekleyip sonra yükle
      if (!hasInitialLoad || !isLoaded) {
        const timeoutId = setTimeout(async () => {
          // Hala yüklenmemişse, WebSocket üzerinden getChats request'i gönder
          // Backend'den chats.set event'i gelecek (backend'de getChats request'i aldığında chats.set event'i de gönderiyoruz)
          const stillNotLoaded = !chatsHook.chatsLoadedRef.current.get(sessionId);
          const stillNoInitialLoad = !chatsHook.chatsInitialLoadRef.current.get(sessionId);
          
          if (stillNotLoaded || stillNoInitialLoad) {
            try {
              console.log(`[WebSocket] Bağlantı kuruldu ama chat'ler yüklenmemiş, getChats request'i gönderiliyor... (sessionId: ${sessionId})`);
              
              // Backend'den chats.set event'i gelecek (handleChatsSet otomatik olarak çalışacak)
              await sendRequest('getChats', {
                sessionId: sessionId,
                limit: 50,
              });
              
              console.log(`[WebSocket] ✅ getChats request'i gönderildi, chats.set event'i bekleniyor...`);
            } catch (error) {
              console.error('[WebSocket] ❌ getChats request hatası:', error);
            }
          }
        }, 2000); // 2 saniye bekle (backend'in sendInitialData'sının çalışması için)
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [connectionState.status, sendRequest, activeAccount?.id]);

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
        
        {/* AddAccountModal - Hesap yokken de göster */}
        <AddAccountModal
          isOpen={accountsHook.showAddAccountModal}
          newAccountName={accountsHook.newAccountName}
          setNewAccountName={accountsHook.setNewAccountName}
          qrCode={accountsHook.qrCode}
          isLoadingQR={accountsHook.isLoadingQR}
          pendingAccountId={accountsHook.pendingAccountId}
          onGenerateQR={accountsHook.generateQR}
          onClose={accountsHook.handleCloseModal}
        />
      </div>
    );
  }

  // Templates sayfası
  if (currentPage === 'templates') {
    return (
      <TemplatesPage
        activeAccountId={activeAccount?.id}
        onBack={() => {
          window.history.pushState({}, '', '/');
          setCurrentPage('main');
        }}
      />
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
        
        {/* AddAccountModal - Aktif hesap yokken de göster */}
        <AddAccountModal
          isOpen={accountsHook.showAddAccountModal}
          newAccountName={accountsHook.newAccountName}
          setNewAccountName={accountsHook.setNewAccountName}
          qrCode={accountsHook.qrCode}
          isLoadingQR={accountsHook.isLoadingQR}
          pendingAccountId={accountsHook.pendingAccountId}
          onGenerateQR={accountsHook.generateQR}
          onClose={accountsHook.handleCloseModal}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <AccountSidebar
        accounts={accountsHook.accounts}
        onSwitchAccount={accountsHook.switchAccount}
        onAddAccount={accountsHook.handleAddAccount}
        onOpenTemplates={() => {
          window.history.pushState({}, '', '/templates');
          setCurrentPage('templates');
        }}
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
              await api.logoutSession(activeAccount.id);
              setShowAccountMenu(false);
              accountsHook.loadAccounts();
            } catch (error) {
              alert('Çıkış yapılamadı');
            }
          }}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
          onMarkChatRead={handleMarkChatRead}
          onPinChat={handlePinChat}
          onMuteChat={handleMuteChat}
          onShowContactProfile={(chat: Chat) => {
            const contact = contactsHook.contacts.find(c => c.id === chat.id);
            setSelectedContactForProfile(contact || null);
            setShowContactProfile(true);
          }}
        />

        <div className="flex-1 flex flex-col w-80">
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
            onArchiveChat={handleArchiveChat}
            onMuteChat={handleMuteChat}
            onMarkChatRead={handleMarkChatRead}
            onPinChat={handlePinChat}
            onDeleteChat={handleDeleteChat}
            onSetDisappearingMessages={handleSetDisappearingMessages}
            onRetryMessage={async (msg) => {
              if (!activeAccount || !chatsHook.selectedChat || !msg.text) return;
              try {
                let response;
                
                // WebSocket varsa WebSocket kullan, yoksa API fallback
                if (sendRequest) {
                  response = await sendRequest('sendMessage', {
                    sessionId: activeAccount.id,
                    jid: chatsHook.selectedChat.id,
                    message: msg.text,
                  });
                } else {
                  response = await api.sendMessage(activeAccount.id, chatsHook.selectedChat.id, msg.text);
                }
                
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
                alert(`Mesaj tekrar gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
              }
            }}
            onPinMessage={handlePinMessage}
            onRejectCall={handleRejectCall}
            onDeleteMessageForMe={handleDeleteMessageForMe}
            onSendReaction={handleSendReaction}
            onCopyMessage={handleCopyMessage}
            onShowMessageInfo={handleShowMessageInfo}
            onSelectMessages={handleSelectMessages}
            searchTerm={messageSearchTerm}
            onSearchChange={setMessageSearchTerm}
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
              activeAccountId={activeAccount?.id}
              onOpenTemplates={() => {
                setShowTemplateSelector(true);
              }}
              isSending={isSending}
              onSendMedia={handleSendMedia}
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
        onSelectContact={handleSelectContactForMessage}
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

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <TemplateSelectorModal
          isOpen={showTemplateSelector}
          activeAccountId={activeAccount?.id}
          selectedChatJid={chatsHook.selectedChat?.id}
          onClose={() => setShowTemplateSelector(false)}
          onTemplateSent={() => {
            // Mesajları yeniden yükle
            if (activeAccount && chatsHook.selectedChat) {
              setTimeout(() => {
                messagesHook.loadMessages(activeAccount.id, chatsHook.selectedChat!.id);
              }, 500);
            }
          }}
        />
      )}

      {/* AddAccountModal - Her zaman render edilir (hesap varken de yokken de) */}
      <AddAccountModal
        isOpen={accountsHook.showAddAccountModal}
        newAccountName={accountsHook.newAccountName}
        setNewAccountName={accountsHook.setNewAccountName}
        qrCode={accountsHook.qrCode}
        isLoadingQR={accountsHook.isLoadingQR}
        pendingAccountId={accountsHook.pendingAccountId}
        onGenerateQR={accountsHook.generateQR}
        onClose={accountsHook.handleCloseModal}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Contact Profile Modal */}
      <ContactProfileModal
        isOpen={showContactProfile}
        contact={selectedContactForProfile || undefined}
        chat={chatsHook.selectedChat}
        profilePicture={
          selectedContactForProfile 
            ? (chatProfilePictures.get(selectedContactForProfile.id) || selectedContactForProfile.imgUrl || undefined)
            : (chatsHook.selectedChat?.profilePicture || chatProfilePictures.get(chatsHook.selectedChat?.id || '') || undefined)
        }
        onClose={() => {
          setShowContactProfile(false);
          setSelectedContactForProfile(null);
        }}
        onSendMessage={() => {
          if (chatsHook.selectedChat) {
            chatsHook.setSelectedChat(chatsHook.selectedChat);
            messagesHook.loadMessages(activeAccount!.id, chatsHook.selectedChat.id);
          }
        }}
      />
      {/* Media Preview Modal */}
      <MediaPreviewModal
        isOpen={showMediaPreview}
        file={selectedMediaFile}
        mediaType={selectedMediaType}
        onClose={() => {
          setShowMediaPreview(false);
          setSelectedMediaFile(null);
        }}
        onSend={(caption) => {
          if (selectedMediaFile) {
            handleSendMedia(selectedMediaFile, selectedMediaType, caption);
          }
        }}
      />
    </div>
  );
}