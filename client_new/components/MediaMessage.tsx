// ============================================
// Media Message Component
// ============================================

import { Image, Video, File, Music, Download, Loader2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { downloadMediaMessage } from '../api/media';
import { getCachedMediaUrl, setCachedMediaUrl, getMessageId } from '../utils/mediaCache';
import type { Message } from '../types';

interface MediaMessageProps {
  message: Message | any;
  fromMe: boolean;
  sessionId?: string;
}

export default function MediaMessage({ message, fromMe, sessionId }: MediaMessageProps) {
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  
  const messageType = message.type || (message.message ? Object.keys(message.message)[0] : 'unknown');
  const mediaData = message.message?.[messageType] || message[messageType];
  
  // Thumbnail URL'ini hazırla (resim ve video için)
  useEffect(() => {
    let thumbnailBlobUrl: string | null = null;
    
    if (messageType === 'imageMessage' || messageType === 'image' || messageType === 'videoMessage' || messageType === 'video') {
      // Thumbnail'i base64'ten blob URL'e çevir
      const thumbnailBase64 = mediaData?.jpegThumbnail || mediaData?.thumbnailUrl || message.message?.imageMessage?.jpegThumbnail || message.message?.videoMessage?.jpegThumbnail;
      
      if (thumbnailBase64) {
        try {
          // Base64 string olabilir veya Buffer olabilir
          let base64String = '';
          if (typeof thumbnailBase64 === 'string') {
            base64String = thumbnailBase64;
          } else if (thumbnailBase64.data) {
            base64String = thumbnailBase64.data;
          } else if (Buffer.isBuffer(thumbnailBase64)) {
            base64String = thumbnailBase64.toString('base64');
          }
          
          // Base64 prefix kontrolü ve temizleme
          if (base64String) {
            // data:image/jpeg;base64, prefix'ini kaldır
            if (base64String.includes(',')) {
              base64String = base64String.split(',')[1];
            }
            
            // Base64 string'i temizle (whitespace'leri kaldır)
            base64String = base64String.trim();
            
            if (!base64String.startsWith('data:')) {
              try {
                // Base64 decode
                const byteCharacters = atob(base64String);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/jpeg' });
                thumbnailBlobUrl = URL.createObjectURL(blob);
                setThumbnailUrl(thumbnailBlobUrl);
              } catch (decodeError) {
                // Thumbnail decode edilemezse null bırak, tam resim yüklenecek
                setThumbnailUrl(null);
              }
            } else if (base64String.startsWith('data:')) {
              setThumbnailUrl(base64String);
            }
          }
        } catch (error) {
          // Thumbnail oluşturulamadı (sessizce handle edildi)
          setThumbnailUrl(null);
        }
      } else {
        // Thumbnail yoksa null set et
        setThumbnailUrl(null);
      }
    }
    
    // Cleanup: component unmount olduğunda blob URL'leri temizle
    return () => {
      if (thumbnailBlobUrl && thumbnailBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(thumbnailBlobUrl);
      }
    };
  }, [messageType, mediaData, message]);

  // Medya URL'ini yükle (cache kontrolü ile)
  useEffect(() => {
    if (!sessionId) return;
    
    // Mesaj ID'sini al
    const msgId = getMessageId(message);
    
    // Önce cache'den kontrol et
    const cachedUrl = getCachedMediaUrl(msgId);
    if (cachedUrl) {
      // Cache'den bulundu, direkt kullan
      setMediaUrl(cachedUrl);
      setImageLoaded(false);
      return;
    }
    
    // Resim mesajları için: thumbnail varsa önce onu göster, yoksa direkt tam resmi yükle
    const isImageMessage = messageType === 'imageMessage' || messageType === 'image';
    const shouldLoadImage = isImageMessage && !thumbnailUrl; // Thumbnail yoksa direkt yükle
    
    // Video, audio, document, sticker için her zaman yükle
    const isOtherMedia = ['videoMessage', 'video', 'audioMessage', 'audio', 'ptt', 'documentMessage', 'document', 'stickerMessage', 'sticker'].includes(messageType);
    
    // Backend'den indir
    if ((shouldLoadImage || isOtherMedia) && !mediaUrl && !isLoading && !imageError && !videoError && !audioError) {
      setIsLoading(true);
      
      // Gelişmiş medya indirme kullan (zaten decrypt edilmiş medya döner)
      downloadMediaMessage(sessionId, message)
        .then(url => {
          if (url) {
            // Cache'e kaydet
            setCachedMediaUrl(msgId, url);
            setMediaUrl(url);
            setImageLoaded(false); // Reset image loaded state
          } else {
            // Medya URL alınamadı
            if (isImageMessage) setImageError(true);
            if (isOtherMedia) {
              setVideoError(true);
              setAudioError(true);
            }
          }
        })
        .catch((error) => {
          // Medya indirme hatası
          if (isImageMessage) setImageError(true);
          if (isOtherMedia) {
            setVideoError(true);
            setAudioError(true);
          }
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [sessionId, message, messageType, mediaUrl, isLoading, imageError, videoError, audioError, thumbnailUrl]);
  
  // ESC tuşu ile modal'ı kapat
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showImageModal) {
        setShowImageModal(false);
        setModalImageUrl(null);
      }
    };
    
    if (showImageModal) {
      document.addEventListener('keydown', handleEscape);
      // Body scroll'u engelle
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [showImageModal]);

  // Resim mesajı
  if (messageType === 'imageMessage' || messageType === 'image') {
    const caption = mediaData?.caption || message.caption || '';
    const mimetype = mediaData?.mimetype || message.message?.imageMessage?.mimetype || 'image/jpeg';
    
    // Thumbnail varsa önce onu göster, yoksa tam resmi göster
    const displayImage = thumbnailUrl && !imageLoaded ? thumbnailUrl : mediaUrl;
    const isShowingThumbnail = thumbnailUrl && !imageLoaded && !mediaUrl;
    
    // Thumbnail'e tıklandığında tam resmi yükle
    const handleThumbnailClick = () => {
      const msgId = getMessageId(message);
      const cachedUrl = getCachedMediaUrl(msgId);
      
      if (cachedUrl) {
        // Cache'den bulundu
        setMediaUrl(cachedUrl);
        return;
      }
      
      if (!mediaUrl && sessionId && !isLoading) {
        setIsLoading(true);
        downloadMediaMessage(sessionId, message)
          .then(url => {
            if (url) {
              // Cache'e kaydet
              setCachedMediaUrl(msgId, url);
              setMediaUrl(url);
            } else {
              setImageError(true);
            }
          })
          .catch((error) => {
            // Tam resim yükleme hatası
            setImageError(true);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    };
    
    // Popup/modal açmak için
    const openImageModal = async () => {
      const imageToOpen = mediaUrl || displayImage;
      if (!imageToOpen) return;
      
      try {
        // Blob URL'den blob'u al ve data URL'e çevir
        const response = await fetch(imageToOpen);
        const blob = await response.blob();
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          setModalImageUrl(dataUrl);
          setShowImageModal(true);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        // Resim açılamadı - Fallback: blob URL'i direkt kullan
        setModalImageUrl(imageToOpen);
        setShowImageModal(true);
      }
    };
    
    // Modal'ı kapat
    const closeImageModal = () => {
      setShowImageModal(false);
      setModalImageUrl(null);
    };
    
    // Loading durumu
    if (isLoading && !displayImage) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 p-4 bg-gray-100 rounded-lg">
          <Loader2 size={20} className="animate-spin" />
          <span>Yükleniyor...</span>
        </div>
      );
    }
    
    // Hata durumu
    if (!displayImage && imageError) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 p-2 bg-gray-100 rounded-lg">
          <Image size={20} />
          <span>{caption || '[Resim yüklenemedi]'}</span>
        </div>
      );
    }
    
    // Henüz yüklenmemiş durumu
    if (!displayImage && !isLoading) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 p-2 bg-gray-100 rounded-lg">
          <Image size={20} />
          <span>{caption || '[Resim]'}</span>
        </div>
      );
    }
    
    return (
      <div className="space-y-1">
        <div className="relative">
          {isShowingThumbnail && isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 rounded-lg z-10">
              <Loader2 size={20} className="animate-spin text-gray-500" />
            </div>
          )}
          {displayImage ? (
            <img
              src={displayImage}
              alt={caption || 'Resim'}
              className={`max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity ${
                isShowingThumbnail ? 'blur-sm opacity-70' : ''
              }`}
              onError={() => {
                if (isShowingThumbnail) {
                  // Thumbnail hata verirse direkt tam resmi yükle
                  handleThumbnailClick();
                } else {
                  // Resim yüklenemedi
                  setImageError(true);
                }
              }}
              style={{ maxHeight: '400px', width: 'auto' }}
              onClick={isShowingThumbnail ? handleThumbnailClick : openImageModal}
              onLoad={() => {
                // Tam resim yüklendiğinde
                if (mediaUrl && !imageLoaded) {
                  setImageLoaded(true);
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center p-8 bg-gray-100 rounded-lg">
              <Image size={32} className="text-gray-400" />
            </div>
          )}
        </div>
        {caption && (
          <div className="text-sm text-gray-700 mt-1">{caption}</div>
        )}
        
        {/* Resim Popup Modal */}
        {showImageModal && modalImageUrl && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-95 p-4 animate-in fade-in duration-200"
            onClick={closeImageModal}
          >
            <div 
              className="relative max-w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Kapat butonu */}
              <button
                onClick={closeImageModal}
                className="absolute top-4 right-4 z-10 p-2 bg-black bg-opacity-60 hover:bg-opacity-80 rounded-full text-white transition-all hover:scale-110"
                aria-label="Kapat (ESC)"
                title="Kapat (ESC)"
              >
                <X size={24} />
              </button>
              
              {/* Resim */}
              <img
                src={modalImageUrl}
                alt={caption || 'Resim'}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                style={{ width: 'auto', height: 'auto' }}
                onClick={(e) => e.stopPropagation()} // Resme tıklayınca kapanmasın
              />
              
              {/* Caption */}
              {caption && (
                <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-70 text-white p-3 rounded-lg backdrop-blur-sm">
                  <div className="text-sm font-medium">{caption}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Video mesajı
  if (messageType === 'videoMessage' || messageType === 'video') {
    const caption = mediaData?.caption || message.caption || '';
    const thumbnail = mediaData?.jpegThumbnail || mediaData?.thumbnailUrl;
    
    if (isLoading) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 p-4 bg-gray-100 rounded-lg">
          <Loader2 size={20} className="animate-spin" />
          <span>Yükleniyor...</span>
        </div>
      );
    }
    
    if (!mediaUrl && videoError) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 p-4 bg-gray-100 rounded-lg">
          <Video size={24} />
          <span>{caption || '[Video yüklenemedi]'}</span>
        </div>
      );
    }
    
    if (!mediaUrl) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 p-4 bg-gray-100 rounded-lg">
          <Video size={24} />
          <span>{caption || '[Video]'}</span>
        </div>
      );
    }
    
    return (
      <div className="space-y-1">
        <video
          src={mediaUrl}
          controls
          className="max-w-full rounded-lg"
          poster={thumbnail}
          onError={() => setVideoError(true)}
          style={{ maxHeight: '400px' }}
        />
        {caption && (
          <div className="text-sm text-gray-700">{caption}</div>
        )}
      </div>
    );
  }
  
  // Ses mesajı
  if (messageType === 'audioMessage' || messageType === 'audio' || messageType === 'ptt') {
    const duration = mediaData?.seconds || mediaData?.duration;
    
    if (isLoading) {
      return (
        <div className="flex items-center space-x-3 p-3 bg-gray-100 rounded-lg">
          <Loader2 size={20} className="animate-spin text-gray-600" />
          <span className="text-sm text-gray-500">Yükleniyor...</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center space-x-3 p-3 bg-gray-100 rounded-lg">
        <Music size={24} className="text-gray-600" />
        {mediaUrl && !audioError ? (
          <audio src={mediaUrl} controls className="flex-1" onError={() => setAudioError(true)} />
        ) : (
          <div className="flex-1">
            <div className="text-sm text-gray-700">[Ses mesajı]</div>
            {duration && (
              <div className="text-xs text-gray-500">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</div>
            )}
          </div>
        )}
      </div>
    );
  }
  
  // Dosya mesajı
  if (messageType === 'documentMessage' || messageType === 'document') {
    const fileName = mediaData?.fileName || mediaData?.title || 'Dosya';
    const fileSize = mediaData?.fileLength || mediaData?.fileSize;
    const fileUrl = mediaData?.url || message.mediaUrl;
    const mimeType = mediaData?.mimetype || '';
    
    const formatFileSize = (bytes: number) => {
      if (!bytes) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };
    
    return (
      <div className="flex items-center space-x-3 p-3 bg-gray-100 rounded-lg">
        <File size={24} className="text-gray-600" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{fileName}</div>
          {fileSize && (
            <div className="text-xs text-gray-500">{formatFileSize(fileSize)}</div>
          )}
        </div>
        {fileUrl && (
          <a
            href={fileUrl}
            download={fileName}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            title="İndir"
          >
            <Download size={18} className="text-gray-600" />
          </a>
        )}
      </div>
    );
  }
  
  // Sticker mesajı
  if (messageType === 'stickerMessage' || messageType === 'sticker') {
    const mimetype = mediaData?.mimetype || message.message?.stickerMessage?.mimetype || 'image/webp';
    
    // Sticker'ı yeni sekmede açmak için data URL oluştur
    const openStickerInNewTab = async () => {
      if (!mediaUrl) return;
      
      try {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const newWindow = window.open();
          if (newWindow) {
            newWindow.document.write(`
              <html>
                <head><title>Sticker</title></head>
                <body style="margin:0;padding:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;">
                  <img src="${dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain;" />
                </body>
              </html>
            `);
          }
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        // Sticker açılamadı
        window.open(mediaUrl, '_blank');
      }
    };
    
    if (isLoading) {
      return (
        <div className="flex justify-center items-center p-4">
          <Loader2 size={20} className="animate-spin text-gray-500" />
        </div>
      );
    }
    
    return (
      <div className="flex justify-center">
        {mediaUrl ? (
          <img
            src={mediaUrl}
            alt="Sticker"
            className="max-w-[200px] max-h-[200px] cursor-pointer hover:opacity-90 transition-opacity"
            onClick={openStickerInNewTab}
          />
        ) : (
          <div className="text-gray-500 text-sm">[Sticker]</div>
        )}
      </div>
    );
  }
  
  return null;
}
