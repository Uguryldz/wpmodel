import React from 'react';
import { X, Phone, MessageCircle, User } from 'lucide-react';
import { extractPhoneFromJid } from '../utils/contactUtils';

interface Contact {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  imgUrl?: string | null | undefined;
}

interface Chat {
  id: string;
  name: string;
  profilePicture?: string;
  verifiedName?: string | null;
}

interface ContactProfileModalProps {
  isOpen: boolean;
  contact?: Contact | null;
  chat?: Chat | null;
  profilePicture?: string;
  onClose: () => void;
  onSendMessage?: () => void;
}

export default function ContactProfileModal({
  isOpen,
  contact,
  chat,
  profilePicture,
  onClose,
  onSendMessage,
}: ContactProfileModalProps) {
  if (!isOpen) return null;

  const displayContact = contact || (chat ? {
    id: chat.id,
    name: chat.name,
    verifiedName: chat.verifiedName || undefined,
    imgUrl: chat.profilePicture,
  } : null);

  if (!displayContact) return null;

  const phoneNumber = extractPhoneFromJid(displayContact.id);
  const displayName = displayContact.name || displayContact.notify || displayContact.verifiedName || phoneNumber;
  const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Kişi Bilgileri</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            {hasProfilePicture ? (
              <img
                src={profilePicture}
                alt={displayName}
                className="w-32 h-32 rounded-full object-cover"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gray-300 flex items-center justify-center text-4xl font-semibold text-gray-600">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h3 className="text-xl font-semibold text-gray-900">{displayName}</h3>
          {displayContact.verifiedName && displayContact.verifiedName !== displayName && (
            <p className="text-sm text-gray-500 mt-1">{displayContact.verifiedName}</p>
          )}
          {phoneNumber && (
            <p className="text-sm text-gray-500 mt-1">{phoneNumber}</p>
          )}
        </div>

        <div className="space-y-2">
          {onSendMessage && (
            <button
              onClick={() => {
                onSendMessage();
                onClose();
              }}
              className="w-full flex items-center space-x-3 p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <MessageCircle size={20} />
              <span>Mesaj Gönder</span>
            </button>
          )}
          {phoneNumber && (
            <a
              href={`tel:${phoneNumber}`}
              className="w-full flex items-center space-x-3 p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Phone size={20} />
              <span>Ara</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}





