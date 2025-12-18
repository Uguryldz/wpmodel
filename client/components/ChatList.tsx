import React from 'react';
import { Search, Edit2, Users, MoreVertical, LogOut, VolumeX, RefreshCcw } from 'lucide-react';
import * as api from '../api';
import { extractPhoneFromJid } from '../utils/contactUtils';

interface Account {
  id: string;
  name: string;
  status?: string;
  color: string;
  active: boolean;
}

interface Chat {
  id: string;
  name: string;
  unreadCount?: number;
  conversationTimestamp?: number | null;
  isMuted?: boolean;
  lastMessage?: string;
  time?: string;
  profilePicture?: string;
  verifiedName?: string | null;
  archived?: boolean;
}

interface ChatListProps {
  activeAccount: Account | undefined;
  chats: Chat[];
  selectedChat: Chat | null;
  chatFilter: 'all' | 'unread' | 'groups' | 'archived';
  chatSearchTerm: string;
  editingAccountId: string | null;
  editingAccountName: string;
  showAccountMenu: boolean;
  onSelectChat: (chat: Chat) => void;
  onChatFilterChange: (filter: 'all' | 'unread' | 'groups' | 'archived') => void;
  onChatSearchChange: (term: string) => void;
  onStartEditingAccount: (account: Account) => void;
  onEditingAccountNameChange: (name: string) => void;
  onRenameAccount: (accountId: string, newName: string) => void;
  onOpenContactSelector: () => void;
  onOpenContactsModal?: () => void;
  onShowAccountMenu: (show: boolean) => void;
  onLogout: () => void;
}

