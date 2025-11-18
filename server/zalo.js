import 'dotenv/config';

const ZALO_ACCESS_TOKEN = process.env.ZALO_ACCESS_TOKEN || '';
const ZALO_USER_ID = process.env.ZALO_USER_ID || '';

export async function sendZaloText(message) {
  try {
    if (!ZALO_ACCESS_TOKEN || !ZALO_USER_ID) {
      return { ok: false, reason: 'Missing Zalo config' };
    }
    const userIds = String(ZALO_USER_ID).split(',').map(s => s.trim()).filter(Boolean);
    const url = `https://openapi.zalo.me/v2.0/oa/message?access_token=${encodeURIComponent(ZALO_ACCESS_TOKEN)}`;
    const results = await Promise.all(userIds.map(async uid => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { user_id: uid },
          message: { text: message }
        })
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data, uid };
    }));
    const ok = results.every(r => r.ok);
    return { ok, results };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
