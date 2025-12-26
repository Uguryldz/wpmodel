import React, { useState } from 'react';
import { X, Send } from 'lucide-react';

interface MediaPreviewModalProps {
  isOpen: boolean;
  file: File | null;
  mediaType: 'image' | 'video' | 'document';
  onClose: () => void;
  onSend: (caption: string) => void;
}

export default function MediaPreviewModal({
  isOpen,
  file,
  mediaType,
  onClose,
  onSend,
}: MediaPreviewModalProps) {
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>('');

  React.useEffect(() => {
    if (file && (mediaType === 'image' || mediaType === 'video')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, mediaType]);

  if (!isOpen || !file) return null;

  const handleSend = () => {
    onSend(caption);
    setCaption('');
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">
            {mediaType === 'image' ? 'Resim Gönder' : mediaType === 'video' ? 'Video Gönder' : 'Dosya Gönder'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50 flex items-center justify-center">
          {mediaType === 'image' && previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-[400px] object-contain rounded"
            />
          )}
          {mediaType === 'video' && previewUrl && (
            <video
              src={previewUrl}
              controls
              className="max-w-full max-h-[400px] rounded"
            />
          )}
          {mediaType === 'document' && (
            <div className="text-center">
              <div className="text-6xl mb-4">📄</div>
              <p className="text-gray-700 font-medium">{file.name}</p>
              <p className="text-gray-500 text-sm mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}
        </div>

        {/* Caption Input */}
        <div className="p-4 border-t">
          <div className="flex items-end space-x-3">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={`${mediaType === 'image' ? 'Resim' : mediaType === 'video' ? 'Video' : 'Dosya'} için açıklama ekleyin...`}
              className="flex-1 bg-gray-100 rounded-lg px-4 py-2 outline-none resize-none max-h-[100px] min-h-[60px]"
              rows={2}
              maxLength={1024}
            />
            <button
              onClick={handleSend}
              className="bg-green-500 text-white p-3 rounded-full hover:bg-green-600 transition-colors flex-shrink-0"
              title="Gönder"
            >
              <Send size={24} />
            </button>
          </div>
          {caption.length > 0 && (
            <div className="text-xs text-gray-500 mt-2 text-right">
              {caption.length}/1024
            </div>
          )}
        </div>
      </div>
    </div>
  );
}