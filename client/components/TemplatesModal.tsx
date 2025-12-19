import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Send, FileText, List, Square, Package, Save } from 'lucide-react';
import { sendButtonMessage, sendListMessage, sendTemplateMessage, sendProductMessage } from '../api/messages';
import * as templatesApi from '../api/templates';

export interface MessageTemplate {
  id: string;
  name: string;
  type: 'button' | 'list' | 'template' | 'product';
  data: any;
  createdAt: number;
}

interface TemplatesModalProps {
  isOpen: boolean;
  activeAccountId: string | undefined;
  activeAccountJid: string | undefined | null; // Aktif hesabın WhatsApp JID'si
  selectedChatJid: string | undefined;
  onClose: () => void;
  onSendTemplate: (template: MessageTemplate) => void;
}

export default function TemplatesModal({
  isOpen,
  activeAccountId,
  activeAccountJid,
  selectedChatJid,
  onClose,
  onSendTemplate,
  onSelectTemplate,
}: TemplatesModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [templateType, setTemplateType] = useState<'button' | 'list' | 'template' | 'product'>('button');
  const [templateName, setTemplateName] = useState('');
  
  // Button template form
  const [buttonText, setButtonText] = useState('');
  const [buttonFooter, setButtonFooter] = useState('');
  const [buttons, setButtons] = useState<Array<{ buttonId: string; displayText: string; type: 1 | 2 | 3 }>>([
    { buttonId: 'btn1', displayText: '', type: 1 },
  ]);
  
  // List template form
  const [listText, setListText] = useState('');
  const [listTitle, setListTitle] = useState('');
  const [listButtonText, setListButtonText] = useState('Seçenekleri Görüntüle');
  const [listFooter, setListFooter] = useState('');
  const [sections, setSections] = useState<Array<{ title: string; rows: Array<{ title: string; description: string; rowId: string }> }>>([
    { title: 'Bölüm 1', rows: [{ title: '', description: '', rowId: 'row1' }] },
  ]);
  
  // Template message form
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [templateLanguageCode, setTemplateLanguageCode] = useState('tr');
  
  // Product template form
  const [productText, setProductText] = useState('');
  const [productFooter, setProductFooter] = useState('');
  const [businessOwnerJid, setBusinessOwnerJid] = useState('');
  const [productList, setProductList] = useState<Array<{ title: string; products: Array<{ productId: string }> }>>([
    { title: 'Kategori', products: [{ productId: '' }] },
  ]);

  useEffect(() => {
    if (isOpen && activeAccountId) {
      loadTemplates();
    }
  }, [isOpen, activeAccountId]);

  const loadTemplates = async () => {
    try {
      const templates = await templatesApi.getTemplates(activeAccountId);
      setTemplates(templates);
    } catch (error) {
      console.error('Şablonlar yüklenemedi:', error);
      setTemplates([]);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Lütfen şablon adı girin');
      return;
    }

    let templateData: any = {};

    if (templateType === 'button') {
      if (!buttonText.trim()) {
        alert('Lütfen mesaj metni girin');
        return;
      }
      const validButtons = buttons.filter(btn => btn.displayText.trim());
      if (validButtons.length === 0) {
        alert('En az bir buton ekleyin');
        return;
      }
      templateData = {
        text: buttonText,
        footer: buttonFooter,
        buttons: validButtons.map(btn => ({
          buttonId: btn.buttonId,
          buttonText: { displayText: btn.displayText },
          type: btn.type,
        })),
      };
    } else if (templateType === 'list') {
      if (!listText.trim() || !listTitle.trim() || !listButtonText.trim()) {
        alert('Lütfen tüm zorunlu alanları doldurun');
        return;
      }
      const validSections = sections
        .map(section => ({
          ...section,
          rows: section.rows.filter(row => row.title.trim()),
        }))
        .filter(section => section.rows.length > 0);
      if (validSections.length === 0) {
        alert('En az bir seçenek ekleyin');
        return;
      }
      templateData = {
        text: listText,
        title: listTitle,
        buttonText: listButtonText,
        footer: listFooter,
        sections: validSections,
      };
    } else if (templateType === 'template') {
      if (!templateNameInput.trim()) {
        alert('Lütfen şablon adı girin');
        return;
      }
      templateData = {
        templateName: templateNameInput,
        languageCode: templateLanguageCode,
        components: [],
      };
    } else if (templateType === 'product') {
      if (!productText.trim()) {
        alert('Lütfen mesaj metni girin');
        return;
      }
      // Business Owner JID yoksa aktif hesabın JID'sini kullan
      const finalBusinessOwnerJid = businessOwnerJid.trim() || activeAccountJid;
      if (!finalBusinessOwnerJid) {
        alert('Business Owner JID gerekli. Lütfen aktif hesabın bağlı olduğundan emin olun veya JID girin.');
        return;
      }
      const validProductList = productList
        .map(list => ({
          ...list,
          products: list.products.filter(p => p.productId.trim()),
        }))
        .filter(list => list.products.length > 0);
      if (validProductList.length === 0) {
        alert('En az bir ürün ekleyin');
        return;
      }
      templateData = {
        text: productText,
        footer: productFooter,
        productList: validProductList,
        businessOwnerJid: finalBusinessOwnerJid,
      };
    }

    if (!activeAccountId) {
      alert('Lütfen bir hesap seçin');
      return;
    }

    try {
      const newTemplate = await templatesApi.createTemplate(
        activeAccountId,
        templateName,
        templateType,
        templateData
      );

      // Şablonları yeniden yükle
      await loadTemplates();

      // Form'u sıfırla
      resetForm();
      setShowAddForm(false);
      alert('Şablon kaydedildi!');
    } catch (error: any) {
      console.error('Şablon kaydedilemedi:', error);
      alert(`Şablon kaydedilemedi: ${error.message}`);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!activeAccountId) {
      alert('Lütfen bir hesap seçin');
      return;
    }

    if (window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) {
      try {
        await templatesApi.deleteTemplate(activeAccountId, id);
        // Şablonları yeniden yükle
        await loadTemplates();
      } catch (error: any) {
        console.error('Şablon silinemedi:', error);
        alert(`Şablon silinemedi: ${error.message}`);
      }
    }
  };

  const handleSendTemplate = async (template: MessageTemplate) => {
    if (!activeAccountId || !selectedChatJid) {
      alert('Lütfen bir hesap ve sohbet seçin');
      return;
    }

    try {
      if (template.type === 'button') {
        await sendButtonMessage(
          activeAccountId,
          selectedChatJid,
          template.data.text,
          template.data.buttons,
          template.data.footer,
          undefined
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
          undefined
        );
      }
      onSendTemplate(template);
      alert('Mesaj gönderildi!');
    } catch (error: any) {
      console.error('Mesaj gönderilemedi:', error);
      alert(`Mesaj gönderilemedi: ${error.message}`);
    }
  };

  const resetForm = () => {
    setTemplateName('');
    setButtonText('');
    setButtonFooter('');
    setButtons([{ buttonId: 'btn1', displayText: '', type: 1 }]);
    setListText('');
    setListTitle('');
    setListButtonText('Seçenekleri Görüntüle');
    setListFooter('');
    setSections([{ title: 'Bölüm 1', rows: [{ title: '', description: '', rowId: 'row1' }] }]);
    setTemplateNameInput('');
    setTemplateLanguageCode('tr');
    setProductText('');
    setProductFooter('');
    setBusinessOwnerJid('');
    setProductList([{ title: 'Kategori', products: [{ productId: '' }] }]);
  };

  const addButton = () => {
    if (buttons.length < 3) {
      setButtons([...buttons, { buttonId: `btn${buttons.length + 1}`, displayText: '', type: 1 }]);
    }
  };

  const removeButton = (index: number) => {
    if (buttons.length > 1) {
      setButtons(buttons.filter((_, i) => i !== index));
    }
  };

  const addListRow = (sectionIndex: number) => {
    const newSections = [...sections];
    if (newSections[sectionIndex].rows.length < 10) {
      newSections[sectionIndex].rows.push({
        title: '',
        description: '',
        rowId: `row${Date.now()}`,
      });
      setSections(newSections);
    }
  };

  const removeListRow = (sectionIndex: number, rowIndex: number) => {
    const newSections = [...sections];
    if (newSections[sectionIndex].rows.length > 1) {
      newSections[sectionIndex].rows = newSections[sectionIndex].rows.filter((_, i) => i !== rowIndex);
      setSections(newSections);
    }
  };

  const addListSection = () => {
    setSections([...sections, { title: `Bölüm ${sections.length + 1}`, rows: [{ title: '', description: '', rowId: `row${Date.now()}` }] }]);
  };

  const removeListSection = (index: number) => {
    if (sections.length > 1) {
      setSections(sections.filter((_, i) => i !== index));
    }
  };

  if (!isOpen) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'button': return <Square size={16} />;
      case 'list': return <List size={16} />;
      case 'template': return <FileText size={16} />;
      case 'product': return <Package size={16} />;
      default: return <FileText size={16} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'button': return 'Butonlu Mesaj';
      case 'list': return 'Liste Mesajı';
      case 'template': return 'Şablon Mesajı';
      case 'product': return 'Ürün Mesajı';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[90vw] max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Mesaj Şablonları</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
            >
              <Plus size={18} />
              Yeni Şablon
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {showAddForm ? (
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="border-b pb-4">
              <h3 className="text-lg font-semibold mb-4">Yeni Şablon Oluştur</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Şablon Adı</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Örn: Müşteri Desteği Butonları"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Şablon Tipi</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['button', 'list', 'template', 'product'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setTemplateType(type)}
                      className={`p-3 border rounded-lg flex flex-col items-center gap-2 ${
                        templateType === type ? 'border-green-500 bg-green-50' : ''
                      }`}
                    >
                      {getTypeIcon(type)}
                      <span className="text-xs">{getTypeLabel(type)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Button Template Form */}
            {templateType === 'button' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Mesaj Metni *</label>
                  <textarea
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                    placeholder="Mesaj metnini girin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Alt Bilgi (Footer)</label>
                  <input
                    type="text"
                    value={buttonFooter}
                    onChange={(e) => setButtonFooter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="© 2025 Şirketimiz"
                    maxLength={60}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Butonlar (En fazla 3) *</label>
                  {buttons.map((btn, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={btn.displayText}
                        onChange={(e) => {
                          const newButtons = [...buttons];
                          newButtons[index].displayText = e.target.value;
                          setButtons(newButtons);
                        }}
                        className="flex-1 px-3 py-2 border rounded-lg"
                        placeholder={`Buton ${index + 1} metni`}
                        maxLength={20}
                      />
                      <select
                        value={btn.type}
                        onChange={(e) => {
                          const newButtons = [...buttons];
                          newButtons[index].type = parseInt(e.target.value) as 1 | 2 | 3;
                          setButtons(newButtons);
                        }}
                        className="px-3 py-2 border rounded-lg"
                      >
                        <option value={1}>Hızlı Yanıt</option>
                        <option value={2}>URL</option>
                        <option value={3}>Ara</option>
                      </select>
                      {buttons.length > 1 && (
                        <button
                          onClick={() => removeButton(index)}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {buttons.length < 3 && (
                    <button
                      onClick={addButton}
                      className="mt-2 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Buton Ekle
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* List Template Form */}
            {templateType === 'list' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Mesaj Metni *</label>
                  <textarea
                    value={listText}
                    onChange={(e) => setListText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={2}
                    placeholder="Mesaj metnini girin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Liste Başlığı *</label>
                  <input
                    type="text"
                    value={listTitle}
                    onChange={(e) => setListTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Menü"
                    maxLength={24}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Buton Metni *</label>
                  <input
                    type="text"
                    value={listButtonText}
                    onChange={(e) => setListButtonText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Seçenekleri Görüntüle"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Alt Bilgi (Footer)</label>
                  <input
                    type="text"
                    value={listFooter}
                    onChange={(e) => setListFooter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    maxLength={60}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Bölümler ve Seçenekler (En fazla 10 seçenek) *</label>
                  {sections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className="mb-4 p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) => {
                            const newSections = [...sections];
                            newSections[sectionIndex].title = e.target.value;
                            setSections(newSections);
                          }}
                          className="flex-1 px-3 py-2 border rounded-lg"
                          placeholder="Bölüm başlığı"
                        />
                        {sections.length > 1 && (
                          <button
                            onClick={() => removeListSection(sectionIndex)}
                            className="ml-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      {section.rows.map((row, rowIndex) => (
                        <div key={rowIndex} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) => {
                              const newSections = [...sections];
                              newSections[sectionIndex].rows[rowIndex].title = e.target.value;
                              setSections(newSections);
                            }}
                            className="flex-1 px-3 py-2 border rounded-lg"
                            placeholder="Seçenek başlığı"
                            maxLength={24}
                          />
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => {
                              const newSections = [...sections];
                              newSections[sectionIndex].rows[rowIndex].description = e.target.value;
                              setSections(newSections);
                            }}
                            className="flex-1 px-3 py-2 border rounded-lg"
                            placeholder="Açıklama"
                            maxLength={72}
                          />
                          {section.rows.length > 1 && (
                            <button
                              onClick={() => removeListRow(sectionIndex, rowIndex)}
                              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      {section.rows.length < 10 && (
                        <button
                          onClick={() => addListRow(sectionIndex)}
                          className="mt-2 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 flex items-center gap-2"
                        >
                          <Plus size={16} />
                          Seçenek Ekle
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addListSection}
                    className="mt-2 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Bölüm Ekle
                  </button>
                </div>
              </div>
            )}

            {/* Template Message Form */}
            {templateType === 'template' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Şablon Adı (Onaylanmış) *</label>
                  <input
                    type="text"
                    value={templateNameInput}
                    onChange={(e) => setTemplateNameInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="whatsapp_template_name"
                  />
                  <p className="text-xs text-gray-500 mt-1">WhatsApp Business API'de onaylanmış şablon adı</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Dil Kodu</label>
                  <select
                    value={templateLanguageCode}
                    onChange={(e) => setTemplateLanguageCode(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
              </div>
            )}

            {/* Product Template Form */}
            {templateType === 'product' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Mesaj Metni *</label>
                  <textarea
                    value={productText}
                    onChange={(e) => setProductText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Business Owner JID 
                    {activeAccountJid ? (
                      <span className="text-xs text-gray-500 font-normal ml-2">(Boş bırakılırsa aktif hesap kullanılır)</span>
                    ) : (
                      <span className="text-red-500"> *</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={businessOwnerJid}
                    onChange={(e) => setBusinessOwnerJid(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder={activeAccountJid || "905551234567@s.whatsapp.net"}
                  />
                  {activeAccountJid && (
                    <p className="text-xs text-gray-500 mt-1">
                      Aktif hesap JID: {activeAccountJid}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Alt Bilgi (Footer)</label>
                  <input
                    type="text"
                    value={productFooter}
                    onChange={(e) => setProductFooter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    maxLength={60}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Ürün Listesi *</label>
                  {productList.map((list, index) => (
                    <div key={index} className="mb-4 p-4 border rounded-lg">
                      <input
                        type="text"
                        value={list.title}
                        onChange={(e) => {
                          const newList = [...productList];
                          newList[index].title = e.target.value;
                          setProductList(newList);
                        }}
                        className="w-full px-3 py-2 border rounded-lg mb-2"
                        placeholder="Kategori adı"
                      />
                      {list.products.map((product, pIndex) => (
                        <div key={pIndex} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={product.productId}
                            onChange={(e) => {
                              const newList = [...productList];
                              newList[index].products[pIndex].productId = e.target.value;
                              setProductList(newList);
                            }}
                            className="flex-1 px-3 py-2 border rounded-lg"
                            placeholder="Ürün ID"
                          />
                          {list.products.length > 1 && (
                            <button
                              onClick={() => {
                                const newList = [...productList];
                                newList[index].products = newList[index].products.filter((_, i) => i !== pIndex);
                                setProductList(newList);
                              }}
                              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const newList = [...productList];
                          newList[index].products.push({ productId: '' });
                          setProductList(newList);
                        }}
                        className="mt-2 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 flex items-center gap-2"
                      >
                        <Plus size={16} />
                        Ürün Ekle
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <button
                onClick={saveTemplate}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Save size={18} />
                Kaydet
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setShowAddForm(false);
                }}
                className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
              >
                İptal
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                <p>Henüz şablon yok</p>
                <p className="text-sm mt-2">Yeni şablon oluşturmak için "Yeni Şablon" butonuna tıklayın</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(template.type)}
                        <h3 className="font-semibold">{template.name}</h3>
                      </div>
                      <div className="flex gap-2">
                        {onSelectTemplate ? (
                          // Chat sırasında şablon seçme modu
                          <button
                            onClick={() => {
                              onSelectTemplate(template);
                              onClose();
                            }}
                            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                            title="Şablonu Seç"
                          >
                            <Send size={16} />
                          </button>
                        ) : activeAccountId && selectedChatJid ? (
                          // Normal gönderme modu
                          <button
                            onClick={() => handleSendTemplate(template)}
                            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                            title="Gönder"
                          >
                            <Send size={16} />
                          </button>
                        ) : null}
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                          title="Sil"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 mb-2">
                      <span className="inline-block px-2 py-1 bg-gray-100 rounded">{getTypeLabel(template.type)}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(template.createdAt).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
