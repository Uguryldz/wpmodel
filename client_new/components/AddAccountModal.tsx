// ============================================
// Add Account Modal Component
// ============================================

import React from 'react';
import { X, RefreshCcw, Loader2, Smartphone, QrCode, CheckCircle2 } from 'lucide-react';
import { cn } from '../utils';

interface AddAccountModalProps {
  isOpen: boolean;
  qrCode: string | null;
  isLoading: boolean;
  isScanning?: boolean; // QR kod taranıyor mu?
  accountName: string;
  onAccountNameChange: (name: string) => void;
  onRefreshQR?: () => void;
  onClose: () => void;
}

export function AddAccountModal({
  isOpen,
  qrCode,
  isLoading,
  isScanning = false,
  accountName,
  onAccountNameChange,
  onRefreshQR,
  onClose,
}: AddAccountModalProps) {
  if (!isOpen) return null;
  
  // Loading veya scanning durumunda modal kapatmayı engelle
  const canClose = !isLoading && !isScanning;
  
  const handleClose = () => {
    if (canClose) {
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && canClose) {
      onClose();
    }
  };
  
  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-2xl w-50 max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-green-500 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone size={24} />
            <h2 className="text-lg font-semibold">WhatsApp Hesabı Ekle</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={!canClose}
            className={cn(
              "p-1 rounded-full transition-colors",
              !canClose 
                ? "opacity-50 cursor-not-allowed" 
                : "hover:bg-white/20"
            )}
            title={!canClose ? "Bağlantı kurulurken kapatılamaz" : "Kapat"}
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
              disabled={isLoading || isScanning}
              className={cn(
                "w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors",
                (isLoading || isScanning) && "bg-gray-100 cursor-not-allowed"
              )}
            />
          </div>
          
          {/* QR Code Area */}
          <div className="flex flex-col items-center">
            {isScanning ? (
              // QR kod taranıyor - Bağlantı kuruluyor
              <div className="w-64 h-64 flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100 rounded-lg border-2 border-green-200">
                <div className="text-center space-y-4">
                  <div className="relative">
                    <QrCode size={64} className="text-green-500 mx-auto animate-pulse" />
                    <CheckCircle2 
                      size={28} 
                      className="text-green-600 absolute -bottom-1 -right-1 bg-white rounded-full animate-bounce" 
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-green-700 font-semibold text-lg">QR Kod Tarandı!</p>
                    <p className="text-green-600 text-sm">WhatsApp'a bağlanılıyor...</p>
                    <div className="flex items-center justify-center gap-1 mt-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : isLoading ? (
              // QR kod yükleniyor
              <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg">
                <div className="text-center">
                  <Loader2 size={48} className="animate-spin text-green-500 mx-auto mb-2" />
                  <p className="text-gray-500">QR kod yükleniyor...</p>
                </div>
              </div>
            ) : qrCode ? (
              // QR kod gösteriliyor
              <div className="relative">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="w-64 h-64 rounded-lg"
                />
                {onRefreshQR && (
                  <button
                    onClick={onRefreshQR}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-md flex items-center gap-1 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCcw size={14} />
                    Yenile
                  </button>
                )}
              </div>
            ) : (
              // QR kod yüklenemedi
              <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg">
                <p className="text-gray-500 text-center">
                  QR kod yüklenemedi.<br />
                  Lütfen tekrar deneyin.
                </p>
              </div>
            )}
          </div>
          
          {/* Instructions */}
          {!isScanning && (
            <div className="mt-6 text-sm text-gray-600">
              <ol className="space-y-2">
                <li>1. WhatsApp'ı telefonunuzda açın</li>
                <li>2. <strong>Ayarlar</strong> {'>'} <strong>Bağlı Cihazlar</strong>'a gidin</li>
                <li>3. <strong>Cihaz Bağla</strong>'ya dokunun</li>
                <li>4. QR kodu tarayın</li>
              </ol>
            </div>
          )}
          
          {/* Scanning Instructions */}
          {isScanning && (
            <div className="mt-6 text-center">
              <p className="text-sm text-green-600 font-medium">
                Lütfen bekleyin, bağlantı kurulacak...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}