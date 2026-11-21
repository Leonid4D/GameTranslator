// server.js — GameTranslator backend
// Запуск: npm start (или node server.js)
'use strict';

// 1. Переменные окружения: сначала Keys.env (исторический файл проекта), затем .env.
// Путь к Keys.env считаем от каталога server.js, чтобы файл находился при запуске
// из любой рабочей директории (Netlify/серверless-функция файла не содержит и
// берёт значения из переменных окружения).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'Keys.env'), quiet: true });
require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const { YooKassa } = require('yookassa-api-sdk');

/* =========================================================
   КОНФИГУРАЦИЯ
   ========================================================= */

// Значения-заглушки из Keys.env ("your_shop_id" и т.п.) считаем отсутствующими
const PLACEHOLDER_RE = /^(your|change|xxx|test|placeholder|none|null)/i;

function isSet(value) {
    return typeof value === 'string' && value.trim() !== '' && !PLACEHOLDER_RE.test(value.trim());
}

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const config = {
    port: num(process.env.PORT, 3000),
    // Детерминированный режим без внешних запросов: используется в тестах и демо.
    mockLlm: /^(1|true|yes|on)$/i.test(String(process.env.MOCK_LLM || '').trim()),
    llm: {
        baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').trim().replace(/\/+$/, ''),
        apiKey: (process.env.LLM_API_KEY || '').trim(),
        model: (process.env.LLM_MODEL || 'deepseek-chat').trim(),
        timeoutMs: num(process.env.LLM_TIMEOUT_MS, 60000),
        // Верхняя граница ответа: защищает бюджет при «разговорившейся» модели.
        maxTokens: num(process.env.LLM_MAX_TOKENS, 1600),
        // auto — просим у провайдера JSON-режим и откатываемся, если он не поддерживается.
        jsonMode: (process.env.LLM_JSON_MODE || 'auto').toLowerCase(),
    },
    tavilyKey: (process.env.TAVILY_API_KEY || '').trim(),
    // Tavily блокирует часть IP-адресов (в т.ч. российские) на уровне CDN:
    // запрос с ключом оттуда получает 403. Если есть прокси — укажите его здесь.
    tavilyBaseUrl: (process.env.TAVILY_BASE_URL || 'https://api.tavily.com').trim().replace(/\/+$/, ''),
    tavilyProxy: (process.env.TAVILY_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim(),
    // Сколько максимум ждём веб-поиск (Tavily/DDG). На serverless держите меньше
    // лимита функции: Netlify free обрывает запрос на ~10 секундах.
    searchTimeoutMs: num(process.env.WEB_SEARCH_TIMEOUT_MS, 10000),
    yookassa: {
        shopId: (process.env.YOOKASSA_SHOP_ID || '').trim(),
        secretKey: (process.env.YOOKASSA_SECRET_KEY || '').trim(),
    },
    // Куда вернуть пользователя после оплаты
    frontendOrigin: (process.env.FRONTEND_ORIGIN || 'https://leonid4d.github.io').trim().replace(/\/+$/, ''),
    // Через запятую можно ограничить источники; пусто = разрешены все (удобно для локальной разработки)
    corsOrigins: (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    rateLimit: {
        windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60000),
        max: num(process.env.RATE_LIMIT_MAX, 40),
    },
    // Подсказки терминов (автодополнение) — можно выключить на слабом хостинге.
    suggest: {
        enabled: !/^(0|false|off|no)$/i.test(String(process.env.SUGGEST_ENABLED || '1').trim()),
    },
    // 0 — без ограничения. Иначе максимум LLM-запросов в сутки на инстанс:
    // грубая страховка бюджета, если ключом начнут пользоваться посторонние.
    dailyLlmLimit: num(process.env.LLM_DAILY_LIMIT, 0),
};

const llmReady = isSet(config.llm.apiKey);
const tavilyReady = isSet(config.tavilyKey);
const yookassaReady = isSet(config.yookassa.shopId) && isSet(config.yookassa.secretKey);

const yookassa = yookassaReady
    ? YooKassa({ shop_id: config.yookassa.shopId, secret_key: config.yookassa.secretKey })
    : null;

/* =========================================================
   ЯЗЫКИ
   Клиент может прислать коды (ru) или отображаемые названия (Русский) —
   принимаем оба варианта, наружу всегда отдаём код + название.
   ========================================================= */

const PROMPT_VERSION = 'v2-structured';

const SUPPORTED_LANGS = {
    ru: 'Русский',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    ja: '日本語',
    pl: 'Polski',
    es: 'Español',
    zh: '中文',
    it: 'Italiano',
    pt: 'Português',
    tr: 'Türkçe',
    ko: '한국어',
    uk: 'Українська',
};

const LANG_CODE_BY_NAME = Object.fromEntries(
    Object.entries(SUPPORTED_LANGS).map(([code, name]) => [name.toLowerCase(), code])
);

// «🇷🇺 Русский» -> ru; «ru» -> ru; незнакомое значение оставляем как есть.
function normalizeTargetLangs(input) {
    const raw = Array.isArray(input)
        ? input
        : typeof input === 'string'
          ? input.split(',')
          : [];

    const result = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const cleaned = item
            .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
            .replace(/[^\p{L}\p{N}\- ]/gu, '')
            .trim()
            .toLowerCase();
        if (!cleaned) continue;

        const code = SUPPORTED_LANGS[cleaned] ? cleaned : LANG_CODE_BY_NAME[cleaned] || cleaned;
        if (!result.some((l) => l.code === code)) {
            result.push({ code, name: SUPPORTED_LANGS[code] || cleaned });
        }
        if (result.length >= 12) break;
    }
    return result;
}

/* =========================================================
   БЮДЖЕТ LLM (страховка от исчерпания ключа)
   ========================================================= */

let dailyBudget = { date: '', count: 0 };

function consumeDailyBudget() {
    if (!config.dailyLlmLimit) return true;
    const today = new Date().toISOString().slice(0, 10);
    if (dailyBudget.date !== today) dailyBudget = { date: today, count: 0 };
    if (dailyBudget.count >= config.dailyLlmLimit) return false;
    dailyBudget.count += 1;
    return true;
}

/* =========================================================
   HTTP-КЛИЕНТЫ И КЭШ
   ========================================================= */

const UA = 'GameTranslator/1.0 (+https://github.com/Leonid4D/GameTranslator)';

const http = axios.create({
    timeout: config.searchTimeoutMs,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' },
});

