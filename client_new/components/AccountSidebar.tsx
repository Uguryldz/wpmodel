// ============================================
// Account Sidebar Component
// ============================================

import React, { useState } from 'react';
import { Plus, MessageCircle, FileText, Trash2, LogOut, Users } from 'lucide-react';
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
  onOpenContacts?: () => void;
}

export function AccountSidebar({
  accounts,
  activeAccountId,
  onSwitchAccount,
  onAddAccount,
  onDeleteAccount,
  onLogout,
  onOpenTemplates,
  onOpenContacts,
}: AccountSidebarProps) {
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{x: number, y: number} | null>(null);
  
  const activeAccount = accounts.find(acc => acc.id === activeAccountId);
  
  // Menüyü kapatmak için document click handler
  React.useEffect(() => {
    const handleClick = () => {
      setShowMenu(null);
      setMenuPosition(null);
    };
    
    if (showMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showMenu]);
  
  return (
    <>
      <div className="w-20 bg-gray-800 flex flex-col items-center py-4 gap-2 flex-shrink-0 overflow-y-auto">
        {/* Logo */}
        <div className="text-green-400 mb-2 p-2 bg-green-500/10 rounded-xl">
          <MessageCircle size={28} strokeWidth={2.5} />
        </div>
        
        {/* Ayırıcı */}
        <div className="w-8 h-px bg-gray-700 flex-shrink-0 mb-2"></div>
        
        {/* Hesap Avatarları */}
        {/* Sadece açık/aktif/bağlı durumda olan hesapları göster (close durumundakileri filtrele) */}
        {accounts
          .filter((account) => account.status !== 'close')
          .map((account) => (
            <div key={account.id} className="relative">
              <button
                onClick={() => onSwitchAccount(account.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPosition({ x: rect.right + 8, y: rect.top });
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
                  // account.status === 'close' && 'bg-red-500', // Close durumundaki hesaplar artık gösterilmiyor
                  account.status === 'unknown' && 'bg-gray-500'
                )}
              />
            </div>
          ))}
        
        {/* Eski kod - tüm hesapları gösteriyordu (yorum satırına alındı) */}
        {/* {accounts.map((account) => (
          <div key={account.id} className="relative">
            <button
              onClick={() => onSwitchAccount(account.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuPosition({ x: rect.right + 8, y: rect.top });
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
            
            <div
              className={cn(
                'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800',
                account.status === 'open' && 'bg-green-500',
                account.status === 'connecting' && 'bg-yellow-500',
                account.status === 'close' && 'bg-red-500',
                account.status === 'unknown' && 'bg-gray-500'
              )}
            />
          </div>
        ))} */}
        
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
        
        {/* Kişiler - Sadece aktif hesap açıksa göster */}
        {activeAccount && activeAccount.status === 'open' && onOpenContacts && (
          <button
            onClick={onOpenContacts}
            className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white transition-colors"
            title="Kişi Listesi"
          >
            <Users size={20} />
          </button>
        )}
        
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
      
      {/* Context Menu */}
      {showMenu && menuPosition && (
        <div 
          className="fixed bg-white rounded-lg shadow-2xl py-1 min-w-[160px] border border-gray-200"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
            zIndex: 99999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const account = accounts.find(a => a.id === showMenu);
            if (!account) return null;
            
            return (
              <>
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {account.name}
                  </p>
                </div>
                
                <div className="py-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Bu hesabı silmek istediğinizden emin misiniz?')) {
                        onDeleteAccount(account.id);
                      }
                      setShowMenu(null);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-red-50 active:bg-red-100 text-red-600 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Hesabı Sil</span>
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}