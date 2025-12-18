// Calls API module
const API_BASE = '';

/**
 * Arama reddet (Reject Call) - README'ye göre
 */
export const rejectCall = async (
  sessionId: string,
  callId: string,
  callFrom: string
): Promise<any> => {
  const response = await fetch(`${API_BASE}/${sessionId}/calls/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callId, callFrom }),
  });
  if (!response.ok) throw new Error('Arama reddedilemedi');
  return response.json();
};