// Прокси для Tavily: http://user:pass@host:port
function parseProxy(raw) {
    if (!raw) return undefined;
    try {
        const url = new URL(raw);
        return {
            protocol: url.protocol.replace(':', ''),
            host: url.hostname,
            port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
            auth: url.username
                ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
                : undefined,
        };
    } catch {
        console.warn('[config] Не удалось разобрать TAVILY_PROXY, прокси игнорируется');
        return undefined;
    }
}

const tavilyHttp = axios.create({
    timeout: config.searchTimeoutMs,
    proxy: parseProxy(config.tavilyProxy),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// Простой TTL-кэш для контекста (вики/веб), чтобы не долбить внешние API
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value, ttlMs = CACHE_TTL_MS) {
    cache.set(key, { value, expires: Date.now() + ttlMs });
    // Не даём кэшу расти бесконечно
    if (cache.size > 500) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
}

/* =========================================================
   КОНТЕКСТ: FANDOM + WIKIPEDIA
   ========================================================= */

// Транслитерация: «Ведьмак 3» -> "vedmak 3", «Сильверхенд» -> "silverhend".
// Без этого на кириллический ввод не строится ни одного латинского слага,
// и Fandom (где вики живут на латинских поддоменах) не находится вообще.
const TRANSLIT_MAP = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
    á: 'a', à: 'a', ä: 'a', å: 'a', ā: 'a', ç: 'c', č: 'c', ć: 'c',
    é: 'e', è: 'e', ê: 'e', ë: 'e', ē: 'e', ę: 'e', í: 'i', ì: 'i', î: 'i',
    ï: 'i', ñ: 'n', ń: 'n', ó: 'o', ò: 'o', ô: 'o', ö: 'o', ø: 'o', ō: 'o',
    ś: 's', š: 's', ß: 'ss', ú: 'u', ù: 'u', û: 'u', ü: 'u', ū: 'u',
    ý: 'y', ź: 'z', ż: 'z', ž: 'z', œ: 'oe', æ: 'ae',
};

function translit(input) {
    return String(input)
        .toLowerCase()
        .split('')
        .map((ch) => (TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch))
        .join('');
}

// "The Witcher 3" -> thewitcher3, thewitcher, witcher, ... (и транслит кириллицы)
function slugCandidates(game) {
    const slug = (s) => s.toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, '');
    const withoutTrademark = game.replace(/[™®©]/g, ' ');
    const withoutSubtitle = withoutTrademark.replace(/\s*[:–—-]\s.*$/, '');
    const variants = new Set();

    const add = (v) => {
        if (v && v.length >= 3 && v.length <= 40) variants.add(v);
    };

    const sources = [withoutTrademark, withoutSubtitle];
    for (const source of sources) {
        const transliterated = translit(source);
        if (transliterated !== source.toLowerCase()) sources.push(transliterated);
    }

    for (const source of sources) {
        add(slug(source));
        add(slug(source.replace(/\s+\d+$/, '')));
        add(slug(source.replace(/^the\s+/i, '')));
        add(slug(source.replace(/\s+\d+$/, '').replace(/^the\s+/i, '')));
        add(slug(source.split(/\s+/)[0]));
    }

    return [...variants].slice(0, 8);
}

async function fandomContext(game, term) {
    for (const wikiSlug of slugCandidates(game)) {
        try {
            const api = `https://${wikiSlug}.fandom.com/api.php`;

            const search = await http.get(api, {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: term,
                    format: 'json',
                    srlimit: 1,
                },
            });
            const hit = search.data?.query?.search?.[0];
            if (!hit) continue;

            const parsed = await http.get(api, {
                params: {
                    action: 'parse',
                    page: hit.title,
                    prop: 'text',
                    format: 'json',
                    redirects: 1,
                },
            });
            const html = parsed.data?.parse?.text?.['*'];
            if (!html) continue;

            const $ = cheerio.load(html);
            $('script, style, sup, table, .navbox, .reference').remove();
            const text = $('body').text().replace(/\s+/g, ' ').trim();
            if (text.length < 40) continue;

            return {
                source: `${wikiSlug}.fandom.com`,
                title: hit.title,
                url: `https://${wikiSlug}.fandom.com/wiki/${encodeURIComponent(hit.title.replace(/\s/g, '_'))}`,
                text: text.slice(0, 1200),
            };
        } catch (error) {
            // Вики может не существовать (404) — это нормально, идём к следующему варианту
        }
    }
    return null;
}

async function wikipediaContext(game, term) {
    for (const lang of ['ru', 'en']) {
        try {
            const api = `https://${lang}.wikipedia.org/w/api.php`;
            const search = await http.get(api, {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: `${term} ${game}`.trim(),
                    format: 'json',
                    srlimit: 1,
                },
            });
            const hit = search.data?.query?.search?.[0];
            if (!hit) continue;

            const extract = await http.get(api, {
                params: {
                    action: 'query',
                    prop: 'extracts',
                    explaintext: 1,
                    exintro: 1,
                    titles: hit.title,
                    format: 'json',
                },
            });
            const pages = extract.data?.query?.pages || {};
            const text = Object.values(pages)[0]?.extract || '';
            if (text.length < 60) continue;

            return {
                source: `${lang}.wikipedia.org`,
                title: hit.title,
                url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/\s/g, '_'))}`,
                text: text.slice(0, 1200),
            };
        } catch (error) {
            // Пропускаем язык, если Википедия недоступна
        }
    }
    return null;
}

async function collectContext(game, term) {
    const key = `${game}::${term}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const [fandom, wiki] = await Promise.all([fandomContext(game, term), wikipediaContext(game, term)]);

    const result = { blocks: [], sources: [] };
    for (const item of [fandom, wiki]) {
        if (!item) continue;
        // Не дублируем одинаковый текст из разных источников
        if (result.blocks.some((b) => b.text === item.text)) continue;
        result.blocks.push(item);
        result.sources.push({ title: item.title, url: item.url, source: item.source });
    }

    cacheSet(key, result);
    return result;
}

/* =========================================================
   LLM
   ========================================================= */

const SYSTEM_PROMPT = [
    'Ты — эксперт по локализации видеоигр и профессиональный переводчик.',
    'Твоя задача — объяснить, как игровой термин переведён в разных локализациях, опираясь на предоставленный контекст.',
    'Ты не выдумываешь переводы и источники: если данных нет, честно понижаешь уверенность.',
    'Служебные поля ответа (summary, explanation) пиши по-русски; сами переводы — на целевых языках.',
].join(' ');

