// ============================================
// Contact Selector Modal Component
// ============================================

import React, { useState, useMemo } from 'react';
import { X, Search, User } from 'lucide-react';
import type { Contact, Chat } from '../types';
import { cn } from '../utils';
import { extractPhoneFromJid, normalizePhoneNumber } from '../utils/jid';

interface ContactSelectorProps {
  isOpen: boolean;
  contacts: Contact[];
  chats?: Chat[];
  profilePictures?: Map<string, string>;
  title?: string;
  onSelect: (contact: Contact) => void;
  onSelectChat?: (chatId: string) => void;
  onClose: () => void;
}

export function ContactSelector({
  isOpen,
  contacts,
  chats = [],
  profilePictures = new Map(),
  title = 'Kişi Seç',
  onSelect,
  onSelectChat,
  onClose,
}: ContactSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'contacts' | 'chats'>('contacts');
  
  const filteredContacts = useMemo(() => {
    if (!searchTerm.trim()) return contacts;
    
    const search = searchTerm.toLowerCase().trim();
    const searchNormalized = normalizePhoneNumber(search);
    
    return contacts.filter(contact => {
      const name = (contact.name || '').toLowerCase();
      const notify = (contact.notify || '').toLowerCase();
      const verifiedName = (contact.verifiedName || '').toLowerCase();
      const phone = extractPhoneFromJid(contact.id);
      const phoneNormalized = normalizePhoneNumber(phone);
      
      return name.includes(search) ||
             notify.includes(search) ||
             verifiedName.includes(search) ||
             phone.includes(search) ||
             phoneNormalized.includes(searchNormalized);
    });
  }, [contacts, searchTerm]);
  
  const filteredChats = useMemo(() => {
    if (!searchTerm.trim()) return chats;
    
    const search = searchTerm.toLowerCase().trim();
    
    return chats.filter(chat => {
      const name = (chat.name || '').toLowerCase();
      return name.includes(search) || chat.id.toLowerCase().includes(search);
    });
  }, [chats, searchTerm]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-green-500 text-white p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Search */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Kişi veya sohbet ara..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          {/* Tabs */}
          {onSelectChat && chats.length > 0 && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setActiveTab('contacts')}
                className={cn(
                  'flex-1 py-2 text-sm rounded-lg transition-colors',
                  activeTab === 'contacts'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                Kişiler ({filteredContacts.length})
              </button>
              <button
                onClick={() => setActiveTab('chats')}
                className={cn(
                  'flex-1 py-2 text-sm rounded-lg transition-colors',
                  activeTab === 'chats'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                Sohbetler ({filteredChats.length})
              </button>
            </div>
          )}
        </div>
        
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'contacts' ? (
            filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <User size={48} className="mb-2" />
                <p>Kişi bulunamadı</p>
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => onSelect(contact)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  {contact.imgUrl || profilePictures.get(contact.id) ? (
                    <img
                      src={contact.imgUrl || profilePictures.get(contact.id)}
                      alt={contact.name || ''}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                      {(contact.name || contact.notify || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {/* Info */}
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-800">
                      {contact.verifiedName || contact.name || contact.notify || extractPhoneFromJid(contact.id)}
                    </p>
                    {contact.status && (
                      <p className="text-sm text-gray-500 truncate">{contact.status}</p>
                    )}
                  </div>
                </button>
              ))
            )
          ) : (
            filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <User size={48} className="mb-2" />
                <p>Sohbet bulunamadı</p>
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat?.(chat.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  {chat.profilePicture || profilePictures.get(chat.id) ? (
                    <img
                      src={chat.profilePicture || profilePictures.get(chat.id)}
                      alt={chat.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                      {chat.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {/* Info */}
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-800">{chat.name}</p>
                    {chat.lastMessage && (
                      <p className="text-sm text-gray-500 truncate">{chat.lastMessage}</p>
                    )}
                  </div>
                </button>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

