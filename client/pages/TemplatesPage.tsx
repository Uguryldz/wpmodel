import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Edit2, FileText, X, Check, List, Square, Package } from 'lucide-react';
import * as templatesApi from '../api/templates';

export interface MessageTemplate {
  id: string;
  name: string;
  type: 'button' | 'list' | 'template' | 'product';
  data: any;
  createdAt: number;
}

interface TemplatesPageProps {
  activeAccountId: string | undefined;
  onBack: () => void;
}

export default function TemplatesPage({ activeAccountId, onBack }: TemplatesPageProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateType, setTemplateType] = useState<'button' | 'list' | 'template' | 'product'>('button');
  const [templateName, setTemplateName] = useState('');
  
  // Button template form
  const [buttonText, setButtonText] = useState('');
  const [buttonFooter, setButtonFooter] = useState('');
  const [buttonHeaderType, setButtonHeaderType] = useState<1 | 2 | 3 | 4>(1); // 1=text, 2=image, 3=video, 4=document
  const [buttonHeaderText, setButtonHeaderText] = useState('');
  const [buttonHeaderImage, setButtonHeaderImage] = useState('');
  const [buttonHeaderVideo, setButtonHeaderVideo] = useState('');
  const [buttonHeaderDocument, setButtonHeaderDocument] = useState('');
  const [buttons, setButtons] = useState<Array<{ buttonId: string; displayText: string; type: 1 | 2 | 3; url?: string; phoneNumber?: string }>>([
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
  const [templateComponents, setTemplateComponents] = useState<Array<{ type: string; parameters: Array<{ type: string; text?: string; image?: any; video?: any; document?: any }> }>>([]);
  
  // Product template form
  const [productText, setProductText] = useState('');
  const [productFooter, setProductFooter] = useState('');
  const [businessOwnerJid, setBusinessOwnerJid] = useState('');
  const [productThumbnail, setProductThumbnail] = useState('');
  const [productList, setProductList] = useState<Array<{ title: string; products: Array<{ productId: string }> }>>([
    { title: 'Kategori', products: [{ productId: '' }] },
  ]);

  useEffect(() => {
    if (activeAccountId) {
      loadTemplates();
    }
  }, [activeAccountId]);

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
        footer: buttonFooter || undefined,
        buttons: validButtons.map(btn => {
          const buttonData: any = {
            buttonId: btn.buttonId,
            buttonText: { displayText: btn.displayText },
            type: btn.type
          };
          // URL butonu için URL ekle
          if (btn.type === 2 && btn.url) {
            buttonData.url = btn.url;
          }
          // Call butonu için telefon numarası ekle
          if (btn.type === 3 && btn.phoneNumber) {
            buttonData.phoneNumber = btn.phoneNumber;
          }
          return buttonData;
        }),
        header: buttonHeaderType === 1 && buttonHeaderText ? {
          type: 1,
          text: buttonHeaderText
        } : buttonHeaderType === 2 && buttonHeaderImage ? {
          type: 2,
          image: buttonHeaderImage
        } : buttonHeaderType === 3 && buttonHeaderVideo ? {
          type: 3,
          video: buttonHeaderVideo
        } : buttonHeaderType === 4 && buttonHeaderDocument ? {
          type: 4,
          document: buttonHeaderDocument
        } : undefined
      };
    } else if (templateType === 'list') {
      if (!listText.trim() || !listTitle.trim() || !listButtonText.trim()) {
        alert('Lütfen tüm zorunlu alanları doldurun');
        return;
      }
      const validSections = sections.filter(section => 
        section.title.trim() && section.rows.some(row => row.title.trim())
      );
      if (validSections.length === 0) {
        alert('En az bir bölüm ve seçenek ekleyin');
        return;
      }
      templateData = {
        text: listText,
        title: listTitle,
        buttonText: listButtonText,
        footer: listFooter || undefined,
        sections: validSections.map(section => ({
          title: section.title,
          rows: section.rows.filter(row => row.title.trim()).map(row => ({
            title: row.title,
            description: row.description || undefined,
            rowId: row.rowId
          }))
        }))
      };
    } else if (templateType === 'template') {
      if (!templateNameInput.trim()) {
        alert('Lütfen şablon adı girin');
        return;
      }
      templateData = {
        templateName: templateNameInput,
        languageCode: templateLanguageCode
      };
    } else if (templateType === 'product') {
      if (!productText.trim() || !businessOwnerJid.trim()) {
        alert('Lütfen mesaj metni ve business owner JID girin');
        return;
      }
      const validProductList = productList.filter(list => 
        list.title.trim() && list.products.some(p => p.productId.trim())
      );
      if (validProductList.length === 0) {
        alert('En az bir ürün kategorisi ekleyin');
        return;
      }
      templateData = {
        text: productText,
        footer: productFooter || undefined,
        businessOwnerJid,
        thumbnail: productThumbnail || undefined,
        productList: validProductList.map(list => ({
          title: list.title,
          products: list.products.filter(p => p.productId.trim()).map(p => ({
            productId: p.productId
          }))
        }))
      };
    }

    try {
      if (editingTemplateId) {
        // Düzenleme modu
        await templatesApi.updateTemplate(activeAccountId, editingTemplateId, {
          name: templateName,
          type: templateType,
          data: templateData
        });
        alert('Şablon güncellendi!');
      } else {
        // Yeni şablon oluşturma
        await templatesApi.createTemplate(activeAccountId, templateName, templateType, templateData);
        alert('Şablon kaydedildi!');
      }
      await loadTemplates();
      setShowAddForm(false);
      setEditingTemplateId(null);
      resetForm();
    } catch (error: any) {
      console.error('Şablon kaydedilemedi:', error);
      alert(`Şablon kaydedilemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  const editTemplate = (template: MessageTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateType(template.type);
    setShowAddForm(true);

    // Şablon verilerini form alanlarına yükle
    if (template.type === 'button') {
      setButtonText(template.data?.text || '');
      setButtonFooter(template.data?.footer || '');
      setButtonHeaderType(template.data?.header?.type || 1);
      setButtonHeaderText(template.data?.header?.text || '');
      setButtonHeaderImage(template.data?.header?.image || '');
      setButtonHeaderVideo(template.data?.header?.video || '');
      setButtonHeaderDocument(template.data?.header?.document || '');
      setButtons(template.data?.buttons?.map((btn: any, index: number) => ({
        buttonId: btn.buttonId || `btn${index + 1}`,
        displayText: btn.buttonText?.displayText || btn.displayText || '',
        type: btn.type || 1,
        url: btn.url,
        phoneNumber: btn.phoneNumber
      })) || [{ buttonId: 'btn1', displayText: '', type: 1 }]);
    } else if (template.type === 'list') {
      setListText(template.data?.text || '');
      setListTitle(template.data?.title || '');
      setListButtonText(template.data?.buttonText || 'Seçenekleri Görüntüle');
      setListFooter(template.data?.footer || '');
      setSections(template.data?.sections || [{ title: 'Bölüm 1', rows: [{ title: '', description: '', rowId: 'row1' }] }]);
    } else if (template.type === 'template') {
      setTemplateNameInput(template.data?.templateName || '');
      setTemplateLanguageCode(template.data?.languageCode || 'tr');
      setTemplateComponents(template.data?.components || []);
    } else if (template.type === 'product') {
      setProductText(template.data?.text || '');
      setProductFooter(template.data?.footer || '');
      setBusinessOwnerJid(template.data?.businessOwnerJid || '');
      setProductThumbnail(template.data?.thumbnail || '');
      setProductList(template.data?.productList || [{ title: 'Kategori', products: [{ productId: '' }] }]);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!window.confirm('Bu şablonu silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await templatesApi.deleteTemplate(activeAccountId, templateId);
      await loadTemplates();
      alert('Şablon silindi!');
    } catch (error: any) {
      console.error('Şablon silinemedi:', error);
      alert(`Şablon silinemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
  };

  const resetForm = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setButtonText('');
    setButtonFooter('');
    setButtonHeaderType(1);
    setButtonHeaderText('');
    setButtonHeaderImage('');
    setButtonHeaderVideo('');
    setButtonHeaderDocument('');
    setButtons([{ buttonId: 'btn1', displayText: '', type: 1 }]);
    setListText('');
    setListTitle('');
    setListButtonText('Seçenekleri Görüntüle');
    setListFooter('');
    setSections([{ title: 'Bölüm 1', rows: [{ title: '', description: '', rowId: 'row1' }] }]);
    setTemplateNameInput('');
    setTemplateLanguageCode('tr');
    setTemplateComponents([]);
    setProductText('');
    setProductFooter('');
    setBusinessOwnerJid('');
    setProductThumbnail('');
    setProductList([{ title: 'Kategori', products: [{ productId: '' }] }]);
  };

  const addButton = () => {
    if (buttons.length >= 3) {
      alert('En fazla 3 buton ekleyebilirsiniz');
      return;
    }
    setButtons([...buttons, { buttonId: `btn${buttons.length + 1}`, displayText: '', type: 1 }]);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const addSection = () => {
    setSections([...sections, { title: '', rows: [{ title: '', description: '', rowId: `row${Date.now()}` }] }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const addRow = (sectionIndex: number) => {
    const newSections = [...sections];
    const totalRows = newSections.reduce((sum, s) => sum + s.rows.length, 0);
    if (totalRows >= 10) {
      alert('Toplamda en fazla 10 seçenek ekleyebilirsiniz');
      return;
    }
    newSections[sectionIndex].rows.push({ title: '', description: '', rowId: `row${Date.now()}` });
    setSections(newSections);
  };

  const removeRow = (sectionIndex: number, rowIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].rows = newSections[sectionIndex].rows.filter((_, i) => i !== rowIndex);
    setSections(newSections);
  };

  const addProductCategory = () => {
    setProductList([...productList, { title: '', products: [{ productId: '' }] }]);
  };

  const removeProductCategory = (index: number) => {
    setProductList(productList.filter((_, i) => i !== index));
  };

  const addProduct = (categoryIndex: number) => {
    const newProductList = [...productList];
    newProductList[categoryIndex].products.push({ productId: '' });
    setProductList(newProductList);
  };

  const removeProduct = (categoryIndex: number, productIndex: number) => {
    const newProductList = [...productList];
    newProductList[categoryIndex].products = newProductList[categoryIndex].products.filter((_, i) => i !== productIndex);
    setProductList(newProductList);
  };

  // Örnek şablonlar oluştur
  const createExampleTemplate = async (type: 'button' | 'list' | 'template' | 'product') => {
    try {
      let templateData: any = {};
      let name = '';

      if (type === 'button') {
        name = 'Örnek: Hoş Geldin Mesajı';
        templateData = {
          text: 'Merhaba! Hoş geldiniz. Size nasıl yardımcı olabiliriz?',
          footer: 'Bizimle iletişime geçin',
          buttons: [
            {
              buttonId: 'btn_info',
              buttonText: { displayText: '📋 Bilgi Al' },
              type: 1
            },
            {
              buttonId: 'btn_website',
              buttonText: { displayText: '🌐 Web Sitemiz' },
              type: 2,
              url: 'https://example.com'
            },
            {
              buttonId: 'btn_call',
              buttonText: { displayText: '📞 Bizi Arayın' },
              type: 3,
              phoneNumber: '+905551234567'
            }
          ],
          header: {
            type: 1,
            text: 'Hoş Geldiniz! 👋'
          }
        };
      } else if (type === 'list') {
        name = 'Örnek: Sipariş Durumu';
        templateData = {
          text: 'Sipariş durumunuzu öğrenmek için lütfen bir seçenek seçin:',
          title: 'Sipariş Durumu',
          buttonText: 'Durumu Görüntüle',
          footer: 'Müşteri Hizmetleri',
          sections: [
            {
              title: 'Sipariş İşlemleri',
              rows: [
                {
                  title: 'Sipariş Sorgula',
                  description: 'Sipariş numaranızı girerek durumu öğrenin',
                  rowId: 'order_query'
                },
                {
                  title: 'Kargo Takibi',
                  description: 'Kargo durumunuzu takip edin',
                  rowId: 'cargo_track'
                },
                {
                  title: 'İade/Değişim',
                  description: 'İade veya değişim talebi oluşturun',
                  rowId: 'return_exchange'
                }
              ]
            },
            {
              title: 'Destek',
              rows: [
                {
                  title: 'Müşteri Hizmetleri',
                  description: 'Bizimle iletişime geçin',
                  rowId: 'customer_service'
                },
                {
                  title: 'SSS',
                  description: 'Sık sorulan sorular',
                  rowId: 'faq'
                }
              ]
            }
          ]
        };
      } else if (type === 'template') {
        name = 'Örnek: WhatsApp Business Şablonu';
        templateData = {
          templateName: 'welcome_message',
          languageCode: 'tr',
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: 'Ahmet'
                }
              ]
            },
            {
              type: 'header',
              parameters: [
                {
                  type: 'text',
                  text: 'Özel Kampanya'
                }
              ]
            }
          ]
        };
      } else if (type === 'product') {
        name = 'Örnek: Ürün Kataloğu';
        templateData = {
          text: 'Merhaba! Size özel ürünlerimizi keşfedin. İlgilendiğiniz kategoriyi seçin:',
          footer: 'Tüm ürünlerimiz için web sitemizi ziyaret edin',
          businessOwnerJid: '905551234567@s.whatsapp.net',
          thumbnail: 'https://example.com/catalog-thumbnail.jpg',
          productList: [
            {
              title: 'Elektronik',
              products: [
                { productId: 'PROD001' },
                { productId: 'PROD002' }
              ]
            },
            {
              title: 'Giyim',
              products: [
                { productId: 'PROD003' },
                { productId: 'PROD004' }
              ]
            },
            {
              title: 'Ev & Yaşam',
              products: [
                { productId: 'PROD005' }
              ]
            }
          ]
        };
      }

      if (!activeAccountId) {
        alert('Lütfen önce bir hesap seçin');
        return;
      }

      console.log('Örnek şablon oluşturuluyor:', { activeAccountId, name, type, templateData });
      const result = await templatesApi.createTemplate(activeAccountId, name, type, templateData);
      console.log('Şablon oluşturuldu:', result);
      await loadTemplates();
      alert(`${name} şablonu başarıyla oluşturuldu!`);
    } catch (error: any) {
      console.error('Örnek şablon oluşturulamadı - Detaylar:', {
        error,
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        type,
        activeAccountId
      });
      
      let errorMessage = 'Bilinmeyen hata';
      
      if (error?.message) {
        errorMessage = error.message;
        // JSON parse hatası varsa düzelt
        if (errorMessage.includes('JSON')) {
          errorMessage = 'Sunucu yanıtı işlenemedi. Lütfen tekrar deneyin.';
        }
      } else if (error instanceof Error) {
        errorMessage = error.toString();
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`Örnek şablon oluşturulamadı:\n\n${errorMessage}\n\nLütfen konsolu kontrol edin.`);
    }
  };

  if (!activeAccountId) {
    return (
      <div className="flex h-screen bg-gray-100 items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Aktif hesap bulunamadı</p>
          <button
            onClick={onBack}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Geri Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Sol Taraf - Başlık */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Geri Dön"
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Mesaj Şablonları</h1>
              <p className="text-xs text-gray-500 mt-0.5">Hızlı mesaj şablonlarınızı yönetin</p>
            </div>
          </div>

          {/* Sağ Taraf - Yeni Şablon Butonu */}
          {!showAddForm && (
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="bg-green-500 text-white px-5 py-2.5 rounded-lg hover:bg-green-600 transition-all shadow-md hover:shadow-lg flex items-center space-x-2 group"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              <span className="font-medium">Yeni Şablon</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {showAddForm ? (
  <div className="max-w-4xl mx-auto">
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-white px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {editingTemplateId ? '✏️ Şablonu Düzenle' : '✨ Yeni Şablon Oluştur'}
          </h2>
          <button
            onClick={() => {
              setShowAddForm(false);
              setEditingTemplateId(null);
              resetForm();
            }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6 max-h-[calc(100vh-250px)] overflow-y-auto">
        {/* Şablon Tipi */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">Şablon Tipi</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { type: 'button', icon: Square, label: 'Buton', color: 'blue' },
              { type: 'list', icon: List, label: 'Liste', color: 'purple' },
              { type: 'template', icon: FileText, label: 'Şablon', color: 'orange' },
              { type: 'product', icon: Package, label: 'Ürün', color: 'green' }
            ].map(({ type, icon: Icon, label, color }) => (
              <button
                key={type}
                onClick={() => setTemplateType(type as any)}
                className={`p-4 border-2 rounded-xl transition-all ${
                  templateType === type 
                    ? `border-${color}-100 bg-${color}-50 shadow-md` 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon 
                  size={24} 
                  className={`mx-auto mb-2 ${
                    templateType === type ? `text-${color}-600` : 'text-gray-400'
                  }`} 
                />
                <span className={`text-sm font-semibold ${
                  templateType === type ? `text-${color}-700` : 'text-gray-600'
                }`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Şablon Adı */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Şablon Adı <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Örn: Hoş Geldin Mesajı"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {/* BUTON ŞABLONU */}
        {templateType === 'button' && (
          <div className="space-y-5 p-5 bg-blue-50/40 rounded-xl border-2 border-blue-100">
            {/* Mesaj Metni */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                💬 Mesaj Metni <span className="text-red-500">*</span>
              </label>
              <textarea
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Mesaj metnini buraya yazın"
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            {/* Header */}
            <div className="p-4 bg-white rounded-lg border border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-3">📌 Header (Opsiyonel)</label>
              <select
                value={buttonHeaderType}
                onChange={(e) => setButtonHeaderType(Number(e.target.value) as 1 | 2 | 3 | 4)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value={1}>📝 Text</option>
                <option value={2}>🖼️ Image</option>
                <option value={3}>🎥 Video</option>
                <option value={4}>📄 Document</option>
              </select>
              {buttonHeaderType === 1 && (
                <input
                  type="text"
                  value={buttonHeaderText}
                  onChange={(e) => setButtonHeaderText(e.target.value)}
                  placeholder="Header metni"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              )}
              {buttonHeaderType === 2 && (
                <input
                  type="text"
                  value={buttonHeaderImage}
                  onChange={(e) => setButtonHeaderImage(e.target.value)}
                  placeholder="Image URL veya path"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              )}
              {buttonHeaderType === 3 && (
                <input
                  type="text"
                  value={buttonHeaderVideo}
                  onChange={(e) => setButtonHeaderVideo(e.target.value)}
                  placeholder="Video URL veya path"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              )}
              {buttonHeaderType === 4 && (
                <input
                  type="text"
                  value={buttonHeaderDocument}
                  onChange={(e) => setButtonHeaderDocument(e.target.value)}
                  placeholder="Document URL veya path"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              )}
            </div>

            {/* Footer */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">📝 Alt Bilgi (Opsiyonel)</label>
              <input
                type="text"
                value={buttonFooter}
                onChange={(e) => setButtonFooter(e.target.value)}
                placeholder="Alt bilgi metni"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Butonlar */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                🔘 Butonlar (En fazla 3) <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                {buttons.map((button, index) => (
                  <div key={index} className="p-4 bg-white border-2 border-gray-200 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                        <span>Buton {index + 1}</span>
                      </span>
                      {buttons.length > 1 && (
                        <button
                          onClick={() => removeButton(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
                        >
                          <X size={14} />
                          <span className="text-sm font-medium">Kaldır</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={button.displayText}
                        onChange={(e) => {
                          const newButtons = [...buttons];
                          newButtons[index].displayText = e.target.value;
                          setButtons(newButtons);
                        }}
                        placeholder="Buton metni"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <select
                        value={button.type}
                        onChange={(e) => {
                          const newButtons = [...buttons];
                          newButtons[index].type = Number(e.target.value) as 1 | 2 | 3;
                          setButtons(newButtons);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value={1}>⚡ Hızlı Yanıt</option>
                        <option value={2}>🔗 URL</option>
                        <option value={3}>📞 Arama</option>
                      </select>
                      {button.type === 2 && (
                        <input
                          type="text"
                          value={button.url || ''}
                          onChange={(e) => {
                            const newButtons = [...buttons];
                            newButtons[index].url = e.target.value;
                            setButtons(newButtons);
                          }}
                          placeholder="https://example.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      )}
                      {button.type === 3 && (
                        <input
                          type="text"
                          value={button.phoneNumber || ''}
                          onChange={(e) => {
                            const newButtons = [...buttons];
                            newButtons[index].phoneNumber = e.target.value;
                            setButtons(newButtons);
                          }}
                          placeholder="+905551234567"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {buttons.length < 3 && (
                <button
                  onClick={addButton}
                  className="mt-3 text-green-600 hover:text-green-700 hover:bg-green-50 px-4 py-2.5 rounded-lg transition-colors flex items-center space-x-2 font-semibold"
                >
                  <Plus size={18} />
                  <span>Buton Ekle</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* LİSTE ŞABLONU */}
        {templateType === 'list' && (
          <div className="space-y-5 p-5 bg-purple-50/40 rounded-xl border-2 border-purple-100">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                💬 Mesaj Metni <span className="text-red-500">*</span>
              </label>
              <textarea
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                placeholder="Mesaj metnini buraya yazın"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                📋 Liste Başlığı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={listTitle}
                onChange={(e) => setListTitle(e.target.value)}
                placeholder="Liste başlığı"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                🔘 Buton Metni <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={listButtonText}
                onChange={(e) => setListButtonText(e.target.value)}
                placeholder="Seçenekleri Görüntüle"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">📝 Alt Bilgi (Opsiyonel)</label>
              <input
                type="text"
                value={listFooter}
                onChange={(e) => setListFooter(e.target.value)}
                placeholder="Alt bilgi metni"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📑 Bölümler ve Seçenekler (Max 10) <span className="text-red-500">*</span>
              </label>
              <div className="space-y-4">
                {sections.map((section, sectionIndex) => {
                  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
                  return (
                    <div key={sectionIndex} className="p-4 bg-white border-2 border-gray-200 rounded-xl">
                      <div className="flex items-center space-x-2 mb-3">
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) => {
                            const newSections = [...sections];
                            newSections[sectionIndex].title = e.target.value;
                            setSections(newSections);
                          }}
                          placeholder="Bölüm başlığı"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        {sections.length > 1 && (
                          <button
                            onClick={() => removeSection(sectionIndex)}
                            className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {section.rows.map((row, rowIndex) => (
                          <div key={rowIndex} className="p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-500">Seçenek {rowIndex + 1}</span>
                              {section.rows.length > 1 && (
                                <button
                                  onClick={() => removeRow(sectionIndex, rowIndex)}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  Kaldır
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={row.title}
                              onChange={(e) => {
                                const newSections = [...sections];
                                newSections[sectionIndex].rows[rowIndex].title = e.target.value;
                                setSections(newSections);
                              }}
                              placeholder="Seçenek başlığı"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded mb-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => {
                                const newSections = [...sections];
                                newSections[sectionIndex].rows[rowIndex].description = e.target.value;
                                setSections(newSections);
                              }}
                              placeholder="Açıklama (opsiyonel)"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                        ))}
                      </div>
                      {totalRows < 10 && (
                        <button
                          onClick={() => addRow(sectionIndex)}
                          className="mt-2 text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        >
                          + Seçenek Ekle
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={addSection}
                className="mt-3 text-purple-600 hover:bg-purple-50 px-4 py-2.5 rounded-lg transition-colors flex items-center space-x-2 font-semibold"
              >
                <Plus size={18} />
                <span>Bölüm Ekle</span>
              </button>
            </div>
          </div>
        )}

        {/* TEMPLATE ŞABLONU */}
        {templateType === 'template' && (
          <div className="space-y-5 p-5 bg-orange-50/40 rounded-xl border-2 border-orange-100">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                📄 WhatsApp Business Şablon Adı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={templateNameInput}
                onChange={(e) => setTemplateNameInput(e.target.value)}
                placeholder="Onaylanmış şablon adı"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">🌍 Dil Kodu</label>
              <select
                value={templateLanguageCode}
                onChange={(e) => setTemplateLanguageCode(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="tr">🇹🇷 Türkçe</option>
                <option value="en">🇬🇧 İngilizce</option>
                <option value="de">🇩🇪 Almanca</option>
                <option value="fr">🇫🇷 Fransızca</option>
              </select>
            </div>
          </div>
        )}

        {/* ÜRÜN ŞABLONU */}
        {templateType === 'product' && (
          <div className="space-y-5 p-5 bg-green-50/40 rounded-xl border-2 border-green-100">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                💬 Mesaj Metni <span className="text-red-500">*</span>
              </label>
              <textarea
                value={productText}
                onChange={(e) => setProductText(e.target.value)}
                placeholder="Mesaj metnini buraya yazın"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                👤 Business Owner JID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={businessOwnerJid}
                onChange={(e) => setBusinessOwnerJid(e.target.value)}
                placeholder="905551234567@s.whatsapp.net"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">📝 Alt Bilgi (Opsiyonel)</label>
              <input
                type="text"
                value={productFooter}
                onChange={(e) => setProductFooter(e.target.value)}
                placeholder="Alt bilgi metni"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">🖼️ Thumbnail URL (Opsiyonel)</label>
              <input
                type="text"
                value={productThumbnail}
                onChange={(e) => setProductThumbnail(e.target.value)}
                placeholder="https://example.com/product.jpg"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📦 Ürün Kategorileri <span className="text-red-500">*</span>
              </label>
              <div className="space-y-4">
                {productList.map((category, categoryIndex) => (
                  <div key={categoryIndex} className="p-4 bg-white border-2 border-gray-200 rounded-xl">
                    <div className="flex items-center space-x-2 mb-3">
                      <input
                        type="text"
                        value={category.title}
                        onChange={(e) => {
                          const newProductList = [...productList];
                          newProductList[categoryIndex].title = e.target.value;
                          setProductList(newProductList);
                        }}
                        placeholder="Kategori başlığı"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      {productList.length > 1 && (
                        <button
                          onClick={() => removeProductCategory(categoryIndex)}
                          className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {category.products.map((product, productIndex) => (
                        <div key={productIndex} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={product.productId}
                            onChange={(e) => {
                              const newProductList = [...productList];
                              newProductList[categoryIndex].products[productIndex].productId = e.target.value;
                              setProductList(newProductList);
                            }}
                            placeholder="Ürün ID"
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          {category.products.length > 1 && (
                            <button
                              onClick={() => removeProduct(categoryIndex, productIndex)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => addProduct(categoryIndex)}
                      className="mt-2 text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      + Ürün Ekle
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addProductCategory}
                className="mt-3 text-green-600 hover:bg-green-50 px-4 py-2.5 rounded-lg transition-colors flex items-center space-x-2 font-semibold"
              >
                <Plus size={18} />
                <span>Kategori Ekle</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
        <button
          onClick={() => {
            setShowAddForm(false);
            setEditingTemplateId(null);
            resetForm();
          }}
          className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all font-medium"
        >
          İptal
        </button>
        <button
          onClick={saveTemplate}
          className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg font-medium flex items-center space-x-2"
        >
          {editingTemplateId ? (
            <>
              <Check size={18} />
              <span>Güncelle</span>
            </>
          ) : (
            <>
              <Plus size={18} />
              <span>Kaydet</span>
            </>
          )}
        </button>
      </div>
    </div>
  </div>
) : (
          <div className="max-w-6xl mx-auto">
            {templates.length === 0 ? (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText size={40} className="text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Henüz şablon yok</h3>
                <p className="text-gray-600 mb-6">İlk mesaj şablonunuzu oluşturarak başlayın</p>
                <div className="space-y-4">
                  <button
                    onClick={() => {
                      setShowAddForm(true);
                      resetForm();
                    }}
                    className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors mr-2"
                  >
                    İlk Şablonu Oluştur
                  </button>
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-4 text-center">
                      🚀 Hızlı Başlangıç - Örnek Şablonlar
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <button
                        onClick={() => createExampleTemplate('button')}
                        className="group bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-200 hover:border-blue-300 text-blue-700 px-4 py-4 rounded-xl transition-all hover:shadow-lg hover:scale-105 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-12 h-12 bg-blue-200/30 rounded-bl-full"></div>
                        <Square size={24} className="mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold block">Buton</span>
                        <span className="text-xs text-blue-600 mt-1 block">Örnek Şablon</span>
                      </button>

                      <button
                        onClick={() => createExampleTemplate('list')}
                        className="group bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 border-2 border-purple-200 hover:border-purple-300 text-purple-700 px-4 py-4 rounded-xl transition-all hover:shadow-lg hover:scale-105 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-12 h-12 bg-purple-200/30 rounded-bl-full"></div>
                        <List size={24} className="mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold block">Liste</span>
                        <span className="text-xs text-purple-600 mt-1 block">Örnek Şablon</span>
                      </button>

                      <button
                        onClick={() => createExampleTemplate('template')}
                        className="group bg-gradient-to-br from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200 border-2 border-orange-200 hover:border-orange-300 text-orange-700 px-4 py-4 rounded-xl transition-all hover:shadow-lg hover:scale-105 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-12 h-12 bg-orange-200/30 rounded-bl-full"></div>
                        <FileText size={24} className="mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold block">Şablon</span>
                        <span className="text-xs text-orange-600 mt-1 block">Örnek Şablon</span>
                      </button>

                      <button
                        onClick={() => createExampleTemplate('product')}
                        className="group bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 border-2 border-green-200 hover:border-green-300 text-green-700 px-4 py-4 rounded-xl transition-all hover:shadow-lg hover:scale-105 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-12 h-12 bg-green-200/30 rounded-bl-full"></div>
                        <Package size={24} className="mx-auto mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold block">Ürün</span>
                        <span className="text-xs text-green-600 mt-1 block">Örnek Şablon</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Örnek Şablonlar Bölümü */}
                <div className="mb-6 bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Hızlı Örnek Şablonlar:</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button
                      onClick={() => createExampleTemplate('button')}
                      className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg transition-colors text-xs font-medium flex items-center justify-center space-x-1"
                    >
                      <Square size={16} />
                      <span>Örnek Buton</span>
                    </button>
                    <button
                      onClick={() => createExampleTemplate('list')}
                      className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 px-3 py-2 rounded-lg transition-colors text-xs font-medium flex items-center justify-center space-x-1"
                    >
                      <List size={16} />
                      <span>Örnek Liste</span>
                    </button>
                    <button
                      onClick={() => createExampleTemplate('template')}
                      className="bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 px-3 py-2 rounded-lg transition-colors text-xs font-medium flex items-center justify-center space-x-1"
                    >
                      <FileText size={16} />
                      <span>Örnek Şablon</span>
                    </button>
                    <button
                      onClick={() => createExampleTemplate('product')}
                      className="bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 px-3 py-2 rounded-lg transition-colors text-xs font-medium flex items-center justify-center space-x-1"
                    >
                      <Package size={16} />
                      <span>Örnek Ürün</span>
                    </button>
                  </div>
                </div>
                {/* Şablon Listesi */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <div key={template.id} className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-800 mb-1">{template.name}</h3>
                        <span className={`inline-block px-2 py-1 text-xs rounded ${
                          template.type === 'button' ? 'bg-blue-100 text-blue-800' :
                          template.type === 'list' ? 'bg-green-100 text-green-800' :
                          template.type === 'template' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {template.type === 'button' ? 'Buton' :
                           template.type === 'list' ? 'Liste' :
                           template.type === 'template' ? 'Şablon' : 'Ürün'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => editTemplate(template)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="Şablonu Düzenle"
                        >
                          <Edit2 size={20} />
                        </button>
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Şablonu Sil"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-4">
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
                    <div className="text-xs text-gray-400">
                      Oluşturulma: {new Date(template.createdAt).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                ))}
              </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}




