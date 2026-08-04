const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = "8391874688:AAEYtVfDVlzs-L26m7tXEVEzqrAukhyCitE";
const ADMIN_CHAT_ID = "6972574654";
let codes = {};

setInterval(() => {
  const now = Date.now();
  for (const [code, data] of Object.entries(codes)) {
    if (now - data.createdAt > 180000) delete codes[code];
  }
}, 30000);

app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (!update.message) { res.sendStatus(200); return; }
    const text = update.message.text ? update.message.text.trim().toUpperCase() : '';
    const userId = update.message.from.id;
    const userName = update.message.from.first_name || 'Пользователь';
    const chatId = update.message.chat.id;
    const isCode = text && /^[A-Z0-9]{6}$/.test(text);
    
    if (isCode && codes[text]) {
      const codeData = codes[text];
      if (codeData.used) {
        await sendTelegram(chatId, '❌ Код уже использован');
        res.sendStatus(200); return;
      }
      if (Date.now() - codeData.createdAt > 180000) {
        await sendTelegram(chatId, '⏰ Код истек');
        delete codes[text];
        res.sendStatus(200); return;
      }
      codeData.used = true;
      codeData.userId = userId;
      codeData.userName = userName;
      await sendTelegram(ADMIN_CHAT_ID, `✅ КОД ПОДТВЕРЖДЕН: ${text}\n👤 ${userName} (${userId})`);
      await sendTelegram(chatId, `✅ *Аккаунт привязан!*\nПривет, ${userName}!`);
      delete codes[text];
    } else if (isCode && !codes[text]) {
      await sendTelegram(chatId, `❌ Код ${text} не найден`);
    } else if (text === '/START' || text === 'СТАРТ') {
      await sendTelegram(chatId, `👋 Привет! Установи расширение и привяжи аккаунт.`);
    } else {
      await sendTelegram(chatId, `❓ Отправь /start`);
    }
    res.sendStatus(200);
  } catch(e) { res.sendStatus(200); }
});

app.post('/add-code', async (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  codes[code] = { createdAt: Date.now(), used: false };
  await sendTelegram(ADMIN_CHAT_ID, `🔑 НОВЫЙ КОД: ${code}`);
  res.json({ success: true, code: code });
});

app.post('/check-code', async (req, res) => {
  const { code } = req.body;
  if (!code || !codes[code]) return res.json({ success: false, error: 'Код не найден' });
  const data = codes[code];
  if (data.used) return res.json({ success: false, error: 'Код уже использован' });
  if (Date.now() - data.createdAt > 180000) { delete codes[code]; return res.json({ success: false, error: 'Код истек' }); }
  res.json({ success: true, pending: true });
});

app.get('/', (req, res) => res.send('🚀 Ozon CRM Bot работает!'));

async function sendTelegram(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch(e) {}
}

app.listen(PORT, () => console.log(`🚀 Бот запущен на порту ${PORT}`));
