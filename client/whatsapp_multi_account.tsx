import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Plus, Search, MoreVertical, Users, Phone, Video, Smile, Paperclip, Mic, Send, Check, CheckCheck, X, Edit2, Loader2, LogOut, Volume2, VolumeX, RefreshCcw, Reply, Forward, Trash2, Star, StarOff, Eye } from 'lucide-react';
import * as api from './api';
import * as QRCode from 'qrcode';

interface Account {
  id: string;
  name: string;
  status?: string;
  color: string;
  active: boolean;
  whatsappJid?: string | null; // WhatsApp numarası (duplicate kontrolü için)
}

interface Chat {
  id: string;
  name: string;
  unreadCount?: number;
  conversationTimestamp?: number | null;
  isMuted?: boolean;
  lastMessage?: string;
  time?: string;
  profilePicture?: string;
  verifiedName?: string;
  archived?: boolean;
}

interface Message {
  id?: string;
  key?: {
    fromMe?: boolean;
    id?: string;
    remoteJid?: string;
    participant?: string;
  };
  message?: any;
  pushName?: string;
  body?: string; // bazı helper formatlarda gelebilir
  text?: string; // Backend'den gelen formatlanmış text
  timestamp?: number; // Unix timestamp (saniye cinsinden)
  fromMe?: boolean; // Backend'den gelen formatlanmış mesajlarda direkt olarak var
  from?: string; // Backend'den gelen remoteJid
  type?: string; // Mesaj tipi (conversation, imageMessage, videoMessage, vb.)
  participant?: string; // Grup mesajlarında gönderen kişi
  starred?: boolean; // Mesaj yıldızlı mı?
  messageTimestamp?: number; // Alternatif timestamp
  quotedMessage?: { // Yanıtlanan mesaj bilgisi
    id?: string;
    from?: string;
    text?: string;
  };
}

