import React from 'react';
import { X, Loader2, RefreshCcw } from 'lucide-react';
import * as api from '../api';
import { extractPhoneFromJid } from '../utils/contactUtils';

interface Chat {
  id: string;
  name: string;
  verifiedName?: string | null;
  imgUrl?: string | null;
}

interface ContactSelectorProps {
  isOpen: boolean;
  contacts: api.Contact[];
  filteredContacts: api.Contact[];
  contactSearchTerm: string;
  setContactSearchTerm: (term: string) => void;
  isLoadingContacts: boolean;
  chatProfilePictures: Map<string, string>;
  forwardingMessage?: {
    text?: string;
    body?: string;
  } | null;
  chats?: Chat[];
  selectedChat?: Chat | null;
  onRefresh: () => void;
  onSelectContact: (contact: api.Contact) => void;
  onSelectChat?: (chatId: string) => void;
  onClose: () => void;
}

export default function ContactSelector({
  isOpen,
  contacts,
  filteredContacts,
  contactSearchTerm,
  setContactSearchTerm,
  isLoadingContacts,
  chatProfilePictures,
  forwardingMessage,
  chats = [],
  selectedChat,
  onRefresh,
  onSelectContact,
  onSelectChat,
  onClose,
}: ContactSelectorProps) {
  if (!isOpen) return null;

  const isForwardMode = !!forwardingMessage;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{isForwardMode ? 'Mesajı İlet' : 'Kişi Seç'}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>
        
        {isForwardMode && forwardingMessage && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border-l-4 border-green-500">
            <div className="text-xs text-gray-500 mb-1">İletilecek mesaj:</div>
            <div className="text-sm font-medium text-gray-700 mb-1">
              {forwardingMessage.fromMe ? 'Sen' : (forwardingMessage.pushName || 'Kişi')}
            </div>
            <div className="text-sm text-gray-600 break-words">
              {forwardingMessage.text || forwardingMessage.body || 'Mesaj'}
            </div>
            {forwardingMessage.timestamp && (
              <div className="text-xs text-gray-400 mt-1">
                {new Date((forwardingMessage.timestamp > 1000000000000 ? forwardingMessage.timestamp : forwardingMessage.timestamp * 1000)).toLocaleString('tr-TR')}
              </div>
            )}
          </div>
        )}

        {contacts.length === 0 && !isLoadingContacts ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center text-gray-500">
              <p>Kişi listesi yükleniyor...</p>
              <p className="text-xs mt-2">WebSocket'ten contact'lar bekleniyor</p>
            </div>
          </div>
        ) : isLoadingContacts ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-green-500" size={32} />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center space-x-2">
              <input
                type="text"
                placeholder="Kişi ara (isim, telefon: 868, *868*)..."
                value={contactSearchTerm}
                onChange={(e) => setContactSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {!isForwardMode && (
                <button
                  onClick={onRefresh}
                  disabled={isLoadingContacts}
                  className="px-3 py-2 text-sm flex items-center space-x-2 border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg disabled:opacity-60"
                >
                  <RefreshCcw size={16} />
                  <span>Yenile</span>
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {contacts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  Kişi bulunamadı
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Forward mode'da chats listesi de göster */}
                  {isForwardMode && chats && chats.filter(chat => chat.id !== selectedChat?.id).map((chat) => {
                    const profilePicture = chatProfilePictures.get(chat.id) || chat.imgUrl;
                    const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                    
                    return (
                      <div
                        key={chat.id}
                        onClick={() => onSelectChat?.(chat.id)}
                        className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          {hasProfilePicture ? (
                            <img
                              src={profilePicture}
                              alt={chat.name}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                if (target.nextElementSibling) {
                                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold ${
                            hasProfilePicture ? 'hidden' : ''
                          }`} style={{
                            backgroundColor: `hsl(${(chat.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                          }}>
                            {chat.name[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {chat.verifiedName || chat.name}
                            </div>
                            <div className="text-xs text-gray-400 truncate">{chat.id}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Contacts listesi */}
                  {filteredContacts.map((contact) => {
                    const phoneNumber = extractPhoneFromJid(contact.id);
                    const profilePicture = chatProfilePictures.get(contact.id) || contact.imgUrl;
                    const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                    
                    // Cihaz rehberindeki isim öncelikli (name alanı cihaz rehberindeki isimdir)
                    // name: Cihaz rehberindeki isim
                    // notify: WhatsApp'ta kayıtlı isim
                    const displayName = contact.name || contact.notify || contact.verifiedName || phoneNumber;
                    const showPhoneNumber = !!(contact.name || contact.notify || contact.verifiedName);
                    
                    return (
                      <div
                        key={contact.id}
                        onClick={() => onSelectContact(contact)}
                        className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          {hasProfilePicture ? (
                            <img
                              src={profilePicture}
                              alt={displayName}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                if (target.nextElementSibling) {
                                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold ${
                            hasProfilePicture ? 'hidden' : ''
                          }`} style={{
                            backgroundColor: `hsl(${(contact.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                          }}>
                            {displayName[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate" title={displayName}>
                              {displayName}
                            </div>
                            {showPhoneNumber && (
                              <div className="text-xs text-gray-400 truncate" title={phoneNumber}>
                                {phoneNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredContacts.length === 0 && contacts.length > 0 && (!isForwardMode || chats.length === 0) && (
                    <div className="text-center text-gray-500 py-4">
                      Arama sonucu bulunamadı
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