const JSON_SCHEMA_INSTRUCTION = `Верни ТОЛЬКО валидный JSON-объект без markdown-обёртки и текста вокруг:
{
  "summary": "1–3 предложения общего вывода по термину",
  "translations": [
    {
      "lang": "код языка из списка целевых: ru, en, de, fr, ja, pl, es, zh, it, pt…",
      "langName": "название языка по-русски",
      "official": "официальный перевод в локализации игры или null",
      "alternatives": ["другие варианты: фанатские, дословные, транслитерация"],
      "literal": "дословный перевод или null",
      "explanation": "1–2 предложения: почему так, какие отсылки и адаптации",
      "confidence": "high | medium | low"
    }
  ]
}
Правила:
- Ровно один элемент translations на каждый целевой язык.
- official заполняй, только если уверен в официальной локализации; иначе null и предложи вариант в alternatives.
- Не выдумывай источники и переводы. Нет вики-контекста — так и скажи в summary и поставь confidence не выше medium.
- Учитывай стиль перевода, глоссарий пользователя и подпроект, если они заданы.`;

function toneInstruction(tone) {
    const map = {
        lore: 'Используй стиль, соответствующий лору игры: возвышенный, архаичный, если это уместно.',
        slang: 'Используй сленг и неформальный стиль, принятый в игровом сообществе.',
        official: 'Опирайся на официальную локализацию и терминологию издателя.',
    };
    return map[tone] || '';
}

function formatLangList(targetLangs) {
    return targetLangs
        .map((lang) => (typeof lang === 'string' ? lang : `${lang.code} (${lang.name})`))
        .join(', ');
}

function buildPrompt({ game, object, subproject, targetLangs, tone, glossary, context, webBlock, structured = true }) {
    let prompt = 'Переведи игровой термин и объясни адаптацию.\n\n';
    prompt += `Игра: "${game}"\n`;
    prompt += `Термин: "${object}"\n`;
    if (subproject) prompt += `Подпроект/контекст: "${subproject}"\n`;
    prompt += `Целевые языки: ${formatLangList(targetLangs || [])}\n`;

    if (glossary && typeof glossary === 'object' && Object.keys(glossary).length > 0) {
        prompt += '\nОбязательно используй следующие переводы из глоссария пользователя:\n';
        let count = 0;
        for (const [term, translation] of Object.entries(glossary)) {
            if (count >= 50) break;
            prompt += `- "${term}" -> "${translation}"\n`;
            count += 1;
        }
    }

    const toneText = toneInstruction(tone);
    if (toneText) prompt += `\nСтиль перевода: ${toneText}\n`;

    const blocks = (context && Array.isArray(context.blocks)) ? context.blocks : [];
    if (blocks.length > 0) {
        prompt += '\nКонтекст из вики (используй для точности, но не копируй дословно):\n';
        for (const block of blocks) {
            prompt += `--- ${block.source} (${block.title}) ---\n"""\n${block.text}\n"""\n`;
        }
    } else {
        prompt += '\nКонтекста из вики нет: работай по собственным знаниям и предупреди об этом в summary.\n';
    }

    if (webBlock) {
        prompt += `\nДополнительный контекст из интернета (может содержать ошибки, проверяй критически):\n"""\n${webBlock}\n"""\n`;
    }

    if (structured) {
        prompt += `\n${JSON_SCHEMA_INSTRUCTION}`;
    } else {
        prompt +=
            '\nОтвет должен быть в формате Markdown: для каждого языка — перевод и краткое обоснование (1–2 предложения). ' +
            'Если официальной локализации нет, предложи наиболее естественный вариант и укажи это.';
    }

    return prompt;
}

async function requestLlm(body) {
    return axios.post(`${config.llm.baseUrl}/chat/completions`, body, {
        headers: {
            Authorization: `Bearer ${config.llm.apiKey}`,
            'Content-Type': 'application/json',
        },
        timeout: config.llm.timeoutMs,
    });
}

// Один повтор на временных сбоях провайдера — дешевле, чем показать пользователю ошибку.
async function withRetry(fn, attempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const status = error?.response?.status;
            const retryable =
                !status || status === 429 || status >= 500 || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error?.code);
            if (!retryable || attempt === attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
    }
    throw lastError;
}

function mockLlmText(prompt) {
    return '[mock] ' + String(prompt).replace(/\s+/g, ' ').slice(0, 80);
}

async function callLlm(prompt, options = {}) {
    if (config.mockLlm) return { content: mockLlmText(prompt), usage: null };

    const { json = false, temperature = 0.2, system = null, maxTokens = config.llm.maxTokens } = options;
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const body = {
        model: config.llm.model,
        messages,
        temperature,
        max_tokens: maxTokens,
    };
    if (json && config.llm.jsonMode !== 'off') body.response_format = { type: 'json_object' };

    let response;
    try {
        response = await withRetry(() => requestLlm(body));
    } catch (error) {
        const status = error?.response?.status;
        const providerMessage = String(error?.response?.data?.error?.message || '');
        // Часть OpenAI-совместимых провайдеров не знает response_format.
        if (body.response_format && [400, 404, 422].includes(status)) {
            console.warn(
                `[llm] Провайдер не принял response_format (HTTP ${status}${providerMessage ? `: ${providerMessage}` : ''}) — повторяем без JSON-режима`
            );
            delete body.response_format;
            response = await withRetry(() => requestLlm(body));
        } else {
            throw error;
        }
    }

    const answer = response.data?.choices?.[0]?.message?.content;
    if (!answer || !String(answer).trim()) {
        throw new Error('LLM вернул пустой ответ');
    }
    return { content: String(answer).trim(), usage: response.data?.usage || null };
}

/* =========================================================
   СТРУКТУРИРОВАННЫЙ ОТВЕТ
   Модель просим отдать JSON, но клиент обязан работать и с обычным
   markdown-ответом (старые провайдеры, отключённый JSON-режим).
   ========================================================= */

const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

function extractJson(text) {
    if (!text) return null;
    const cleaned = String(text)
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        /* пробуем вырезать объект */
    }

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

