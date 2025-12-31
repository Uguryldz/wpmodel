import { useState, useRef, useEffect } from 'react';
import * as api from '../api';
import * as QRCode from 'qrcode';
import { Account } from '../types';
import { COLORS } from '../constants/appConstants';

interface UseAccountsProps {
  onAccountCreated?: (accountId: string) => void;
  onLoadContacts?: (sessionId: string) => Promise<any>;
  onLoadChats?: (sessionId: string, limit: number) => void;
  sendRequest?: (requestType: string, payload: any) => Promise<any>;
}

export function useAccounts({ onAccountCreated, onLoadContacts, onLoadChats, sendRequest }: UseAccountsProps = {}) {
  // sendRequest ref'i - dışarıdan geçirilebilir
  const sendRequestRef = useRef<((requestType: string, payload: any) => Promise<any>) | null>(null);
  
  // sendRequest setter - dışarıdan çağrılabilir
  const setSendRequest = (sr: (requestType: string, payload: any) => Promise<any>) => {
    sendRequestRef.current = sr;
  };
  
  // sendRequest prop'undan ref'i güncelle
  useEffect(() => {
    if (sendRequest) {
      sendRequestRef.current = sendRequest;
    }
  }, [sendRequest]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState('');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const sseRef = useRef<(() => void) | null>(null);
  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // newAccountName'in güncel değerini takip etmek için ref kullan (closure sorunu için)
  const newAccountNameRef = useRef<string>('');
  // accountId'yi takip etmek için ref kullan (closure sorunu için)
  const accountIdRef = useRef<string | null>(null);
  
  // newAccountName değiştiğinde ref'i güncelle
  useEffect(() => {
    newAccountNameRef.current = newAccountName;
  }, [newAccountName]);

  const loadAccounts = async () => {
    try {
      // Önce WebSocket request dene (eğer sendRequestRef varsa)
      if (sendRequestRef.current) {
        try {
          const sessions = await sendRequestRef.current('getSessions', {});
          
          if (sessions && Array.isArray(sessions) && sessions.length > 0) {
            // localStorage'dan hesap adlarını yükle
            const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
            
            // Temp- ile başlayan session'ları filtrele
            const validSessions = sessions.filter((session: any) => !session.id?.startsWith('temp-'));
            
            const accountsWithStatus = await Promise.all(
              validSessions.map(async (session: any, index: number) => {
                try {
                  const accountName = accountNames[session.id] || session.id;
                  return {
                    id: session.id,
                    name: accountName,
                    status: session.status || 'unknown',
                    color: COLORS[index % COLORS.length],
                    active: index === 0,
                    whatsappJid: session.whatsappJid || null,
                  };
                } catch (error) {
                  const accountName = accountNames[session.id] || session.id;
                  return {
                    id: session.id,
                    name: accountName,
                    status: session.status || 'unknown',
                    color: COLORS[index % COLORS.length],
                    active: index === 0,
                    whatsappJid: session.whatsappJid || null,
                  };
                }
              })
            );
            
            // Duplicate kontrolü
            const uniqueAccounts = new Map<string, Account>();
            const statusPriority = { 'open': 4, 'connecting': 3, 'initializing': 2, 'close': 1, 'unknown': 0 };
            
            for (const account of accountsWithStatus) {
              const key = account.whatsappJid || account.id;
              const existing = uniqueAccounts.get(key);
              
              if (!existing) {
                uniqueAccounts.set(key, account);
              } else {
                const existingPriority = statusPriority[existing.status as keyof typeof statusPriority] || 0;
                const currentPriority = statusPriority[account.status as keyof typeof statusPriority] || 0;
                
                if (currentPriority > existingPriority) {
                  uniqueAccounts.set(key, account);
                } else if (currentPriority === existingPriority && account.status === 'open') {
                  if (account.id && existing.id && account.id > existing.id) {
                    uniqueAccounts.set(key, account);
                  }
                }
              }
            }
            
            const finalAccounts = Array.from(uniqueAccounts.values());
            const hasActive = finalAccounts.some(acc => acc.active);
            if (!hasActive && finalAccounts.length > 0) {
              finalAccounts[0].active = true;
            }
            
            setAccounts(finalAccounts);
            return;
          }
        } catch (wsError) {
          // WebSocket request başarısız, API fallback kullanılıyor
        }
      }
      
      // Fallback: API kullan (WebSocket request yoksa veya başarısızsa)
      // WebSocket'ten sessions.update event'i gelecek
      // İlk yükleme için WebSocket bağlantısını bekliyoruz
      // Eğer WebSocket bağlı değilse veya event gelmezse, fallback olarak API kullan
      try {
        const sessions = await api.getSessions();
        
        if (!sessions || sessions.length === 0) {
          setAccounts([]);
          return;
        }

        // localStorage'dan hesap adlarını yükle
        const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
        
        // Temp- ile başlayan session'ları filtrele
        const validSessions = sessions.filter(session => !session.id.startsWith('temp-'));
        
        // Güncellenmiş account names'i kaydet
        localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));

        const accountsWithStatus = await Promise.all(
          validSessions.map(async (session, index) => {
            try {
              const status = await api.getSessionStatus(session.id);
              const accountName = accountNames[session.id] || session.id;
              return {
                id: session.id,
                name: accountName,
                status: status.status || session.status || 'unknown',
                color: COLORS[index % COLORS.length],
                active: index === 0,
                whatsappJid: (session as any).whatsappJid || null,
              };
            } catch (error) {
              const accountName = accountNames[session.id] || session.id;
              return {
                id: session.id,
                name: accountName,
                status: session.status || 'unknown',
                color: COLORS[index % COLORS.length],
                active: index === 0,
                whatsappJid: (session as any).whatsappJid || null,
              };
            }
          })
        );
        
        // Duplicate kontrolü
        const uniqueAccounts = new Map<string, Account>();
        
        for (const account of accountsWithStatus) {
          const key = (account as any).whatsappJid || account.id;
          
          const existing = uniqueAccounts.get(key);
          if (!existing) {
            uniqueAccounts.set(key, account);
          } else {
            const statusPriority = { 'open': 4, 'connecting': 3, 'initializing': 2, 'close': 1, 'unknown': 0 };
            const existingPriority = statusPriority[existing.status as keyof typeof statusPriority] || 0;
            const currentPriority = statusPriority[account.status as keyof typeof statusPriority] || 0;
            
            if (currentPriority > existingPriority) {
              uniqueAccounts.set(key, account);
            } else if (currentPriority === existingPriority && account.status === 'open') {
              if (account.id > existing.id) {
                uniqueAccounts.set(key, account);
              }
            }
          }
        }
        
        const finalAccounts = Array.from(uniqueAccounts.values());
        
        const hasActive = finalAccounts.some(acc => acc.active);
        if (!hasActive && finalAccounts.length > 0) {
          finalAccounts[0].active = true;
        }
        
        setAccounts(finalAccounts);
      } catch (error) {
        console.error('[useAccounts] ❌ Hesaplar yüklenemedi:', error);
        setAccounts([]);
      }
    } catch (error) {
      console.error('[useAccounts] ❌ loadAccounts hatası:', error);
      setAccounts([]);
    }
  };

  const switchAccount = (accountId: string) => {
    setAccounts(accounts.map(acc => ({
      ...acc,
      active: acc.id === accountId
    })));
  };

  const generateAccountId = (accountName: string): string => {
    const baseSlug = accountName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    if (!baseSlug || baseSlug.length < 2) {
      return `account-${Date.now()}`;
    }
    
    // Mevcut session ID'lerini kontrol et (hem state'ten hem localStorage'dan)
    const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
    const existingSessionIds = new Set([
      ...accounts.map(acc => acc.id),
      ...Object.keys(accountNames)
    ]);
    
    let accountId = baseSlug;
    let counter = 1;
    while (existingSessionIds.has(accountId)) {
      accountId = `${baseSlug}-${counter}`;
      counter++;
    }
    
    return accountId;
  };

  const handleAddAccount = async () => {
    setShowAddAccountModal(true);
    setQrCode(null);
    setIsLoadingQR(true);
    
    try {
      // Önce mevcut session'ları yükle (duplicate kontrolü için)
      const sessions = await api.getSessions();
      const existingSessionIds = new Set(sessions.map(s => s.id));
      
      // Hesap adı boş olarak başlat (kullanıcı kendi ismini girebilir)
      setNewAccountName('');
      
      // ID oluştur (hesap adı boş olduğu için timestamp kullan)
      const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
      let accountId = `account-${Date.now()}`;
      let counter = 1;
      const allExistingIds = new Set([
        ...existingSessionIds,
        ...accounts.map(acc => acc.id),
        ...Object.keys(accountNames)
      ]);
      
      while (allExistingIds.has(accountId)) {
        accountId = `account-${Date.now()}-${counter}`;
        counter++;
      }
      
      accountIdRef.current = accountId;
      setPendingAccountId(accountId);
      
      // 5 dakika sonra bağlantı kurulmazsa session'ı otomatik sil
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
      cleanupTimeoutRef.current = setTimeout(async () => {
        const currentAccountId = accountIdRef.current;
        if (!currentAccountId) return;
        
        try {
          const status = await api.getSessionStatus(currentAccountId);
          if (status.status !== 'open') {
            try {
              await api.deleteSession(currentAccountId);
              const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
              delete accountNames[currentAccountId];
              localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
              setAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== currentAccountId));
            } catch (error) {
              console.error('[Timeout] ❌ Session silme hatası:', error);
            }
          }
        } catch (error) {
          console.error('[Timeout] Status kontrolü hatası:', error);
        }
        
        if (accountIdRef.current === currentAccountId) {
          accountIdRef.current = null;
          setPendingAccountId(null);
        }
      }, 5 * 60 * 1000); // 5 dakika
    
      // Session oluştur - bu endpoint artık direkt QR kod döndürüyor
      const sessionResponse = await api.createSession(accountId);
      
      // QR kod response'da var mı kontrol et
      const qrValue = sessionResponse.qr || sessionResponse.lastQr;
      
      if (qrValue && typeof qrValue === 'string' && qrValue.length > 0) {
        // QR kod string'ini görsel QR kod'a çevir
        QRCode.toDataURL(qrValue)
          .then(url => {
            setQrCode(url);
            setIsLoadingQR(false);
          })
          .catch(err => {
            console.error('[handleAddAccount] ❌ QR kod oluşturulamadı:', err);
            setIsLoadingQR(false);
          });
      }

      // SSE ile QR kod dinle
      const currentAccountId = accountIdRef.current;
      if (!currentAccountId) return;
      
      sseRef.current = api.subscribeToQR(currentAccountId, (data) => {
        // QR kod kontrolü
        if (data.qr || data.lastQr) {
          const qrValue = data.qr || data.lastQr;
          QRCode.toDataURL(qrValue)
            .then(url => {
              setQrCode(url);
              setIsLoadingQR(false);
            })
            .catch(err => {
              console.error('[handleAddAccount] ❌ QR kod oluşturulamadı:', err);
              setIsLoadingQR(false);
            });
        }
        
        // Bağlantı açıldıysa hesap adını kaydet ve modal'ı kapat
        if (data.status === 'open') {
          // Hesap adını belirle: doluysa kullan, boşsa otomatik ata
          // Ref kullanarak güncel değeri al (closure sorunu için)
          const currentAccountName = newAccountNameRef.current;
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          let accountName: string;
          
          if (currentAccountName && currentAccountName.trim()) {
            // Kullanıcı hesap adı girmişse onu kullan
            accountName = currentAccountName.trim();
          } else {
            // Boşsa otomatik isim ata (mevcut hesap sayısına göre)
            const existingCount = Object.keys(accountNames).length;
            accountName = `Hesap ${existingCount + 1}`;
          }
          
          // Hesap adını kaydet
          const currentAccountId = accountIdRef.current;
          if (!currentAccountId) return;
          
          // Timeout'u iptal et (bağlantı kuruldu)
          if (cleanupTimeoutRef.current) {
            clearTimeout(cleanupTimeoutRef.current);
            cleanupTimeoutRef.current = null;
          }
          
          accountNames[currentAccountId] = accountName;
          localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          
          if (sseRef.current) {
            sseRef.current();
            sseRef.current = null;
          }
          setQrCode(null);
          setIsLoadingQR(false);
          setPendingAccountId(null);
          accountIdRef.current = null;
          setShowAddAccountModal(false);
          loadAccounts();
          
          if (onAccountCreated) {
            onAccountCreated(currentAccountId);
          } else {
            setTimeout(() => {
              if (onLoadContacts && onLoadChats) {
                onLoadContacts(currentAccountId).then(() => {
                  onLoadChats(currentAccountId, 50);
                });
              }
            }, 1000);
          }
        }
      });

      // Alternatif: QR kod'u direkt çek (düzenli kontrol)
      let checkCount = 0;
      const maxChecks = 15;
      
      const checkQRInterval = setInterval(async () => {
        checkCount++;
        try {
          const currentAccountId = accountIdRef.current;
          if (!currentAccountId) {
            clearInterval(checkQRInterval);
            return;
          }
          
          const status = await api.getSessionStatus(currentAccountId);
          const qr = status.qr || status.lastQr;
          
          if (qr && typeof qr === 'string' && qr.length > 0 && !qrCode) {
            QRCode.toDataURL(qr)
              .then(url => {
                setQrCode(url);
                setIsLoadingQR(false);
                clearInterval(checkQRInterval);
              })
              .catch(err => {
                console.error('[handleAddAccount] ❌ QR kod oluşturulamadı (alternatif):', err);
              });
          }
          
          if (status.status === 'open') {
            // Hesap adını belirle: doluysa kullan, boşsa otomatik ata
            // Ref kullanarak güncel değeri al (closure sorunu için)
            const currentAccountName = newAccountNameRef.current;
            const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
            let accountName: string;
            
            if (currentAccountName && currentAccountName.trim()) {
              // Kullanıcı hesap adı girmişse onu kullan
              accountName = currentAccountName.trim();
            } else {
              // Boşsa otomatik isim ata (mevcut hesap sayısına göre)
              const existingCount = Object.keys(accountNames).length;
              accountName = `Hesap ${existingCount + 1}`;
            }
            
            // Timeout'u iptal et (bağlantı kuruldu)
            if (cleanupTimeoutRef.current) {
              clearTimeout(cleanupTimeoutRef.current);
              cleanupTimeoutRef.current = null;
            }
            
            // Hesap adını kaydet
            accountNames[currentAccountId] = accountName;
            localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
            
            clearInterval(checkQRInterval);
            setQrCode(null);
            setIsLoadingQR(false);
            setPendingAccountId(null);
            accountIdRef.current = null;
            setShowAddAccountModal(false);
            loadAccounts();
            
            if (onAccountCreated) {
              onAccountCreated(currentAccountId);
            } else {
              setTimeout(() => {
                if (onLoadContacts && onLoadChats) {
                  onLoadContacts(currentAccountId).then(() => {
                    onLoadChats(currentAccountId, 50);
                  });
                }
              }, 1000);
            }
          } else if (checkCount >= maxChecks) {
            clearInterval(checkQRInterval);
          }
        } catch (error) {
          console.error('[handleAddAccount] Status kontrolü hatası:', error);
          if (checkCount >= maxChecks) {
            clearInterval(checkQRInterval);
          }
        }
      }, 2000);
      
    } catch (error: any) {
      console.error('[handleAddAccount] QR kod oluşturulamadı:', error);
      alert(error.message || 'QR kod oluşturulamadı');
      setIsLoadingQR(false);
      setPendingAccountId(null);
    }
  };

  const createAccount = async () => {
    // Artık QR kod "Hesap Ekle" butonuna tıklandığında oluşturuluyor
    // Bu fonksiyon sadece hesap adını kaydetmek için kullanılıyor
    if (!pendingAccountId) {
      alert('Önce QR kod oluşturun');
      return;
    }

    if (!newAccountName.trim()) {
      alert('Hesap adı gerekli');
      return;
    }

    const accountName = newAccountName.trim();
    
    // localStorage'a hesap adını kaydet
    const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
    accountNames[pendingAccountId] = accountName;
    localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
    
    // Hesap listesini güncelle (eğer hesap zaten listede varsa)
    setAccounts(prevAccounts => {
      const existingAccount = prevAccounts.find(acc => acc.id === pendingAccountId);
      if (existingAccount) {
        return prevAccounts.map(acc => 
          acc.id === pendingAccountId ? { ...acc, name: accountName } : acc
        );
      }
      return prevAccounts;
    });
  };

  // QR üretimini başlat (kullanıcı tarafından manuel tetiklenir - yenileme için)
  const generateQR = async () => {
    if (!pendingAccountId) {
      alert('Önce bir hesap oluşturun');
      return;
    }

    setIsLoadingQR(true);
    setQrCode(null);

    try {
      // Socket'i başlat (QR üretimi için)
      await api.startConnection(pendingAccountId);

      // SSE ile QR kod dinle
      if (sseRef.current) {
        sseRef.current();
      }
      
      sseRef.current = api.subscribeToQR(pendingAccountId, (data) => {
        if (data.qr) {
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
          // Hesap adını belirle: doluysa kullan, boşsa otomatik ata
          // Ref kullanarak güncel değeri al (closure sorunu için)
          const currentAccountName = newAccountNameRef.current;
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          let accountName: string;
          
          if (currentAccountName && currentAccountName.trim()) {
            // Kullanıcı hesap adı girmişse onu kullan
            accountName = currentAccountName.trim();
          } else {
            // Boşsa otomatik isim ata (mevcut hesap sayısına göre)
            const existingCount = Object.keys(accountNames).length;
            accountName = `Hesap ${existingCount + 1}`;
          }
          
          // Hesap adını kaydet
          accountNames[pendingAccountId] = accountName;
          localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          
          if (sseRef.current) {
            sseRef.current();
            sseRef.current = null;
          }
          setQrCode(null);
          setIsLoadingQR(false);
          setPendingAccountId(null);
          setShowAddAccountModal(false);
          loadAccounts();
          
          if (onAccountCreated) {
            onAccountCreated(pendingAccountId);
          } else {
            setTimeout(() => {
              if (onLoadContacts && onLoadChats) {
                onLoadContacts(pendingAccountId).then(() => {
                  onLoadChats(pendingAccountId, 50);
                });
              }
            }, 1000);
          }
        }
      });
    } catch (error: any) {
      console.error('QR üretilemedi:', error);
      alert(error.message || 'QR üretilemedi');
      setIsLoadingQR(false);
    }
  };

  const handleRenameAccount = (accountId: string, newName: string) => {
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

  const handleCloseModal = async () => {
    // SSE bağlantısını kapat
    if (sseRef.current) {
      sseRef.current();
      sseRef.current = null;
    }

    // QR kontrol interval'ini temizle
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = null;
    }

    // Cleanup timeout'unu iptal et
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }

    const accountIdToDelete = pendingAccountId || accountIdRef.current;
    if (accountIdToDelete) {
      try {
        const status = await api.getSessionStatus(accountIdToDelete);
        
        // Bağlantı kurulmamışsa (open değilse) session'ı sil
        if (status.status !== 'open') {
          try {
            await api.deleteSession(accountIdToDelete);
          } catch (deleteError) {
            console.error('[Modal Kapatıldı] ❌ Session silme hatası:', deleteError);
          }
          
          // localStorage'dan temizle
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          delete accountNames[accountIdToDelete];
          localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          
          // State'ten kaldır
          setAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== accountIdToDelete));
        }
      } catch (error) {
        // Status kontrolü başarısız oldu, yine de silmeyi dene
        console.error('[Modal Kapatıldı] Status kontrolü başarısız, session siliniyor:', error);
        try {
          await api.deleteSession(accountIdToDelete);
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          delete accountNames[accountIdToDelete];
          localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          setAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== accountIdToDelete));
        } catch (deleteError) {
          console.error('[Modal Kapatıldı] ❌ Session silme hatası:', deleteError);
        }
      }
      
      setPendingAccountId(null);
      accountIdRef.current = null;
    }

    setShowAddAccountModal(false);
    setQrCode(null);
    setIsLoadingQR(false);
  };

  return {
    accounts,
    setAccounts,
    setSendRequest,
    editingAccountId,
    editingAccountName,
    setEditingAccountName,
    showAddAccountModal,
    newAccountName,
    setNewAccountName,
    qrCode,
    isLoadingQR,
    pendingAccountId,
    loadAccounts,
    switchAccount,
    handleAddAccount,
    createAccount,
    generateQR,
    handleRenameAccount,
    startEditingAccount,
    handleCloseModal,
  };
}
