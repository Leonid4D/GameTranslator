// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MediaWiki } = require('mediawiki-sdk');
const { tavily } = require('@tavily/core');
const OpenAI = require('openai');

const app = express();
app.use(cors()); // Разрешаем запросы с вашего фронтенда
app.use(express.json());

// Инициализация клиентов
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Вспомогательная функция для сканирования Fandom вики через MediaWiki API.
 * @param {string} gameName - Название игры (например, "cyberpunk2077")
 * @param {string} searchTerm - Что ищем (например, "Johnny Silverhand")
 * @returns {Promise<string>} - Найденный текст или пустая строка.
 */
async function scanFandomWiki(gameName, searchTerm) {
  try {
    // Формируем URL API. Важно: для Fandom это обычно <subdomain>.fandom.com/api.php
    // Мы предполагаем, что пользователь ввёл корректный поддомен, но можно добавить логику поиска.
    const wikiUrl = `https://${gameName}.fandom.com/api.php`;
    const mw = new MediaWiki({ baseURL: wikiUrl });

    // 1. Ищем страницу по запросу
    const searchResults = await mw.client.search(searchTerm, null, 1);
    if (!searchResults.query.search.length) {
      console.log(`[Wiki] Ничего не найдено для "${searchTerm}" в ${wikiUrl}`);
      return '';
    }
    const pageTitle = searchResults.query.search[0].title;

    // 2. Получаем содержимое найденной страницы в виде простого текста
    // Используем action=parse, чтобы получить очищенный текст, а не сырой wikitext.
    const parsedPage = await mw.client.parse({
      page: pageTitle,
      prop: 'text', // Запрашиваем HTML-представление
    });

    // Простая очистка HTML до текста (для демонстрации)
    const plainText = parsedPage.text()
      .replace(/<[^>]*>?/gm, ' ') // Удаляем теги
      .replace(/\s+/g, ' ') // Схлопываем пробелы
      .trim();

    console.log(`[Wiki] Найдена страница "${pageTitle}" в ${wikiUrl}`);
    return `Источник (Вики): ${pageTitle}\n${plainText.substring(0, 4000)}`; // Ограничиваем длину
  } catch (error) {
    console.error(`[Wiki] Ошибка при сканировании ${gameName}.fandom.com:`, error.message);
    return '';
  }
}

// Основной эндпоинт
app.post('/api/translate', async (req, res) => {
  const { game, object, targetLangs } = req.body;

  if (!game || !object) {
    return res.status(400).json({ error: 'Пожалуйста, укажите игру и объект для поиска.' });
  }

  try {
    // --- Шаг 1: Сбор фактов из нескольких источников ---
    console.log(`[Поиск] Игра: "${game}", Объект: "${object}"`);

    // 1a. Пытаемся найти информацию напрямую в вики игры
    // Преобразуем название игры в вероятный поддомен (например, "Cyberpunk 2077" -> "cyberpunk2077")
    const wikiSubdomain = game.toLowerCase().replace(/\s+/g, '');
    const wikiContext = await scanFandomWiki(wikiSubdomain, object);

    // 1b. Ищем в интернете через Tavily
    const tavilyResponse = await tvly.search(`${game} ${object} localization translation`, {
      searchDepth: 'advanced',
      includeAnswer: false, // Нам нужны сырые результаты
    });

    const webContext = tavilyResponse.results
      .map(r => `Источник (Web): ${r.title} (${r.url})\n${r.content}`)
      .join('\n\n');

    // Объединяем контекст, отдавая приоритет вики, если она есть
    const fullContext = [wikiContext, webContext].filter(Boolean).join('\n\n---\n\n');

    if (!fullContext) {
      return res.status(404).json({ error: 'Не удалось найти информацию об этом объекте в игре.' });
    }

    // --- Шаг 2: Генерация ответа нейросетью ---
    const langInstruction = targetLangs && targetLangs.length
      ? `Сфокусируйся на следующих языках: ${targetLangs.join(', ')}.`
      : 'Покажи переводы на русском, английском, немецком, французском, японском и польском.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Быстрая и недорогая модель, хорошо подходит для этой задачи
      messages: [
        {
          role: 'system',
          content: `Ты — эксперт по локализации видеоигр и переводчик. Твоя задача — на основе предоставленных фактов найти и красиво оформить информацию о том, как называется указанный объект (герой, предмет, термин) в разных языковых локализациях игры. 
          
          Правила:
          1. Используй ТОЛЬКО информацию из предоставленных фактов.
          2. Если в фактах нет перевода на какой-то язык, не выдумывай его.
          3. Оформи ответ в виде структурированного списка или таблицы (используй Markdown).
          4. Если возможно, добавь краткий комментарий о том, является ли перевод адаптацией или прямым заимствованием.
          5. ${langInstruction}`
        },
        {
          role: 'user',
          content: `Игра: "${game}"\nОбъект: "${object}"\n\nФакты из вики и интернета:\n${fullContext}`
        }
      ],
      temperature: 0.2, // Низкая температура для большей фактичности
    });

    const answer = completion.choices[0].message.content;
    res.json({ answer });

  } catch (error) {
    console.error('Ошибка при обработке запроса:', error.response?.data || error.message);
    res.status(500).json({ error: 'Произошла ошибка при поиске или генерации ответа. Попробуйте позже.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер GameTranslator запущен на http://localhost:${PORT}`);
});