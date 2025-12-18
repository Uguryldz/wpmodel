import React from 'react';
import { MessageCircle, Plus, X } from 'lucide-react';
import * as api from '../api';

interface Account {
  id: string;
  name: string;
  status?: string;
  color: string;
  active: boolean;
  whatsappJid?: string | null;
}

interface AccountSidebarProps {
  accounts: Account[];
  onSwitchAccount: (accountId: string) => void;
  onAddAccount: () => void;
  onDeleteAccount: (accountId: string) => Promise<void>;
}

export default function AccountSidebar({
  accounts,
  onSwitchAccount,
  onAddAccount,
  onDeleteAccount,
}: AccountSidebarProps) {
  return (
    <div className="w-20 bg-gray-800 flex flex-col items-center py-4 space-y-4">
      <div className="text-white text-2xl mb-4">
        <MessageCircle size={32} />
      </div>
      
      {accounts.map(account => (
        <div key={account.id} className="relative group">
          <button
            onClick={() => onSwitchAccount(account.id)}
            className={`w-12 h-12 rounded-full ${account.color} flex items-center justify-center text-white font-bold relative hover:scale-110 transition-transform ${
              account.active ? 'ring-4 ring-white' : ''
            }`}
            title={account.name}
          >
            {account.name[0].toUpperCase()}
            {account.active && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-gray-800"></div>
            )}
          </button>
          {account.status === 'open' && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
          )}
          {/* Hesap silme butonu - hover'da görünür */}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm(`"${account.name}" hesabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
                await onDeleteAccount(account.id);
              }
            }}
            className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
            title="Hesabı Sil"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      
      <button
        onClick={onAddAccount}
        className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white hover:bg-gray-500 transition-colors"
        title="Hesap Ekle"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
