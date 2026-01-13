// ============================================
// Toast Component
// ============================================

import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { Toast as ToastType } from '../types';
import { cn } from '../utils';

interface ToastProps {
  toast: ToastType;
  onClose: () => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
};

export function Toast({ toast, onClose }: ToastProps) {
  const Icon = icons[toast.type];
  
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white',
        'animate-in slide-in-from-right duration-300',
        colors[toast.type]
      )}
    >
      <Icon size={20} />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onClose}
        className="hover:bg-white/20 rounded p-1 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastType[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => onClose(toast.id)} />
      ))}
    </div>
  );
}

