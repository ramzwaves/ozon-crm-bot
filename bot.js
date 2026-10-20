const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = "8391874688:AAEYtVfDVlzs-L26m7tXEVEzqrAukhyCitE";

let codes = {};
let savedUsers = {}; // <-- ТУТ БУДЕТ ХРАНИТЬСЯ ЦИФРОВОЙ ID

app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

setInterval(() => {
    const now = Date.now();
    for (const [code, data] of Object.entries(codes)) {
        if (now - data.createdAt > 180000) delete codes[code];
    }
}, 30000);

app.post('/add-code', (req, res) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    codes[code] = { createdAt: Date.now(), used: false, userId: null };
    res.json({ success: true, code: code });
});

app.post('/check-code', (req, res) => {
    const { code } = req.body;
    if (!code || !codes[code]) return res.json({ success: false, error: 'Код не найден' });
    const data = codes[code];
    
    if (data.used && data.userId) {
        savedUsers['main'] = data.userId; // ЗАПОМИНАЕМ ЦИФРОВОЙ ID НА СЕРВЕРЕ!
        return res.json({ success: true, pending: false, userId: data.userId });
    }
    res.json({ success: true, pending: true });
});

// Тестовая отправка
app.post('/test-message', async (req, res) => {
    try {
        const userId = savedUsers['main']; // Берем ID прямо с сервера!
        if (!userId) return res.json({ success: false, error: 'Пользователь еще не привязан' });

        await sendTelegram(userId, `🧪 *Тестовое сообщение!*\n\nСвязь настроена идеально! 🚀`);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        if (!update.message) return res.sendStatus(200);

        const text = (update.message.text || '').trim().toUpperCase();
        const userId = update.message.from.id;
        const userName = update.message.from.first_name || 'Пользователь';
        const chatId = update.message.chat.id;

        const isCode = /^[A-Z0-9]{6}$/.test(text);

        if (isCode && codes[text]) {
            const codeData = codes[text];
            if (codeData.used) return res.sendStatus(200);
            
            codeData.used = true;
            codeData.userId = userId;
            savedUsers['main'] = userId; // СОХРАНЯЕМ ID

            await sendTelegram(chatId, `✅ *Аккаунт успешно привязан!*\n\nПривет, ${userName}!\n\n🚀 *Приятной работы!*`);
        } else if (isCode) {
            await sendTelegram(chatId, `❌ Код ${text} не найден.`);
        } else if (text === '/START' || text === 'СТАРТ') {
            await sendTelegram(chatId, `👋 *Привет!* Отправь мне код из расширения.`);
        }
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(200);
    }
});

async function sendTelegram(chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) {}
}

app.get('/', (req, res) => res.send('🚀 Ozon CRM Bot работает!'));

app.listen(PORT, () => console.log(`🚀 Бот запущен на порту ${PORT}`));
