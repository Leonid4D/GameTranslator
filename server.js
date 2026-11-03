// server.js

// 1. Загрузка переменных окружения из нестандартного файла Keys.env
require('dotenv').config({ path: './Keys.env' });

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

// Импорт SDK для Tavily и YooKassa
const { tavily } = require('@tavily/core');
const { YooKassa } = require('yookassa-api-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Настройка CORS
// ВАЖНО: Замените 'https://your-frontend.github.io' на реальный URL вашего GitHub Pages
const allowedOrigins = ['https://leonid4d.github.io/GameTranslator/'];
app.use(cors());

// Middleware для парсинга JSON-тел запросов
app.use(express.json());

// 3. Инициализация клиентов API
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const yookassa = YooKassa({
    shop_id: process.env.YOOKASSA_SHOP_ID,
    secret_key: process.env.YOOKASSA_SECRET_KEY,
});


/**
 * Вспомогательная функция для сканирования вики (MediaWiki API)
 * @param {string} game - Название игры
 * @param {string} object - Искомый термин
 * @returns {Promise<string>} - Найденный текст или пустая строка
 */
async function searchWiki(game, object) {
    try {
        // Пытаемся найти вики по игре (например, на Fandom)
        // Это упрощенный пример. В реальности можно использовать поиск по community.fandom.com
        const wikiApiUrl = `https://${game.toLowerCase().replace(/\s+/g, '')}.fandom.com/api.php`;
        
        const searchResponse = await axios.get(wikiApiUrl, {
            params: {
                action: 'query',
                list: 'search',
                srsearch: object,
                format: 'json',
                srlimit: 1 // Берем только один лучший результат
            }
        });

        const searchResults = searchResponse.data.query?.search;
        if (!searchResults || searchResults.length === 0) {
            return ''; // Ничего не найдено
        }

        const pageTitle = searchResults[0].title;
        
        // Получаем содержимое найденной страницы
        const contentResponse = await axios.get(wikiApiUrl, {
            params: {
                action: 'query',
                prop: 'extracts',
                explaintext: 1, // Только чистый текст
                titles: pageTitle,
                format: 'json'
            }
        });

        const pages = contentResponse.data.query?.pages;
        const pageId = Object.keys(pages)[0];
        return pages[pageId]?.extract || '';

    } catch (error) {
        console.error('Ошибка при сканировании вики:', error.message);
        return ''; // В случае ошибки возвращаем пустую строку, чтобы не ломать основной процесс
    }
}


// 4. Эндпоинт /api/translate
app.post('/api/translate', async (req, res) => {
    try {
        const { game, object, subproject, targetLangs, isPro, tone, glossary, userTier } = req.body;

        // Простая валидация
        if (!game || !object || !targetLangs || !Array.isArray(targetLangs)) {
            return res.status(400).json({ answer: 'Ошибка: Неверные входные данные.' });
        }

        // --- Сбор контекста ---

        // A. Сканирование вики
        const wikiContext = await searchWiki(game, object);

        // B. Поиск в интернете через Tavily (только если включен Pro)
        let webContext = '';
        if (isPro) {
            try {
                const searchQuery = `${object} ${game} localization term`;
                const tavilyResponse = await tvly.search(searchQuery, {
                    searchDepth: 'advanced', // Глубокий поиск для лучшего качества
                    maxResults: 3 // Берем несколько результатов
                });
                // Формируем контекст из результатов Tavily
                if (tavilyResponse.results) {
                    webContext = tavilyResponse.results.map(r => `${r.title}: ${r.content}`).join('\n\n');
                }
            } catch (tavilyError) {
                console.error('Ошибка Tavily:', tavilyError.message);
                // Не прерываем выполнение, просто продолжаем без веб-контекста
            }
        }

        // --- Формирование промпта для LLM ---

        let prompt = `Ты — эксперт по локализации видеоигр. Переведи указанный термин на следующие языки: ${targetLangs.join(', ')}.\n\n`;
        prompt += `Игра: "${game}"\n`;
        prompt += `Термин: "${object}"\n`;
        if (subproject) {
            prompt += `Подпроект/Контекст: "${subproject}"\n`;
        }

        // Добавляем пользовательский глоссарий
        if (glossary && Object.keys(glossary).length > 0) {
            prompt += `\nОбязательно используй следующие переводы из глоссария пользователя:\n`;
            for (const [term, translation] of Object.entries(glossary)) {
                prompt += `- "${term}" -> "${translation}"\n`;
            }
        }

        // Добавляем стиль перевода (tone)
        if (tone && tone !== 'default') {
            const toneMap = {
                lore: 'Используй стиль, соответствующий лору игры (возвышенный, архаичный, если это уместно).',
                slang: 'Используй сленг и неформальный стиль, принятый в игровом сообществе.'
            };
            prompt += `\nСтиль перевода: ${toneMap[tone] || tone}\n`;
        }

        // Добавляем контекст из вики и веб-поиска
        if (wikiContext) {
            prompt += `\nКонтекст из вики по игре (используй для точности):\n"""\n${wikiContext.substring(0, 2000)}\n"""\n`; // Ограничиваем длину
        }
        if (webContext) {
            prompt += `\nДополнительный контекст из интернета:\n"""\n${webContext.substring(0, 1500)}\n"""\n`;
        }

        prompt += `\nОтвет должен быть в формате Markdown. Для каждого языка укажи перевод и краткое обоснование выбора (1-2 предложения).`;

        // --- Отправка запроса к LLM ---
        // Используем OpenAI-совместимый эндпоинт (подходит для OpenAI, DeepSeek, OpenRouter)
        const llmResponse = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3, // Низкая температура для большей точности
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const answer = llmResponse.data.choices[0].message.content;

        // Возвращаем ответ в требуемом формате
        res.json({ answer });

    } catch (error) {
        console.error('Ошибка в /api/translate:', error.response ? error.response.data : error.message);
        res.status(500).json({ answer: 'Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.' });
    }
});


// 5. Эндпоинт /api/proxy-translate
app.post('/api/proxy-translate', async (req, res) => {
    try {
        const { url, targetLang, userTier } = req.body;

        // Проверка доступа (доступно только для userTier >= 2)
        if (userTier < 2) {
            return res.status(403).send('Доступ запрещен. Эта функция доступна с уровня Premium+.');
        }

        if (!url || !targetLang) {
            return res.status(400).send('Ошибка: Необходимо указать URL и целевой язык.');
        }

        // Скачиваем HTML-страницу
        const response = await axios.get(url, {
            headers: {
                // Представляемся браузером, чтобы избежать блокировок
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data;

        // Парсим HTML с помощью Cheerio
        const $ = cheerio.load(html);

        // Переписываем относительные ссылки на ресурсы (изображения, стили, скрипты) в абсолютные
        const baseUrl = new URL(url);
        $('img[src], link[href], script[src]').each((i, elem) => {
            const $elem = $(elem);
            const attr = elem.tagName === 'link' ? 'href' : 'src';
            const relativeUrl = $elem.attr(attr);
            if (relativeUrl && !relativeUrl.startsWith('data:')) {
                try {
                    const absoluteUrl = new URL(relativeUrl, baseUrl).href;
                    $elem.attr(attr, absoluteUrl);
                } catch (e) {
                    // Игнорируем некорректные URL
                }
            }
        });

        // Переписываем ссылки <a href> на абсолютные, чтобы они вели на оригинальный сайт, а не на наш прокси
        $('a[href]').each((i, elem) => {
            const $elem = $(elem);
            const relativeUrl = $elem.attr('href');
            if (relativeUrl && !relativeUrl.startsWith('#')) {
                try {
                    const absoluteUrl = new URL(relativeUrl, baseUrl).href;
                    $elem.attr('href', absoluteUrl);
                } catch (e) {}
            }
        });

        // --- Перевод текста (упрощенный пример) ---
        // В реальном проекте здесь нужно извлекать текст, переводить его через LLM и вставлять обратно.
        // Для демонстрации мы просто добавим пометку в заголовок.
        // ВАЖНО: Полноценный перевод всей страницы — сложная задача, требующая аккуратной работы с текстовыми узлами.
        $('title').text(`[${targetLang}] ${$('title').text()}`);

        // Получаем итоговый HTML
        const translatedHtml = $.html();

        // Отправляем результат
        res.send(translatedHtml);

    } catch (error) {
        console.error('Ошибка в /api/proxy-translate:', error.message);
        res.status(500).send('Не удалось загрузить или перевести страницу.');
    }
});


// 6. Эндпоинт для создания платежа (заготовка для ЮKassa)
app.post('/api/create-payment', async (req, res) => {
    try {
        const { plan } = req.body; // Например, 'premium', 'premium_plus', 'premium_plus_plus'

        // Определяем стоимость в зависимости от тарифа
        const prices = {
            'premium': '299.00',
            'premium_plus': '599.00',
            'premium_plus_plus': '999.00'
        };

        const amount = prices[plan];
        if (!amount) {
            return res.status(400).json({ error: 'Неверный тарифный план.' });
        }

        // Создаем платеж через SDK ЮKassa
        const payment = await yookassa.payments.create({
            amount: {
                value: amount,
                currency: 'RUB'
            },
            confirmation: {
                type: 'redirect',
                return_url: 'https://your-frontend.github.io/payment-success' // URL возврата после оплаты
            },
            description: `Оплата подписки GameTranslator: ${plan}`,
            capture: true // Автоматическое подтверждение платежа
        });

        // Возвращаем URL для перенаправления пользователя на страницу оплаты
        res.json({ confirmation_url: payment.confirmation.confirmation_url });

    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        res.status(500).json({ error: 'Не удалось создать платеж.' });
    }
});


// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер GameTranslator запущен на порту ${PORT}`);
});