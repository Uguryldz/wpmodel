// ============================================
// Chat List Component
// ============================================

import React from 'react';
import { Search, Users, Archive, MessageCircle, MoreVertical, Pin, VolumeX, Trash2 } from 'lucide-react';
import type { Account, Chat, ChatFilter } from '../types';
import { cn } from '../utils';
import { formatChatTime } from '../utils/date';

interface ChatListProps {
  account: Account | null;
  chats: Chat[];
  selectedChatId: string | null;
  filter: ChatFilter;
  searchTerm: string;
  onSelectChat: (chatId: string) => void;
  onFilterChange: (filter: ChatFilter) => void;
  onSearchChange: (term: string) => void;
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
  onSelectChat,
  onFilterChange,
  onSearchChange,
  onPinChat,
  onMuteChat,
  onArchiveChat,
  onDeleteChat,
  onNewChat,
}: ChatListProps) {
  const [menuChatId, setMenuChatId] = React.useState<string | null>(null);
  
  return (
    <div className="w-80 bg-white border-r flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-800">
            {account?.name || 'Sohbetler'}
          </h1>
          {account && (
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                account.status === 'open' && 'bg-green-500',
                account.status === 'connecting' && 'bg-yellow-500 animate-pulse',
                account.status !== 'open' && account.status !== 'connecting' && 'bg-gray-400'
              )}
              title={account.status}
            />
          )}
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
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
                'relative flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors',
                selectedChatId === chat.id && 'bg-gray-100'
              )}
              onClick={() => onSelectChat(chat.id)}
            >
              {/* Avatar */}
              <div className="relative bg-green-500 rounded-full">
                {chat.profilePicture ? (
                  <img
                    src={chat.profilePicture}
                    alt={chat.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold"
                  >
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
                  setMenuChatId(menuChatId === chat.id ? null : chat.id);
                }}
                className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical size={16} className="text-gray-500" />
              </button>
              
              {/* Context Menu */}
              {menuChatId === chat.id && (
                <div
                  className="absolute right-2 top-full mt-1 bg-white rounded-lg shadow-xl py-1 z-50 min-w-[150px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onPinChat && (
                    <button
                      onClick={() => {
                        onPinChat(chat, !chat.pinned);
                        setMenuChatId(null);
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
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
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
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
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
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
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Sohbeti Sil
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* New Chat Button */}
      {onNewChat && (
        <button
          onClick={onNewChat}
          className="absolute bottom-4 right-4 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
        >
          <MessageCircle size={24} />
        </button>
      )}
    </div>
  );
}

