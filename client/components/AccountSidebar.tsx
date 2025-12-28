import { useState, useEffect } from 'react';
import { MessageCircle, Plus, X, Users, FileText, Loader2 } from 'lucide-react';
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
  onOpenTemplates: () => void;
}

export default function AccountSidebar({
  accounts,
  onSwitchAccount,
  onAddAccount,
  onDeleteAccount,
  onOpenTemplates,
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
    <div className="w-20 bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center py-4 space-y-3 shadow-xl h-screen">
      {/* Logo */}
      <div className="text-green-400 mb-2 p-2 bg-green-500/10 rounded-xl">
        <MessageCircle size={28} strokeWidth={2.5} />
      </div>
      
      {/* Templates Butonu */}
      <button
        onClick={onOpenTemplates}
        className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 group flex-shrink-0"
        title="Mesaj Şablonları"
      >
        <FileText size={20} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* Ayırıcı */}
      <div className="w-8 h-px bg-gray-700 flex-shrink-0"></div>
      
      {/* Hesap Butonları - Scrollable */}
      <div className="flex-1 flex flex-col space-y-3 overflow-y-auto py-1 px-1 scrollbar-hide min-h-0">
        {accounts.map(account => (
          <div key={account.id} className="relative group flex-shrink-0">
            <button
              onClick={() => onSwitchAccount(account.id)}
              className={`w-12 h-12 rounded-xl ${account.color} flex items-center justify-center text-white font-bold relative hover:scale-105 transition-all shadow-md ${
                account.active ? 'ring-3 ring-green-400 scale-105' : 'hover:ring-2 hover:ring-gray-500'
              }`}
              title={account.name}
            >
              <span className="text-base">{account.name[0].toUpperCase()}</span>
              
              {/* Aktif Göstergesi */}
              {account.active && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-gray-900"></div>
              )}
              
              {/* Online Durumu */}
              {account.status === 'open' && (
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900"></div>
              )}
            </button>
            
            {/* Hesap Silme Butonu */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (window.confirm(`"${account.name}" hesabını silmek istediğinize emin misiniz?`)) {
                  await onDeleteAccount(account.id);
                }
              }}
              className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:scale-110 z-10 shadow-md"
              title="Hesabı Sil"
            >
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        ))}
      </div>

      {/* Ayırıcı */}
      <div className="w-8 h-px bg-gray-700 flex-shrink-0"></div>
      
      {/* Alt Butonlar */}
      <div className="flex flex-col space-y-3 flex-shrink-0">
        {/* Hesap Ekle */}
        <button
          onClick={onAddAccount}
          className="w-12 h-12 rounded-xl bg-gray-700 flex items-center justify-center text-white hover:bg-gray-600 transition-all shadow-md hover:shadow-lg hover:scale-105 group"
          title="Hesap Ekle"
        >
          <Plus size={22} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Cihazdaki Kişiler */}
        {activeAccount && activeAccount.status === 'open' && (
          <div className="relative">
            <button
              onClick={() => setShowContacts(!showContacts)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-white transition-all shadow-md hover:shadow-lg hover:scale-105 ${
                showContacts 
                  ? 'bg-gradient-to-br from-green-500 to-green-600' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title="Cihazdaki Kayıtlı Kişiler"
            >
              <Users size={20} />
            </button>
            
            {/* Contacts Modal */}
            {showContacts && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowContacts(false)}
                />
                
                {/* Modal */}
                <div className="fixed left-24 bottom-4 w-80 h-[500px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-50 animate-fade-in">
                  {/* Header */}
                  <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-green-50 to-white rounded-t-xl flex-shrink-0">
                    <div>
                      <h3 className="font-semibold text-gray-800 text-sm">Cihazdaki Kişiler</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{deviceContacts.length} kişi</p>
                    </div>
                    <button
                      onClick={() => setShowContacts(false)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  
                  {/* Contact List */}
                  <div className="flex-1 overflow-y-auto p-2 min-h-0">
                    {isLoadingContacts ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-2" />
                        <p className="text-gray-500 text-sm">Yükleniyor...</p>
                      </div>
                    ) : deviceContacts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                          <Users className="text-gray-400" size={28} />
                        </div>
                        <p className="text-gray-500 text-sm font-medium">Kişi bulunamadı</p>
                        <p className="text-gray-400 text-xs mt-1">Henüz kayıtlı kişi yok</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {deviceContacts.map((contact) => {
                          const displayName = contact.name || contact.notify || contact.verifiedName || contact.id || 'Bilinmeyen';
                          
                          return (
                            <div
                              key={contact.id}
                              className="p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                              title={displayName}
                            >
                              <div className="flex items-center space-x-2">
                                {/* Avatar */}
                                <div 
                                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                                  style={{
                                    backgroundColor: `hsl(${(contact.id.charCodeAt(0) * 137.508) % 360}, 65%, 55%)`
                                  }}
                                >
                                  {displayName[0]?.toUpperCase() || '?'}
                                </div>
                                
                                {/* İsim */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-800 truncate group-hover:text-green-600 transition-colors">
                                    {displayName}
                                  </div>
                                  {contact.name && contact.notify && contact.name !== contact.notify && (
                                    <div className="text-xs text-gray-500 truncate">
                                      {contact.notify}
                                    </div>
                                  )}
                                </div>

                                {/* Verified Badge */}
                                {contact.verifiedName && (
                                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
