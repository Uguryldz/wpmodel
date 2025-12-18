// Presence API module
const API_BASE = '';

/**
 * Presence dinle (Fetch Someone's Presence) - README'ye göre
 * The presence update is fetched and called in presence.update event
 */
export const subscribeToPresence = async (sessionId: string, jid: string): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/presence/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid }),
  });
  if (!response.ok) throw new Error('Presence dinlenemedi');
  return response.json();
};
