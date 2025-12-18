// Tarih ayırıcı component'i
import { formatMessageDate } from '../utils/dateUtils';

interface DateSeparatorProps {
  timestamp: number | undefined;
}

export default function DateSeparator({ timestamp }: DateSeparatorProps) {
  if (!timestamp) return null;

  const dateText = formatMessageDate(timestamp);

  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-gray-600 font-medium shadow-sm">
        {dateText}
      </div>
    </div>
  );
}