function asString(value, maxLength) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeTranslationRows(raw, targetLangs) {
    const allowed = (targetLangs || []).map((lang) => (typeof lang === 'string' ? lang : lang.code));
    const rows = [];
    const list = Array.isArray(raw) ? raw : [];

    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const code = asString(item.lang, 12).toLowerCase().split(/[-_]/)[0];
        if (!code || (allowed.length > 0 && !allowed.includes(code))) continue;
        if (rows.some((row) => row.lang === code)) continue;

        const langInfo = (targetLangs || []).find((lang) => (typeof lang === 'string' ? lang : lang.code) === code);
        const langName = asString(item.langName, 40) || (langInfo && langInfo.name) || SUPPORTED_LANGS[code] || code;

        rows.push({
            lang: code,
            langName,
            official: asString(item.official, 200) || null,
            alternatives: Array.isArray(item.alternatives)
                ? item.alternatives.map((alt) => asString(alt, 160)).filter(Boolean).slice(0, 6)
                : [],
            literal: asString(item.literal, 200) || null,
            explanation: asString(item.explanation, 800),
            confidence: CONFIDENCE_LEVELS.has(String(item.confidence || '').toLowerCase())
                ? String(item.confidence).toLowerCase()
                : 'medium',
            verified: false,
            evidence: null,
        });
    }

    if (rows.length === 0) return null;

    // Модель может вернуть меньше языков, чем просили — честно добиваем «нет данных».
    for (const lang of targetLangs || []) {
        const code = typeof lang === 'string' ? lang : lang.code;
        if (rows.some((row) => row.lang === code)) continue;
        rows.push({
            lang: code,
            langName: (lang && lang.name) || SUPPORTED_LANGS[code] || code,
            official: null,
            alternatives: [],
            literal: null,
            explanation: 'Модель не вернула перевод для этого языка.',
            confidence: 'low',
            verified: false,
            evidence: null,
        });
    }

    return rows;
}

