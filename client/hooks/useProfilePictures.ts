import { useState, useRef } from 'react';
import * as api from '../api';
import { PROFILE_PICTURE_BATCH_SIZE, PROFILE_PICTURE_DEBOUNCE_MS, PROFILE_PICTURE_BATCH_DELAY_MS } from '../constants/appConstants';

export function useProfilePictures() {
  const [chatProfilePictures, setChatProfilePictures] = useState<Map<string, string>>(new Map());
  const profilePictureQueueRef = useRef<Map<string, Set<string>>>(new Map());
  const profilePictureLoadingRef = useRef<boolean>(false);
  const profilePictureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profilePictureFailedRef = useRef<Set<string>>(new Set());
  const profilePicturesQueuedRef = useRef<Set<string>>(new Set()); // Zaten queue'ya eklenmiş jid'leri takip et
  const profilePicturesLoadedRef = useRef<Map<string, boolean>>(new Map()); // Hangi session için profil fotoğrafları yüklendi

  // Profil resimlerini batch olarak yükle (debounce ile)
  // Öncelik: contacts.upsert event'inden gelen imgUrl (WebSocket)
  // Fallback: API'den yükleme (sadece gerektiğinde)
  const loadProfilePicturesBatch = async (sessionId: string) => {
    if (profilePictureLoadingRef.current) return;
    
    const queue = profilePictureQueueRef.current.get(sessionId);
    if (!queue || queue.size === 0) return;

    profilePictureLoadingRef.current = true;
    
    // Queue'dan jid'leri al ve temizle
    const jidsToLoad = Array.from(queue);
    profilePictureQueueRef.current.delete(sessionId);

    // Batch olarak yükle (sadece fallback olarak API'den)
    // contacts.upsert event'inden gelen imgUrl'ler zaten cache'e yazılıyor
    const batchSize = PROFILE_PICTURE_BATCH_SIZE;
    const jidsNeedingApi = jidsToLoad.filter(jid => !chatProfilePictures.has(jid));
    
    // Sadece cache'de olmayan profil resimlerini API'den yükle
    for (let i = 0; i < jidsNeedingApi.length; i += batchSize) {
      const batch = jidsNeedingApi.slice(i, i + batchSize);
      
      // Paralel olarak yükle (fallback için API)
      await Promise.allSettled(
        batch.map(jid => {
          // Cache'de zaten varsa atla (contacts.upsert'ten gelmiş olabilir)
          if (chatProfilePictures.has(jid)) {
            const queueKey = `${sessionId}:${jid}`;
            profilePicturesQueuedRef.current.delete(queueKey);
            return Promise.resolve();
          }
          
          // Fallback: API'den yükle
          return api.getProfilePicture(sessionId, jid)
            .then(pictureUrl => {
              const queueKey = `${sessionId}:${jid}`;
              profilePicturesQueuedRef.current.delete(queueKey);
              
              if (pictureUrl) {
                setChatProfilePictures(prev => new Map(prev).set(jid, pictureUrl));
                profilePictureFailedRef.current.delete(jid);
              } else {
                setChatProfilePictures(prev => new Map(prev).set(jid, 'NO_PICTURE'));
                profilePictureFailedRef.current.add(jid);
              }
            })
            .catch(() => {
              const queueKey = `${sessionId}:${jid}`;
              profilePicturesQueuedRef.current.delete(queueKey);
              
              setChatProfilePictures(prev => new Map(prev).set(jid, 'NO_PICTURE'));
              profilePictureFailedRef.current.add(jid);
            });
        })
      );
      
      // Her batch arasında kısa bir bekleme (rate limiting)
      if (i + batchSize < jidsNeedingApi.length) {
        await new Promise(resolve => setTimeout(resolve, PROFILE_PICTURE_BATCH_DELAY_MS));
      }
    }
    
    // Cache'de zaten olan jid'leri queue'dan temizle
    jidsToLoad.forEach(jid => {
      if (chatProfilePictures.has(jid)) {
        const queueKey = `${sessionId}:${jid}`;
        profilePicturesQueuedRef.current.delete(queueKey);
      }
    });

    profilePictureLoadingRef.current = false;
  };

  // Profil resmi yükleme isteğini queue'ya ekle (debounce ile)
  const queueProfilePicture = (sessionId: string, jid: string) => {
    // Eğer zaten yüklenmişse, yükleniyorsa, başarısız olmuşsa veya zaten queue'da ise, atla
    if (chatProfilePictures.has(jid)) return;
    if (profilePictureFailedRef.current.has(jid)) return;
    
    // Bu jid zaten queue'ya eklenmiş mi kontrol et
    const queueKey = `${sessionId}:${jid}`;
    if (profilePicturesQueuedRef.current.has(queueKey)) return;
    
    // Queue'ya ekle
    if (!profilePictureQueueRef.current.has(sessionId)) {
      profilePictureQueueRef.current.set(sessionId, new Set());
    }
    profilePictureQueueRef.current.get(sessionId)!.add(jid);
    profilePicturesQueuedRef.current.add(queueKey); // Queue'ya eklendiğini işaretle

    // Debounce: belirli süre sonra batch yükle
    if (profilePictureTimeoutRef.current) {
      clearTimeout(profilePictureTimeoutRef.current);
    }
    
    profilePictureTimeoutRef.current = setTimeout(() => {
      loadProfilePicturesBatch(sessionId);
    }, PROFILE_PICTURE_DEBOUNCE_MS);
  };

  return {
    chatProfilePictures,
    setChatProfilePictures,
    queueProfilePicture,
    profilePictureFailedRef,
  };
}
