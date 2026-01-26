// ============================================
// useAccounts Hook - FIXED VERSION
// ============================================

import { useCallback, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../api';
import { COLORS } from '../constants';
import type { Account } from '../types';
import * as QRCode from 'qrcode';

export function useAccounts() {
  const { state, dispatch, sendRequest, showToast } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState('');
  
  // Hesap adını ref ile tut
  const accountNameRef = useRef('');
  
  const { accounts, activeAccountId } = state;
  const activeAccount = accounts.find(a => a.id === activeAccountId) || accounts.find(a => a.active) || null;
  
  /**
   * Hesapları yükle
   */
  const loadAccounts = useCallback(async () => {
    try {
      // Önce WebSocket dene
      try {
        const sessions = await sendRequest<any[]>('getSessions', {});
        if (sessions && sessions.length > 0) {
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          const validSessions = sessions.filter((s: any) => !s.id?.startsWith('temp-'));
          
          const formattedAccounts: Account[] = validSessions.map((session: any, index: number) => ({
            id: session.id,
            name: accountNames[session.id] || session.id,
            status: (session.status || 'unknown') as Account['status'],
            color: COLORS[index % COLORS.length],
            active: index === 0,
            whatsappJid: session.whatsappJid,
          }));
          
          dispatch({ type: 'SET_ACCOUNTS', payload: formattedAccounts });
          if (formattedAccounts.length > 0) {
            dispatch({ type: 'SET_ACTIVE_ACCOUNT', payload: formattedAccounts[0].id });
          }
          return;
        }
      } catch {
        // WebSocket başarısız, API'ye düş
      }
      
      // API fallback
      const sessions = await api.getSessions();
      if (sessions && sessions.length > 0) {
        const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
        const validSessions = sessions.filter(s => !s.id.startsWith('temp-'));
        
        const formattedAccounts: Account[] = await Promise.all(
          validSessions.map(async (session, index) => {
            try {
              const status = await api.getSessionStatus(session.id);
              return {
                id: session.id,
                name: accountNames[session.id] || session.id,
                status: (status.status || session.status || 'unknown') as Account['status'],
                color: COLORS[index % COLORS.length],
                active: index === 0,
                whatsappJid: (session as any).whatsappJid,
              };
            } catch {
              return {
                id: session.id,
                name: accountNames[session.id] || session.id,
                status: (session.status || 'unknown') as Account['status'],
                color: COLORS[index % COLORS.length],
                active: index === 0,
                whatsappJid: (session as any).whatsappJid,
              };
            }
          })
        );
        
        dispatch({ type: 'SET_ACCOUNTS', payload: formattedAccounts });
        if (formattedAccounts.length > 0) {
          dispatch({ type: 'SET_ACTIVE_ACCOUNT', payload: formattedAccounts[0].id });
        }
      } else {
        dispatch({ type: 'SET_ACCOUNTS', payload: [] });
      }
    } catch (error) {
      console.error('[useAccounts] Hesaplar yüklenemedi:', error);
      dispatch({ type: 'SET_ACCOUNTS', payload: [] });
    }
  }, [dispatch, sendRequest]);
  
  /**
   * Hesap değiştir
   */
  const switchAccount = useCallback((accountId: string) => {
    dispatch({ type: 'SET_ACTIVE_ACCOUNT', payload: accountId });
  }, [dispatch]);
  
  /**
   * Yeni hesap ekle (QR kod modal'ını aç)
   */
  const handleAddAccount = useCallback(async () => {
    setShowAddModal(true);
    setQrCode(null);
    setIsLoadingQR(true);
    setIsScanning(false);
    setNewAccountName('');
    accountNameRef.current = '';
    
    try {
      // Unique ID oluştur
      const accountId = `account-${Date.now()}`;
      setPendingAccountId(accountId);
      
      // Session oluştur
      const response = await api.createSession(accountId);
      
      // QR kod varsa göster
      const qrValue = response.qr || response.lastQr;
      if (qrValue) {
        const qrUrl = await QRCode.toDataURL(qrValue);
        setQrCode(qrUrl);
        setIsLoadingQR(false);
      }
      
      // SSE ile QR kod dinle - DOĞRU ENDPOINT
      const eventSource = new EventSource(`/sessions/${accountId}/add-sse`);
      
      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[useAccounts] SSE Event:', data);
          
          // QR kod güncellemesi
          if (data.qr || data.lastQr) {
            const qrValue = data.qr || data.lastQr;
            const qrUrl = await QRCode.toDataURL(qrValue);
            setQrCode(qrUrl);
            setIsLoadingQR(false);
            setIsScanning(false);
          }
          
          // QR kod tarandı - Backend'den gelen event'ler
          // Backend "connection: 'connecting'" gönderiyor
          if (data.connection === 'connecting' && !data.qr && !data.lastQr) {
            console.log('[useAccounts] QR kod tarandı, bağlanıyor...');
            setIsScanning(true);
            setIsLoadingQR(false);
          }
          
          // Hesap bağlandı - Backend "connection: 'open'" veya "status: 'open'" gönderiyor
          if (data.status === 'open' || data.connection === 'open') {
            console.log('[useAccounts] Hesap başarıyla bağlandı');
            
            // Güncel hesap adını al (ref'ten)
            const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
            const finalAccountName = accountNameRef.current.trim() || `Hesap ${Object.keys(accountNames).length + 1}`;
            accountNames[accountId] = finalAccountName;
            localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
            
            // SSE'yi kapat
            eventSource.close();
            
            // Modal'ı kapat
            setIsScanning(false);
            setShowAddModal(false);
            setQrCode(null);
            setPendingAccountId(null);
            
            // Hesapları yeniden yükle
            await loadAccounts();
            showToast('Hesap başarıyla eklendi', 'success');
          }
        } catch (error) {
          console.error('[useAccounts] SSE Parse error:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('[useAccounts] SSE Error:', error);
        eventSource.close();
        setIsLoadingQR(false);
        setIsScanning(false);
      };
      
      // Cleanup için SSE'yi instance'da sakla
      (window as any).__currentSSE = eventSource;
      
    } catch (error: any) {
      console.error('[useAccounts] Hesap ekleme hatası:', error);
      showToast(error.message || 'Hesap eklenemedi', 'error');
      setIsLoadingQR(false);
      setIsScanning(false);
    }
  }, [loadAccounts, showToast]);
  
  /**
   * Hesap adı değiştiğinde ref'i güncelle
   */
  const handleAccountNameChange = useCallback((name: string) => {
    setNewAccountName(name);
    accountNameRef.current = name;
  }, []);
  
  /**
   * Modal'ı kapat
   */
  const closeAddModal = useCallback(async () => {
    // Scanning durumunda kapatmaya izin verme
    if (isScanning) {
      console.log('[useAccounts] Bağlantı kurulurken modal kapatılamaz');
      showToast('Bağlantı kurulurken kapatılamaz', 'warning');
      return;
    }
    
    // SSE'yi kapat
    if ((window as any).__currentSSE) {
      (window as any).__currentSSE.close();
      (window as any).__currentSSE = null;
    }
    
    if (pendingAccountId) {
      try {
        const status = await api.getSessionStatus(pendingAccountId);
        if (status.status !== 'open') {
          await api.deleteSession(pendingAccountId);
        }
      } catch {
        // Sessizce devam et
      }
    }
    
    setShowAddModal(false);
    setQrCode(null);
    setPendingAccountId(null);
    setIsLoadingQR(false);
    setIsScanning(false);
    setNewAccountName('');
    accountNameRef.current = '';
  }, [pendingAccountId, isScanning, showToast]);
  
  /**
   * Hesabı sil
   */
  const deleteAccount = useCallback(async (accountId: string) => {
    try {
      await api.deleteSession(accountId);
      
      const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
      delete accountNames[accountId];
      localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
      
      const newAccounts = accounts.filter(a => a.id !== accountId);
      dispatch({ type: 'SET_ACCOUNTS', payload: newAccounts });
      
      if (activeAccountId === accountId && newAccounts.length > 0) {
        dispatch({ type: 'SET_ACTIVE_ACCOUNT', payload: newAccounts[0].id });
      }
      
      showToast('Hesap silindi', 'success');
    } catch (error: any) {
      showToast(error.message || 'Hesap silinemedi', 'error');
    }
  }, [accounts, activeAccountId, dispatch, showToast]);
  
  /**
   * Hesap adını değiştir
   */
  const renameAccount = useCallback((accountId: string, newName: string) => {
    const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
    accountNames[accountId] = newName;
    localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
    
    dispatch({ type: 'UPDATE_ACCOUNT', payload: { id: accountId, name: newName } });
    setEditingAccountId(null);
    setEditingAccountName('');
  }, [dispatch]);
  const startEditingAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setEditingAccountName(account.name);
  };
  /**
   * Çıkış yap
   */
  const logout = useCallback(async (accountId: string) => {
    try {
      await api.logoutSession(accountId);
      loadAccounts();
      showToast('Çıkış yapıldı', 'success');
    } catch (error: any) {
      showToast(error.message || 'Çıkış yapılamadı', 'error');
    }
  }, [loadAccounts, showToast]);
  
  return {
    accounts,
    activeAccount,
    activeAccountId,
    showAddModal,
    qrCode,
    isLoadingQR,
    isScanning,
    pendingAccountId,
    newAccountName,
    setNewAccountName: handleAccountNameChange, // Ref'i güncelleyen versiyonu kullan
    editingAccountId,
    setEditingAccountId,
    editingAccountName,
    setEditingAccountName,
    loadAccounts,
    switchAccount,
    handleAddAccount,
    closeAddModal,
    deleteAccount,
    renameAccount,
    startEditingAccount,
    logout,
  };
}