function escapeMarkdownCell(value) {
    return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function translationsToMarkdown({ rows, summary }) {
    const lines = [];
    if (summary) lines.push(summary, '');

    lines.push('| Язык | Официальный перевод | Другие варианты | Уверенность |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of rows) {
        const official = escapeMarkdownCell(row.official || '—');
        const alternatives = row.alternatives.length ? escapeMarkdownCell(row.alternatives.join('; ')) : '—';
        const confidence = row.verified ? `${row.confidence} (подтверждено источником)` : row.confidence;
        lines.push(`| ${escapeMarkdownCell(`${row.langName} (${row.lang})`)} | ${official} | ${alternatives} | ${confidence} |`);
    }

    const explanations = rows.filter((row) => row.explanation);
    if (explanations.length > 0) {
        lines.push('');
        for (const row of explanations) {
            lines.push(`**${row.langName}:** ${row.explanation}`);
        }
    }

    return lines.join('\n');
}

function normalizeForMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[«»"'`’ʼ()[\]{}.,:;!?—–-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Проверяем, что предложенный перевод действительно встречается в собранном контексте.
// Это дешёвая защита от галлюцинаций: совпало — ставим бейдж «подтверждено источником».
function verifyRows(rows, blocks) {
    const haystack = (blocks || [])
        .map((block) => ({
            source: block.source,
            title: block.title,
            text: normalizeForMatch(block.text),
        }))
        .filter((block) => block.text);

    let verifiedCount = 0;
    for (const row of rows) {
        if (!Array.isArray(row.alternatives)) row.alternatives = [];
        const candidates = [row.official, ...row.alternatives].filter(Boolean);
        for (const candidate of candidates) {
            const needle = normalizeForMatch(candidate);
            if (needle.length < 3) continue;
            const hit = haystack.find((block) => block.text.includes(needle));
            if (hit) {
                row.verified = true;
                row.evidence = `${hit.source} — ${hit.title}`;
                verifiedCount += 1;
                break;
            }
        }
    }
    return verifiedCount;
}

function buildMockResponse({ game, object, targetLangs, subproject }) {
    const rows = targetLangs.map((lang) => ({
        lang: lang.code,
        langName: lang.name,
        official: `[${lang.code}] ${object} (mock)`,
        alternatives: [`${object} — демо-вариант`],
        literal: null,
        explanation: 'Демонстрационный ответ: включён MOCK_LLM, внешние сервисы не вызывались.',
        confidence: 'low',
        verified: false,
        evidence: null,
    }));
    const summary = `Демо-режим: перевод «${object}» (${game}${subproject ? `, ${subproject}` : ''}) не запрашивался у модели.`;

    return {
        answer: translationsToMarkdown({ rows, summary }),
        summary,
        translations: rows,
        sources: [],
        meta: {
            model: 'mock',
            promptVersion: PROMPT_VERSION,
            mock: true,
            usedWiki: false,
            usedWeb: false,
            webProvider: null,
            structured: true,
            verifiedCount: 0,
            cacheHit: false,
            latencyMs: 0,
            usage: null,
        },
    };
}

/* =========================================================
   ВЕБ-ПОИСК ДЛЯ PRO-РЕЖИМА
   Порядок: Tavily (если ключ рабочий) → DuckDuckGo HTML (без ключа)
   ========================================================= */

const WEB_SEARCH_PROVIDER = (process.env.WEB_SEARCH_PROVIDER || 'auto').toLowerCase();
const TAVILY_COOLDOWN_MS = 10 * 60 * 1000;
let tavilyCooldownUntil = 0;

function normalizeResults(results, source) {
    return results
        .filter((r) => r && r.url)
        .slice(0, 3)
        .map((r) => ({
            title: String(r.title || r.url).trim(),
            url: r.url,
            content: String(r.content || '').replace(/\s+/g, ' ').trim().slice(0, 500),
            source,
        }));
}

async function searchViaTavily(query) {
    if (!tavilyReady) return [];
    if (Date.now() < tavilyCooldownUntil) return [];

    try {
        const response = await tavilyHttp.post(
            `${config.tavilyBaseUrl}/search`,
            {
                query,
                search_depth: 'advanced',
                max_results: 3,
                include_answer: false,
            },
            {
                headers: { Authorization: `Bearer ${config.tavilyKey}` },
            }
        );

        return normalizeResults(response.data?.results || [], 'tavily');
    } catch (error) {
        const status = error?.response?.status;
        tavilyCooldownUntil = Date.now() + TAVILY_COOLDOWN_MS;

        if (status === 403) {
            console.warn(
                '[search] Tavily вернул 403 — похоже, запрос блокируется на уровне CDN по IP/региону. ' +
                    'Нужен прокси (TAVILY_PROXY) или запуск бэкенда вне РФ. 10 минут работаем через DuckDuckGo'
            );
        } else {
            console.warn(
                `[search] Tavily недоступен${status ? ` (HTTP ${status})` : ''} — 10 минут работаем через DuckDuckGo`
            );
        }
        return [];
    }
}

const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchDuckDuckGoHtml(query) {
    const headers = { 'User-Agent': BROWSER_UA, 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' };

    try {
        // POST надёжнее: GET-версия заметно чаще отдаёт капчу
        const post = await http.post(
            'https://html.duckduckgo.com/html/',
            new URLSearchParams({ q: query, kl: 'ru-ru' }).toString(),
            {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: config.searchTimeoutMs,
                validateStatus: () => true,
            }
        );
        const postHtml = String(post.data || '');
        if (post.status === 200 && postHtml.includes('result__a')) return postHtml;
    } catch (error) {
        console.warn('[search] DuckDuckGo (POST) недоступен:', error?.message || error);
    }

    try {
        const get = await http.get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            headers,
            timeout: config.searchTimeoutMs,
            validateStatus: () => true,
        });
        const getHtml = String(get.data || '');
        if (get.status === 200 && getHtml.includes('result__a')) return getHtml;
        if (getHtml.includes('bots use DuckDuckGo')) {
            console.warn('[search] DuckDuckGo показал капчу — веб-контекст пропущен');
        }
    } catch (error) {
        console.warn('[search] DuckDuckGo (GET) недоступен:', error?.message || error);
    }

    return '';
}

async function searchViaDuckDuckGoInstant(query) {
    try {
        const response = await http.get('https://api.duckduckgo.com/', {
            params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
            timeout: config.searchTimeoutMs,
            validateStatus: () => true,
        });
        const data = response.data || {};
        const results = [];

        if (data.AbstractText && data.AbstractURL) {
            results.push({
                title: data.Heading || query,
                url: data.AbstractURL,
                content: data.AbstractText,
            });
        }

        // Связанные темы берём только если это настоящие внешние ссылки
        const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
        for (const topic of topics) {
            if (results.length >= 3) break;
            if (!topic?.FirstURL || !topic?.Text) continue;
            if (/^https?:\/\/(www\.)?duckduckgo\.com/i.test(topic.FirstURL)) continue;
            results.push({
                title: String(topic.Text).split(' - ')[0].slice(0, 120),
                url: topic.FirstURL,
                content: topic.Text,
            });
        }

        return normalizeResults(results, 'duckduckgo-instant');
    } catch (error) {
        console.warn('[search] DuckDuckGo Instant Answer недоступен:', error?.message || error);
        return [];
    }
}

async function searchViaDuckDuckGo(query) {
    const html = await fetchDuckDuckGoHtml(query);

    if (html) {
        const $ = cheerio.load(html);
        const results = [];

        $('.result').each((i, el) => {
            if (results.length >= 3) return;

            const link = $(el).find('.result__a').first();
            let href = link.attr('href') || '';

            // На всякий случай разворачиваем редирект /l/?uddg=<url>
            const match = href.match(/[?&]uddg=([^&]+)/);
            if (match) {
                try {
                    href = decodeURIComponent(match[1]);
                } catch {
                    /* оставляем как есть */
                }
            }
            if (!/^https?:\/\//i.test(href)) return;

            const title = link.text().replace(/\s+/g, ' ').trim();
            if (!title) return;

            results.push({
                title,
                url: href,
                content: $(el).find('.result__snippet').text(),
            });
        });

        if (results.length > 0) return normalizeResults(results, 'duckduckgo');
    }

    // HTML-выдача недоступна (часто капча) — берём короткий ответ из Instant Answer API
    return searchViaDuckDuckGoInstant(query.split(/\s+/).slice(0, 6).join(' '));
}

async function searchWeb(query) {
    const cacheKey = `web::${query}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const providers =
        WEB_SEARCH_PROVIDER === 'tavily'
            ? ['tavily']
            : WEB_SEARCH_PROVIDER === 'duckduckgo'
              ? ['duckduckgo']
              : WEB_SEARCH_PROVIDER === 'off'
                ? []
                : ['tavily', 'duckduckgo'];

    let results = [];
    let provider = null;

    for (const candidate of providers) {
        results = candidate === 'tavily' ? await searchViaTavily(query) : await searchViaDuckDuckGo(query);
        if (results.length > 0) {
            provider = candidate;
            break;
        }
    }

    const payload = { results, provider };
    if (results.length > 0) cacheSet(cacheKey, payload, 15 * 60 * 1000);
    return payload;
}

/* =========================================================
   ВСПОМОГАТЕЛЬНОЕ
   ========================================================= */

function rateLimit({ windowMs = config.rateLimit.windowMs, max = config.rateLimit.max } = {}) {
    const hits = new Map();

    return function limiter(req, res, next) {
        const key = req.ip || 'unknown';
        const now = Date.now();
        const record = hits.get(key);

        if (!record || now > record.reset) {
            hits.set(key, { count: 1, reset: now + windowMs });
            return next();
        }

        record.count += 1;
        if (record.count > max) {
            const retryAfter = Math.ceil((record.reset - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ error: `Слишком много запросов. Повторите через ${retryAfter} с.` });
        }
        return next();
    };
}

function isPrivateIp(ip) {
    if (!ip) return true;
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);

    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
        const [a, b] = parts;
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 192 && b === 0) return true; // 192.0.0.0/24 и 192.0.2.0/24 (IETF/TEST-NET-1)
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
        if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
        if (a === 198 && b === 51) return true; // TEST-NET-2
        if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
        if (a >= 224) return true; // multicast / reserved
        return false;
    }

    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fe80')) return true; // link-local
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
        if (lower.startsWith('64:ff9b')) return true; // NAT64 — встраивает IPv4
        if (lower.startsWith('2002:')) return true; // 6to4 — встраивает IPv4
        if (lower.startsWith('2001:db8')) return true; // документация
        if (lower.startsWith('ff')) return true; // multicast
        return false;
    }

    return true;
}

async function assertPublicUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('Некорректный URL.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Поддерживаются только http(s)-адреса.');
    }

    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    if (![80, 443].includes(port)) {
        throw new Error('Разрешены только стандартные порты 80 и 443.');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (!hostname) throw new Error('Не удалось определить хост.');
    if (hostname === 'localhost' || /\.(localhost|local|internal|home\.arpa|lan)$/.test(hostname)) {
        throw new Error('Локальные адреса запрещены.');
    }

    if (net.isIP(hostname)) {
        if (isPrivateIp(hostname)) throw new Error('Локальные и служебные адреса запрещены.');
        return parsed;
    }

    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch {
        throw new Error('Не удалось разрешить доменное имя.');
    }

    if (!addresses.length) throw new Error('Не удалось разрешить доменное имя.');
    if (addresses.some((a) => isPrivateIp(a.address))) {
        throw new Error('Адрес ведёт во внутреннюю сеть — запрос запрещён.');
    }

    return parsed;
}

/* =========================================================
   ПРОКСИ-ПЕРЕВОД: БЕЗОПАСНАЯ ЗАГРУЗКА ЧУЖОЙ СТРАНИЦЫ
   ========================================================= */

const MAX_PROXY_REDIRECTS = 3;
const PROXY_BAD_TAGS =
    'script, iframe, frame, frameset, object, embed, noscript, template, portal, link[rel="import"], meta[http-equiv="refresh"]';

const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'xlink:href', 'poster'];

function isDangerousUrl(value) {
    return /^\s*(javascript|vbscript|data:text\/html|data:application):/i.test(String(value || ''));
}

// Чужой HTML показываем в iframe: вычищаем исполняемое и «выкидываем» относительные пути.
function sanitizeFetchedHtml($, parsedUrl) {
    $(PROXY_BAD_TAGS).remove();

    for (const element of $('*').toArray()) {
        const $element = $(element);
        for (const name of Object.keys(element.attribs || {})) {
            const lower = name.toLowerCase();
            if (lower.startsWith('on')) {
                $element.removeAttr(name); // inline-обработчики
                continue;
            }
            if (URL_ATTRIBUTES.includes(lower) && isDangerousUrl(element.attribs[name])) {
                $element.removeAttr(name); // javascript:-ссылки
            }
        }
    }

    // <base> заменяем на свой, иначе относительные ресурсы уедут на наш домен.
    $('base').remove();
    $('head').prepend(`<base href="${parsedUrl.origin}${parsedUrl.pathname}">`);

    // Формы из iframe никуда не отправляются.
    $('form').removeAttr('action').removeAttr('method');
}

// Загрузка с ручной обработкой редиректов: каждый хоп снова проверяется
// assertPublicUrl, иначе внешний сайт мог бы увести запрос во внутреннюю сеть.
async function fetchPublicPage(rawUrl, targetLang) {
    let current = rawUrl;

    for (let hop = 0; hop <= MAX_PROXY_REDIRECTS; hop += 1) {
        const parsedUrl = await assertPublicUrl(current);
        const response = await axios.get(parsedUrl.href, {
            timeout: 20000,
            maxContentLength: 8 * 1024 * 1024,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept-Language': `${targetLang},en;q=0.7`,
            },
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location;
            if (!location) throw new Error(`Сайт ответил ${response.status} без адреса перенаправления.`);
            current = new URL(location, parsedUrl).href;
            continue;
        }

        return { response, parsedUrl };
    }

    throw new Error('Слишком много перенаправлений.');
}

/* =========================================================
   ПОДСКАЗКИ ТЕРМИНОВ (автодополнение)
   ========================================================= */

async function fetchSuggestions(game, query) {
    const cacheKey = `suggest::${game.toLowerCase()}::${query.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const timeout = Math.min(config.searchTimeoutMs, 6000);
    const payload = { provider: null, suggestions: [] };

    for (const wikiSlug of slugCandidates(game)) {
        try {
            const response = await http.get(`https://${wikiSlug}.fandom.com/api.php`, {
                params: { action: 'opensearch', search: query, limit: 6, format: 'json', namespace: 0 },
                timeout,
                validateStatus: () => true,
            });
            const data = response.data;
            if (Array.isArray(data) && Array.isArray(data[1]) && data[1].length > 0) {
                payload.provider = 'fandom';
                payload.suggestions = data[1].slice(0, 6).map((title, index) => ({
                    title,
                    snippet: (data[2] && data[2][index]) || '',
                    url:
                        (data[3] && data[3][index]) ||
                        `https://${wikiSlug}.fandom.com/wiki/${encodeURIComponent(String(title).replace(/\s/g, '_'))}`,
                    source: `${wikiSlug}.fandom.com`,
                }));
                cacheSet(cacheKey, payload, 10 * 60 * 1000);
                return payload;
            }
        } catch {
            /* вики может не существовать — пробуем следующий вариант */
        }
    }

    try {
        const response = await http.get('https://en.wikipedia.org/w/api.php', {
            params: { action: 'opensearch', search: query, limit: 6, format: 'json' },
            timeout,
            validateStatus: () => true,
        });
        const data = response.data;
        if (Array.isArray(data) && Array.isArray(data[1]) && data[1].length > 0) {
            payload.provider = 'wikipedia';
            payload.suggestions = data[1].slice(0, 6).map((title, index) => ({
                title,
                snippet: (data[2] && data[2][index]) || '',
                url: (data[3] && data[3][index]) || '',
                source: 'en.wikipedia.org',
            }));
        }
    } catch {
        /* нет сети — отдаём пустой список, клиент это переживёт */
    }

    if (payload.suggestions.length > 0) cacheSet(cacheKey, payload, 10 * 60 * 1000);
    return payload;
}

/* =========================================================
   ПРИЛОЖЕНИЕ
   ========================================================= */

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(
    cors({
        origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    })
);
app.use(express.json({ limit: '256kb' }));

// Заголовки безопасности для всех ответов API.
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
});

const translateLimiter = rateLimit();
const proxyLimiter = rateLimit({ max: Math.max(5, Math.floor(config.rateLimit.max / 4)) });
const suggestLimiter = rateLimit({ max: Math.max(30, config.rateLimit.max * 2) });

/* ---------- health ---------- */

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        promptVersion: PROMPT_VERSION,
        mock: config.mockLlm,
        services: {
            llm: llmReady || config.mockLlm,
            tavily: tavilyReady,
            yookassa: yookassaReady,
        },
        webSearch: {
            provider: WEB_SEARCH_PROVIDER,
            fallback: 'duckduckgo',
            tavilyProxy: Boolean(config.tavilyProxy),
        },
        suggest: config.suggest.enabled,
        cache: { entries: cache.size, ttlSec: Math.round(CACHE_TTL_MS / 1000) },
        dailyLlmLimit: config.dailyLlmLimit,
        model: config.mockLlm ? 'mock' : config.llm.model,
    });
});

