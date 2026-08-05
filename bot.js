const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = "8391874688:AAEYtVfDVlzs-L26m7tXEVEzqrAukhyCitE";
let codes = {};

// ===== РАЗРЕШАЕМ ЗАПРОСЫ ОТ ЛЮБОГО ИСТОЧНИКА =====
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.json());

// Очистка старых кодов
setInterval(() => {
    const now = Date.now();
    for (const [code, data] of Object.entries(codes)) {
        if (now - data.createdAt > 180000) {
            delete codes[code];
            console.log(`🗑️ Код ${code} удален (истек)`);
        }
    }
}, 30000);

// ===== ОБРАБОТКА ВХОДЯЩИХ СООБЩЕНИЙ =====
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        if (!update.message) {
            res.sendStatus(200);
            return;
        }
        
        const text = update.message.text ? update.message.text.trim().toUpperCase() : '';
        const userId = update.message.from.id;
        const userName = update.message.from.first_name || 'Пользователь';
        const chatId = update.message.chat.id;
        
        console.log(`📨 ${userName} (${userId}): "${text}"`);
        
        const isCode = text && /^[A-Z0-9]{6}$/.test(text);
        
        if (isCode && codes[text]) {
            const codeData = codes[text];
            
            if (codeData.used) {
                await sendTelegram(chatId, '❌ Этот код уже использован. Запросите новый код в расширении.');
                res.sendStatus(200);
                return;
            }
            
            if (Date.now() - codeData.createdAt > 180000) {
                await sendTelegram(chatId, '⏰ Код истек. Запросите новый код в расширении.');
                delete codes[text];
                res.sendStatus(200);
                return;
            }
            
            // ПРИВЯЗЫВАЕМ ЛЮБОГО ПОЛЬЗОВАТЕЛЯ
            codeData.used = true;
            codeData.userId = userId;
            codeData.userName = userName;
            
            await sendTelegram(chatId, `✅ *Аккаунт успешно привязан!*\n\nПривет, ${userName}!\n\n📌 Теперь ты будешь получать уведомления о новых тикетах в Ozon CRM.\n\n🚀 *Приятной работы!*`);
            
            console.log(`✅ Пользователь ${userName} (${userId}) ПРИВЯЗАН по коду ${text}`);
            delete codes[text];
            
        } else if (isCode && !codes[text]) {
            await sendTelegram(chatId, `❌ Код ${text} не найден.\n\n⚠️ Код действителен только 3 минуты.`);
            
        } else if (text === '/START' || text === 'СТАРТ') {
            await sendTelegram(chatId, `👋 *Привет, ${userName}!*\n\nЯ - бот для уведомлений о новых тикетах в Ozon CRM.\n\n📋 *Чтобы начать:*\n1️⃣ Установи расширение "Ozon CRM Notifier"\n2️⃣ Нажми "Привязать Telegram аккаунт"\n3️⃣ Получи код и отправь его мне\n\n🚀 *Приятной работы!*`);
            
        } else {
            await sendTelegram(chatId, `❓ *Неизвестная команда*\n\nОтправь /start для инструкции.`);
        }
        
        res.sendStatus(200);
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.sendStatus(200);
    }
});

// ===== СОЗДАНИЕ КОДА =====
app.post('/add-code', async (req, res) => {
    try {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        codes[code] = {
            createdAt: Date.now(),
            used: false
        };
        
        console.log(`🔑 СОЗДАН КОД: ${code}`);
        console.log(`📋 Всего кодов: ${Object.keys(codes).length}`);
        
        res.json({ success: true, code: code });
        
    } catch (error) {
        console.error('❌ Ошибка создания кода:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===== ПРОВЕРКА КОДА =====
app.post('/check-code', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || !codes[code]) {
            res.json({ success: false, error: 'Код не найден' });
            return;
        }
        
        const codeData = codes[code];
        
        if (codeData.used) {
            res.json({ success: false, error: 'Код уже использован' });
            return;
        }
        
        if (Date.now() - codeData.createdAt > 180000) {
            delete codes[code];
            res.json({ success: false, error: 'Код истек' });
            return;
        }
        
        res.json({ success: true, pending: true });
        
    } catch (error) {
        console.error('❌ Ошибка проверки кода:', error);
        res.json({ success: false, error: error.message });
    }
});

// ===== ГЛАВНАЯ СТРАНИЦА =====
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Ozon CRM Bot</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>🚀 Ozon CRM Bot работает!</h1>
                <p>Бот для уведомлений о тикетах</p>
                <p>🟢 Статус: Активен</p>
                <p>📋 Кодов в обработке: ${Object.keys(codes).length}</p>
            </body>
        </html>
    `);
});

// ===== ОТПРАВКА СООБЩЕНИЯ =====
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
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Бот запущен на порту ${PORT}`);
    console.log(`🌐 URL: https://ozon-crm-bot.onrender.com`);
});
