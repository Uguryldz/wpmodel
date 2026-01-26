// ============================================
// Chat List Component
// ============================================

import React from 'react';
import { Search, Users, Archive, MessageCircle, MoreVertical, LogOut, Pin, VolumeX, Trash2, CheckCheck, Edit2 } from 'lucide-react';
import type { Account, Chat, ChatFilter } from '../types';
import { cn } from '../utils';
import { formatChatTime } from '../utils/date';

interface ChatListProps {
  account: Account | null;
  chats: Chat[];
  selectedChatId: string | null;
  filter: ChatFilter;
  searchTerm: string;
  editingAccountId: string | null;
  editingAccountName: string;
  onSelectChat: (chatId: string) => void;
  onFilterChange: (filter: ChatFilter) => void;
  onSearchChange: (term: string) => void;
  onEditingAccountNameChange: (name: string) => void;
  onRenameAccount: (accountId: string, newName: string) => void;
  onStartEditingAccount: (account: Account) => void;
  onPinChat?: (chat: Chat, pin: boolean) => void;
  onMuteChat?: (chat: Chat, durationMs: number | null) => void;
  onArchiveChat?: (chat: Chat, archive: boolean) => void;
  onDeleteChat?: (chat: Chat) => void;
  onNewChat?: () => void;
}

const filters: { value: ChatFilter; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'all', label: 'Tümü', icon: MessageCircle },
  { value: 'unread', label: 'Okunmamış', icon: MessageCircle },
  { value: 'groups', label: 'Gruplar', icon: Users },
  { value: 'archived', label: 'Arşiv', icon: Archive },
];

