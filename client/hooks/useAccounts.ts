import { useState, useRef } from 'react';
import * as api from '../api';
import * as QRCode from 'qrcode';
import { Account } from '../types';
import { COLORS } from '../constants/appConstants';

interface UseAccountsProps {
  onAccountCreated?: (accountId: string) => void;
  onLoadContacts?: (sessionId: string) => Promise<any>;
  onLoadChats?: (sessionId: string, limit: number) => void;
}

export function useAccounts({ onAccountCreated, onLoadContacts, onLoadChats }: UseAccountsProps = {}) {
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
            console.warn(`Session ${session.id} status alınamadı:`, error);
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
      
      console.log('Hesaplar oluşturuldu (duplicate kontrolü öncesi):', accountsWithStatus);
      
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
      console.log('Hesaplar oluşturuldu (duplicate kontrolü sonrası):', finalAccounts);
      
      const hasActive = finalAccounts.some(acc => acc.active);
      if (!hasActive && finalAccounts.length > 0) {
        finalAccounts[0].active = true;
      }
      
      setAccounts(finalAccounts);
    } catch (error) {
      console.error('Hesaplar yüklenemedi:', error);
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
    
    let accountId = baseSlug;
    let counter = 1;
    while (accounts.some(acc => acc.id === accountId)) {
      accountId = `${baseSlug}-${counter}`;
      counter++;
    }
    
    return accountId;
  };

  const handleAddAccount = async () => {
    setShowAddAccountModal(true);
    setNewAccountName('');
    setQrCode(null);
    setIsLoadingQR(true);
    
    // Otomatik olarak geçici bir session ID oluştur ve QR kod üret
    const tempAccountId = `temp-${Date.now()}`;
    setPendingAccountId(tempAccountId);
    
    try {
      console.log('[handleAddAccount] QR kod oluşturuluyor, geçici session ID:', tempAccountId);
      
      // Session oluştur - bu endpoint artık direkt QR kod döndürüyor
      const sessionResponse = await api.createSession(tempAccountId);
      console.log('[handleAddAccount] Session response:', sessionResponse);
      
      // QR kod response'da var mı kontrol et
      const qrValue = sessionResponse.qr || sessionResponse.lastQr;
      
      if (qrValue && typeof qrValue === 'string' && qrValue.length > 0) {
        console.log('[handleAddAccount] ✅ QR kod direkt response\'da geldi, görüntüye dönüştürülüyor...');
        // QR kod string'ini görsel QR kod'a çevir
        QRCode.toDataURL(qrValue)
          .then(url => {
            console.log('[handleAddAccount] ✅ QR kod görüntüye dönüştürüldü');
            setQrCode(url);
            setIsLoadingQR(false);
          })
          .catch(err => {
            console.error('[handleAddAccount] ❌ QR kod oluşturulamadı:', err);
            setIsLoadingQR(false);
          });
      } else {
        console.log('[handleAddAccount] ⚠️ QR kod henüz gelmedi, SSE ile takip ediliyor...');
      }

      // SSE ile QR kod dinle
      sseRef.current = api.subscribeToQR(tempAccountId, (data) => {
        console.log('[handleAddAccount] SSE güncellemesi alındı:', {
          hasQr: !!data.qr,
          hasLastQr: !!data.lastQr,
          status: data.status,
        });
        
        // QR kod kontrolü
        if (data.qr || data.lastQr) {
          const qrValue = data.qr || data.lastQr;
          QRCode.toDataURL(qrValue)
            .then(url => {
              console.log('[handleAddAccount] ✅ SSE\'den QR kod görüntüye dönüştürüldü');
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
          console.log('[handleAddAccount] Bağlantı açıldı, hesap adı kaydediliyor...');
          
          // Hesap adını localStorage'dan kontrol et (kullanıcı "Hesap Adını Kaydet" butonuna tıklamış olabilir)
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          const savedName = accountNames[tempAccountId];
          const accountName = savedName || tempAccountId;
          
          // Hesap adını kaydet (eğer kaydedilmemişse)
          if (!savedName) {
            accountNames[tempAccountId] = accountName;
            localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          }
          
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
            onAccountCreated(tempAccountId);
          } else {
            setTimeout(() => {
              if (onLoadContacts && onLoadChats) {
                onLoadContacts(tempAccountId).then(() => {
                  onLoadChats(tempAccountId, 50);
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
          const status = await api.getSessionStatus(tempAccountId);
          const qr = status.qr || status.lastQr;
          
          if (qr && typeof qr === 'string' && qr.length > 0 && !qrCode) {
            QRCode.toDataURL(qr)
              .then(url => {
                console.log('[handleAddAccount] ✅ Alternatif yöntemle QR kod görüntüye dönüştürüldü');
                setQrCode(url);
                setIsLoadingQR(false);
                clearInterval(checkQRInterval);
              })
              .catch(err => {
                console.error('[handleAddAccount] ❌ QR kod oluşturulamadı (alternatif):', err);
              });
          }
          
          if (status.status === 'open' || checkCount >= maxChecks) {
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
    
    console.log('[createAccount] Hesap adı kaydedildi:', accountName, 'Session ID:', pendingAccountId);
    
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
    if (sseRef.current) {
      sseRef.current();
      sseRef.current = null;
    }

    const accountIdToDelete = pendingAccountId;
    if (accountIdToDelete) {
      try {
        const status = await api.getSessionStatus(accountIdToDelete);
        
        if (status.status !== 'open') {
          console.log(`[Modal Kapatıldı] QR kod okutulmadan vazgeçildi, session siliniyor: ${accountIdToDelete}`);
          await api.deleteSession(accountIdToDelete);
          
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          delete accountNames[accountIdToDelete];
          localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          
          setAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== accountIdToDelete));
          console.log(`[Modal Kapatıldı] Session silindi: ${accountIdToDelete}`);
        } else {
          console.log(`[Modal Kapatıldı] Session zaten bağlanmış, silinmedi: ${accountIdToDelete}`);
        }
      } catch (error) {
        console.error('[Modal Kapatıldı] Session silinirken hata:', error);
        try {
          await api.deleteSession(accountIdToDelete);
          setAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== accountIdToDelete));
        } catch (deleteError) {
          console.error('[Modal Kapatıldı] Session silme hatası:', deleteError);
        }
      }
      
      setPendingAccountId(null);
    }

    setShowAddAccountModal(false);
    setQrCode(null);
    setIsLoadingQR(false);
  };

  return {
    accounts,
    setAccounts,
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
