const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = "8391874688:AAEYtVfDVlzs-L26m7tXEVEzqrAukhyCitE";

// Хранилище кодов (в памяти процесса)
let codes = {};

// Middleware для парсинга JSON
app.use(express.json());

// Разрешаем CORS (для запросов из расширения)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Очистка старых кодов каждые 30 секунд
setInterval(() => {
    const now = Date.now();
    for (const [code, data] of Object.entries(codes)) {
        if (now - data.createdAt > 180000) { // 3 минуты
            delete codes[code];
            console.log(`🗑️ Код ${code} удален (истек)`);
        }
    }
}, 30000);

// 1. Создание кода (вызывается из расширения)
app.post('/add-code', (req, res) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    codes[code] = { createdAt: Date.now(), used: false, userId: null, userName: null };
    console.log(`🔑 Создан код: ${code}. Всего кодов: ${Object.keys(codes).length}`);
    res.json({ success: true, code: code });
});

// 2. Проверка кода (вызывается из расширения)
app.post('/check-code', (req, res) => {
    const { code } = req.body;
    if (!code || !codes[code]) {
        return res.json({ success: false, error: 'Код не найден' });
    }
    const data = codes[code];
    if (data.used) {
        return res.json({ success: false, error: 'Код уже использован' });
    }
    if (Date.now() - data.createdAt > 180000) {
        delete codes[code];
        return res.json({ success: false, error: 'Код истек' });
    }
    res.json({ success: true, pending: true });
});

// 3. Webhook для Telegram (сюда приходят сообщения от пользователей)
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        if (!update.message) return res.sendStatus(200);

        const text = (update.message.text || '').trim().toUpperCase();
        const userId = update.message.from.id;
        const userName = update.message.from.first_name || 'Пользователь';
        const chatId = update.message.chat.id;

        console.log(`📨 Сообщение от ${userName} (${userId}): "${text}"`);

        // Проверка, является ли текст кодом (6 символов, буквы и цифры)
        const isCode = /^[A-Z0-9]{6}$/.test(text);

        if (isCode && codes[text]) {
            const codeData = codes[text];
            
            if (codeData.used) {
                await sendTelegram(chatId, '❌ Этот код уже использован. Запросите новый в расширении.');
                return res.sendStatus(200);
            }
            if (Date.now() - codeData.createdAt > 180000) {
                delete codes[text];
                await sendTelegram(chatId, '⏰ Код истек. Запросите новый в расширении.');
                return res.sendStatus(200);
            }

            // Код валиден — привязываем
            codeData.used = true;
            codeData.userId = userId;
            codeData.userName = userName;
            console.log(`✅ Пользователь ${userName} (${userId}) привязан по коду ${text}`);
            
            // Отправляем подтверждение
            await sendTelegram(chatId, `✅ *Аккаунт успешно привязан!*\n\nПривет, ${userName}!\n\nТеперь вы будете получать уведомления о новых тикетах в Ozon CRM.\n\n🚀 *Приятной работы!*`);
            
            // Удаляем использованный код
            delete codes[text];

        } else if (isCode) {
            // Код не найден
            await sendTelegram(chatId, `❌ Код ${text} не найден.\n\n⚠️ Код действителен только 3 минуты.\n🔄 Запросите новый код в расширении.`);
        } else if (text === '/START' || text === 'СТАРТ') {
            await sendTelegram(chatId, `👋 *Привет, ${userName}!*\n\nЯ — бот для уведомлений о тикетах в Ozon CRM.\n\n📋 *Чтобы начать:*\n1. Установите расширение Ozon CRM Notifier\n2. Нажмите "Привязать Telegram аккаунт"\n3. Отправьте код мне\n\n🚀 *Приятной работы!*`);
        } else {
            await sendTelegram(chatId, `❓ *Неизвестная команда*\n\nОтправьте /start для инструкции.`);
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
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('❌ Ошибка отправки в Telegram:', e);
    }
}

// Главная страница (для проверки работоспособности)
app.get('/', (req, res) => {
    res.send('🚀 Ozon CRM Bot работает!');
});

app.listen(PORT, () => {
    console.log(`🚀 Бот запущен на порту ${PORT}`);
});