export function ChatList({
  account,
  chats,
  selectedChatId,
  filter,
  searchTerm,
  editingAccountId,
  editingAccountName,
  onSelectChat,
  onFilterChange,
  onSearchChange,
  onRenameAccount,
  onEditingAccountNameChange,
  onStartEditingAccount,
  onPinChat,
  onMuteChat,
  onArchiveChat,
  onDeleteChat,
  onNewChat,
}: ChatListProps) {
  const [menuChatId, setMenuChatId] = React.useState<string | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<{x: number, y: number} | null>(null);
  const [showAccountMenu, setShowAccountMenu] = React.useState(false);
  // Menüyü kapatmak için document click handler
  React.useEffect(() => {
    const handleClick = () => {
      setMenuChatId(null);
      setMenuPosition(null);
    };
    
    if (menuChatId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuChatId]);
  
  return (
    <>
      <div className="w-80 bg-white border-r flex flex-col flex-shrink-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 pb-4 flex items-center justify-between border-b border-gray-200">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {account ? (
                <>
                  <div
                    className={`w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center 
                    text-white font-semibold flex-shrink-0 shadow`}
                  >
                    {account.name[0].toUpperCase() || "Sohbetler"}
                  </div>

                  <div className="text-sm flex-1 min-w-0">
                    {editingAccountId === account.id ? (
                      <div className="flex items-center gap-2">
                        <input
                        type="text"
                        className="flex-1 px-3 py-1.5 border border-blue-500 rounded-lg 
                          text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        value={editingAccountName}
                        onChange={(e) => onEditingAccountNameChange(e.target.value)}
                        onBlur={() => onRenameAccount(account.id, editingAccountName)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            onRenameAccount(account.id, editingAccountName);
                          }
                          if (e.key === 'Escape') {
                            onEditingAccountNameChange(account.name);
                            onStartEditingAccount({ ...account, id: '' });
                          }
                        }}
                        autoFocus
                        placeholder="Hesap adı girin..."
                        maxLength={30}
                        />
                        <button
                          onClick={() => onRenameAccount(account.id, editingAccountName)}
                          className="p-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition"
                          title="Kaydet"
                        >
                          <CheckCheck size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 group">
                          <div className="font-semibold truncate text-gray-900">
                            {account.name}
                          </div>                          
                              <button
                                onClick={() => onStartEditingAccount(account)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-all flex-shrink-0"
                                title="Yeniden Adlandır"
                              >
                                <Edit2 size={14} />
                              </button>
                        </div>
                        <div className="text-gray-500 text-xs truncate font-mono">
                          {account.id}
                        </div>

                        {account.status === 'open' && (
                          <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-0.5">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            Bağlı
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              ): (
                <>
                  <div
                    className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center 
                    text-gray-700 font-semibold flex-shrink-0 shadow"
                  >
                    S
                  </div>
                  <div className="text-sm font-semibold text-gray-700 truncate">
                    Sohbetler
                  </div>
                </>
              )}
            </div>
            {/* Right Actions */}{/* 2.version */}
            {account && (
              <div className="flex gap-1 text-gray-600 relative hidden">
                <button className="p-2 rounded-lg hover:bg-gray-200 transition">
                  <Users size={18} />
                </button>

                <button className="p-2 rounded-lg hover:bg-gray-200 transition">
                  <MoreVertical size={18} />
                </button>

                {showAccountMenu && (
                  <div
                    className="absolute right-0 top-12 w-44 bg-white border rounded-xl shadow-lg z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="w-full px-4 py-2 flex items-center gap-2 text-red-600 hover:bg-red-50"
                    >
                      <LogOut size={16} />
                      Çıkış Yap
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
          
          {/* Search */}
          <div className="relative pt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-[45%] text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Sohbet ara..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          {/* Filters */}
          <div className="flex gap-1 mt-3">
            {filters.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => onFilterChange(value)}
                className={cn(
                  'flex-1 py-1.5 px-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1',
                  filter === value
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>

        
        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <MessageCircle size={48} className="mb-2" />
              <p>Sohbet bulunamadı</p>
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  'p-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 relative transition-all duration-200 group',
                  selectedChatId === chat.id ? 'bg-green-50 border-l-4 border-l-green-500' : ''
                )}
                onClick={() => onSelectChat(chat.id)}              >
                {/* Avatar */}
                <div className="relative bg-green-500 rounded-full">
                  {chat.profilePicture ? (
                    <img
                      src={chat.profilePicture}
                      alt={chat.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                      {chat.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {/* Pin indicator */}
                  {chat.pinned && (
                    <Pin size={12} className="absolute -top-1 -right-1 text-green-500" />
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800 truncate">
                      {chat.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatChatTime(chat.conversationTimestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-sm text-gray-500 truncate">
                      {chat.lastMessage || 'Henüz mesaj yok'}
                    </p>
                    {chat.unreadCount > 0 && (
                      <span className="bg-green-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Menu Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPosition({ 
                      x: rect.left - 170, 
                      y: rect.bottom + 4 
                    });
                    setMenuChatId(menuChatId === chat.id ? null : chat.id);
                  }}
                  className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={16} className="text-gray-500" />
                </button>
              </div>
            ))
          )}
        </div>
        
        {/* New Chat Button */}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="absolute bottom-4 right-4 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-10"
          >
            <MessageCircle size={24} />
          </button>
        )}
      </div>
      
      {/* Context Menu - DIV DIŞINDA RENDER EDİLİYOR */}
      {menuChatId && menuPosition && (
        <div
          className="fixed bg-white rounded-lg shadow-2xl py-1  min-w-[160px] border border-gray-200"
          style={{
            left: `${menuPosition.x * 2}px`,
            top: `${menuPosition.y}px`,
            zIndex: 99999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const chat = chats.find(c => c.id === menuChatId);
            if (!chat) return null;
            
            return (
              <>
                {onPinChat && (
                  <button
                    onClick={() => {
                      onPinChat(chat, !chat.pinned);
                      setMenuChatId(null);
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <Pin size={14} />
                    {chat.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                  </button>
                )}
                {onMuteChat && (
                  <button
                    onClick={() => {
                      onMuteChat(chat, chat.isMuted ? null : 8 * 60 * 60 * 1000);
                      setMenuChatId(null);
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <VolumeX size={14} />
                    {chat.isMuted ? 'Sessizi Kaldır' : 'Sessize Al'}
                  </button>
                )}
                {onArchiveChat && (
                  <button
                    onClick={() => {
                      onArchiveChat(chat, !chat.archived);
                      setMenuChatId(null);
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <Archive size={14} />
                    {chat.archived ? 'Arşivden Çıkar' : 'Arşivle'}
                  </button>
                )}
                {onDeleteChat && (
                  <button
                    onClick={() => {
                      onDeleteChat(chat);
                      setMenuChatId(null);
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors border-t border-gray-100"
                  >
                    <Trash2 size={14} />
                    Sohbeti Sil
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}