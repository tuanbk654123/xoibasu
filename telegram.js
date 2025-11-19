import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export async function sendTelegramMessage(message) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('[TELEGRAM] Missing config:', {
        hasToken: !!TELEGRAM_BOT_TOKEN,
        hasChatId: !!TELEGRAM_CHAT_ID
      });
      return { ok: false, reason: 'Missing Telegram config' };
    }

    const chatIds = String(TELEGRAM_CHAT_ID).split(',').map(s => s.trim()).filter(Boolean);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const results = await Promise.all(chatIds.map(async (chatId) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML' // Support HTML formatting
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          console.error(`[TELEGRAM] Failed to send to chat ${chatId}:`, data.description || res.statusText);
          return { ok: false, status: res.status, data, chatId };
        }
        return { ok: true, messageId: data.result?.message_id, chatId };
      } catch (err) {
        console.error(`[TELEGRAM] Error sending to chat ${chatId}:`, err);
        return { ok: false, error: String(err), chatId };
      }
    }));

    const allOk = results.every(r => r.ok);
    if (allOk) {
      console.log('[TELEGRAM] Message sent successfully to all chats');
    } else {
      console.warn('[TELEGRAM] Some messages failed:', results.filter(r => !r.ok));
    }

    return { ok: allOk, results };
  } catch (err) {
    console.error('[TELEGRAM] Exception:', err);
    return { ok: false, error: String(err) };
  }
}

