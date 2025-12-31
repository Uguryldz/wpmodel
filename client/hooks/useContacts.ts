import { useState, useRef, useEffect, useCallback } from 'react';
// getContacts import'u kaldırıldı - WebSocket kullanılıyor
// getDeviceContacts API olarak kalıyor (özel endpoint)
import * as api from '../api';
import { CONTACTS_CACHE_TTL } from '../constants/appConstants';
import { normalizePhoneNumber, extractPhoneFromJid } from '../utils/contactUtils';

interface UseContactsProps {
  activeAccountId: string | undefined;
  chatProfilePictures: Map<string, string>;
  queueProfilePicture: (sessionId: string, jid: string) => void;
  profilePictureFailedRef: React.MutableRefObject<Set<string>>;
}

export function useContacts({ 
  activeAccountId, 
  chatProfilePictures, 
  queueProfilePicture,
  profilePictureFailedRef 
}: UseContactsProps) {
  const [contacts, setContacts] = useState<api.Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<api.Contact[]>([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const contactsCacheRef = useRef<Map<string, { data: Map<string, any>, timestamp: number }>>(new Map());
  const contactsProfilePicturesLoadedRef = useRef<Map<string, boolean>>(new Map()); // Hangi session için profil fotoğrafları yüklendi

  const loadContacts = async (sessionId: string, forceReload: boolean = false): Promise<Map<string, any>> => {
    try {
      // Temp session'lar için API çağrısı yapma (geçersiz session'lar)
      if (sessionId.startsWith('temp-') || sessionId.startsWith('account-')) {
        return new Map<string, any>();
      }
      
      // WebSocket'ten contacts.set event'i gelecek
      // Cache'den kontrol et
      const cached = contactsCacheRef.current.get(sessionId);
      if (!forceReload && cached) {
        return cached.data;
      }

      // WebSocket'ten contacts.set event'i bekleniyor
      
      // Eğer cache'de yoksa, WebSocket event'ini bekliyoruz
      // contacts.set event'i geldiğinde cache dolacak ve bu fonksiyon tekrar çağrılabilir
      // Cihaz rehberinden contact çekme işlemi API olarak kalıyor (özel endpoint)
      if (forceReload) {
        try {
          const deviceContacts = await api.getDeviceContacts(sessionId);
          if (deviceContacts && deviceContacts.length > 0) {
            // Cihaz rehberindeki contact'ları cache'e ekle
            const contactsMap = cached ? new Map(cached.data) : new Map<string, any>();
            deviceContacts.forEach((deviceContact: any) => {
              const existing = contactsMap.get(deviceContact.id);
              if (existing) {
                // Mevcut contact'ı güncelle (cihaz rehberindeki isim öncelikli)
                contactsMap.set(deviceContact.id, {
                  ...existing,
                  name: deviceContact.name || existing.name,
                  notify: existing.notify || deviceContact.notify,
                  verifiedName: existing.verifiedName || deviceContact.verifiedName,
                  imgUrl: existing.imgUrl || deviceContact.imgUrl,
                  status: existing.status || deviceContact.status,
                });
              } else {
                contactsMap.set(deviceContact.id, deviceContact);
              }
            });
            contactsCacheRef.current.set(sessionId, {
              data: contactsMap,
              timestamp: Date.now()
            });
            return contactsMap;
          }
        } catch (deviceError) {
          // Cihaz rehberinden contact'lar yüklenemedi
        }
      }
      
      // Cache'de yoksa boş Map döndür, WebSocket event'i gelince dolacak
      return cached ? cached.data : new Map<string, any>();
    } catch (error) {
      console.error('[useContacts] ❌ Contact\'lar yüklenemedi:', error);
      const cached = contactsCacheRef.current.get(sessionId);
      return cached ? cached.data : new Map<string, any>();
    }
  };

  const handleLoadContacts = useCallback(async () => {
    if (!activeAccountId) return;
    
    // Bu session için profil fotoğrafları zaten yüklendiyse tekrar yükleme
    const alreadyLoaded = contactsProfilePicturesLoadedRef.current.get(activeAccountId);
    
    const cached = contactsCacheRef.current.get(activeAccountId);
    if (cached && cached.data.size > 0) {
      const contactsArray = Array.from(cached.data.values());
      setContacts(contactsArray);
      setFilteredContacts(contactsArray);
      
      // Sadece ilk yüklemede profil fotoğraflarını çek
      if (!alreadyLoaded) {
        contactsArray.forEach((contact) => {
          if (!contact.imgUrl && !chatProfilePictures.has(contact.id) && !profilePictureFailedRef.current.has(contact.id)) {
            queueProfilePicture(activeAccountId, contact.id);
          }
        });
        contactsProfilePicturesLoadedRef.current.set(activeAccountId, true);
      }
    } else {
      // Cache boşsa API'den yükle
      try {
        setIsLoadingContacts(true);
        const contactsMap = await loadContacts(activeAccountId, false);
        const contactsArray = Array.from(contactsMap.values());
        setContacts(contactsArray);
        setFilteredContacts(contactsArray);
        
        // Sadece ilk yüklemede profil fotoğraflarını çek
        if (!alreadyLoaded) {
          contactsArray.forEach((contact) => {
            if (!contact.imgUrl && !chatProfilePictures.has(contact.id) && !profilePictureFailedRef.current.has(contact.id)) {
              queueProfilePicture(activeAccountId, contact.id);
            }
          });
          contactsProfilePicturesLoadedRef.current.set(activeAccountId, true);
        }
      } catch (error) {
        console.error('Kişi listesi yüklenemedi:', error);
        setContacts([]);
        setFilteredContacts([]);
      } finally {
        setIsLoadingContacts(false);
      }
    }
  }, [activeAccountId, chatProfilePictures, queueProfilePicture, profilePictureFailedRef]);

  const handleRefreshContacts = useCallback(async () => {
    if (!activeAccountId) return;

    try {
      setIsLoadingContacts(true);
      // Cihaz rehberinden contact'ları yükle (forceReload=true ile)
      const contactsMap = await loadContacts(activeAccountId, true);
      const contactsArray = Array.from(contactsMap.values());
      setContacts(contactsArray);
      setFilteredContacts(contactsArray);
      
      // Refresh'te profil fotoğraflarını tekrar yükleme (sadece yeni contact'lar için)
      // Zaten yüklenmiş olanları atla
      contactsArray.forEach((contact) => {
        if (!contact.imgUrl && 
            !chatProfilePictures.has(contact.id) && 
            !profilePictureFailedRef.current.has(contact.id)) {
          queueProfilePicture(activeAccountId, contact.id);
        }
      });
    } catch (error) {
      console.error('[useContacts] ❌ Kişi listesi yenilenemedi:', error);
    } finally {
      setIsLoadingContacts(false);
    }
  }, [activeAccountId, chatProfilePictures, queueProfilePicture, profilePictureFailedRef, loadContacts]);

  const handleOpenContactSelector = useCallback(async () => {
    if (!activeAccountId) return;
    
    // Bu session için profil fotoğrafları zaten yüklendiyse tekrar yükleme
    const alreadyLoaded = contactsProfilePicturesLoadedRef.current.get(activeAccountId);
    
    const cached = contactsCacheRef.current.get(activeAccountId);
    if (cached && cached.data.size > 0) {
      const contactsArray = Array.from(cached.data.values());
      setContacts(contactsArray);
      setFilteredContacts(contactsArray);
      
      // Sadece ilk yüklemede profil fotoğraflarını çek
      if (!alreadyLoaded) {
        contactsArray.forEach((contact) => {
          if (!contact.imgUrl && !chatProfilePictures.has(contact.id) && !profilePictureFailedRef.current.has(contact.id)) {
            queueProfilePicture(activeAccountId, contact.id);
          }
        });
        contactsProfilePicturesLoadedRef.current.set(activeAccountId, true);
      }
    } else {
      // Cache boşsa API'den yükle
      try {
        setIsLoadingContacts(true);
        const contactsMap = await loadContacts(activeAccountId, false);
        const contactsArray = Array.from(contactsMap.values());
        setContacts(contactsArray);
        setFilteredContacts(contactsArray);
        
        // Sadece ilk yüklemede profil fotoğraflarını çek
        if (!alreadyLoaded) {
          contactsArray.forEach((contact) => {
            if (!contact.imgUrl && !chatProfilePictures.has(contact.id) && !profilePictureFailedRef.current.has(contact.id)) {
              queueProfilePicture(activeAccountId, contact.id);
            }
          });
          contactsProfilePicturesLoadedRef.current.set(activeAccountId, true);
        }
      } catch (error) {
        console.error('Kişi listesi yüklenemedi:', error);
        setContacts([]);
        setFilteredContacts([]);
      } finally {
        setIsLoadingContacts(false);
      }
    }
  }, [activeAccountId, chatProfilePictures, queueProfilePicture, profilePictureFailedRef]);

  // Contact arama (telefon numarası wildcard desteği ile)
  useEffect(() => {
    if (!contactSearchTerm.trim()) {
      setFilteredContacts(contacts);
    } else {
      const search = contactSearchTerm.toLowerCase().trim();
      const searchNormalized = normalizePhoneNumber(search);
      
      const filtered = contacts.filter(contact => {
        const name = (contact.name || '').toLowerCase();
        const notify = (contact.notify || '').toLowerCase();
        const verifiedName = (contact.verifiedName || '').toLowerCase();
        
        if (name.includes(search) || notify.includes(search) || verifiedName.includes(search)) {
          return true;
        }
        
        const phoneFromJid = extractPhoneFromJid(contact.id);
        const phoneNormalized = normalizePhoneNumber(phoneFromJid);
        
        if (/^[\d\s\*\-\(\)]+$/.test(contactSearchTerm)) {
          const searchPattern = searchNormalized.replace(/\*/g, '.*');
          const regex = new RegExp(searchPattern, 'i');
          
          if (regex.test(phoneNormalized)) {
            return true;
          }
          
          const phoneFormatted1 = phoneFromJid.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
          const phoneFormatted2 = phoneFromJid.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2$3');
          const phoneFormatted3 = phoneFromJid.replace(/(\d{4})(\d{3})(\d{4})/, '$1$2 $3');
          
          if (regex.test(normalizePhoneNumber(phoneFormatted1)) || 
              regex.test(normalizePhoneNumber(phoneFormatted2)) || 
              regex.test(normalizePhoneNumber(phoneFormatted3))) {
            return true;
          }
        }
        
        const id = (contact.id || '').toLowerCase();
        if (id.includes(search)) {
          return true;
        }
        
        return false;
      });
      setFilteredContacts(filtered);
    }
  }, [contactSearchTerm, contacts]);

  return {
    contacts,
    setContacts,
    filteredContacts,
    setFilteredContacts,
    contactSearchTerm,
    setContactSearchTerm,
    isLoadingContacts,
    contactsCacheRef,
    loadContacts,
    handleLoadContacts,
    handleRefreshContacts,
    handleOpenContactSelector,
  };
}
