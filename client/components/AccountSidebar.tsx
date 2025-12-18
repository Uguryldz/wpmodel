import { useState, useEffect } from 'react';
import { MessageCircle, Plus, X, Users } from 'lucide-react';
import * as api from '../api';
import { Contact } from '../types';

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
  const [showContacts, setShowContacts] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const activeAccount = accounts.find(acc => acc.active) || accounts[0];

  // Aktif hesap değiştiğinde cihazdaki contact'ları yükle
  useEffect(() => {
    if (activeAccount && activeAccount.status === 'open' && showContacts) {
      loadDeviceContacts(activeAccount.id);
    }
  }, [activeAccount?.id, showContacts]);

  const loadDeviceContacts = async (sessionId: string) => {
    setIsLoadingContacts(true);
    try {
      const contacts = await api.getDeviceContacts(sessionId);
      setDeviceContacts(contacts);
    } catch (error) {
      console.error('Cihazdaki contact\'lar yüklenemedi:', error);
      setDeviceContacts([]);
    } finally {
      setIsLoadingContacts(false);
    }
  };

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

      {/* Cihazdaki Kayıtlı Kişiler Listesi */}
      {activeAccount && activeAccount.status === 'open' && (
        <div className="relative w-full">
          <button
            onClick={() => setShowContacts(!showContacts)}
            className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white hover:bg-gray-600 transition-colors"
            title="Cihazdaki Kayıtlı Kişiler"
          >
            <Users size={20} />
          </button>
          
          {showContacts && (
            <div className="absolute left-full ml-2 top-0 w-64 h-96 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col z-50">
              {/* Header */}
              <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Cihazdaki Kişiler</h3>
                <button
                  onClick={() => setShowContacts(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={18} />
                </button>
              </div>
              
              {/* Contact List */}
              <div className="flex-1 overflow-y-auto p-2">
                {isLoadingContacts ? (
                  <div className="text-center text-gray-500 py-8">
                    Yükleniyor...
                  </div>
                ) : deviceContacts.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    Kişi bulunamadı
                  </div>
                ) : (
                  <div className="space-y-1">
                    {deviceContacts.map((contact) => {
                      // Cihaz rehberindeki isim öncelikli (name alanı)
                      const displayName = contact.name || contact.notify || contact.verifiedName || contact.id || 'Bilinmeyen';
                      
                      return (
                        <div
                          key={contact.id}
                          className="p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                          title={displayName}
                        >
                          <div className="flex items-center space-x-2">
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-semibold flex-shrink-0">
                              {displayName[0]?.toUpperCase() || '?'}
                            </div>
                            
                            {/* İsim */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">
                                {displayName}
                              </div>
                              {contact.name && contact.notify && contact.name !== contact.notify && (
                                <div className="text-xs text-gray-500 truncate">
                                  {contact.notify}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Footer */}
              <div className="p-2 border-t border-gray-200 text-xs text-gray-500 text-center">
                {deviceContacts.length} kişi
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
