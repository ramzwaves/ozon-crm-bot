const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = "8391874688:AAEYtVfDVlzs-L26m7tXEVEzqrAukhyCitE";

// Хранилище кодов (в памяти процесса)
let codes = {};

app.use(express.json());

// Разрешаем CORS (чтобы расширение могло делать запросы)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Очистка старых кодов каждые 30 секунд (живут 3 минуты)
setInterval(() => {
    const now = Date.now();
    for (const [code, data] of Object.entries(codes)) {
        if (now - data.createdAt > 180000) {
            delete codes[code];
            console.log(`🗑️ Код ${code} удален (истек)`);
        }
    }
}, 30000);

// 1. Создание кода (из расширения)
app.post('/add-code', (req, res) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    codes[code] = { createdAt: Date.now(), used: false, userId: null, userName: null };
    console.log(`🔑 Создан код: ${code}`);
    res.json({ success: true, code: code });
});

// 2. Проверка кода (из расширения)
app.post('/check-code', (req, res) => {
    const { code } = req.body;
    
    if (!code || !codes[code]) {
        return res.json({ success: false, error: 'Код не найден' });
    }
    
    const data = codes[code];
    
    // Если код был использован в Telegram — отдаем данные расширению!
    if (data.used && data.userId) {
        return res.json({ 
            success: true, 
            pending: false, 
            userId: data.userId, 
            userName: data.userName 
        });
    }
    
    // Если код истек
    if (Date.now() - data.createdAt > 180000) {
        delete codes[code];
        return res.json({ success: false, error: 'Код истек' });
    }
    
    // Если код еще ждет отправки в бот
    res.json({ success: true, pending: true });
});

// 3. Отправка тестового сообщения через сервер (обход блокировки api.telegram.org)
app.post('/test-message', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.json({ success: false, error: 'Нет ID пользователя' });

        // Отправляем сообщение от имени бота
        await sendTelegram(userId, `🧪 *Тестовое сообщение!*\n\nЕсли вы это видите, значит связь настроена идеально! 🚀`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка теста:', error);
        res.json({ success: false, error: error.message });
    }
});

// 4. Webhook для Telegram (сюда приходят сообщения)
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        if (!update.message) return res.sendStatus(200);

        const text = (update.message.text || '').trim().toUpperCase();
        const userId = update.message.from.id;
        const userName = update.message.from.first_name || 'Пользователь';
        const chatId = update.message.chat.id;

        console.log(`📨 Сообщение от ${userName} (${userId}): "${text}"`);

        const isCode = /^[A-Z0-9]{6}$/.test(text);

        if (isCode && codes[text]) {
            const codeData = codes[text];
            
            if (codeData.used) {
                await sendTelegram(chatId, '❌ Этот код уже использован.');
                return res.sendStatus(200);
            }
            
            // СОХРАНЯЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ В КОД
            codeData.used = true;
            codeData.userId = userId;
            codeData.userName = userName;
            
            console.log(`✅ Пользователь ${userName} (${userId}) привязан по коду ${text}`);
            
            await sendTelegram(chatId, `✅ *Аккаунт успешно привязан!*\n\nПривет, ${userName}!\n\nТеперь вы будете получать уведомления о тикетах в Ozon CRM.\n\n🚀 *Приятной работы!*`);

        } else if (isCode) {
            await sendTelegram(chatId, `❌ Код ${text} не найден.`);
        } else if (text === '/START' || text === 'СТАРТ') {
            await sendTelegram(chatId, `👋 *Привет, ${userName}!*\n\nОтправь мне код из расширения.`);
        } else {
            await sendTelegram(chatId, `❓ Отправь /start`);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Ошибка в webhook:', error);
        res.sendStatus(200);
    }
});

// Функция отправки сообщения в Telegram
async function sendTelegram(chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) {
        console.error('❌ Ошибка отправки в Telegram:', e);
    }
}

app.get('/', (req, res) => res.send('🚀 Ozon CRM Bot работает!'));

app.listen(PORT, () => console.log(`🚀 Бот запущен на порту ${PORT}`));
