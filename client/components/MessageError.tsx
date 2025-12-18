// Mesaj gönderme hatası component'i
import { AlertCircle, RefreshCw } from 'lucide-react';

interface MessageErrorProps {
  message: any;
  onRetry?: () => void;
  className?: string;
}

export default function MessageError({ message, onRetry, className = '' }: MessageErrorProps) {
  if (message.status !== 'error') return null;

  return (
    <div className={`flex items-center space-x-2 text-red-500 ${className}`}>
      <AlertCircle size={14} />
      <span className="text-xs">Gönderilemedi</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-2 p-1 hover:bg-red-100 rounded-full transition-colors"
          title="Tekrar dene"
        >
          <RefreshCw size={12} />
        </button>
      )}
    </div>
  );
}
