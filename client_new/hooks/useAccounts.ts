// ============================================
// useAccounts Hook
// ============================================

import { useCallback, useState } from 'react';
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
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState('');
  
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
    setNewAccountName('');
    
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
      }
      
      // SSE ile QR kod dinle
      const unsubscribe = api.subscribeToQR(accountId, async (data) => {
        if (data.qr || data.lastQr) {
          const qrUrl = await QRCode.toDataURL(data.qr || data.lastQr);
          setQrCode(qrUrl);
          setIsLoadingQR(false);
        }
        
        if (data.status === 'open') {
          // Hesap bağlandı
          const accountNames = JSON.parse(localStorage.getItem('whatsapp_account_names') || '{}');
          const accountName = newAccountName.trim() || `Hesap ${Object.keys(accountNames).length + 1}`;
          accountNames[accountId] = accountName;
          localStorage.setItem('whatsapp_account_names', JSON.stringify(accountNames));
          
          unsubscribe();
          setShowAddModal(false);
          setQrCode(null);
          setPendingAccountId(null);
          loadAccounts();
          showToast('Hesap başarıyla eklendi', 'success');
        }
      });
      
      setIsLoadingQR(false);
    } catch (error: any) {
      console.error('[useAccounts] Hesap ekleme hatası:', error);
      showToast(error.message || 'Hesap eklenemedi', 'error');
      setIsLoadingQR(false);
    }
  }, [loadAccounts, newAccountName, showToast]);
  
  /**
   * Modal'ı kapat
   */
  const closeAddModal = useCallback(async () => {
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
  }, [pendingAccountId]);
  
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
    pendingAccountId,
    newAccountName,
    setNewAccountName,
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
    logout,
  };
}

