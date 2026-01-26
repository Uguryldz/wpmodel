// ============================================
// useContacts Hook
// ============================================

import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../api';
import type { Contact } from '../types';
import { extractPhoneFromJid, normalizePhoneNumber, standardizeChatId } from '../utils/jid';

export function useContacts() {
  const { state, dispatch, sendRequest, activeAccount } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  
  const { contacts, isLoadingContacts } = state;
  const contactsArray = Array.from(contacts.values());
  /**
   * Kişileri yükle
   */
  const loadContacts = useCallback(async (force: boolean = false) => {
    if (!activeAccount?.id) {
      console.warn('[useContacts] Active account yok, contact yüklenemedi');
      return;
    }
    
    dispatch({ type: 'SET_LOADING_CONTACTS', payload: true });
    
    try {
      // WebSocket üzerinden yükle
      const response = await sendRequest<any[]>('getContacts', {
        sessionId: activeAccount.id,
      });
      
      // Response'u handle et (eğer contacts.set event'i gelmediyse)
      if (response && Array.isArray(response) && response.length > 0) {
        console.log('[useContacts] ✅ Response\'dan contact\'ler alındı:', response.length);
        const contactsMap = new Map<string, Contact>();
        response.forEach((contact: any) => {
          // @lid formatını handle et
          let contactId = contact.id;
          if (contact.id && contact.id.includes('@lid') && contact.lidJid) {
            contactId = contact.lidJid;
          }
          contactId = standardizeChatId(contactId);
          
          contactsMap.set(contactId, {
            id: contactId,
            name: contact.name,
            notify: contact.notify,
            verifiedName: contact.verifiedName,
            imgUrl: contact.imgUrl,
            status: contact.status,
          });
        });
        dispatch({ type: 'SET_CONTACTS', payload: contactsMap });
      }
    } catch (error: any) {
      console.error('[useContacts] Kişi yükleme hatası:', error);
      
      // SessionId hatası ise API'ye düşme, sadece logla
      if (error.message?.includes('sessionId')) {
        console.warn('[useContacts] SessionId hatası, API fallback atlanıyor');
        dispatch({ type: 'SET_LOADING_CONTACTS', payload: false });
        return;
      }
      
      // API fallback
      if (force) {
        try {
          const contacts = await api.getDeviceContacts(activeAccount.id);
          const contactsMap = new Map<string, Contact>();
          
          // Array kontrolü
          if (Array.isArray(contacts)) {
            contacts.forEach(contact => {
              contactsMap.set(contact.id, contact);
            });
            dispatch({ type: 'SET_CONTACTS', payload: contactsMap });
          } else if (contacts && typeof contacts === 'object') {
            // Object ise values'ları al
            //const contactsArray = Object.values(contacts);
            
            contactsArray.forEach((contact: any) => {
              if (contact && contact.id) {
                contactsMap.set(contact.id, contact);
              }
            });
            dispatch({ type: 'SET_CONTACTS', payload: contactsMap });
          } else {
            console.warn('[useContacts] API\'den beklenmeyen format:', contacts);
            dispatch({ type: 'SET_CONTACTS', payload: new Map() });
          }
        } catch (apiError) {
          console.error('[useContacts] API fallback hatası:', apiError);
          dispatch({ type: 'SET_CONTACTS', payload: new Map() });
        }
      }
    } finally {
      dispatch({ type: 'SET_LOADING_CONTACTS', payload: false });
    }
  }, [activeAccount?.id, dispatch, sendRequest]);
  
  /**
   * Profil fotoğrafını yükle
   */
  const loadProfilePicture = useCallback(async (jid: string) => {
    if (!activeAccount?.id) return null;
    
    try {
      const url = await api.getProfilePicture(activeAccount.id, jid);
      if (url) {
        dispatch({ type: 'SET_PROFILE_PICTURE', payload: { jid, url } });
      }
      return url;
    } catch {
      return null;
    }
  }, [activeAccount?.id, dispatch]);
  
  /**
   * Kişi adını al
   */
  const getContactName = useCallback((jid: string): string => {
    const contact = contacts.get(jid);
    if (contact) {
      return contact.verifiedName || contact.name || contact.notify || '';
    }
    return '';
  }, [contacts]);
  
  /**
   * Filtrelenmiş kişiler
   */
  const filteredContacts = useMemo(() => {
    const contactsArray = Array.from(contacts.values());
    
    if (!searchTerm.trim()) {
      return contactsArray;
    }
    
    const search = searchTerm.toLowerCase().trim();
    const searchNormalized = normalizePhoneNumber(search);
    
    return contactsArray.filter(contact => {
      const name = (contact.name || '').toLowerCase();
      const notify = (contact.notify || '').toLowerCase();
      const verifiedName = (contact.verifiedName || '').toLowerCase();
      
      // İsim araması
      if (name.includes(search) || notify.includes(search) || verifiedName.includes(search)) {
        return true;
      }
      
      // Telefon numarası araması
      const phone = extractPhoneFromJid(contact.id);
      const phoneNormalized = normalizePhoneNumber(phone);
      
      if (phoneNormalized.includes(searchNormalized) || phone.includes(search)) {
        return true;
      }
      
      return false;
    });
  }, [contacts, searchTerm]);
  
  return {
    contacts,
    contactsArray: Array.from(contacts.values()),
    filteredContacts,
    isLoadingContacts,
    searchTerm,
    setSearchTerm,
    loadContacts,
    loadProfilePicture,
    getContactName,
  };
}