export default function ChatList({
  activeAccount,
  chats,
  selectedChat,
  chatFilter,
  chatSearchTerm,
  editingAccountId,
  editingAccountName,
  showAccountMenu,
  onSelectChat,
  onChatFilterChange,
  onChatSearchChange,
  onStartEditingAccount,
  onEditingAccountNameChange,
  onRenameAccount,
  onOpenContactSelector,
  onOpenContactsModal,
  onShowAccountMenu,
  onLogout,
}: ChatListProps) {
  if (!activeAccount) {
    return (
      <div className="w-96 bg-white border-r flex flex-col">
        <div className="p-4 text-center text-gray-500 text-sm">
          Hesap seçin
        </div>
      </div>
    );
  }

  const filteredChats = chats.filter(chat => {
    // Filtreleme
    if (chatFilter === 'all') {
      if (chat.archived) return false;
    } else if (chatFilter === 'unread') {
      if (!chat.unreadCount || chat.unreadCount === 0) return false;
      if (chat.archived) return false;
    } else if (chatFilter === 'groups') {
      if (!chat.id.includes('@g.us')) return false;
      if (chat.archived) return false;
    } else if (chatFilter === 'archived') {
      if (!chat.archived) return false;
    }
    
    // Arama filtresi
    if (chatSearchTerm.trim()) {
      const search = chatSearchTerm.toLowerCase();
      const name = (chat.name || '').toLowerCase();
      const lastMessage = (chat.lastMessage || '').toLowerCase();
      if (!name.includes(search) && !lastMessage.includes(search)) {
        return false;
      }
    }
    
    return true;
  });

  return (
    <div className="w-96 bg-white border-r flex flex-col">
      {/* Header */}
      <div className="bg-gray-100 p-3 flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-full ${activeAccount.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
            {activeAccount.name[0].toUpperCase()}
          </div>
          <div className="text-sm flex-1 min-w-0">
            <div className="font-semibold truncate">{activeAccount.name}</div>
            <div className="text-gray-500 text-xs truncate" title={activeAccount.id}>
              ID: {activeAccount.id}
            </div>
            {activeAccount.status === 'open' && (
              <div className="text-gray-400 text-xs">Bağlı</div>
            )}
          </div>
          {editingAccountId === activeAccount.id ? (
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={editingAccountName}
                onChange={(e) => onEditingAccountNameChange(e.target.value)}
                onBlur={() => onRenameAccount(activeAccount.id, editingAccountName)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    onRenameAccount(activeAccount.id, editingAccountName);
                  }
                }}
                className="text-xs px-2 py-1 border rounded"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => onStartEditingAccount(activeAccount)}
              className="text-gray-500 hover:text-gray-700 flex-shrink-0"
              title="Yeniden Adlandır"
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>
        <div className="flex space-x-4 text-gray-600 relative account-menu-container">
          <button 
            onClick={onOpenContactsModal || onOpenContactSelector}
            className="hover:text-gray-800"
            title="Kişi Listesi"
          >
            <Users size={20} />
          </button>
          <button 
            onClick={() => onShowAccountMenu(!showAccountMenu)}
            className="hover:text-gray-800 relative account-menu-container"
          >
            <MoreVertical size={20} />
            {showAccountMenu && (
              <div className="absolute right-0 top-8 bg-white rounded-lg shadow-2xl py-2 w-48 z-50 border">
                <button
                  onClick={onLogout}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2 text-red-600"
                >
                  <LogOut size={16} />
                  <span>Çıkış Yap</span>
                </button>
                <button
                  onClick={() => {
                    console.log('Sessize al:', activeAccount.id);
                    onShowAccountMenu(false);
                    alert('Sessize al özelliği yakında eklenecek');
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
                >
                  <VolumeX size={16} />
                  <span>Sessize Al</span>
                </button>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Filtre Butonları */}
      <div className="px-2 pt-2 pb-1 bg-white border-b">
        <div className="flex space-x-1">
          <button
            onClick={() => onChatFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              chatFilter === 'all'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tümü
          </button>
          <button
            onClick={() => onChatFilterChange('unread')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              chatFilter === 'unread'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Okunmamış
          </button>
          <button
            onClick={() => onChatFilterChange('groups')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              chatFilter === 'groups'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Gruplar
          </button>
          <button
            onClick={() => onChatFilterChange('archived')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              chatFilter === 'archived'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Arşiv
          </button>
        </div>
      </div>

      {/* Arama */}
      <div className="p-2 bg-white">
        <div className="bg-gray-100 rounded-lg px-4 py-2 flex items-center">
          <Search size={18} className="text-gray-500" />
          <input
            type="text"
            placeholder="Ara veya yeni sohbet başlat"
            value={chatSearchTerm}
            onChange={(e) => onChatSearchChange(e.target.value)}
            className="bg-transparent ml-3 outline-none flex-1 text-sm"
          />
        </div>
      </div>

      {/* Sohbet Listesi */}
      <div className="flex-1 overflow-y-auto">
        {activeAccount.status !== 'open' ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            Hesap bağlantısı bekleniyor...
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {chatFilter === 'archived' ? 'Arşivlenmiş sohbet yok' : 'Henüz sohbet yok'}
          </div>
        ) : (
          filteredChats.map(chat => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className={`p-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer border-b ${
                selectedChat?.id === chat.id ? 'bg-gray-100' : ''
              }`}
            >
              <div className="relative flex-shrink-0">
                {chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? (
                  <img
                    src={chat.profilePicture} 
                    alt={chat.name}
                    className="w-12 h-12 rounded-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        const fallback = parent.querySelector('.profile-fallback') as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div 
                  className={`w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center text-2xl profile-fallback ${chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? 'hidden' : ''}`}
                >
                  {chat.name[0]?.toUpperCase() || '?'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {chat.name}
                    </div>
                    {!chat.id.includes('@g.us') && (
                      <div className="text-xs text-gray-400 truncate">
                        {extractPhoneFromJid(chat.id)}
                      </div>
                    )}
                  </div>
                  {chat.time && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{chat.time}</span>}
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-600 truncate">{chat.lastMessage || ''}</span>
                  {chat.unreadCount && chat.unreadCount > 0 && (
                    <div className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs ml-2 flex-shrink-0">
                      {chat.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
