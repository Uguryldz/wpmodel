import React, { useState, useEffect } from 'react';
import { X, FileText, List, Square, Package, Loader2 } from 'lucide-react';
import * as templatesApi from '../api/templates';
import { sendButtonMessage, sendListMessage, sendTemplateMessage, sendProductMessage } from '../api/messages';
import { MessageTemplate } from '../pages/TemplatesPage';

interface TemplateSelectorModalProps {
  isOpen: boolean;
  activeAccountId: string | undefined;
  selectedChatJid: string | undefined;
  onClose: () => void;
  onTemplateSent?: () => void;
}

export default function TemplateSelectorModal({
  isOpen,
  activeAccountId,
  selectedChatJid,
  onClose,
  onTemplateSent,
}: TemplateSelectorModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sendingTemplateId, setSendingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && activeAccountId) {
      loadTemplates();
    }
  }, [isOpen, activeAccountId]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const templatesList = await templatesApi.getTemplates(activeAccountId);
      setTemplates(templatesList);
    } catch (error) {
      console.error('Şablonlar yüklenemedi:', error);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTemplate = async (template: MessageTemplate) => {
    if (!activeAccountId || !selectedChatJid) {
      alert('Lütfen bir hesap ve sohbet seçin');
      return;
    }

    setSendingTemplateId(template.id);

    try {
      if (template.type === 'button') {
        await sendButtonMessage(
          activeAccountId,
          selectedChatJid,
          template.data.text,
          template.data.buttons,
          template.data.footer,
          template.data.header
        );
      } else if (template.type === 'list') {
        await sendListMessage(
          activeAccountId,
          selectedChatJid,
          template.data.text,
          template.data.title,
          template.data.buttonText,
          template.data.sections,
          template.data.footer
        );
      } else if (template.type === 'template') {
        await sendTemplateMessage(
          activeAccountId,
          selectedChatJid,
          template.data.templateName,
          template.data.languageCode,
          template.data.components || []
        );
      } else if (template.type === 'product') {
        await sendProductMessage(
          activeAccountId,
          selectedChatJid,
          template.data.text,
          template.data.productList,
          template.data.businessOwnerJid,
          template.data.footer,
          template.data.thumbnail
        );
      }

      onTemplateSent?.();
      onClose();
    } catch (error: any) {
      console.error('Şablon mesajı gönderilemedi:', error);
      alert(`Mesaj gönderilemedi: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setSendingTemplateId(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'button':
        return <Square size={20} className="text-blue-600" />;
      case 'list':
        return <List size={20} className="text-green-600" />;
      case 'template':
        return <FileText size={20} className="text-purple-600" />;
      case 'product':
        return <Package size={20} className="text-orange-600" />;
      default:
        return <FileText size={20} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'button':
        return 'Buton';
      case 'list':
        return 'Liste';
      case 'template':
        return 'Şablon';
      case 'product':
        return 'Ürün';
      default:
        return type;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Şablon Seç</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            title="Kapat"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={32} />
              <span className="ml-3 text-gray-600">Şablonlar yükleniyor...</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={64} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-2">Henüz şablon oluşturulmamış</p>
              <p className="text-sm text-gray-500">
                Şablonlar sayfasından yeni şablonlar oluşturabilirsiniz
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSendTemplate(template)}
                  disabled={sendingTemplateId === template.id}
                  className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getTypeIcon(template.type)}
                        <h3 className="font-semibold text-gray-800">{template.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded ${
                          template.type === 'button' ? 'bg-blue-100 text-blue-800' :
                          template.type === 'list' ? 'bg-green-100 text-green-800' :
                          template.type === 'template' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {getTypeLabel(template.type)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {template.type === 'button' && template.data?.text && (
                          <p className="truncate">{template.data.text}</p>
                        )}
                        {template.type === 'list' && template.data?.text && (
                          <p className="truncate">{template.data.text}</p>
                        )}
                        {template.type === 'template' && template.data?.templateName && (
                          <p>Şablon: {template.data.templateName}</p>
                        )}
                        {template.type === 'product' && template.data?.text && (
                          <p className="truncate">{template.data.text}</p>
                        )}
                      </div>
                    </div>
                    {sendingTemplateId === template.id && (
                      <Loader2 className="animate-spin text-blue-600 ml-2" size={20} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}




