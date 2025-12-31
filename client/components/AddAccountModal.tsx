import React from 'react';
import { X, Loader2 } from 'lucide-react';

interface AddAccountModalProps {
  isOpen: boolean;
  newAccountName: string;
  setNewAccountName: (name: string) => void;
  qrCode: string | null;
  isLoadingQR: boolean;
  pendingAccountId: string | null;
  onGenerateQR: () => void;
  onClose: () => void;
}

export default function AddAccountModal({
  isOpen,
  newAccountName,
  setNewAccountName,
  qrCode,
  isLoadingQR,
  pendingAccountId,
  onGenerateQR,
  onClose,
}: AddAccountModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Yeni Hesap Ekle</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hesap Adı
            </label>
            <input
              type="text"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="Örn: Kişisel, İş"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {qrCode ? (
            <div className="flex flex-col items-center space-y-2 py-4">
              <p className="text-sm font-medium text-gray-700">QR Kodu WhatsApp ile tarayın</p>
              <div className="p-4 bg-white border-2 border-gray-300 rounded-lg">
                <img 
                  src={qrCode} 
                  alt="QR Code" 
                  className="w-64 h-64 mx-auto"
                  onError={(e) => {
                    console.error('[AddAccountModal] QR kod görseli yüklenemedi:', e);
                    console.error('[AddAccountModal] QR kod URL:', qrCode.substring(0, 100));
                  }}
                />
              </div>
              <p className="text-xs text-gray-500">QR kodu WhatsApp uygulaması ile tarayın</p>
            </div>
          ) : isLoadingQR ? (
            <div className="flex flex-col items-center space-y-2 py-4">
              <Loader2 className="animate-spin text-green-500" size={32} />
              <p className="text-sm text-gray-600">QR kod oluşturuluyor...</p>
              <p className="text-xs text-gray-500">Lütfen bekleyin...</p>
            </div>
          ) : null}

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {qrCode ? 'İptal' : 'Kapat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