/* ---------- /api/suggest (автодополнение терминов) ---------- */

app.get('/api/suggest', suggestLimiter, async (req, res) => {
    const game = typeof req.query.game === 'string' ? req.query.game.trim().slice(0, 120) : '';
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (query.length < 2 || query.length > 80) {
        return res.status(400).json({ error: 'Нужен параметр q длиной от 2 до 80 символов.' });
    }
    if (!config.suggest.enabled || config.mockLlm) return res.json({ provider: null, suggestions: [] });

    try {
        return res.json(await fetchSuggestions(game || query, query));
    } catch (error) {
        console.warn('[suggest] Ошибка:', error?.message || error);
        return res.json({ provider: null, suggestions: [] });
    }
});

/* ---------- /api/translate (GET и POST) ---------- */

function readTranslateInput(req) {
    // GET-параметры и JSON-тело сливаем: ручку можно дёргать curl'ом без тела.
    const body = Object.assign({}, req.query || {}, req.body || {});

    return {
        game: typeof body.game === 'string' ? body.game.trim() : '',
        object: typeof body.object === 'string' ? body.object.trim() : '',
        subproject: typeof body.subproject === 'string' ? body.subproject.trim().slice(0, 200) : '',
        tone: typeof body.tone === 'string' ? body.tone : 'default',
        glossary: body.glossary && typeof body.glossary === 'object' ? body.glossary : null,
        targetLangs: normalizeTargetLangs(body.targetLangs || body.langs || body.lang),
        isPro: body.isPro === true || body.isPro === '1' || body.isPro === 'true',
    };
}

