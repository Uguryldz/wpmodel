// Mesaj durumu gösterimi component'i
import { getMessageStatus, getMessageStatusIcon, MessageStatus } from '../utils/messageStatusUtils';
import { CheckCheck, Clock, AlertCircle } from 'lucide-react';

interface MessageStatusProps {
  message: any;
  className?: string;
}

export default function MessageStatusComponent({ message, className = '' }: MessageStatusProps) {
  const status = getMessageStatus(message);
  const statusIcon = getMessageStatusIcon(status);

  if (status === 'sending') {
    return (
      <span className={`ml-1 ${className}`} title="Gönderiliyor...">
        <Clock size={12} className="text-gray-400 animate-pulse" />
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className={`ml-1 ${className}`} title="Gönderilemedi">
        <AlertCircle size={12} className="text-red-500" />
      </span>
    );
  }

  if (status === 'read') {
    return (
      <span className={`ml-1 ${className}`} title="Okundu">
        <CheckCheck size={12} className="text-blue-500" />
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span className={`ml-1 ${className}`} title="Teslim edildi">
        <CheckCheck size={12} className="text-gray-500" />
      </span>
    );
  }

  // sent
  return (
    <span className={`ml-1 ${className}`} title="Gönderildi">
      <CheckCheck size={12} className="text-gray-400" />
    </span>
  );
}
