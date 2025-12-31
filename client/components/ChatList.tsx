import React, { useState } from 'react';
import { Search, Edit2, Users, MoreVertical, LogOut, VolumeX, Volume2, RefreshCcw, Archive, ArchiveRestore, Trash2, CheckCheck, XCircle, Pin, PinOff } from 'lucide-react';
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
  pinned?: Date | null;
  notify?: string | null; // WhatsApp'ta kayıtlı isim
  contactName?: string | null; // Cihaz rehberindeki isim (name alanı)
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
  onArchiveChat?: (chat: Chat, archive: boolean) => void;
  onDeleteChat?: (chat: Chat) => void;
  onMarkChatRead?: (chat: Chat, markRead: boolean) => void;
  onPinChat?: (chat: Chat, pin: boolean) => void;
  onMuteChat?: (chat: Chat, durationMs: number | null) => void;
  onShowContactProfile?: (chat: Chat) => void;
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
  onArchiveChat,
  onDeleteChat,
  onMarkChatRead,
  onPinChat,
  onMuteChat,
  onShowContactProfile,
}: ChatListProps) {
  const [contextMenuChat, setContextMenuChat] = useState<Chat | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
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
          <div className={`w-12 h-12 rounded-full ${activeAccount.color} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-md`}>
            {activeAccount.name[0].toUpperCase()}
          </div>
          <div className="text-sm flex-1 min-w-0">
            {editingAccountId === activeAccount.id ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editingAccountName}
                  onChange={(e) => onEditingAccountNameChange(e.target.value)}
                  onBlur={() => onRenameAccount(activeAccount.id, editingAccountName)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      onRenameAccount(activeAccount.id, editingAccountName);
                    }
                    if (e.key === 'Escape') {
                      onEditingAccountNameChange(activeAccount.name);
                      onStartEditingAccount({ ...activeAccount, id: '' });
                    }
                  }}
                  className="flex-1 px-3 py-1.5 border-2 border-blue-500 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
                  autoFocus
                  placeholder="Hesap adı girin..."
                  maxLength={30}
                />
                <button
                  onClick={() => onRenameAccount(activeAccount.id, editingAccountName)}
                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  title="Kaydet"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-2 group">
                  <div className="font-semibold truncate text-gray-800">{activeAccount.name}</div>
                  <button
                    onClick={() => onStartEditingAccount(activeAccount)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-all flex-shrink-0"
                    title="Yeniden Adlandır"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
                <div className="text-gray-500 text-xs truncate flex items-center space-x-1">
                  <span className="font-mono">{activeAccount.id}</span>
                </div>
                {activeAccount.status === 'open' && (
                  <div className="flex items-center space-x-1 text-green-600 text-xs font-medium">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Bağlı</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex space-x-2 text-gray-600 relative">
          <button 
            onClick={onOpenContactsModal || onOpenContactSelector}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors group relative"
            title="Kişi Listesi"
          >
            <Users size={20} className="group-hover:text-green-500 transition-colors" />
          </button>
          
          <div className="relative">
            <button 
              onClick={() => onShowAccountMenu(!showAccountMenu)}
              className={`p-2 hover:bg-gray-200 rounded-lg transition-colors ${showAccountMenu ? 'bg-gray-200 text-gray-800' : ''}`}
              title="Hesap Menüsü"
            >
              <MoreVertical size={20} />
            </button>
            
            {showAccountMenu && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => onShowAccountMenu(false)}
                />
                
                {/* Menu */}
                <div className="absolute right-0 top-12 bg-white rounded-xl shadow-2xl py-2 w-52 z-50 border border-gray-200 animate-fade-in">
                  {/* Header */}
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hesap İşlemleri</p>
                  </div>
                  
                  {/* Menu Items */}
                  <div className="py-1">
                    {/* <button
                      onClick={() => {
                        onShowAccountMenu(false);
                        alert('Sessize al özelliği yakında eklenecek');
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                    >
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                        <VolumeX size={16} className="text-gray-600" />
                      </div>
                      <span className="text-sm font-medium">Sessize Al</span>
                    </button> */}
                    
                    {/* <div className="my-1 border-t border-gray-100"></div> */}
                    
                    <button
                      onClick={onLogout}
                      className="w-full px-4 py-2.5 text-left hover:bg-red-50 flex items-center space-x-3 text-red-600 transition-colors group"
                    >
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100 transition-colors">
                        <LogOut size={16} className="text-red-600" />
                      </div>
                      <span className="text-sm font-medium">Çıkış Yap</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filtre Butonları */}
      <div className="px-3 pt-3 pb-2 bg-white border-b">
        <div className="flex gap-2">
          <button
            onClick={() => onChatFilterChange('all')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              chatFilter === 'all'
                ? 'bg-green-500 text-white shadow-md scale-105'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Tümü
          </button>
          <button
            onClick={() => onChatFilterChange('unread')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative ${
              chatFilter === 'unread'
                ? 'bg-green-500 text-white shadow-md scale-105'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Okunmamış
            {chatFilter !== 'unread' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></span>
            )}
          </button>
          <button
            onClick={() => onChatFilterChange('groups')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              chatFilter === 'groups'
                ? 'bg-green-500 text-white shadow-md scale-105'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Gruplar
          </button>
          <button
            onClick={() => onChatFilterChange('archived')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              chatFilter === 'archived'
                ? 'bg-green-500 text-white shadow-md scale-105'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Arşiv
          </button>
        </div>
      </div>

      {/* Arama */}
      <div className="p-3 bg-white">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Ara veya yeni sohbet başlat"
            value={chatSearchTerm}
            onChange={(e) => onChatSearchChange(e.target.value)}
            className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-green-500 rounded-lg pl-10 pr-10 py-2.5 outline-none text-sm transition-all duration-200 placeholder:text-gray-400"
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
              onDoubleClick={() => {
                if (!chat.id.includes('@g.us') && onShowContactProfile) {
                  onShowContactProfile(chat);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuChat(chat);
                setContextMenuPosition({ x: e.clientX, y: e.clientY });
              }}
              className={`p-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 relative transition-all duration-200 group ${
                selectedChat?.id === chat.id ? 'bg-green-50 border-l-4 border-l-green-500' : ''
              } ${chat.pinned ? 'bg-blue-50/50' : ''}`}
            >
              {chat.pinned && (
                <Pin size={14} className="absolute top-1 right-1 text-blue-500" />
              )}
              <div className="relative flex-shrink-0">
                {chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' ? (
                  <img
                    src={chat.profilePicture} 
                    alt={chat.name}
                    className="w-12 h-12 rounded-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        const fallback = parent.querySelector('.profile-fallback') as HTMLElement;
                        if (fallback) {
                          fallback.style.display = 'flex';
                          // Profil resmini NO_PICTURE olarak işaretle (tekrar yüklenmesin)
                          if (chat.profilePicture && !chat.profilePicture.includes('NO_PICTURE')) {
                            // Burada profil resmini güncellemek için callback gerekebilir
                            // Şimdilik sadece gizle
                          }
                        }
                      }
                    }}
                  />
                ) : null}
                <div 
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl profile-fallback ${
                    chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' 
                      ? 'hidden' 
                      : ''
                  }`}
                  style={{
                    backgroundColor: chat.profilePicture && chat.profilePicture !== '' && chat.profilePicture !== 'NO_PICTURE' 
                      ? 'transparent' 
                      : `hsl(${(chat.id.charCodeAt(0) * 137.508) % 360}, 70%, 50%)`
                  }}
                >
                  {chat.name[0]?.toUpperCase() || '?'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1">
                      <div className="font-semibold text-sm truncate">
                        {(() => {
                          // Grup sohbetleri için normal name'i göster
                          if (chat.id.includes('@g.us')) {
                            return chat.name;
                          }
                          // Bireysel sohbetler için: contactName varsa contactName, yoksa notify, o da yoksa telefon numarası
                          const displayName = chat.contactName || chat.notify || extractPhoneFromJid(chat.id);
                          return displayName;
                        })()}
                      </div>
                      {chat.isMuted && <VolumeX size={14} className="text-gray-400 flex-shrink-0" />}
                    </div>
                    {!chat.id.includes('@g.us') && (chat.contactName || chat.notify) && (
                      <div className="text-xs text-gray-400 truncate">
                        {extractPhoneFromJid(chat.id)}
                      </div>
                    )}
                  </div>
                  {chat.time && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{chat.time}</span>}
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-600 truncate">{chat.lastMessage || ''}</span>
                  {(chat.unreadCount ?? 0) > 0 && (
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

      {/* Context Menu */}
      {contextMenuChat && contextMenuPosition && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setContextMenuChat(null);
              setContextMenuPosition(null);
            }}
          />
          
          {/* Menu */}
          <div
            className="fixed bg-white rounded-xl shadow-2xl py-2 w-56 z-50 border border-gray-200 animate-fade-in"
            style={{
              left: `${contextMenuPosition.x}px`,
              top: `${contextMenuPosition.y}px`,
            }}
          >
            {/* Header */}
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sohbet İşlemleri</p>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              {onArchiveChat && (
                <button
                  onClick={() => {
                    onArchiveChat(contextMenuChat, !contextMenuChat.archived);
                    setContextMenuChat(null);
                    setContextMenuPosition(null);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    {contextMenuChat.archived ? (
                      <ArchiveRestore size={16} className="text-gray-600" />
                    ) : (
                      <Archive size={16} className="text-gray-600" />
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {contextMenuChat.archived ? 'Arşivden Çıkar' : 'Arşivle'}
                  </span>
                </button>
              )}

              {onMarkChatRead && (
                <button
                  onClick={() => {
                    onMarkChatRead(contextMenuChat, contextMenuChat.unreadCount === 0);
                    setContextMenuChat(null);
                    setContextMenuPosition(null);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    {contextMenuChat.unreadCount && contextMenuChat.unreadCount > 0 ? (
                      <CheckCheck size={16} className="text-gray-600" />
                    ) : (
                      <XCircle size={16} className="text-gray-600" />
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {contextMenuChat.unreadCount && contextMenuChat.unreadCount > 0 
                      ? 'Okundu İşaretle' 
                      : 'Okunmadı İşaretle'}
                  </span>
                </button>
              )}

              {onPinChat && (
                <button
                  onClick={() => {
                    onPinChat(contextMenuChat, !contextMenuChat.pinned);
                    setContextMenuChat(null);
                    setContextMenuPosition(null);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    {contextMenuChat.pinned ? (
                      <PinOff size={16} className="text-gray-600" />
                    ) : (
                      <Pin size={16} className="text-gray-600" />
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {contextMenuChat.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                  </span>
                </button>
              )}

              {onMuteChat && (
                <button
                  onClick={() => {
                    if (contextMenuChat.isMuted) {
                      onMuteChat(contextMenuChat, null);
                    } else {
                      onMuteChat(contextMenuChat, 8 * 60 * 60 * 1000);
                    }
                    setContextMenuChat(null);
                    setContextMenuPosition(null);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center space-x-3 text-gray-700 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    {contextMenuChat.isMuted ? (
                      <Volume2 size={16} className="text-gray-600" />
                    ) : (
                      <VolumeX size={16} className="text-gray-600" />
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {contextMenuChat.isMuted ? 'Sessizliği Kaldır' : 'Sessize Al (8 saat)'}
                  </span>
                </button>
              )}

              {/* Divider */}
              {onDeleteChat && (
                <div className="my-1 border-t border-gray-100"></div>
              )}

              {onDeleteChat && (
                <button
                  onClick={() => {
                    if (confirm('Bu sohbeti silmek istediğinizden emin misiniz?')) {
                      onDeleteChat(contextMenuChat);
                    }
                    setContextMenuChat(null);
                    setContextMenuPosition(null);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-red-50 flex items-center space-x-3 text-red-600 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100 transition-colors">
                    <Trash2 size={16} className="text-red-600" />
                  </div>
                  <span className="text-sm font-medium">Sohbeti Sil</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
