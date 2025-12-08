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

interface Message {
  id?: string;
  key?: {
    fromMe?: boolean;
    id?: string;
  };
  message?: any;
  pushName?: string;
  body?: string; // bazı helper formatlarda gelebilir
  timestamp?: number;
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
  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sseRef = useRef<(() => void) | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chatsPollRef = useRef<NodeJS.Timeout | null>(null);
  const activeAccountRef = useRef<Account | undefined>(undefined);
  const selectedChatRef = useRef<Chat | null>(null);

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
      console.log('loadChats çağrılıyor, sessionId:', activeAccount.id, 'status:', activeAccount.status);
      // Sadece bağlı hesaplar için sohbetleri yükle
      if (activeAccount.status === 'open') {
        loadChats(activeAccount.id, 50); // Son 50 sohbet
      } else {
        console.log('Hesap henüz bağlı değil, sohbetler yüklenmeyecek');
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

  const loadChats = async (sessionId: string, limit: number = 50) => {
    try {
      console.log('=== Sohbetler yükleniyor ===', { sessionId, limit });
      console.log('SessionId:', sessionId);
      console.log('Aktif hesap:', activeAccount);
      
      // Sohbetleri ve contact'ları paralel yükle
      const [chatsData, contactsData] = await Promise.all([
        api.getChats(sessionId, limit),
        api.getContacts(sessionId).catch(() => []) // Contact yüklenemezse boş array döndür
      ]);
      
      console.log('Sohbetler alındı (ham data):', chatsData);
      console.log('Contact\'lar alındı:', contactsData);
      console.log('Sohbet sayısı:', chatsData?.length || 0);
      
      if (!chatsData || chatsData.length === 0) {
        console.warn('Sohbet listesi boş! SessionId doğru mu kontrol edin.');
        setChats([]);
        return;
      }
      
      // Contact'ları Map'e çevir (hızlı arama için)
      const contactsMap = new Map<string, any>();
      if (contactsData && Array.isArray(contactsData)) {
        contactsData.forEach((contact: any) => {
          contactsMap.set(contact.id, contact);
        });
      }
      
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
        let displayName = chat.name || chat.displayName || chat.id;
        
        // Grup değilse (grup ID'leri @g.us ile biter) contact'tan ad al
        if (!chat.id.includes('@g.us')) {
          const contact = contactsMap.get(chat.id);
          if (contact) {
            // Contact'tan ad al: verifiedName > name > notify > id
            displayName = contact.verifiedName || contact.name || contact.notify || chat.id;
          } else {
            // Contact bulunamadıysa, ID'den telefon numarasını göster
            const phoneMatch = chat.id.match(/^(\d+)@/);
            if (phoneMatch) {
              displayName = phoneMatch[1];
            }
          }
        }
        
        return {
          ...chat,
          name: displayName, // Kişi adı ile güncelle
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
      setChats([]); // Hata durumunda boş liste göster
      // Kullanıcıya hata göster
      alert(`Sohbetler yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  const loadMessages = async (sessionId: string, chatId: string, limit: number = 50) => {
    try {
      console.log('=== Mesajlar yükleniyor ===', { sessionId, chatId, limit });
      const data = await api.getMessages(sessionId, chatId, limit);
      console.log('Mesajlar alındı (ham data):', data);

      // Mesaj içeriğini okunabilir hale getirmek için map
      const mapped: Message[] = (data || []).map((msg: any) => {
        const body = extractMessageText(msg);

        return {
          ...msg,
          body,
        };
      });

      // Mesajları timestamp'e göre sırala (en eski önce)
      mapped.sort((a, b) => {
        const aTime = a.timestamp || a.messageTimestamp || 0;
        const bTime = b.timestamp || b.messageTimestamp || 0;
        return aTime - bTime;
      });

      setMessages(mapped);
    } catch (error: any) {
      console.error('Mesajlar yüklenemedi:', error);
      alert(`Mesajlar yüklenemedi: ${error.message || 'Bilinmeyen hata'}`);
      setMessages([]);
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
            loadChats(accountId, 50);
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
      // Mesajları ve sohbet listesini yenile
      loadMessages(activeAccount.id, selectedChat.id);
      loadChats(activeAccount.id, 50);
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
              // Sohbet listesi güncellendi
              if (data.sessionId === currentActiveAccount?.id) {
                console.log('[WebSocket] Sohbet listesi güncelleniyor...');
                loadChats(data.sessionId, 50);
              }
            } else if (data.type === 'chats.update') {
              // Sohbet güncellendi (unreadCount, lastMessage vs.)
              if (data.sessionId === currentActiveAccount?.id) {
                console.log('[WebSocket] Sohbet güncelleniyor...');
                loadChats(data.sessionId, 50);
              }
            } else if (data.type === 'messages.upsert') {
              // Yeni mesajlar geldi
              if (data.sessionId === currentActiveAccount?.id) {
                console.log('[WebSocket] Yeni mesajlar alındı:', data.messages.length);
                // Seçili sohbetin mesajlarıysa yenile
                if (currentSelectedChat && data.messages.some((msg: any) => msg.from === currentSelectedChat.id)) {
                  console.log('[WebSocket] Seçili sohbetin mesajları yenileniyor...');
                  loadMessages(data.sessionId, currentSelectedChat.id);
                }
                // Sohbet listesini de yenile (unreadCount güncellemesi için)
                loadChats(data.sessionId, 50);
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
    };
  }, []);

  // Seçili sohbet değiştiğinde mesajları yükle
  useEffect(() => {
    if (activeAccount && selectedChat) {
      loadMessages(activeAccount.id, selectedChat.id);
    } else {
      setMessages([]);
    }
  }, [activeAccount?.id, selectedChat?.id]);

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
    loadChats(activeAccount.id);

    chatsPollRef.current = setInterval(() => {
      loadChats(activeAccount.id, 50);
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
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm">
                      Henüz mesaj yok
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      const fromMe = msg.key?.fromMe;
                      const text = msg.body || '';
                      const ts = msg.timestamp
                        ? new Date(msg.timestamp * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        : '';

                      return (
                        <div
                          key={msg.id || msg.key?.id || index}
                          className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs md:max-w-md rounded-lg px-3 py-2 text-sm shadow ${
                              fromMe ? 'bg-[#d9fdd3] text-gray-900' : 'bg-white text-gray-900'
                            }`}
                          >
                            <div>{text || '⟨desteksiz mesaj tipi⟩'}</div>
                            {ts && (
                              <div className="text-[10px] text-gray-500 mt-1 text-right">
                                {ts}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
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
      {showAddAccountModal && renderAddAccountModal()}
    </div>
  );
}