export default function WhatsAppMultiAccount() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState('');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [showForwardSelector, setShowForwardSelector] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [contacts, setContacts] = useState<api.Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<api.Contact[]>([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [chatProfilePictures, setChatProfilePictures] = useState<Map<string, string>>(new Map());
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups' | 'archived'>('all');
  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sseRef = useRef<(() => void) | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chatsPollRef = useRef<NodeJS.Timeout | null>(null);
  const activeAccountRef = useRef<Account | undefined>(undefined);
  const selectedChatRef = useRef<Chat | null>(null);
  const contactsCacheRef = useRef<Map<string, { data: Map<string, any>, timestamp: number }>>(new Map());
  const chatsLoadedRef = useRef<Map<string, boolean>>(new Map()); // sessionId -> chat listesi yüklendi mi?
  const chatsInitialLoadRef = useRef<Map<string, boolean>>(new Map()); // sessionId -> ilk yükleme yapıldı mı?
  const messagesInitialLoadRef = useRef<Map<string, boolean>>(new Map()); // sessionId-chatId -> mesaj geçmişi ilk yüklendi mi?
  const profilePictureQueueRef = useRef<Map<string, Set<string>>>(new Map()); // sessionId -> Set of jids
  const profilePictureLoadingRef = useRef<boolean>(false);
  const profilePictureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profilePictureFailedRef = useRef<Set<string>>(new Set()); // Başarısız olan profil resimleri (tekrar deneme)
  const CONTACTS_CACHE_TTL = 5 * 60 * 1000; // 5 dakika

  // Profil resimlerini batch olarak yükle (debounce ile)
  const loadProfilePicturesBatch = async (sessionId: string) => {
    if (profilePictureLoadingRef.current) return;
    
    const queue = profilePictureQueueRef.current.get(sessionId);
    if (!queue || queue.size === 0) return;

    profilePictureLoadingRef.current = true;
    
    // Queue'dan jid'leri al ve temizle
    const jidsToLoad = Array.from(queue);
    profilePictureQueueRef.current.delete(sessionId);

    // Batch olarak yükle (bir seferde maksimum 5 profil resmi)
    const batchSize = 5;
    for (let i = 0; i < jidsToLoad.length; i += batchSize) {
      const batch = jidsToLoad.slice(i, i + batchSize);
      
      // Paralel olarak yükle
      await Promise.allSettled(
        batch.map(jid => 
          api.getProfilePicture(sessionId, jid)
            .then(pictureUrl => {
              if (pictureUrl) {
                setChatProfilePictures(prev => new Map(prev).set(jid, pictureUrl));
                // Başarılı olduysa failed listesinden çıkar
                profilePictureFailedRef.current.delete(jid);
              } else {
                // Resim yoksa özel bir flag ekle (tekrar deneme yapılmayacak)
                setChatProfilePictures(prev => new Map(prev).set(jid, 'NO_PICTURE'));
                profilePictureFailedRef.current.add(jid);
              }
            })
            .catch(() => {
              // Hata durumunda da tekrar deneme yapılmayacak
              setChatProfilePictures(prev => new Map(prev).set(jid, 'NO_PICTURE'));
              profilePictureFailedRef.current.add(jid);
            })
        )
      );
      
      // Her batch arasında kısa bir bekleme (rate limiting)
      if (i + batchSize < jidsToLoad.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    profilePictureLoadingRef.current = false;
  };

  // Profil resmi yükleme isteğini queue'ya ekle (debounce ile)
  const queueProfilePicture = (sessionId: string, jid: string) => {
    // Eğer zaten yüklenmişse, yükleniyorsa veya başarısız olmuşsa, atla
    if (chatProfilePictures.has(jid)) return;
    if (profilePictureFailedRef.current.has(jid)) return;
    
    // Queue'ya ekle
    if (!profilePictureQueueRef.current.has(sessionId)) {
      profilePictureQueueRef.current.set(sessionId, new Set());
    }
    profilePictureQueueRef.current.get(sessionId)!.add(jid);

    // Debounce: 500ms sonra batch yükle
    if (profilePictureTimeoutRef.current) {
      clearTimeout(profilePictureTimeoutRef.current);
    }
    
    profilePictureTimeoutRef.current = setTimeout(() => {
      loadProfilePicturesBatch(sessionId);
    }, 500);
  };

  const colors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-red-500', 'bg-yellow-500', 'bg-indigo-500'];

  // Hesap listesini yükle
  useEffect(() => {
    console.log('=== Component mount - loadAccounts çağrılıyor ===');
    loadAccounts();
  }, []);


  // Aktif hesap değiştiğinde sohbetleri yükle
  const activeAccount = accounts.find(acc => acc.active) || accounts[0];
  
  // Ref'leri güncelle
  useEffect(() => {
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);
  
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    console.log('=== activeAccount değişti ===', activeAccount);
    if (activeAccount) {
      const sessionId = activeAccount.id;
      const hasInitialLoad = chatsInitialLoadRef.current.get(sessionId);
      
      // Sadece ilk bağlantıda veya bağlantı durumu değiştiğinde yükle
      if (activeAccount.status === 'open' && !hasInitialLoad) {
        console.log('İlk bağlantı - sohbetler yükleniyor, sessionId:', sessionId);
        chatsInitialLoadRef.current.set(sessionId, true);
        chatsLoadedRef.current.set(sessionId, false);
        
        // İlk bağlantıda contact'ları da yükle
        loadContacts(sessionId).then(() => {
          // Sadece sohbet listesi boşsa yükle
          if (chats.length === 0) {
            loadChats(sessionId, 50, true);
          }
        });
      } else if (activeAccount.status !== 'open' && chats.length === 0 && !hasInitialLoad) {
        // Bağlı değilse de DB'den yükle (uygulama yeniden başladığında sohbetler görünsün)
        console.log('Hesap bağlı değil ama sohbetler yok - DB\'den yükleniyor');
        chatsInitialLoadRef.current.set(sessionId, true);
        loadChats(sessionId, 50, true);
      }
    } else {
      console.log('activeAccount yok, loadChats çağrılmıyor');
    }
  }, [activeAccount?.id, activeAccount?.status]);

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

      // localStorage'dan hesap adlarını yükle
      const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');

      const accountsWithStatus = await Promise.all(
        sessions.map(async (session, index) => {
          try {
            const status = await api.getSessionStatus(session.id);
            // localStorage'dan hesap adını al, yoksa sessionId kullan
            const accountName = accountNames[session.id] || session.id;
            return {
              id: session.id,
              name: accountName,
              status: status.status || session.status || 'unknown',
              color: colors[index % colors.length],
              active: index === 0, // İlk hesap aktif
              whatsappJid: (session as any).whatsappJid || null, // Backend'den gelen whatsappJid
            };
          } catch (error) {
            console.warn(`Session ${session.id} status alınamadı:`, error);
            // Status alınamazsa session'dan gelen status'u kullan
            const accountName = accountNames[session.id] || session.id;
            return {
              id: session.id,
              name: accountName,
              status: session.status || 'unknown',
              color: colors[index % colors.length],
              active: index === 0,
              whatsappJid: (session as any).whatsappJid || null,
            };
          }
        })
      );
      
      console.log('Hesaplar oluşturuldu (duplicate kontrolü öncesi):', accountsWithStatus);
      
      // Duplicate kontrolü: Aynı WhatsApp numarasına sahip session'ları filtrele
      // Sadece en son aktif olan (open status) session'ı göster
      const uniqueAccounts = new Map<string, Account>();
      
      for (const account of accountsWithStatus) {
        const key = (account as any).whatsappJid || account.id; // WhatsApp numarası varsa onu kullan, yoksa sessionId
        
        const existing = uniqueAccounts.get(key);
        if (!existing) {
          // İlk kez görülen hesap
          uniqueAccounts.set(key, account);
        } else {
          // Duplicate hesap - öncelik sırası: open > connecting > initializing > close
          const statusPriority = { 'open': 4, 'connecting': 3, 'initializing': 2, 'close': 1, 'unknown': 0 };
          const existingPriority = statusPriority[existing.status as keyof typeof statusPriority] || 0;
          const currentPriority = statusPriority[account.status as keyof typeof statusPriority] || 0;
          
          if (currentPriority > existingPriority) {
            // Mevcut hesap daha yüksek öncelikli, eskiyi değiştir
            uniqueAccounts.set(key, account);
          } else if (currentPriority === existingPriority && account.status === 'open') {
            // Aynı öncelik ve ikisi de open ise, daha yeni olanı al (id'ye göre)
            if (account.id > existing.id) {
              uniqueAccounts.set(key, account);
            }
          }
        }
      }
      
      const finalAccounts = Array.from(uniqueAccounts.values());
      console.log('Hesaplar oluşturuldu (duplicate kontrolü sonrası):', finalAccounts);
      
      // Aktif hesap yoksa ilkini aktif yap
      const hasActive = finalAccounts.some(acc => acc.active);
      if (!hasActive && finalAccounts.length > 0) {
        finalAccounts[0].active = true;
      }
      
      setAccounts(finalAccounts);
    } catch (error) {
      console.error('Hesaplar yüklenemedi:', error);
      // Hata durumunda boş liste göster
      setAccounts([]);
    }
  };

  // Mesajdan text çıkarma fonksiyonu (yeniden kullanılabilir)
  const extractMessageText = (msg: any): string => {
    if (!msg) return '';
    
    // Bazı adapter'lar direkt text döndürebilir
    let body: string | undefined =
      msg.body ||
      msg.text ||
      msg.message?.text;

    // Baileys ham mesaj yapısından text / caption çıkar
    if (!body && msg.message) {
      const m = msg.message;
      if (m.conversation) body = m.conversation;
      else if (m.extendedTextMessage?.text) body = m.extendedTextMessage.text;
      else if (m.imageMessage?.caption) body = m.imageMessage.caption || '📷 Fotoğraf';
      else if (m.videoMessage?.caption) body = m.videoMessage.caption || '📹 Video';
      else if (m.audioMessage) body = '🎵 Ses';
      else if (m.documentMessage) body = '📄 ' + (m.documentMessage.fileName || 'Belge');
      else if (m.stickerMessage) body = '🎨 Sticker';
      else if (m.locationMessage) body = '📍 Konum';
      else if (m.contactMessage) body = '👤 Kişi';
      else if (m.buttonsMessage?.contentText) body = m.buttonsMessage.contentText;
      else if (m.buttonsResponseMessage?.selectedButtonId) body = m.buttonsResponseMessage.selectedButtonId;
      else if (m.listResponseMessage?.singleSelectReply?.selectedRowId) body = m.listResponseMessage.singleSelectReply.selectedRowId;
      else if (m.templateMessage?.hydratedTemplate?.templateMessage?.contentText) {
        body = m.templateMessage.hydratedTemplate.templateMessage.contentText;
      } else if (m.templateMessage?.hydratedFourRowTemplate?.hydratedContentText) {
        body = m.templateMessage.hydratedFourRowTemplate.hydratedContentText;
      } else if (m.pollCreationMessage) body = '📊 Anket';
      else if (m.pollUpdateMessage) body = '📊 Anket güncellemesi';
      else if (m.reactionMessage) body = '👍 Reaksiyon';
      else if (m.protocolMessage) body = '🔐 Sistem mesajı';
      else if (m.senderKeyDistributionMessage) body = '🔑 Güvenlik mesajı';
      else if (m.groupInviteMessage) body = '👥 Grup daveti';
      else if (m.liveLocationMessage) body = '📍 Canlı konum';
      else if (m.requestPhoneNumberMessage) body = '📞 Telefon numarası isteği';
      else if (m.viewOnceMessage) {
        // View once mesajlar içeriklerini saklamaz, sadece tip bilgisi var
        if (m.viewOnceMessage.message?.imageMessage) body = '📷 Tek seferlik fotoğraf';
        else if (m.viewOnceMessage.message?.videoMessage) body = '📹 Tek seferlik video';
        else body = '👁️ Tek seferlik mesaj';
      }
    }

    return body || '';
  };

  // Contact'ları yükle (sadece manuel çağrıldığında veya ilk bağlantıda)
  const loadContacts = async (sessionId: string, forceReload: boolean = false): Promise<Map<string, any>> => {
    try {
      // Cache kontrolü
      const cached = contactsCacheRef.current.get(sessionId);
      if (!forceReload && cached) {
        console.log('Contact\'lar cache\'den kullanılıyor:', cached.data.size);
        return cached.data;
      }

      console.log('=== Contact\'lar API\'den yükleniyor ===', { sessionId, forceReload });
      // Limit olmadan tüm contact'ları çek
      const contactsData = await api.getContacts(sessionId).catch(() => []);
      
      // Contact'ları Map'e çevir ve cache'e kaydet
      const contactsMap = new Map<string, any>();
      if (contactsData && Array.isArray(contactsData)) {
        contactsData.forEach((contact: any) => {
          contactsMap.set(contact.id, contact);
        });
        contactsCacheRef.current.set(sessionId, {
          data: contactsMap,
          timestamp: Date.now()
        });
        console.log('Contact\'lar yüklendi ve cache\'lendi:', contactsData.length);
      }
      
      return contactsMap;
    } catch (error) {
      console.error('Contact\'lar yüklenemedi:', error);
      // Hata durumunda cache'den döndür
      const cached = contactsCacheRef.current.get(sessionId);
      return cached ? cached.data : new Map<string, any>();
    }
  };

  // Contact listesini yükle ve modal'ı aç (WebSocket cache'inden)
  const handleLoadContacts = () => {
    if (!activeAccount) return;
    
    setShowContactsModal(true);
    setContactSearchTerm('');
    
    // WebSocket cache'den kullan
    const cached = contactsCacheRef.current.get(activeAccount.id);
    if (cached && cached.data.size > 0) {
      // Cache'den kullan
      const contactsArray = Array.from(cached.data.values());
      setContacts(contactsArray);
      setFilteredContacts(contactsArray);
      console.log('Contact\'lar WebSocket cache\'den yüklendi:', contactsArray.length);
      
      // Profil fotoğraflarını yükle (imgUrl yoksa)
      contactsArray.forEach((contact) => {
        if (!contact.imgUrl && !chatProfilePictures.has(contact.id) && !profilePictureFailedRef.current.has(contact.id)) {
          queueProfilePicture(activeAccount.id, contact.id);
        }
      });
    } else {
      // Cache boşsa, WebSocket'ten gelecek contact'ları bekle
      console.log('Contact cache boş, WebSocket\'ten gelecek contact\'lar bekleniyor...');
      setContacts([]);
      setFilteredContacts([]);
    }
  };

  const handleRefreshContacts = async () => {
    if (!activeAccount) return;

    try {
      setIsLoadingContacts(true);
      const contactsMap = await loadContacts(activeAccount.id, true);
      const contactsArray = Array.from(contactsMap.values());
      setContacts(contactsArray);
      
      // Profil fotoğraflarını yükle (imgUrl yoksa)
      contactsArray.forEach((contact) => {
        if (!contact.imgUrl && !chatProfilePictures.has(contact.id) && !profilePictureFailedRef.current.has(contact.id)) {
          queueProfilePicture(activeAccount.id, contact.id);
        }
      });
    } catch (error) {
      console.error('Kişi listesi yenilenemedi:', error);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Kişi seçici modal'ını aç (WebSocket cache'inden)
  const handleOpenContactSelector = () => {
    if (!activeAccount) return;
    
    setShowContactSelector(true);
    setContactSearchTerm('');
    
    // WebSocket cache'den kullan
    const cached = contactsCacheRef.current.get(activeAccount.id);
    if (cached && cached.data.size > 0) {
      // Cache'den kullan
      const contactsArray = Array.from(cached.data.values());
      setContacts(contactsArray);
      setFilteredContacts(contactsArray);
      console.log('Contact\'lar WebSocket cache\'den yüklendi:', contactsArray.length);
    } else {
      // Cache boşsa, WebSocket'ten gelecek contact'ları bekle
      console.log('Contact cache boş, WebSocket\'ten gelecek contact\'lar bekleniyor...');
      setContacts([]);
      setFilteredContacts([]);
    }
  };

  // Telefon numarasını normalize et (boşluk, tire, parantez kaldır)
  const normalizePhoneNumber = (phone: string): string => {
    return phone.replace(/[\s\-\(\)]/g, '');
  };

  // JID'den telefon numarasını çıkar
  const extractPhoneFromJid = (jid: string): string => {
    // JID formatı: 905538682233@s.whatsapp.net veya 905538682233:123@g.us
    const match = jid.match(/^(\d+)@/);
    if (match) {
      let phone = match[1];
      // 90 ile başlıyorsa (Türkiye), 0 ekle
      if (phone.startsWith('90') && phone.length > 10) {
        phone = '0' + phone.substring(2);
      }
      return phone;
    }
    return jid;
  };

  // Contact arama (telefon numarası wildcard desteği ile)
  useEffect(() => {
    if (!contactSearchTerm.trim()) {
      setFilteredContacts(contacts);
    } else {
      const search = contactSearchTerm.toLowerCase().trim();
      const searchNormalized = normalizePhoneNumber(search);
      
      const filtered = contacts.filter(contact => {
        // İsim ve notify araması
        const name = (contact.name || '').toLowerCase();
        const notify = (contact.notify || '').toLowerCase();
        const verifiedName = (contact.verifiedName || '').toLowerCase();
        
        if (name.includes(search) || notify.includes(search) || verifiedName.includes(search)) {
          return true;
        }
        
        // Telefon numarası araması (wildcard desteği)
        const phoneFromJid = extractPhoneFromJid(contact.id);
        const phoneNormalized = normalizePhoneNumber(phoneFromJid);
        
        // Eğer arama terimi sadece rakamlardan oluşuyorsa veya * içeriyorsa telefon araması yap
        if (/^[\d\s\*\-\(\)]+$/.test(contactSearchTerm)) {
          // * karakterini regex wildcard'a çevir
          const searchPattern = searchNormalized.replace(/\*/g, '.*');
          const regex = new RegExp(searchPattern, 'i');
          
          // Normalize edilmiş telefon numarasında ara
          if (regex.test(phoneNormalized)) {
            return true;
          }
          
          // Farklı formatlarda da ara (boşluklu, tireli vs.)
          const phoneFormatted1 = phoneFromJid.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3'); // 0553 868 2233
          const phoneFormatted2 = phoneFromJid.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2$3'); // 0553 8682233
          const phoneFormatted3 = phoneFromJid.replace(/(\d{4})(\d{3})(\d{4})/, '$1$2 $3'); // 0553868 233
          
          if (regex.test(normalizePhoneNumber(phoneFormatted1)) || 
              regex.test(normalizePhoneNumber(phoneFormatted2)) || 
              regex.test(normalizePhoneNumber(phoneFormatted3))) {
            return true;
          }
        }
        
        // JID'de de ara
        const id = (contact.id || '').toLowerCase();
        if (id.includes(search)) {
          return true;
        }
        
        return false;
      });
      setFilteredContacts(filtered);
    }
  }, [contactSearchTerm, contacts]);

  // Profil resimleri güncellendiğinde chat listesini ve selectedChat'i güncelle
  useEffect(() => {
    if (chatProfilePictures.size > 0 && chats.length > 0) {
      setChats(prevChats => prevChats.map(chat => {
        const pictureUrl = chatProfilePictures.get(chat.id);
        if (pictureUrl && pictureUrl !== '' && pictureUrl !== chat.profilePicture) {
          return { ...chat, profilePicture: pictureUrl };
        }
        return chat;
      }));
      
      // Eğer seçili sohbet varsa, profil resmini güncelle
      if (selectedChat) {
        const pictureUrl = chatProfilePictures.get(selectedChat.id);
        if (pictureUrl && pictureUrl !== '' && pictureUrl !== selectedChat.profilePicture) {
          setSelectedChat(prev => prev ? { ...prev, profilePicture: pictureUrl } : null);
        }
      }
    }
  }, [chatProfilePictures, chats.length, selectedChat?.id]);

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
      
      setSelectedChat(newChat);
      setShowContactSelector(false);
      setContactSearchTerm('');
      
      // Mesajları yükle
      await loadMessages(activeAccount.id, chatId);
      
      // Sohbet listesini de yenile (yeni chat eklenmiş olabilir) - force ile
      loadChats(activeAccount.id, 50, true);
    } catch (error) {
      console.error('Kişi seçilemedi:', error);
      alert('Kişi seçilemedi');
    }
  };

  const loadChats = async (sessionId: string, limit: number = 50, force: boolean = false) => {
    try {
      // Eğer zaten yüklendiyse ve force değilse, yükleme
      if (!force && chatsLoadedRef.current.get(sessionId) && chats.length > 0) {
        console.log('Sohbetler zaten yüklü, tekrar yüklenmiyor');
        return;
      }
      
      console.log('=== Sohbetler yükleniyor ===', { sessionId, limit, force });
      console.log('SessionId:', sessionId);
      console.log('Aktif hesap:', activeAccount);
      
      // Sadece sohbetleri yükle
      const chatsData = await api.getChats(sessionId, limit);
      
      console.log('Sohbetler alındı (ham data):', chatsData);
      console.log('Sohbet sayısı:', chatsData?.length || 0);
      
      if (!chatsData || chatsData.length === 0) {
        console.warn('Sohbet listesi boş! SessionId doğru mu kontrol edin.');
        // Boş liste set etme, mevcut sohbetleri koru (uygulama yeniden başladığında sohbetler kaybolmasın)
        // setChats([]);
        return;
      }
      
      // Yüklendi olarak işaretle
      chatsLoadedRef.current.set(sessionId, true);
      
      // Contact'ları cache'den al (yoksa boş map)
      const cached = contactsCacheRef.current.get(sessionId);
      const contactsMap = cached ? cached.data : new Map<string, any>();
      console.log('Contact\'lar cache\'den kullanıldı:', contactsMap.size);
      
      // Son 50 sohbeti sırala (en yeni conversationTimestamp'e göre)
      const sortedChats = [...chatsData].sort((a, b) => {
        const aTime = a.conversationTimestamp || a.lastMsgTimestamp || 0;
        const bTime = b.conversationTimestamp || b.lastMsgTimestamp || 0;
        return Number(bTime) - Number(aTime); // En yeni önce
      }).slice(0, limit);
      
      const formattedChats = sortedChats.map(chat => {
        // Last message'i extract et
        let lastMessage = '';
        if (chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0) {
          const lastMsg = chat.messages[chat.messages.length - 1];
          lastMessage = extractMessageText(lastMsg);
        } else if (chat.lastMessage) {
          lastMessage = extractMessageText(chat.lastMessage);
        }
        
        // Chat ID'den kişi adını bul
        // Backend'den gelen chat'lerde zaten verifiedName ve name olabilir
        let displayName = chat.name || chat.displayName || chat.id;
        let verifiedName: string | undefined = chat.verifiedName || undefined;
        let profilePicture: string | undefined = chatProfilePictures.get(chat.id);
        
        // Grup değilse (grup ID'leri @g.us ile biter) contact'tan ad al
        if (!chat.id.includes('@g.us')) {
          const contact = contactsMap.get(chat.id);
          if (contact) {
            // Contact'tan ad al: verifiedName > name > notify > id
            // Backend'den gelen chat'lerde zaten verifiedName varsa onu kullan
            verifiedName = verifiedName || contact.verifiedName;
            displayName = verifiedName || contact.verifiedName || contact.name || contact.notify || chat.name || chat.id;
            
            // Profil resmini contact'tan al (imgUrl varsa)
            if (contact.imgUrl) {
              profilePicture = contact.imgUrl;
              if (!chatProfilePictures.has(chat.id)) {
                setChatProfilePictures(prev => new Map(prev).set(chat.id, contact.imgUrl));
              }
            } else if (!chatProfilePictures.has(chat.id)) {
              // Contact'ta imgUrl yoksa, queue'ya ekle (batch yükleme)
              queueProfilePicture(sessionId, chat.id);
            } else {
              // Cache'den al
              const cached = chatProfilePictures.get(chat.id);
              profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
            }
          } else {
            // Contact bulunamadıysa, ID'den telefon numarasını göster
            const phoneMatch = chat.id.match(/^(\d+)@/);
            if (phoneMatch) {
              displayName = phoneMatch[1];
            }
            
            // Profil resmini lazy load (contact yoksa da deneyelim) - queue'ya ekle
            if (!chatProfilePictures.has(chat.id)) {
              queueProfilePicture(sessionId, chat.id);
            } else {
              const cached = chatProfilePictures.get(chat.id);
              profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
            }
          }
        } else {
          // Grup için profil resmini yükle - queue'ya ekle
          if (!chatProfilePictures.has(chat.id)) {
            queueProfilePicture(sessionId, chat.id);
          } else {
            // Cache'den al
            const cached = chatProfilePictures.get(chat.id);
            profilePicture = cached && cached !== '' && cached !== 'NO_PICTURE' ? cached : undefined;
          }
        }
        
        return {
          ...chat,
          name: displayName, // Kişi adı ile güncelle
          verifiedName: verifiedName,
          profilePicture: profilePicture,
          archived: chat.archived || false, // Arşiv durumu
          lastMessage: lastMessage || '',
          time: chat.conversationTimestamp 
            ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : chat.lastMsgTimestamp
            ? new Date(Number(chat.lastMsgTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : '',
        };
      });
      console.log('Formatlanmış sohbetler:', formattedChats);
      setChats(formattedChats);
      if (formattedChats.length > 0 && !selectedChat) {
        setSelectedChat(formattedChats[0]);
      }
    } catch (error: any) {
      console.error('Sohbetler yüklenemedi:', error);
      console.error('Hata detayı:', error.message);
      console.error('SessionId:', sessionId);
      // Hata durumunda mevcut sohbetleri koru (uygulama yeniden başladığında sohbetler kaybolmasın)
      // setChats([]);
      // Kullanıcıya hata göster (sessizce, console'da zaten log var)
      console.warn(`Sohbetler yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  const loadMessages = async (sessionId: string, chatId: string, limit: number = 50, append: boolean = false) => {
    try {
      console.log('=== Mesajlar yükleniyor ===', { sessionId, chatId, limit, append });
      
      // Eğer append modu değilse, önce mesajları temizle
      if (!append) {
        setMessages([]);
        // İlk yükleme flag'ini sıfırla (yeni mesajlar yüklenecek)
        const messagesKey = `${sessionId}-${chatId}`;
        messagesInitialLoadRef.current.delete(messagesKey);
      }
      
      const data = await api.getMessages(sessionId, chatId, limit);
      console.log('Mesajlar alındı (ham data):', data);
      
      // İlk yükleme flag'ini set et
      if (!append && data && data.length > 0) {
        const messagesKey = `${sessionId}-${chatId}`;
        messagesInitialLoadRef.current.set(messagesKey, true);
      }

      // Mesaj içeriğini okunabilir hale getirmek için map
      // Backend'den gelen mesajlar formatMessage ile formatlanmış olabilir
      const mapped: Message[] = (data || []).map((msg: any) => {
        // Backend'den gelen text field'ını koru, yoksa extractMessageText kullan
        const text = msg.text || extractMessageText(msg);
        const body = msg.body || text;
        
        // Mesaj ID'si oluştur (duplicate kontrolü için)
        const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;

        // fromMe kontrolü - backend'den gelen formatlanmış mesajlarda direkt var
        const fromMe = msg.fromMe !== undefined 
          ? Boolean(msg.fromMe) 
          : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);

        return {
          ...msg,
          id: msgId,
          text: text || body, // Backend formatını koru
          body: body || text, // Geriye dönük uyumluluk için
          fromMe: fromMe, // fromMe'yi açıkça set et
          timestamp: msg.timestamp || msg.messageTimestamp || undefined,
        };
      });

      // Eğer append moduysa, mevcut mesajlarla birleştir (duplicate kontrolü ile)
      if (append) {
        setMessages(prev => {
          // Mevcut mesaj ID'lerini al
          const existingIds = new Set(prev.map(m => m.id || m.key?.id));
          
          // Yeni mesajları filtrele (duplicate olmayanlar)
          const newMessages = mapped.filter(msg => {
            const msgId = msg.id || msg.key?.id;
            return msgId && !existingIds.has(msgId);
          });
          
          // Birleştir ve sırala (timestamp'leri normalize et)
          const merged = [...prev, ...newMessages];
          merged.sort((a, b) => {
            // Timestamp'leri normalize et (saniye veya milisaniye olabilir)
            const normalizeTimestamp = (ts: number | undefined) => {
              if (!ts) return 0;
              // Eğer çok büyükse (milisaniye), küçükse (saniye) 1000 ile çarp
              return ts > 1000000000000 ? ts : ts * 1000;
            };
            
            const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
            const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
            return aTime - bTime;
          });
          
          return merged;
        });
      } else {
        // Yeni mesajları timestamp'e göre sırala (en eski önce)
        mapped.sort((a, b) => {
          const aTime = a.timestamp || a.messageTimestamp || 0;
          const bTime = b.timestamp || b.messageTimestamp || 0;
          return aTime - bTime;
        });

        setMessages(mapped);
      }
    } catch (error: any) {
      console.error('Mesajlar yüklenemedi:', error);
      if (!append) {
        alert(`Mesajlar yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
        setMessages([]);
      }
    }
  };

  const switchAccount = (accountId: string) => {
    setAccounts(accounts.map(acc => ({
      ...acc,
      active: acc.id === accountId
    })));
  };

  // Benzersiz hesap ID oluştur
  const generateAccountId = (accountName: string): string => {
    // Hesap adından slug oluştur (küçük harf, boşlukları tire ile değiştir, özel karakterleri temizle)
    const baseSlug = accountName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Özel karakterleri temizle
      .replace(/\s+/g, '-') // Boşlukları tire ile değiştir
      .replace(/-+/g, '-') // Birden fazla tireyi tek tire yap
      .replace(/^-|-$/g, ''); // Başta ve sonda tire varsa kaldır
    
    // Eğer slug boşsa veya çok kısaysa, timestamp ekle
    if (!baseSlug || baseSlug.length < 2) {
      return `account-${Date.now()}`;
    }
    
    // Mevcut hesaplarda bu ID var mı kontrol et
    let accountId = baseSlug;
    let counter = 1;
    while (accounts.some(acc => acc.id === accountId)) {
      accountId = `${baseSlug}-${counter}`;
      counter++;
    }
    
    return accountId;
  };

  const handleAddAccount = () => {
    setShowAddAccountModal(true);
    setNewAccountName('');
    setQrCode(null);
  };

  const createAccount = async () => {
    if (!newAccountName.trim()) {
      alert('Hesap adı gerekli');
      return;
    }

    const accountName = newAccountName.trim();
    // Benzersiz ID oluştur
    const accountId = generateAccountId(accountName);
    
    setIsLoadingQR(true);
    setQrCode(null);

    try {
      // Session oluştur
      await api.createSession(accountId);
      
      // localStorage'a hesap adını kaydet
      const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
      accountNames[accountId] = accountName;
      localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
      
      // Hesap listesine ekle
      const newAccount: Account = {
        id: accountId,
        name: accountName,
        status: 'connecting',
        color: colors[accounts.length % colors.length],
        active: accounts.length === 0, // İlk hesap aktif
      };
      setAccounts([...accounts, newAccount]);

      // SSE ile QR kod dinle
      sseRef.current = api.subscribeToQR(accountId, (data) => {
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
          // Hesap listesini yenile
          loadAccounts();
          // Sohbetleri yükle (biraz bekle ki hesap listesi güncellensin)
          setTimeout(() => {
            // İlk bağlantıda contact'ları da yükle
            loadContacts(accountId).then(() => {
              loadChats(accountId, 50);
            });
          }, 1000);
        }
      });

      // Alternatif: QR kod'u direkt çek
      setTimeout(async () => {
        try {
          const qr = await api.getQRCode(accountId);
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
    // localStorage'a kaydet
    const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
    accountNames[accountId] = newName;
    localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
    
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
    
    const messageText = message.trim();
    
    try {
      await api.sendMessage(activeAccount.id, selectedChat.id, messageText);
      setMessage('');
      setShowEmojiPicker(false);
      
      // Mesajları yenileme - WebSocket'ten gelecek mesaj zaten eklenecek
      // loadMessages çağrısını kaldırdık çünkü bu sohbet geçmişini temizliyordu
      // WebSocket'ten gelen messages.upsert event'i mesajı ekleyecek
      
      // Chat listesindeki ilgili chat'i güncelle (yeniden sıralama yapmadan)
      setChats(prevChats => {
        const index = prevChats.findIndex(c => c.id === selectedChat.id);
        if (index >= 0) {
          const updatedChats = [...prevChats];
          const now = Math.floor(Date.now() / 1000); // Saniye cinsinden timestamp
          updatedChats[index] = {
            ...updatedChats[index],
            conversationTimestamp: now,
            lastMessage: messageText,
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          };
          // Chat'i en üste taşıma - sadece güncelle
          return updatedChats;
        }
        return prevChats;
      });
      
      // Optimistik UI güncellemesi: Mesajı hemen ekle (WebSocket'ten gelene kadar)
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        text: messageText,
        body: messageText,
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        from: selectedChat.id,
      };
      
      setMessages(prev => {
        // Duplicate kontrolü
        const existingIds = new Set(prev.map(m => m.id || m.key?.id));
        if (existingIds.has(optimisticMessage.id)) {
          return prev;
        }
        
        // Yeni mesajı ekle ve sırala
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
    } catch (error) {
      console.error('Mesaj gönderilemedi:', error);
      alert('Mesaj gönderilemedi');
    }
  };

  // Mesaj İşlemleri Handler'ları
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  const handleReplyMessage = async (msg: Message, replyText?: string) => {
    if (!activeAccount || !selectedChat || !msg) return;
    
    const textToSend = replyText || message;
    if (!textToSend.trim()) return;
    
    try {
      await api.replyToMessage(activeAccount.id, selectedChat.id, msg.id || '', textToSend);
      setMessage('');
      setReplyingTo(null);
      loadMessages(activeAccount.id, selectedChat.id);
      
      // Chat listesindeki ilgili chat'i güncelle (yeniden sıralama yapmadan)
      setChats(prevChats => {
        const index = prevChats.findIndex(c => c.id === selectedChat.id);
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
      await api.forwardMessage(activeAccount.id, selectedChat?.id || '', toJid, msg.id || '');
      setShowForwardSelector(false);
      setForwardingMessage(null);
      if (selectedChat) {
        loadMessages(activeAccount.id, selectedChat.id);
      }
    } catch (error) {
      console.error('Mesaj iletilemedi:', error);
      alert('Mesaj iletilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleEditMessage = async (msg: Message, newText: string) => {
    if (!activeAccount || !selectedChat || !newText.trim()) return;
    
    try {
      await api.editMessage(activeAccount.id, selectedChat.id, msg.id || '', newText);
      setEditingMessage(null);
      setEditingText('');
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesaj düzenlenemedi:', error);
      alert('Mesaj düzenlenemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    }
  };

  const handleDeleteMessage = async (msg: Message, deleteForEveryone: boolean = false) => {
    if (!activeAccount || !selectedChat) return;
    
    if (!confirm(deleteForEveryone ? 'Bu mesajı herkes için silmek istediğinizden emin misiniz?' : 'Bu mesajı silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      await api.deleteMessage(activeAccount.id, selectedChat.id, msg.id || '', deleteForEveryone);
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesaj silinemedi:', error);
      alert('Mesaj silinemedi');
    }
  };

  const handleStarMessage = async (msg: Message, star: boolean) => {
    if (!activeAccount || !selectedChat) return;
    
    try {
      await api.starMessage(activeAccount.id, selectedChat.id, msg.id || '', star);
      loadMessages(activeAccount.id, selectedChat.id);
    } catch (error) {
      console.error('Mesaj yıldızlanamadı:', error);
      alert('Mesaj yıldızlanamadı');
    }
  };

  const handleMarkAsRead = async () => {
    if (!activeAccount || !selectedChat) return;
    
    try {
      await api.markMessagesAsRead(activeAccount.id, selectedChat.id);
      loadMessages(activeAccount.id, selectedChat.id);
      loadChats(activeAccount.id, 50);
    } catch (error) {
      console.error('Mesajlar okundu olarak işaretlenemedi:', error);
      alert('Mesajlar okundu olarak işaretlenemedi');
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

  // WebSocket bağlantısı
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connectWebSocket = () => {
      // WebSocket bağlantısını kur - Vite proxy üzerinden
      // Vite config'de /ws proxy tanımlı, bu yüzden window.location.host kullanabiliriz
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('[WebSocket] Bağlanılıyor:', wsUrl);
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WebSocket] ✅ Bağlantı kuruldu');
          reconnectTimeout = null; // Bağlantı başarılı, reconnect timeout'u temizle
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WebSocket] 📨 Mesaj alındı:', data);

            // Event tipine göre işle - ref'lerden güncel değerleri al
            const currentActiveAccount = activeAccountRef.current;
            const currentSelectedChat = selectedChatRef.current;

            if (data.type === 'chats.set' || data.type === 'chats.upsert') {
              // Sohbet listesi güncellendi (WebSocket ile)
              if (data.sessionId === currentActiveAccount?.id) {
                console.log('[WebSocket] Sohbet listesi güncelleniyor...', data.chats?.length || 0);
                
                  // WebSocket'ten gelen chat'lerde profil resimleri varsa cache'e ekle
                if (data.chats && Array.isArray(data.chats)) {
                  data.chats.forEach((chat: any) => {
                    if (chat.imgUrl) {
                      setChatProfilePictures(prev => new Map(prev).set(chat.id, chat.imgUrl));
                    } else if (!chatProfilePictures.has(chat.id)) {
                      // Resim yoksa ve cache'de de yoksa, queue'ya ekle (batch yükleme)
                      queueProfilePicture(data.sessionId, chat.id);
                    }
                  });
                  
                  // WebSocket'ten gelen chat'leri direkt state'e set et (API çağrısı yapmadan)
                  const hasInitialLoad = chatsInitialLoadRef.current.get(data.sessionId);
                  
                  // İlk bağlantıda değilse ve chat listesi zaten yüklendiyse, sadece yeni chat'leri ekle
                  if (hasInitialLoad && chatsLoadedRef.current.get(data.sessionId)) {
                    console.log('[WebSocket] Chat listesi zaten yüklü, sadece yeni/güncellenen chat\'ler işleniyor...', data.type);
                    
                    if (data.type === 'chats.upsert' && data.chats && Array.isArray(data.chats)) {
                      // Sadece yeni veya güncellenen chat'leri ekle/güncelle
                      setChats(prevChats => {
                        let hasChanges = false;
                        const updatedChats = [...prevChats];
                        
                        data.chats.forEach((chat: any) => {
                          const index = updatedChats.findIndex(c => c.id === chat.id);
                          if (index >= 0) {
                            // Mevcut chat'i güncelle - sadece önemli değişiklikler varsa
                            const oldChat = updatedChats[index];
                            const newUnreadCount = chat.unreadCount ?? oldChat.unreadCount;
                            const newTimestamp = chat.conversationTimestamp || oldChat.conversationTimestamp;
                            
                            // Sadece unreadCount veya timestamp değiştiyse güncelle
                            if (newUnreadCount !== oldChat.unreadCount || newTimestamp !== oldChat.conversationTimestamp) {
                              updatedChats[index] = {
                                ...oldChat,
                                unreadCount: newUnreadCount,
                                conversationTimestamp: newTimestamp,
                                name: chat.name || oldChat.name,
                                verifiedName: chat.verifiedName || oldChat.verifiedName,
                                profilePicture: chat.imgUrl || oldChat.profilePicture,
                                archived: chat.archived ?? oldChat.archived,
                              };
                              hasChanges = true;
                            }
                          } else {
                            // Yeni chat eklendi
                            updatedChats.push({
                              id: chat.id,
                              name: chat.name || chat.displayName || chat.id,
                              verifiedName: chat.verifiedName,
                              profilePicture: chat.imgUrl,
                              unreadCount: chat.unreadCount || 0,
                              conversationTimestamp: chat.conversationTimestamp || 0,
                              archived: chat.archived || false,
                              lastMessage: '',
                              time: chat.conversationTimestamp 
                                ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                                : '',
                            });
                            hasChanges = true;
                          }
                        });
                        
                        // Sadece değişiklik varsa güncelle
                        return hasChanges ? updatedChats : prevChats;
                      });
                    }
                    // chats.set'i ilk bağlantı dışında ignore et
                  } else {
                    // İlk bağlantı - normal yükleme
                    console.log('[WebSocket] İlk bağlantı - sohbet listesi yükleniyor...', data.type);
                    
                    if (data.type === 'chats.set') {
                      // chats.set: Tüm sohbetler geldi, direkt set et
                      const formattedChats = data.chats.map((chat: any) => {
                        const cached = contactsCacheRef.current.get(data.sessionId);
                        const contactsMap = cached ? cached.data : new Map<string, any>();
                        const contact = contactsMap.get(chat.id);
                        
                        // Mevcut chat'ten lastMessage'ı al (varsa)
                        const existingChat = chats.find(c => c.id === chat.id);
                        
                        return {
                          id: chat.id,
                          name: chat.name || chat.displayName || chat.id,
                          verifiedName: contact?.verifiedName || chat.verifiedName,
                          profilePicture: chat.imgUrl || chatProfilePictures.get(chat.id) || existingChat?.profilePicture,
                          unreadCount: chat.unreadCount ?? existingChat?.unreadCount ?? 0,
                          conversationTimestamp: chat.conversationTimestamp || existingChat?.conversationTimestamp || 0,
                          archived: chat.archived ?? existingChat?.archived ?? false,
                          lastMessage: existingChat?.lastMessage || '',
                          time: chat.conversationTimestamp 
                            ? new Date(Number(chat.conversationTimestamp) * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                            : existingChat?.time || '',
                        };
                      });
                      
                      setChats(formattedChats);
                      chatsLoadedRef.current.set(data.sessionId, true);
                      console.log('[WebSocket] Sohbet listesi direkt güncellendi:', formattedChats.length);
                    }
                  }
                } else {
                  // WebSocket'ten chat gelmediyse API'den yükle (sadece ilk bağlantıda)
                  const hasInitialLoad = chatsInitialLoadRef.current.get(data.sessionId);
                  if (!hasInitialLoad) {
                    loadChats(data.sessionId, 50, true);
                  }
                }
              }
            } else if (data.type === 'chats.update') {
              // Sohbet güncellendi (unreadCount, lastMessage vs.) - sadece ilgili chat'i güncelle
              if (data.sessionId === currentActiveAccount?.id && data.chat) {
                console.log('[WebSocket] Tek sohbet güncelleniyor...', data.chat.id);
                setChats(prevChats => {
                  const index = prevChats.findIndex(c => c.id === data.chat.id);
                  if (index >= 0) {
                    const updatedChats = [...prevChats];
                    updatedChats[index] = {
                      ...updatedChats[index],
                      unreadCount: data.chat.unreadCount ?? updatedChats[index].unreadCount,
                      conversationTimestamp: data.chat.conversationTimestamp || updatedChats[index].conversationTimestamp,
                      lastMessage: data.chat.lastMessage || updatedChats[index].lastMessage,
                    };
                    return updatedChats;
                  }
                  return prevChats;
                });
              }
            } else if (data.type === 'contacts.set' || data.type === 'contacts.upsert') {
              // Kişi listesi güncellendi (WebSocket ile) - chat listesini yenileme, sadece cache'i güncelle
              if (data.sessionId === currentActiveAccount?.id) {
                console.log('[WebSocket] Kişi listesi güncelleniyor...', data.contacts?.length || 0);
                // Contact cache'ini güncelle
                const contactsMap = new Map<string, any>();
                if (data.contacts && Array.isArray(data.contacts)) {
                  data.contacts.forEach((contact: any) => {
                    contactsMap.set(contact.id, contact);
                    
                    // Profil resmini cache'e ekle (eğer varsa)
                    if (contact.imgUrl) {
                      setChatProfilePictures(prev => new Map(prev).set(contact.id, contact.imgUrl));
                      
                      // Eğer bu contact seçili sohbet ise, selectedChat'i de güncelle
                      if (currentSelectedChat && currentSelectedChat.id === contact.id) {
                        setSelectedChat(prev => prev ? { ...prev, profilePicture: contact.imgUrl } : null);
                      }
                    }
                  });
                  contactsCacheRef.current.set(data.sessionId, {
                    data: contactsMap,
                    timestamp: Date.now()
                  });
                  console.log('[WebSocket] Contact cache güncellendi:', contactsMap.size, 'profil resimleri ile');
                }
                // Chat listesini yenileme - gereksiz yenileme yapmıyoruz
              }
            } else if (data.type === 'messages.upsert') {
              // Yeni mesajlar geldi
              if (data.sessionId === currentActiveAccount?.id) {
                console.log('[WebSocket] Yeni mesajlar alındı:', data.messages.length);
                // Seçili sohbetin mesajlarıysa ekle (append mode)
                if (currentSelectedChat && data.messages.some((msg: any) => msg.from === currentSelectedChat.id)) {
                  console.log('[WebSocket] Seçili sohbetin mesajlarına yeni mesajlar ekleniyor...');
                  // Yeni mesajları mevcut mesajlara ekle (duplicate kontrolü ile)
                  setMessages(prev => {
                    const existingIds = new Set(prev.map(m => {
                      const id = m.id || m.key?.id;
                      // Temp mesajları da kontrol et (optimistik mesajlar)
                      if (id && id.toString().startsWith('temp-')) {
                        return id;
                      }
                      return id;
                    }));
                    
                    const newMessages = data.messages
                      .filter((msg: any) => {
                        // Backend'den gelen mesajlarda from field'ı var
                        const msgFrom = msg.from || msg.key?.remoteJid;
                        return msgFrom === currentSelectedChat.id;
                      })
                      .map((msg: any) => {
                        // Backend'den gelen text field'ını koru, yoksa extractMessageText kullan
                        const text = msg.text || extractMessageText(msg);
                        const body = msg.body || text;
                        const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;
                        
                        // fromMe kontrolü
                        const fromMe = msg.fromMe !== undefined 
                          ? Boolean(msg.fromMe) 
                          : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
                        
                        return {
                          ...msg,
                          id: msgId,
                          text: text || body,
                          body: body || text,
                          fromMe: fromMe,
                          timestamp: msg.timestamp || msg.messageTimestamp || undefined,
                        };
                      })
                      .filter(msg => {
                        const msgId = msg.id || msg.key?.id;
                        if (msgId && existingIds.has(msgId)) {
                          return false; // Duplicate
                        }
                        return true;
                      });
                    
                    if (newMessages.length === 0) {
                      return prev; // Yeni mesaj yoksa değişiklik yapma
                    }
                    
                    // Temp mesajları kaldır (eğer gerçek mesaj geldiyse)
                    let filteredPrev = prev;
                    newMessages.forEach(newMsg => {
                      if (newMsg.fromMe && newMsg.text) {
                        // Aynı text ve fromMe olan temp mesajı bul ve kaldır
                        filteredPrev = filteredPrev.filter(m => {
                          const mId = m.id || m.key?.id;
                          if (mId && mId.toString().startsWith('temp-') && 
                              m.text === newMsg.text && 
                              m.fromMe === true) {
                            return false; // Temp mesajı kaldır
                          }
                          return true;
                        });
                      }
                    });
                    
                    // Birleştir ve sırala (timestamp'leri normalize et)
                    const merged = [...filteredPrev, ...newMessages];
                    merged.sort((a, b) => {
                      // Timestamp'leri normalize et (saniye veya milisaniye olabilir)
                      const normalizeTimestamp = (ts: number | undefined) => {
                        if (!ts) return 0;
                        // Eğer çok büyükse (milisaniye), küçükse (saniye) 1000 ile çarp
                        return ts > 1000000000000 ? ts : ts * 1000;
                      };
                      
                      const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
                      const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
                      return aTime - bTime;
                    });
                    
                    return merged;
                  });
                  
                  // Seçili sohbetin chat listesindeki bilgilerini güncelle
                  const lastMessage = data.messages
                    .filter((msg: any) => {
                      const msgFrom = msg.from || msg.key?.remoteJid;
                      return msgFrom === currentSelectedChat.id;
                    })
                    .sort((a: any, b: any) => {
                      const aTime = a.timestamp || a.messageTimestamp || 0;
                      const bTime = b.timestamp || b.messageTimestamp || 0;
                      return bTime - aTime; // En yeni önce
                    })[0];
                  
                  if (lastMessage) {
                    const messageText = lastMessage.text || extractMessageText(lastMessage) || '';
                    const messageTimestamp = lastMessage.timestamp || lastMessage.messageTimestamp || Math.floor(Date.now() / 1000);
                    
                    setChats(prevChats => {
                      const index = prevChats.findIndex(c => c.id === currentSelectedChat.id);
                      if (index >= 0) {
                        const updatedChats = [...prevChats];
                        updatedChats[index] = {
                          ...updatedChats[index],
                          conversationTimestamp: messageTimestamp,
                          lastMessage: messageText,
                          time: new Date(messageTimestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                        };
                        // Chat'i en üste taşıma - sadece güncelle
                        return updatedChats;
                      }
                      return prevChats;
                    });
                  }
                } else {
                  // Seçili olmayan sohbetlere mesaj geldi - sadece o chat'in unreadCount'unu ve lastMessage'ını güncelle
                  const affectedChats = new Map<string, { text: string, timestamp: number }>();
                  data.messages.forEach((msg: any) => {
                    const msgFrom = msg.from || msg.key?.remoteJid;
                    if (msgFrom && msgFrom !== currentSelectedChat?.id) {
                      const messageText = msg.text || extractMessageText(msg) || '';
                      const messageTimestamp = msg.timestamp || msg.messageTimestamp || Math.floor(Date.now() / 1000);
                      const existing = affectedChats.get(msgFrom);
                      if (!existing || messageTimestamp > existing.timestamp) {
                        affectedChats.set(msgFrom, { text: messageText, timestamp: messageTimestamp });
                      }
                    }
                  });
                  
                  if (affectedChats.size > 0) {
                    setChats(prevChats => {
                      let hasChanges = false;
                      const updatedChats = prevChats.map(chat => {
                        const chatUpdate = affectedChats.get(chat.id);
                        if (chatUpdate) {
                          hasChanges = true;
                          return {
                            ...chat,
                            unreadCount: (chat.unreadCount || 0) + 1,
                            conversationTimestamp: chatUpdate.timestamp,
                            lastMessage: chatUpdate.text,
                            time: new Date(chatUpdate.timestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                          };
                        }
                        return chat;
                      });
                      return hasChanges ? updatedChats : prevChats;
                    });
                  }
                }
                // Tüm chat listesini yenileme - gereksiz
              }
            } else if (data.type === 'messages.set') {
              // Mesaj geçmişi geldi (bağlantı açıldığında)
              // ÖNEMLİ: Bu event sadece ilk yüklemede kullanılmalı, sonrasında ignore edilmeli
              if (data.sessionId === currentActiveAccount?.id && currentSelectedChat) {
                const messagesKey = `${data.sessionId}-${currentSelectedChat.id}`;
                const hasInitialLoad = messagesInitialLoadRef.current.get(messagesKey);
                
                // Eğer zaten ilk yükleme yapıldıysa, bu event'i ignore et
                if (hasInitialLoad) {
                  console.log('[WebSocket] messages.set event ignore edildi (zaten yüklendi):', data.messages?.length || 0);
                  return;
                }
                
                console.log('[WebSocket] Mesaj geçmişi alındı (ilk yükleme):', data.messages?.length || 0);
                
                // Seçili sohbetin mesajlarıysa yükle
                const chatMessages = (data.messages || []).filter((msg: any) => {
                  const msgFrom = msg.from || msg.key?.remoteJid;
                  return msgFrom === currentSelectedChat.id;
                });
                
                if (chatMessages.length > 0) {
                  console.log('[WebSocket] Seçili sohbetin mesaj geçmişi yükleniyor:', chatMessages.length);
                  
                  const formattedMessages: Message[] = chatMessages.map((msg: any) => {
                    const text = msg.text || extractMessageText(msg);
                    const body = msg.body || text;
                    const msgId = msg.id || msg.key?.id || `${msg.timestamp || msg.messageTimestamp || Date.now()}-${Math.random()}`;
                    
                    const fromMe = msg.fromMe !== undefined 
                      ? Boolean(msg.fromMe) 
                      : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
                    
                    return {
                      ...msg,
                      id: msgId,
                      text: text || body,
                      body: body || text,
                      fromMe: fromMe,
                      timestamp: msg.timestamp || msg.messageTimestamp || undefined,
                    };
                  });
                  
                  // Timestamp'e göre sırala
                  formattedMessages.sort((a, b) => {
                    const normalizeTimestamp = (ts: number | undefined) => {
                      if (!ts) return 0;
                      return ts > 1000000000000 ? ts : ts * 1000;
                    };
                    const aTime = normalizeTimestamp(a.timestamp || a.messageTimestamp);
                    const bTime = normalizeTimestamp(b.timestamp || b.messageTimestamp);
                    return aTime - bTime;
                  });
                  
                  // İlk yükleme olarak işaretle
                  messagesInitialLoadRef.current.set(messagesKey, true);
                  
                  // Mesajları set et (ilk yükleme olduğu için mevcut mesajları koruma gerekmez)
                  setMessages(formattedMessages);
                }
              }
            }
          } catch (error) {
            console.error('[WebSocket] Mesaj parse hatası:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] ❌ Hata:', error);
        };

        ws.onclose = (event) => {
          console.log('[WebSocket] 🔌 Bağlantı kapandı', event.code, event.reason);
          wsRef.current = null;
          
          // Component unmount olmadıysa ve reconnect timeout yoksa yeniden bağlan
          if (isMounted && !reconnectTimeout) {
            console.log('[WebSocket] 3 saniye sonra yeniden bağlanılacak...');
            reconnectTimeout = setTimeout(() => {
              if (isMounted && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
                console.log('[WebSocket] Yeniden bağlanılıyor...');
                connectWebSocket();
              }
            }, 3000);
          }
        };
      } catch (error) {
        console.error('[WebSocket] Bağlantı hatası:', error);
        // Hata durumunda da yeniden dene
        if (isMounted && !reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            if (isMounted) {
              connectWebSocket();
            }
          }, 3000);
        }
      }
    };

    // İlk bağlantıyı kur
    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Sadece mount'ta çalış - ref'ler sayesinde güncel değerleri kullanabiliriz

  // Cleanup
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current();
      }
      if (qrIntervalRef.current) {
        clearInterval(qrIntervalRef.current);
      }
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (profilePictureTimeoutRef.current) {
        clearTimeout(profilePictureTimeoutRef.current);
      }
    };
  }, []);

  // Aktif hesap durumu değiştiğinde mesajları temizle (bağlantı kopup bağlanınca)
  useEffect(() => {
    if (activeAccount) {
      // Bağlantı durumu değiştiğinde mesajları temizle
      if (activeAccount.status !== 'open') {
        setMessages([]);
      }
    }
  }, [activeAccount?.status]);

  // Seçili sohbet değiştiğinde mesajları yükle ve profil resmini güncelle
  useEffect(() => {
    if (activeAccount && selectedChat) {
      // Seçili sohbet değiştiğinde mesajları temizle ve yükle (append=false)
      const messagesKey = `${activeAccount.id}-${selectedChat.id}`;
      messagesInitialLoadRef.current.delete(messagesKey); // Yeni sohbet için ilk yükleme flag'ini sıfırla
      setMessages([]);
      loadMessages(activeAccount.id, selectedChat.id, 50, false);
      
      // Profil resmini chatProfilePictures Map'inden al ve selectedChat'e ekle
      const profilePicture = chatProfilePictures.get(selectedChat.id);
      if (profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE' && selectedChat.profilePicture !== profilePicture) {
        setSelectedChat(prev => prev ? { ...prev, profilePicture } : null);
      } else if ((!profilePicture || profilePicture === 'NO_PICTURE') && !selectedChat.profilePicture && !selectedChat.id.includes('@g.us')) {
        // Profil resmi yoksa ve henüz yüklenmemişse, contact cache'den kontrol et
        const cached = contactsCacheRef.current.get(activeAccount.id);
        if (cached) {
          const contact = cached.data.get(selectedChat.id);
          if (contact && contact.imgUrl) {
            setChatProfilePictures(prev => new Map(prev).set(selectedChat.id, contact.imgUrl));
            setSelectedChat(prev => prev ? { ...prev, profilePicture: contact.imgUrl } : null);
          } else {
            // API'den yükle - öncelikli olarak hemen yükle (selectedChat için)
            api.getProfilePicture(activeAccount.id, selectedChat.id).then(pictureUrl => {
              if (pictureUrl) {
                setChatProfilePictures(prev => new Map(prev).set(selectedChat.id, pictureUrl));
                setSelectedChat(prev => prev ? { ...prev, profilePicture: pictureUrl } : null);
              }
            }).catch(() => {
              // Hata durumunda sessizce devam et
            });
          }
        }
      }
    } else {
      setMessages([]);
    }
  }, [activeAccount?.id, selectedChat?.id, chatProfilePictures]);

  // Sohbet listesini websocket benzeri periyodik olarak yenile
  useEffect(() => {
    if (!activeAccount || activeAccount.status !== 'open') {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
        chatsPollRef.current = null;
      }
      return;
    }

    // ilk yükleme
    loadChats(activeAccount.id, 50);

    chatsPollRef.current = setInterval(() => {
      loadChats(activeAccount.id, 50); // Periyodik yenilemede contact'ları yükleme (cache kullan)
    }, 10000); // 10 saniyede bir yenile

    return () => {
      if (chatsPollRef.current) {
        clearInterval(chatsPollRef.current);
        chatsPollRef.current = null;
      }
    };
  }, [activeAccount?.id, activeAccount?.status]);

  const renderAddAccountModal = () => (
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
              disabled={!newAccountName.trim() || isLoadingQR}
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
  );

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
        {showAddAccountModal && renderAddAccountModal()}
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
            {/* Hesap silme butonu - hover'da görünür */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (window.confirm(`"${account.name}" hesabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
                  try {
                    // Backend'de session'ı sil
                    await api.deleteSession(account.id);
                    // Frontend'den hesabı kaldır
                    const updatedAccounts = accounts.filter(acc => acc.id !== account.id);
                    setAccounts(updatedAccounts);
                    
                    // Eğer silinen hesap aktif hesapsa, başka bir hesabı aktif yap
                    if (account.active && updatedAccounts.length > 0) {
                      switchAccount(updatedAccounts[0].id);
                    } else if (updatedAccounts.length === 0) {
                      // Tüm hesaplar silindi
                      setActiveAccount(undefined);
                      setChats([]);
                      setMessages([]);
                      setSelectedChat(null);
                    }
                  } catch (error) {
                    console.error('Hesap silinemedi:', error);
                    alert('Hesap silinemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
                  }
                }
              }}
              className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
              title="Hesabı Sil"
            >
              <X size={12} />
            </button>
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
              <button 
                onClick={handleOpenContactSelector}
                className="hover:text-gray-800"
                title="Kişi Seç"
              >
                <Users size={20} />
              </button>
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

          {/* Filtre Butonları */}
          <div className="px-2 pt-2 pb-1 bg-white border-b">
            <div className="flex space-x-1">
              <button
                onClick={() => setChatFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chatFilter === 'all'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tümü
              </button>
              <button
                onClick={() => setChatFilter('unread')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chatFilter === 'unread'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Okunmamış
              </button>
              <button
                onClick={() => setChatFilter('groups')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chatFilter === 'groups'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Gruplar
              </button>
              <button
                onClick={() => setChatFilter('archived')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chatFilter === 'archived'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Arşiv
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
                value={chatSearchTerm}
                onChange={(e) => setChatSearchTerm(e.target.value)}
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
              chats
                .filter(chat => {
                  // Filtreleme
                  if (chatFilter === 'all') {
                    // Tümü: Arşivlenen mesajlar gelmeyecek
                    if (chat.archived) return false;
                  } else if (chatFilter === 'unread') {
                    // Okunmamış: Sadece okunmamış mesajlar
                    if (!chat.unreadCount || chat.unreadCount === 0) return false;
                    if (chat.archived) return false; // Arşivlenenler gelmesin
                  } else if (chatFilter === 'groups') {
                    // Gruplar: Sadece gruplar (@g.us ile bitenler)
                    if (!chat.id.includes('@g.us')) return false;
                    if (chat.archived) return false; // Arşivlenenler gelmesin
                  } else if (chatFilter === 'archived') {
                    // Arşiv: Sadece arşivlenenler
                    if (!chat.archived) return false;
                  }
                  
                  // Arama filtresi
                  if (chatSearchTerm.trim()) {
                    const search = chatSearchTerm.toLowerCase();
                    const name = (chat.name || '').toLowerCase();
                    const lastMessage = (chat.lastMessage || '').toLowerCase();
                    if (!name.includes(search) && !lastMessage.includes(search)) {
                      return false;
                    }
                  }
                  
                  return true;
                })
                .map(chat => (
                <div
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`p-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer border-b ${
                    selectedChat?.id === chat.id ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? (
                        <img
                        src={chat.profilePicture} 
                        alt={chat.name}
                        className="w-12 h-12 rounded-full object-cover"
                        onError={(e) => {
                          // Resim yüklenemezse fallback göster
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = parent.querySelector('.profile-fallback') as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-2xl profile-fallback ${chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? 'hidden' : ''}`}
                    >
                      {chat.name[0]?.toUpperCase() || '?'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-1 flex-1 min-w-0">
                        <span className="font-semibold text-sm truncate">{chat.verifiedName || chat.name}</span>
                        {chat.verifiedName && chat.verifiedName !== chat.name && (
                          <span className="text-xs text-gray-500 truncate">({chat.name})</span>
                        )}
                      </div>
                      {chat.time && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{chat.time}</span>}
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
                  <div className="relative">
                    {selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' ? (
                      <img
                        src={selectedChat.profilePicture}
                        alt={selectedChat.name}
                        className="w-10 h-10 rounded-full object-cover"
                        onError={(e) => {
                          // Resim yüklenemezse fallback göster
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = parent.querySelector('.chat-header-fallback') as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl chat-header-fallback ${
                        selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' ? 'hidden' : ''
                      }`}
                      style={{
                        backgroundColor: selectedChat.profilePicture && selectedChat.profilePicture !== '' && selectedChat.profilePicture !== 'NO_PICTURE' 
                          ? 'transparent' 
                          : `hsl(${(selectedChat.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                      }}
                    >
                      {selectedChat.name[0]?.toUpperCase() || '?'}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold">{selectedChat.verifiedName || selectedChat.name}</div>
                    <div className="text-xs text-gray-500">çevrimiçi</div>
                  </div>
                </div>
                <div className="flex space-x-4 text-gray-600">
                  <button 
                    onClick={handleOpenContactSelector}
                    className="hover:text-gray-800"
                    title="Kişi Seç"
                  >
                    <Users size={20} />
                  </button>
                  <button className="hover:text-gray-800"><Video size={20} /></button>
                  <button className="hover:text-gray-800"><Phone size={20} /></button>
                  <button className="hover:text-gray-800"><Search size={20} /></button>
                  <button 
                    onClick={handleMarkAsRead}
                    className="hover:text-gray-800"
                    title="Okundu olarak işaretle"
                  >
                    <Eye size={20} />
                  </button>
                  <button className="hover:text-gray-800"><MoreVertical size={20} /></button>
                </div>
              </div>

              {/* Mesajlar */}
              <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,.03) 10px, rgba(0,0,0,.03) 20px)'
              }}>
                <div className="space-y-2">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm">
                      Henüz mesaj yok
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      // fromMe değerini kontrol et - backend'den gelen mesajlarda fromMe direkt olarak var
                      // Backend formatMessage fonksiyonu fromMe'yi Boolean olarak döndürüyor
                      const fromMe = msg.fromMe !== undefined 
                        ? Boolean(msg.fromMe) 
                        : (msg.key?.fromMe === true || msg.key?.fromMe === 'true' || msg.key?.fromMe === 1);
                      
                      // Mesaj metnini çıkar - önce backend'den gelen text'i kontrol et, yoksa extractMessageText kullan
                      let text = msg.text || msg.body || '';
                      if (!text && msg.message) {
                        text = extractMessageText(msg);
                      }
                      
                      // Timestamp formatı - backend'den gelen timestamp saniye cinsinden
                      // Eğer milisaniye cinsindeyse (1000'den büyükse) böl, değilse olduğu gibi kullan
                      let timestampMs = 0;
                      if (msg.timestamp) {
                        // Eğer timestamp çok büyükse (milisaniye), küçükse (saniye) 1000 ile çarp
                        timestampMs = msg.timestamp > 1000000000000 ? msg.timestamp : msg.timestamp * 1000;
                      } else if (msg.messageTimestamp) {
                        timestampMs = msg.messageTimestamp > 1000000000000 ? msg.messageTimestamp : msg.messageTimestamp * 1000;
                      }
                      
                      const ts = timestampMs > 0
                        ? new Date(timestampMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        : '';

                      // Mesaj tipi kontrolü - desteksiz mesaj tipleri için daha iyi gösterim
                      const messageType = msg.type || (msg.message ? Object.keys(msg.message)[0] : 'unknown');
                      const isUnsupportedType = !text && messageType && !['conversation', 'extendedTextMessage'].includes(messageType);
                      
                      // Eğer text yoksa ve desteklenmeyen bir tip varsa, tip bilgisini göster
                      if (!text && isUnsupportedType) {
                        text = extractMessageText(msg) || `⟨${messageType}⟩`;
                      }

                      const isSelected = selectedMessage?.id === msg.id;
                      const isEditing = editingMessage?.id === msg.id;
                      const isReplying = replyingTo?.id === msg.id;

                      return (
                        <div
                          key={msg.id || msg.key?.id || index}
                          className={`flex w-full ${fromMe ? 'justify-end' : 'justify-start'} mb-0.5 group relative`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelectedMessage(msg);
                            setShowMessageMenu(true);
                          }}
                        >
                          <div
                            className={`max-w-[65%] md:max-w-[70%] px-2 py-1.5 text-sm relative ${
                              fromMe 
                                ? 'bg-[#d9fdd3] text-gray-900 rounded-[7.5px] rounded-tr-[4px]' 
                                : 'bg-white text-gray-900 rounded-[7.5px] rounded-tl-[4px]'
                            }`}
                            style={{
                              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
                            }}
                          >
                            {/* Grup mesajlarında gönderen kişi adı */}
                            {!fromMe && msg.participant && (
                              <div className="text-xs font-semibold text-gray-600 mb-0.5">
                                {msg.pushName || msg.participant.split('@')[0]}
                              </div>
                            )}
                            
                            {/* Yanıtlanan mesaj gösterimi (mesaj içinde) */}
                            {msg.quotedMessage && (
                              <div className="border-l-2 border-blue-500 pl-2 mb-1 text-xs text-gray-600 bg-gray-100 rounded">
                                <div className="font-semibold">{msg.quotedMessage.from || 'Kişi'}</div>
                                <div className="truncate">{msg.quotedMessage.text || 'Mesaj'}</div>
                              </div>
                            )}
                            
                            {/* Mesaj içeriği - düzenleme modunda input */}
                            {isEditing ? (
                              <div className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleEditMessage(msg, editingText);
                                    } else if (e.key === 'Escape') {
                                      setEditingMessage(null);
                                      setEditingText('');
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 border rounded"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    handleEditMessage(msg, editingText);
                                  }}
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  Kaydet
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingMessage(null);
                                    setEditingText('');
                                  }}
                                  className="text-gray-500 hover:text-gray-700"
                                >
                                  İptal
                                </button>
                              </div>
                            ) : (
                              <div className="break-words whitespace-pre-wrap leading-relaxed">
                                {text || '⟨desteksiz mesaj tipi⟩'}
                              </div>
                            )}
                            
                            {ts && (
                              <div className={`text-[11px] text-gray-500 mt-0.5 flex items-end ${
                                fromMe ? 'justify-end' : 'justify-start'
                              }`}>
                                <span className="opacity-70">{ts}</span>
                                {fromMe && (
                                  <span className="ml-1">
                                    <CheckCheck size={12} className="text-blue-500" />
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Mesaj işlem butonları - hover'da görünür */}
                            <div className={`absolute ${fromMe ? 'left-0' : 'right-0'} -top-8 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded shadow-lg p-1 z-10`}>
                              {!fromMe && (
                                <button
                                  onClick={() => {
                                    setReplyingTo(msg);
                                    setMessage('');
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded"
                                  title="Yanıtla"
                                >
                                  <Reply size={14} />
                                </button>
                              )}
                              {fromMe && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingMessage(msg);
                                      setEditingText(msg.text || msg.body || '');
                                    }}
                                    className="p-1 hover:bg-gray-100 rounded"
                                    title="Düzenle"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleStarMessage(msg, !msg.starred)}
                                    className="p-1 hover:bg-gray-100 rounded"
                                    title={msg.starred ? "Yıldızı kaldır" : "Yıldızla"}
                                  >
                                    {msg.starred ? <StarOff size={14} className="text-yellow-500" /> : <Star size={14} />}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedMessage(msg);
                                  setShowMessageMenu(true);
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Daha fazla"
                              >
                                <MoreVertical size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Mesaj Context Menüsü */}
              {showMessageMenu && selectedMessage && (
                <div className="fixed inset-0 z-50" onClick={() => setShowMessageMenu(false)}>
                  <div 
                    className="absolute bg-white rounded-lg shadow-xl p-2 min-w-[200px] z-50"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setReplyingTo(selectedMessage);
                        setShowMessageMenu(false);
                        setSelectedMessage(null);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                    >
                      <Reply size={16} />
                      <span>Yanıtla</span>
                    </button>
                    <button
                      onClick={() => {
                        setForwardingMessage(selectedMessage);
                        setShowMessageMenu(false);
                        setSelectedMessage(null);
                        setShowForwardSelector(true);
                        // Contact'ları yükle
                        if (activeAccount) {
                          loadContacts(activeAccount.id);
                        }
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                    >
                      <Forward size={16} />
                      <span>İlet</span>
                    </button>
                    {selectedMessage.fromMe && (
                      <>
                        <button
                          onClick={() => {
                            setEditingMessage(selectedMessage);
                            setEditingText(selectedMessage.text || selectedMessage.body || '');
                            setShowMessageMenu(false);
                            setSelectedMessage(null);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                        >
                          <Edit2 size={16} />
                          <span>Düzenle</span>
                        </button>
                        <button
                          onClick={() => {
                            handleStarMessage(selectedMessage, !selectedMessage.starred);
                            setShowMessageMenu(false);
                            setSelectedMessage(null);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2"
                        >
                          {selectedMessage.starred ? (
                            <>
                              <StarOff size={16} className="text-yellow-500" />
                              <span>Yıldızı kaldır</span>
                            </>
                          ) : (
                            <>
                              <Star size={16} />
                              <span>Yıldızla</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                    <hr className="my-1" />
                    <button
                      onClick={() => {
                        handleDeleteMessage(selectedMessage, false);
                        setShowMessageMenu(false);
                        setSelectedMessage(null);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2 text-red-600"
                    >
                      <Trash2 size={16} />
                      <span>Sil</span>
                    </button>
                    {selectedMessage.fromMe && (
                      <button
                        onClick={() => {
                          handleDeleteMessage(selectedMessage, true);
                          setShowMessageMenu(false);
                          setSelectedMessage(null);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded flex items-center space-x-2 text-red-600"
                      >
                        <Trash2 size={16} />
                        <span>Herkes için sil</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Yanıtlanan mesaj gösterimi (mesaj giriş alanında) */}
              {replyingTo && (
                <div className="bg-gray-200 px-3 py-2 flex items-center justify-between border-l-4 border-blue-500">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-gray-600">
                      {replyingTo.fromMe ? 'Sen' : (replyingTo.pushName || 'Kişi')} mesajına yanıt veriyorsun
                    </div>
                    <div className="text-xs text-gray-500 truncate">{replyingTo.text || replyingTo.body || 'Mesaj'}</div>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
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
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      if (replyingTo) {
                        handleReplyMessage(replyingTo);
                      } else {
                        sendMessage();
                      }
                    }
                  }}
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
      {showAddAccountModal && renderAddAccountModal()}

      {/* Kişi Listesi Modalı */}
      {showContactsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Kişi Listesi</h2>
              <button
                onClick={() => {
                  setShowContactsModal(false);
                  setContacts([]);
                  setFilteredContacts([]);
                  setContactSearchTerm('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            
            {contacts.length === 0 && !isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center text-gray-500">
                  <p>Kişi listesi yükleniyor...</p>
                  <p className="text-xs mt-2">WebSocket'ten contact'lar bekleniyor</p>
                </div>
              </div>
            ) : isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-green-500" size={32} />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Kişi ara (isim, telefon: 868, *868*)..."
                    value={contactSearchTerm}
                    onChange={(e) => setContactSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={handleRefreshContacts}
                    disabled={isLoadingContacts}
                    className="px-3 py-2 text-sm flex items-center space-x-2 border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg disabled:opacity-60"
                  >
                    <RefreshCcw size={16} />
                    <span>Yenile</span>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      Kişi bulunamadı
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredContacts.map((contact) => {
                        const phoneNumber = extractPhoneFromJid(contact.id);
                        const profilePicture = chatProfilePictures.get(contact.id) || contact.imgUrl;
                        const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                        
                        return (
                          <div
                            key={contact.id}
                            className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                          >
                            <div className="flex items-center space-x-3">
                              {hasProfilePicture ? (
                                <img
                                  src={profilePicture}
                                  alt={contact.name || contact.notify || contact.id}
                                  className="w-10 h-10 rounded-full object-cover"
                                  onError={(e) => {
                                    // Resim yüklenemezse fallback göster
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold ${
                                hasProfilePicture ? 'hidden' : ''
                              }`} style={{
                                backgroundColor: `hsl(${(contact.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                              }}>
                                {(contact.name || contact.notify || contact.id)[0]?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {contact.verifiedName || contact.name || contact.notify || phoneNumber}
                                </div>
                                {contact.verifiedName && (contact.name || contact.notify) && (
                                  <div className="text-sm text-gray-500 truncate">{contact.name || contact.notify}</div>
                                )}
                                <div className="text-xs text-gray-400 truncate">{phoneNumber}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {filteredContacts.length === 0 && contacts.length > 0 && (
                        <div className="text-center text-gray-500 py-4">
                          Arama sonucu bulunamadı
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mesaj İletme Seçici Modalı */}
      {showForwardSelector && forwardingMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Mesajı İlet</h2>
              <button
                onClick={() => {
                  setShowForwardSelector(false);
                  setForwardingMessage(null);
                  setContacts([]);
                  setFilteredContacts([]);
                  setContactSearchTerm('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* İletilecek mesaj önizlemesi */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">
              <div className="text-xs text-gray-500 mb-1">İletilecek mesaj:</div>
              <div className="text-sm truncate">{forwardingMessage.text || forwardingMessage.body || 'Mesaj'}</div>
            </div>

            {contacts.length === 0 && !isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center text-gray-500">
                  <p>Kişi listesi yükleniyor...</p>
                </div>
              </div>
            ) : isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-green-500" size={32} />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Kişi ara..."
                    value={contactSearchTerm}
                    onChange={(e) => setContactSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      Kişi bulunamadı
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {/* Chats listesi de ekle */}
                      {chats.filter(chat => chat.id !== selectedChat?.id).map((chat) => {
                        const profilePicture = chatProfilePictures.get(chat.id) || chat.imgUrl;
                        const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                        
                        return (
                          <div
                            key={chat.id}
                            onClick={() => {
                              if (forwardingMessage) {
                                handleForwardMessage(forwardingMessage, chat.id);
                              }
                            }}
                            className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              {hasProfilePicture ? (
                                <img
                                  src={profilePicture}
                                  alt={chat.name}
                                  className="w-10 h-10 rounded-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold ${
                                hasProfilePicture ? 'hidden' : ''
                              }`} style={{
                                backgroundColor: `hsl(${(chat.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                              }}>
                                {chat.name[0]?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {chat.verifiedName || chat.name}
                                </div>
                                <div className="text-xs text-gray-400 truncate">{chat.id}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Contacts listesi */}
                      {filteredContacts.map((contact) => {
                        const phoneNumber = extractPhoneFromJid(contact.id);
                        const profilePicture = chatProfilePictures.get(contact.id) || contact.imgUrl;
                        const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                        
                        return (
                          <div
                            key={contact.id}
                            onClick={() => {
                              if (forwardingMessage) {
                                handleForwardMessage(forwardingMessage, contact.id);
                              }
                            }}
                            className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              {hasProfilePicture ? (
                                <img
                                  src={profilePicture}
                                  alt={contact.name || contact.notify || contact.id}
                                  className="w-10 h-10 rounded-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold ${
                                hasProfilePicture ? 'hidden' : ''
                              }`} style={{
                                backgroundColor: `hsl(${(contact.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                              }}>
                                {(contact.name || contact.notify || contact.id)[0]?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {contact.verifiedName || contact.name || contact.notify || phoneNumber}
                                </div>
                                {contact.verifiedName && (contact.name || contact.notify) && (
                                  <div className="text-sm text-gray-500 truncate">{contact.name || contact.notify}</div>
                                )}
                                <div className="text-xs text-gray-400 truncate">{phoneNumber}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {filteredContacts.length === 0 && contacts.length > 0 && chats.length === 0 && (
                        <div className="text-center text-gray-500 py-4">
                          Arama sonucu bulunamadı
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Kişi Seçici Modalı (Mesaj Göndermek İçin) */}
      {showContactSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Kişi Seç</h2>
              <button
                onClick={() => {
                  setShowContactSelector(false);
                  setContacts([]);
                  setFilteredContacts([]);
                  setContactSearchTerm('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            
            {contacts.length === 0 && !isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center text-gray-500">
                  <p>Kişi listesi yükleniyor...</p>
                  <p className="text-xs mt-2">WebSocket'ten contact'lar bekleniyor</p>
                </div>
              </div>
            ) : isLoadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-green-500" size={32} />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Kişi ara (isim, telefon: 868, *868*)..."
                    value={contactSearchTerm}
                    onChange={(e) => setContactSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={handleRefreshContacts}
                    disabled={isLoadingContacts}
                    className="px-3 py-2 text-sm flex items-center space-x-2 border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg disabled:opacity-60"
                  >
                    <RefreshCcw size={16} />
                    <span>Yenile</span>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      Kişi bulunamadı
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredContacts.map((contact) => {
                        const phoneNumber = extractPhoneFromJid(contact.id);
                        const profilePicture = chatProfilePictures.get(contact.id) || contact.imgUrl;
                        const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                        
                        return (
                          <div
                            key={contact.id}
                            onClick={() => handleSelectContactForMessage(contact)}
                            className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              {hasProfilePicture ? (
                                <img
                                  src={profilePicture}
                                  alt={contact.name || contact.notify || contact.id}
                                  className="w-10 h-10 rounded-full object-cover"
                                  onError={(e) => {
                                    // Resim yüklenemezse fallback göster
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.nextElementSibling) {
                                      (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold ${
                                hasProfilePicture ? 'hidden' : ''
                              }`} style={{
                                backgroundColor: `hsl(${(contact.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                              }}>
                                {(contact.name || contact.notify || contact.id)[0]?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {contact.verifiedName || contact.name || contact.notify || phoneNumber}
                                </div>
                                {contact.verifiedName && (contact.name || contact.notify) && (
                                  <div className="text-sm text-gray-500 truncate">{contact.name || contact.notify}</div>
                                )}
                                <div className="text-xs text-gray-400 truncate">{phoneNumber}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {filteredContacts.length === 0 && contacts.length > 0 && (
                        <div className="text-center text-gray-500 py-4">
                          Arama sonucu bulunamadı
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}