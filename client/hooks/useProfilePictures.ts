import { useState, useRef } from 'react';
import * as api from '../api';
import { PROFILE_PICTURE_BATCH_SIZE, PROFILE_PICTURE_DEBOUNCE_MS, PROFILE_PICTURE_BATCH_DELAY_MS } from '../constants/appConstants';

export function useProfilePictures() {
  const [chatProfilePictures, setChatProfilePictures] = useState<Map<string, string>>(new Map());
  const profilePictureQueueRef = useRef<Map<string, Set<string>>>(new Map());
  const profilePictureLoadingRef = useRef<boolean>(false);
  const profilePictureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profilePictureFailedRef = useRef<Set<string>>(new Set());

  // Profil resimlerini batch olarak yükle (debounce ile)
  const loadProfilePicturesBatch = async (sessionId: string) => {
    if (profilePictureLoadingRef.current) return;
    
    const queue = profilePictureQueueRef.current.get(sessionId);
    if (!queue || queue.size === 0) return;

    profilePictureLoadingRef.current = true;
    
    // Queue'dan jid'leri al ve temizle
    const jidsToLoad = Array.from(queue);
    profilePictureQueueRef.current.delete(sessionId);

    // Batch olarak yükle
    const batchSize = PROFILE_PICTURE_BATCH_SIZE;
    for (let i = 0; i < jidsToLoad.length; i += batchSize) {
      const batch = jidsToLoad.slice(i, i + batchSize);
      
      // Paralel olarak yükle
      await Promise.allSettled(
        batch.map(jid => 
          api.getProfilePicture(sessionId, jid)
            .then(pictureUrl => {
              if (pictureUrl) {
                setChatProfilePictures(prev => new Map(prev).set(jid, pictureUrl));
                profilePictureFailedRef.current.delete(jid);
              } else {
                setChatProfilePictures(prev => new Map(prev).set(jid, 'NO_PICTURE'));
                profilePictureFailedRef.current.add(jid);
              }
            })
            .catch(() => {
              setChatProfilePictures(prev => new Map(prev).set(jid, 'NO_PICTURE'));
              profilePictureFailedRef.current.add(jid);
            })
        )
      );
      
      // Her batch arasında kısa bir bekleme (rate limiting)
      if (i + batchSize < jidsToLoad.length) {
        await new Promise(resolve => setTimeout(resolve, PROFILE_PICTURE_BATCH_DELAY_MS));
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