async function handleTranslate(req, res) {
    const { game, object, subproject, tone, glossary, targetLangs, isPro } = readTranslateInput(req);

    if (!game || !object || targetLangs.length === 0) {
        return res.status(400).json({
            error: 'Нужны поля game, object и targetLangs (коды языков: ru, en, de… или названия).',
        });
    }
    if (game.length > 120 || object.length > 300) {
        return res.status(400).json({ error: 'Слишком длинное название игры или термина.' });
    }
    if (!llmReady && !config.mockLlm) {
        return res.status(503).json({
            error: 'LLM не настроена: укажите LLM_API_KEY (и при необходимости LLM_BASE_URL) в Keys.env.',
        });
    }
    if (!consumeDailyBudget()) {
        return res.status(429).json({ error: 'Дневной лимит запросов исчерпан. Попробуйте позже.' });
    }

    const startedAt = Date.now();

    // Демо-режим: тесты и локальный просмотр интерфейса без внешних вызовов.
    if (config.mockLlm) {
        return res.json(buildMockResponse({ game, object, targetLangs, subproject }));
    }

    try {
        const context = await collectContext(game, object);

        // Веб-контекст — только для Pro: Tavily, при сбое DuckDuckGo
        const sources = [...context.sources];
        let webBlock = '';
        let webProvider = null;

        if (isPro) {
            const searchQuery = `${object} ${game} localization term`;
            const web = await searchWeb(searchQuery);
            webProvider = web.provider;

            if (web.results.length > 0) {
                webBlock = web.results
                    .map((r) => `${r.title}: ${r.content}`)
                    .join('\n\n')
                    .slice(0, 1500);
                for (const r of web.results) {
                    sources.push({ title: r.title, url: r.url, source: r.source });
                }
            }
        }

        const prompt = buildPrompt({
            game,
            object,
            subproject,
            targetLangs,
            tone,
            glossary,
            context,
            webBlock,
            structured: true,
        });

        const llmResult = await callLlm(prompt, { json: true, system: SYSTEM_PROMPT, temperature: 0.2 });

        // Пытаемся разобрать JSON; если модель ответила markdown — отдаём его как есть.
        let rows = null;
        let summary = '';
        let structured = false;
        const parsed = extractJson(llmResult.content);
        if (parsed && typeof parsed === 'object') {
            rows = normalizeTranslationRows(parsed.translations, targetLangs);
            summary = asString(parsed.summary, 600);
            structured = Boolean(rows);
        }

        const blocksForVerify = [...context.blocks];
        if (webBlock) blocksForVerify.push({ source: 'веб-поиск', title: 'web', text: webBlock });
        const verifiedCount = rows ? verifyRows(rows, blocksForVerify) : 0;

        res.json({
            answer: structured ? translationsToMarkdown({ rows, summary }) : llmResult.content,
            summary: summary || null,
            translations: rows,
            sources,
            meta: {
                model: config.llm.model,
                promptVersion: PROMPT_VERSION,
                mock: false,
                usedWiki: context.blocks.length > 0,
                usedWeb: Boolean(webBlock),
                webProvider,
                structured,
                verifiedCount,
                latencyMs: Date.now() - startedAt,
                usage: llmResult.usage || null,
            },
        });
    } catch (error) {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
            console.error('[translate] LLM отклонила ключ:', status);
            return res.status(502).json({
                error: 'LLM отклонила API-ключ. Проверьте LLM_API_KEY в Keys.env.',
            });
        }
        if (status === 429) {
            return res.status(503).json({ error: 'Лимит запросов к LLM исчерпан. Попробуйте позже.' });
        }
        if (error?.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'LLM не ответила вовремя. Попробуйте ещё раз.' });
        }

        console.error('[translate] Ошибка:', error?.message || error);
        return res.status(500).json({ error: 'Не удалось обработать запрос. Попробуйте позже.' });
    }
}

app.get('/api/translate', translateLimiter, handleTranslate);
app.post('/api/translate', translateLimiter, handleTranslate);

/* ---------- /api/proxy-translate ---------- */

