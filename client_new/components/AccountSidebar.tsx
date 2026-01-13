// ============================================
// Account Sidebar Component
// ============================================

import React from 'react';
import { Plus, MessageCircle, FileText, Trash2, LogOut } from 'lucide-react';
import type { Account } from '../types';
import { cn } from '../utils';

interface AccountSidebarProps {
  accounts: Account[];
  activeAccountId: string | null;
  onSwitchAccount: (accountId: string) => void;
  onAddAccount: () => void;
  onDeleteAccount: (accountId: string) => void;
  onLogout: (accountId: string) => void;
  onOpenTemplates?: () => void;
}

export function AccountSidebar({
  accounts,
  activeAccountId,
  onSwitchAccount,
  onAddAccount,
  onDeleteAccount,
  onLogout,
  onOpenTemplates,
}: AccountSidebarProps) {
  const [showMenu, setShowMenu] = React.useState<string | null>(null);
  
  return (
    <div className="w-16 bg-gray-800 flex flex-col items-center py-4 gap-2 flex-shrink-0 overflow-y-auto">
      {/* Hesap Avatarları */}
      {accounts.map((account) => (
        <div key={account.id} className="relative">
          <button
            onClick={() => onSwitchAccount(account.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowMenu(showMenu === account.id ? null : account.id);
            }}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center text-white font-bold transition-all',
              'hover:ring-2 hover:ring-white/50',
              account.id === activeAccountId && 'ring-2 ring-white'
            )}
            style={{ backgroundColor: account.color }}
            title={account.name}
          >
            {account.name.charAt(0).toUpperCase()}
          </button>
          
          {/* Status Indicator */}
          <div
            className={cn(
              'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800',
              account.status === 'open' && 'bg-green-500',
              account.status === 'connecting' && 'bg-yellow-500',
              account.status === 'close' && 'bg-red-500',
              account.status === 'unknown' && 'bg-gray-500'
            )}
          />
          
          {/* Context Menu */}
          {showMenu === account.id && (
            <div className="absolute left-14 top-0 bg-white rounded-lg shadow-xl py-1 z-50 min-w-[150px]">
              <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b">
                {account.name}
              </div>
              <button
                onClick={() => {
                  onLogout(account.id);
                  setShowMenu(null);
                }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
              >
                <LogOut size={14} />
                Çıkış Yap
              </button>
              <button
                onClick={() => {
                  if (confirm('Bu hesabı silmek istediğinizden emin misiniz?')) {
                    onDeleteAccount(account.id);
                  }
                  setShowMenu(null);
                }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-2"
              >
                <Trash2 size={14} />
                Hesabı Sil
              </button>
            </div>
          )}
        </div>
      ))}
      
      {/* Yeni Hesap Ekle */}
      <button
        onClick={onAddAccount}
        className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white transition-colors"
        title="Hesap Ekle"
      >
        <Plus size={24} />
      </button>
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Templates */}
      {onOpenTemplates && (
        <button
          onClick={onOpenTemplates}
          className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white transition-colors"
          title="Şablonlar"
        >
          <FileText size={20} />
        </button>
      )}
    </div>
  );
}

