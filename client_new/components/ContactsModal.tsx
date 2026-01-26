// ============================================
// Contacts Modal Component
// ============================================

import React from 'react';
import { X, Loader2, RefreshCcw, Users } from 'lucide-react';
import type { Contact } from '../types';
import { extractPhoneFromJid } from '../utils/jid';

interface ContactsModalProps {
  isOpen: boolean;
  contacts: Contact[];
  filteredContacts: Contact[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isLoading: boolean;
  profilePictures: Map<string, string>;
  onRefresh: () => void;
  onSelectContact?: (contact: Contact) => void;
  onClose: () => void;
}

export function ContactsModal({
  isOpen,
  contacts,
  filteredContacts,
  searchTerm,
  onSearchChange,
  isLoading,
  profilePictures,
  onRefresh,
  onSelectContact,
  onClose,
}: ContactsModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[600px] flex flex-col pointer-events-auto animate-in">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-green-50 to-white rounded-t-xl flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Kişi Listesi</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {contacts.length} kişi
                {filteredContacts.length !== contacts.length && ` (${filteredContacts.length} gösteriliyor)`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Search and Refresh */}
          {!isLoading && contacts.length > 0 && (
            <div className="p-3 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Kişi ara (isim, telefon)..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="px-3 py-2 text-sm flex items-center gap-1.5 border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Kişileri Yenile"
              >
                <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Yenile</span>
              </button>
            </div>
          )}
          
          {/* Contact List */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-3" />
                <p className="text-gray-500 text-sm">Kişiler yükleniyor...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Users className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 text-sm font-medium">Kişi bulunamadı</p>
                <p className="text-gray-400 text-xs mt-1">Henüz kayıtlı kişi yok</p>
                <button
                  onClick={onRefresh}
                  className="mt-4 px-4 py-2 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                >
                  Yeniden Dene
                </button>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Users className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 text-sm font-medium">Arama sonucu bulunamadı</p>
                <p className="text-gray-400 text-xs mt-1">"{searchTerm}" için sonuç yok</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredContacts.map((contact) => {
                  const phoneNumber = extractPhoneFromJid(contact.id);
                  const profilePicture = profilePictures.get(contact.id) || contact.imgUrl;
                  const hasProfilePicture = profilePicture && profilePicture !== '' && profilePicture !== 'NO_PICTURE';
                  
                  // İsim önceliği: cihaz rehberi > WhatsApp ismi > verified name > telefon
                  const displayName = contact.name || contact.notify || contact.verifiedName || phoneNumber;
                  const showPhoneNumber = !!(contact.name || contact.notify || contact.verifiedName);
                  
                  return (
                    <div
                      key={contact.id}
                      onClick={() => {
                        if (onSelectContact) {
                          onSelectContact(contact);
                          onClose();
                        }
                      }}
                      className="p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        {/* Profile Picture or Avatar */}
                        <div className="relative flex-shrink-0">
                          {hasProfilePicture ? (
                            <img
                              src={profilePicture}
                              alt={displayName}
                              className="w-11 h-11 rounded-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const sibling = target.nextElementSibling as HTMLElement;
                                if (sibling) sibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div 
                            className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm ${
                              hasProfilePicture ? 'hidden' : ''
                            }`}
                            style={{
                              backgroundColor: `hsl(${(contact.id.charCodeAt(0) * 137.508) % 360}, 65%, 55%)`
                            }}
                          >
                            {displayName[0]?.toUpperCase() || '?'}
                          </div>
                        </div>
                        
                        {/* Contact Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 truncate group-hover:text-green-600 transition-colors" title={displayName}>
                            {displayName}
                          </div>
                          {showPhoneNumber && (
                            <div className="text-xs text-gray-500 truncate" title={phoneNumber}>
                              {phoneNumber}
                            </div>
                          )}
                          {contact.status && (
                            <div className="text-xs text-gray-400 truncate mt-0.5">
                              {contact.status}
                            </div>
                          )}
                        </div>

                        {/* Verified Badge */}
                        {contact.verifiedName && (
                          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}