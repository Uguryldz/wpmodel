// ============================================
// Add Account Modal Component
// ============================================

import React from 'react';
import { X, RefreshCcw, Loader2, Smartphone } from 'lucide-react';
import { cn } from '../utils';

interface AddAccountModalProps {
  isOpen: boolean;
  qrCode: string | null;
  isLoading: boolean;
  accountName: string;
  onAccountNameChange: (name: string) => void;
  onRefreshQR?: () => void;
  onClose: () => void;
}

export function AddAccountModal({
  isOpen,
  qrCode,
  isLoading,
  accountName,
  onAccountNameChange,
  onRefreshQR,
  onClose,
}: AddAccountModalProps) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-green-500 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone size={24} />
            <h2 className="text-lg font-semibold">WhatsApp Hesabı Ekle</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Account Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hesap Adı (opsiyonel)
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => onAccountNameChange(e.target.value)}
              placeholder="Örn: İş Hesabı"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          
          {/* QR Code Area */}
          <div className="flex flex-col items-center">
            {isLoading ? (
              <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg">
                <div className="text-center">
                  <Loader2 size={48} className="animate-spin text-green-500 mx-auto mb-2" />
                  <p className="text-gray-500">QR kod yükleniyor...</p>
                </div>
              </div>
            ) : qrCode ? (
              <div className="relative">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="w-64 h-64 rounded-lg"
                />
                {onRefreshQR && (
                  <button
                    onClick={onRefreshQR}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-md flex items-center gap-1 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    <RefreshCcw size={14} />
                    Yenile
                  </button>
                )}
              </div>
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg">
                <p className="text-gray-500 text-center">
                  QR kod yüklenemedi.<br />
                  Lütfen tekrar deneyin.
                </p>
              </div>
            )}
          </div>
          
          {/* Instructions */}
          <div className="mt-6 text-center text-sm text-gray-600">
            <ol className="space-y-2">
              <li>1. WhatsApp'ı telefonunuzda açın</li>
              <li>2. <strong>Ayarlar</strong> {'>'} <strong>Bağlı Cihazlar</strong>'a gidin</li>
              <li>3. <strong>Cihaz Bağla</strong>'ya dokunun</li>
              <li>4. QR kodu tarayın</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