app.post('/api/proxy-translate', proxyLimiter, async (req, res) => {
    const body = req.body || {};
    const { url, targetLang } = body;
    const userTier = Number(body.userTier) || 0;

    if (userTier < 2) {
        return res.status(403).json({ error: 'Функция доступна с уровня Premium+.' });
    }
    if (!url || !targetLang) {
        return res.status(400).json({ error: 'Нужны поля url и targetLang.' });
    }

    try {
        // Редиректы обрабатываются вручную: каждый хоп проверяется на SSRF.
        const { response, parsedUrl } = await fetchPublicPage(String(url), String(targetLang).slice(0, 12));

        const contentType = String(response.headers['content-type'] || '');
        if (contentType && !contentType.includes('text/html')) {
            return res.status(415).json({ error: 'Страница не является HTML — перевод невозможен.' });
        }

        const $ = cheerio.load(String(response.data));

        // Абсолютизируем ресурсы до очистки.
        $('img[src], link[href], source[src], video[poster]').each((i, elem) => {
            const $elem = $(elem);
            const attr = elem.tagName === 'link' ? 'href' : elem.tagName === 'video' ? 'poster' : 'src';
            const value = $elem.attr(attr);
            if (value && !value.startsWith('data:') && !value.startsWith('blob:')) {
                try {
                    $elem.attr(attr, new URL(value, parsedUrl).href);
                } catch {
                    /* некорректный URL — оставляем как есть */
                }
            }
        });

        // Ссылки ведут на оригинальный сайт
        $('a[href]').each((i, elem) => {
            const $elem = $(elem);
            const value = $elem.attr('href');
            if (value && !value.startsWith('#')) {
                try {
                    $elem.attr('href', new URL(value, parsedUrl).href);
                } catch {
                    /* ignore */
                }
            }
        });

        // Скрипты, обработчики и javascript:-ссылки в наш iframe не попадают.
        sanitizeFetchedHtml($, parsedUrl);

        // Переводим заголовок страницы (если LLM доступна)
        const title = $('title').text().trim();
        if (title) {
            try {
                const translatedTitle = await callLlm(
                    `Переведи заголовок веб-страницы на язык "${targetLang}". Ответь только переводом, без кавычек и пояснений.\n\n${title}`
                );
                $('title').text(String(translatedTitle.content).replace(/^\s*["«]|["»]\s*$/g, '').slice(0, 200));
            } catch (titleError) {
                console.warn('[proxy-translate] Не удалось перевести заголовок:', titleError?.message || titleError);
            }
        }

        res.type('html').send($.html());
    } catch (error) {
        const message = error?.message || 'неизвестная ошибка';
        console.error('[proxy-translate] Ошибка:', message);
        return res.status(502).json({ error: `Не удалось загрузить страницу: ${message}` });
    }
});

/* ---------- /api/create-payment ---------- */

app.post('/api/create-payment', async (req, res) => {
    // Цены синхронизированы с витриной в index.html.
    const prices = {
        premium: '349.00',
        premium_plus: '699.00',
        premium_plus_plus: '1290.00',
    };

    const plan = typeof req.body?.plan === 'string' ? req.body.plan.trim() : '';
    const amount = prices[plan];
    if (!amount) {
        return res.status(400).json({
            error: `Неизвестный тариф. Доступные: ${Object.keys(prices).join(', ')}.`,
        });
    }

    if (!yookassaReady) {
        return res.status(503).json({
            error: 'Оплата не настроена: добавьте реальные YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в Keys.env.',
        });
    }

    try {
        const payment = await yookassa.payments.create({
            amount: { value: amount, currency: 'RUB' },
            confirmation: {
                type: 'redirect',
                return_url: `${config.frontendOrigin}/index.html?payment=success`,
            },
            description: `Оплата подписки GameTranslator: ${plan}`,
            capture: true,
        });

        return res.json({
            confirmation_url: payment?.confirmation?.confirmation_url,
            payment_id: payment?.id,
        });
    } catch (error) {
        const status = error?.response?.status;
        console.error('[create-payment] Ошибка:', status || error?.message || error);
        if (status === 401 || status === 403) {
            return res.status(502).json({ error: 'ЮKassa отклонила ключи магазина. Проверьте Keys.env.' });
        }
        return res.status(502).json({ error: 'Не удалось создать платёж.' });
    }
});

/* ---------- 404 и обработчик ошибок ---------- */

app.use((req, res) => {
    res.status(404).json({ error: `Маршрут ${req.method} ${req.path} не найден.` });
});

// Ошибки парсинга JSON и прочие — отвечаем JSON, а не HTML
app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Тело запроса не является корректным JSON.' });
    }
    console.error('[server] Необработанная ошибка:', error?.message || error);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
});

/* ---------- запуск (локальный сервер) ---------- */

// В Netlify-функции приложение только импортируется: слушать порт там нельзя.
// Поэтому listen вызывается лишь при прямом запуске "node server.js".
function startServer() {
    const server = app.listen(config.port, () => {
        const mark = (ok) => (ok ? '✓' : '✗');
        console.log('');
        console.log('  GameTranslator backend');
        console.log(`  http://localhost:${config.port}  (health: /api/health)`);
        if (config.mockLlm) {
            console.log(`  LLM      ✓  MOCK-режим (MOCK_LLM=1): внешние вызовы отключены`);
        } else {
            console.log(`  LLM      ${mark(llmReady)}  ${config.llm.model} @ ${config.llm.baseUrl}`);
        }
        console.log(`  Tavily   ${mark(tavilyReady)}  ${tavilyReady ? 'ключ задан (проверяется при первом Pro-запросе)' : 'ключ не задан или заглушка'}`);
        console.log(`  Поиск    ${mark(WEB_SEARCH_PROVIDER !== 'off')}  ${WEB_SEARCH_PROVIDER.toUpperCase()}${WEB_SEARCH_PROVIDER === 'auto' ? ' (Tavily → DuckDuckGo)' : ''}`);
        if (config.tavilyProxy) console.log('  Прокси   ✓  Tavily идёт через ' + config.tavilyProxy.replace(/\/\/[^@]*@/, '//***@'));
        console.log(`  ЮKassa   ${mark(yookassaReady)}  ${yookassaReady ? 'платежи включены' : 'ключи не заданы — оплата отключена'}`);
        console.log(`  Промпт   ${PROMPT_VERSION}`);
        if (config.dailyLlmLimit) console.log(`  Бюджет   ${config.dailyLlmLimit} LLM-запросов в сутки`);
        console.log('');
    });

    function shutdown(signal) {
        console.log(`\n[server] Получен ${signal}, останавливаемся…`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = app;

// Внутренности для тестов: сервер экспортирует всё, что не должно быть
// публичным API, но нужно проверять юнит-тестами.
module.exports.helpers = {
    config,
    PROMPT_VERSION,
    SUPPORTED_LANGS,
    normalizeTargetLangs,
    translit,
    slugCandidates,
    isPrivateIp,
    assertPublicUrl,
    buildPrompt,
    SYSTEM_PROMPT,
    formatLangList,
    extractJson,
    normalizeTranslationRows,
    translationsToMarkdown,
    verifyRows,
    normalizeForMatch,
    cache,
    cacheGet,
    cacheSet,
    rateLimit,
    normalizeResults,
};
module.exports.buildMockResponse = buildMockResponse;
