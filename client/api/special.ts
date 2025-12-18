// Special messages API module (poll, location, contact, etc.)
const API_BASE = '';

/**
 * Anket oluştur (Poll) - README'ye göre geliştirilmiş versiyon
 */
export const createPoll = async (
  sessionId: string,
  jid: string,
  question: string,
  options: string[],
  selectableCount: number = 1,
  toAnnouncementGroup: boolean = false
): Promise<any> => {
  if (!jid || !question || !options || options.length < 2) {
    throw new Error('jid, question ve en az 2 seçenek gereklidir');
  }

  const response = await fetch(`${API_BASE}/${sessionId}/messages/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jid,
      question,
      options,
      selectableCount,
      toAnnouncementGroup,
    }),
  });
  if (!response.ok) throw new Error('Anket oluşturulamadı');
  return response.json();
};

/**
 * Konum gönder
 */
export const sendLocation = async (
  sessionId: string,
  jid: string,
  latitude: number,
  longitude: number,
  name?: string
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, latitude, longitude, name }),
  });
  if (!response.ok) throw new Error('Konum gönderilemedi');
  return response.json();
};

/**
 * Kişi kartı gönder (Contact Card)
 */
export const sendContactCard = async (
  sessionId: string,
  jid: string,
  contact: { jid?: string; id?: string; name?: string; displayName?: string }
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/messages/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, contact }),
  });
  if (!response.ok) throw new Error('Kişi kartı gönderilemedi');
  return response.json();
};
