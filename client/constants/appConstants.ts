// Application Constants

export const COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-red-500',
  'bg-yellow-500',
  'bg-indigo-500'
];

export const EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸'
];

export const ATTACHMENT_OPTIONS = [
  { icon: '📄', label: 'Belge', color: 'bg-purple-500' },
  { icon: '📷', label: 'Fotoğraf', color: 'bg-pink-500' },
  { icon: '📹', label: 'Video', color: 'bg-red-500' },
  { icon: '🎵', label: 'Ses', color: 'bg-orange-500' },
  { icon: '👤', label: 'Kişi', color: 'bg-blue-500' },
  { icon: '📍', label: 'Konum', color: 'bg-green-500' }
];

export const CONTACTS_CACHE_TTL = 5 * 60 * 1000; // 5 dakika
export const PROFILE_PICTURE_BATCH_SIZE = 5; // Bir seferde yüklenecek profil resmi sayısı
export const PROFILE_PICTURE_DEBOUNCE_MS = 500; // Profil resmi yükleme debounce süresi
export const PROFILE_PICTURE_BATCH_DELAY_MS = 200; // Batch'ler arası bekleme süresi
