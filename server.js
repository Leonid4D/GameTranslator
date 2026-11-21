// server.js — GameTranslator backend
// Запуск: npm start (или node server.js)
'use strict';

// 1. Переменные окружения: сначала Keys.env (исторический файл проекта), затем .env
require('dotenv').config({ path: './Keys.env', quiet: true });
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
    llm: {
        baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').trim().replace(/\/+$/, ''),
        apiKey: (process.env.LLM_API_KEY || '').trim(),
        model: (process.env.LLM_MODEL || 'deepseek-chat').trim(),
        timeoutMs: num(process.env.LLM_TIMEOUT_MS, 60000),
    },
    tavilyKey: (process.env.TAVILY_API_KEY || '').trim(),
    // Tavily блокирует часть IP-адресов (в т.ч. российские) на уровне CDN:
    // запрос с ключом оттуда получает 403. Если есть прокси — укажите его здесь.
    tavilyBaseUrl: (process.env.TAVILY_BASE_URL || 'https://api.tavily.com').trim().replace(/\/+$/, ''),
    tavilyProxy: (process.env.TAVILY_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim(),
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
};

const llmReady = isSet(config.llm.apiKey);
const tavilyReady = isSet(config.tavilyKey);
const yookassaReady = isSet(config.yookassa.shopId) && isSet(config.yookassa.secretKey);

const yookassa = yookassaReady
    ? YooKassa({ shop_id: config.yookassa.shopId, secret_key: config.yookassa.secretKey })
    : null;

/* =========================================================
   HTTP-КЛИЕНТЫ И КЭШ
   ========================================================= */

const UA = 'GameTranslator/1.0 (+https://github.com/Leonid4D/GameTranslator)';

const http = axios.create({
    timeout: 10000,
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
    timeout: 20000,
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

// "The Witcher 3" -> thewitcher3, thewitcher, witcher, the, ...
function slugCandidates(game) {
    const slug = (s) => s.toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, '');
    const withoutTrademark = game.replace(/[™®©]/g, ' ');
    const withoutSubtitle = withoutTrademark.replace(/\s*[:–—-]\s.*$/, '');
    const variants = new Set();

    const add = (v) => {
        if (v && v.length >= 3 && v.length <= 40) variants.add(v);
    };

    for (const source of [withoutTrademark, withoutSubtitle]) {
        add(slug(source));
        add(slug(source.replace(/\s+\d+$/, '')));
        add(slug(source.replace(/^the\s+/i, '')));
        add(slug(source.replace(/\s+\d+$/, '').replace(/^the\s+/i, '')));
        add(slug(source.split(/\s+/)[0]));
    }

    return [...variants].slice(0, 5);
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

function toneInstruction(tone) {
    const map = {
        lore: 'Используй стиль, соответствующий лору игры: возвышенный, архаичный, если это уместно.',
        slang: 'Используй сленг и неформальный стиль, принятый в игровом сообществе.',
        official: 'Опирайся на официальную локализацию и терминологию издателя.',
    };
    return map[tone] || '';
}

function buildPrompt({ game, object, subproject, targetLangs, tone, glossary, context }) {
    let prompt = 'Ты — эксперт по локализации видеоигр. Переведи указанный термин на указанные языки.\n\n';
    prompt += `Игра: "${game}"\n`;
    prompt += `Термин: "${object}"\n`;
    if (subproject) prompt += `Подпроект/контекст: "${subproject}"\n`;
    prompt += `Целевые языки: ${targetLangs.join(', ')}\n`;

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

    if (context.blocks.length > 0) {
        prompt += '\nКонтекст из вики (используй для точности, но не копируй дословно):\n';
        for (const block of context.blocks) {
            prompt += `--- ${block.source} (${block.title}) ---\n"""\n${block.text}\n"""\n`;
        }
    }

    prompt +=
        '\nОтвет должен быть в формате Markdown: для каждого языка — перевод и краткое обоснование (1–2 предложения). ' +
        'Если официальной локализации нет, предложи наиболее естественный вариант и укажи это.';

    return prompt;
}

async function callLlm(prompt) {
    const response = await axios.post(
        `${config.llm.baseUrl}/chat/completions`,
        {
            model: config.llm.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        },
        {
            headers: {
                Authorization: `Bearer ${config.llm.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: config.llm.timeoutMs,
        }
    );

    const answer = response.data?.choices?.[0]?.message?.content;
    if (!answer || !String(answer).trim()) {
        throw new Error('LLM вернул пустой ответ');
    }
    return String(answer).trim();
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
                timeout: 15000,
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
            timeout: 15000,
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
            timeout: 12000,
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
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a >= 224) return true; // multicast / reserved
        return false;
    }

    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        if (lower.startsWith('fe80')) return true; // link-local
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
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

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    if (hostname === 'localhost') throw new Error('Локальные адреса запрещены.');

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

const translateLimiter = rateLimit();
const proxyLimiter = rateLimit({ max: Math.max(5, Math.floor(config.rateLimit.max / 4)) });

/* ---------- health ---------- */

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        services: {
            llm: llmReady,
            tavily: tavilyReady,
            yookassa: yookassaReady,
        },
        webSearch: {
            provider: WEB_SEARCH_PROVIDER,
            fallback: 'duckduckgo',
            tavilyProxy: Boolean(config.tavilyProxy),
        },
        model: config.llm.model,
    });
});

/* ---------- /api/translate ---------- */

app.post('/api/translate', translateLimiter, async (req, res) => {
    const body = req.body || {};
    const game = typeof body.game === 'string' ? body.game.trim() : '';
    const object = typeof body.object === 'string' ? body.object.trim() : '';
    const subproject = typeof body.subproject === 'string' ? body.subproject.trim().slice(0, 200) : '';
    const tone = typeof body.tone === 'string' ? body.tone : 'default';
    const glossary = body.glossary && typeof body.glossary === 'object' ? body.glossary : null;

    const targetLangs = Array.isArray(body.targetLangs)
        ? [...new Set(body.targetLangs.filter((l) => typeof l === 'string').map((l) => l.trim()).filter(Boolean))].slice(0, 12)
        : [];

    if (!game || !object || targetLangs.length === 0) {
        return res.status(400).json({
            error: 'Нужны поля game, object и непустой массив targetLangs.',
        });
    }
    if (game.length > 120 || object.length > 300) {
        return res.status(400).json({ error: 'Слишком длинное название игры или термина.' });
    }

    if (!llmReady) {
        return res.status(503).json({
            error: 'LLM не настроена: укажите LLM_API_KEY (и при необходимости LLM_BASE_URL) в Keys.env.',
        });
    }

    try {
        const context = await collectContext(game, object);

        // Веб-контекст — только для Pro: Tavily, при сбое DuckDuckGo
        const sources = [...context.sources];
        let webBlock = '';
        let webProvider = null;

        if (body.isPro === true) {
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

        const prompt = buildPrompt({ game, object, subproject, targetLangs, tone, glossary, context });
        if (webBlock) {
            prompt += `\nДополнительный контекст из интернета:\n"""\n${webBlock}\n"""\n`;
        }

        const answer = await callLlm(prompt);

        res.json({
            answer,
            sources,
            meta: {
                model: config.llm.model,
                usedWiki: context.blocks.length > 0,
                usedWeb: Boolean(webBlock),
                webProvider,
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
});

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
        const parsedUrl = await assertPublicUrl(url);

        const response = await axios.get(parsedUrl.href, {
            timeout: 20000,
            maxContentLength: 8 * 1024 * 1024,
            maxRedirects: 3,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept-Language': `${targetLang},en;q=0.7`,
            },
        });

        const contentType = String(response.headers['content-type'] || '');
        if (contentType && !contentType.includes('text/html')) {
            return res.status(415).json({ error: 'Страница не является HTML — перевод невозможен.' });
        }

        const $ = cheerio.load(String(response.data));

        // <base> — чтобы относительные пути работали в iframe
        $('head').prepend(`<base href="${parsedUrl.origin}${parsedUrl.pathname}">`);

        // Абсолютизируем ресурсы
        $('img[src], link[href], script[src], source[src], video[poster]').each((i, elem) => {
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

        // Переводим заголовок страницы (если LLM доступна)
        const title = $('title').text().trim();
        if (title) {
            try {
                const translatedTitle = await callLlm(
                    `Переведи заголовок веб-страницы на язык "${targetLang}". Ответь только переводом, без кавычек и пояснений.\n\n${title}`
                );
                $('title').text(translatedTitle.replace(/^\s*["«]|["»]\s*$/g, '').slice(0, 200));
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
    const prices = {
        premium: '299.00',
        premium_plus: '599.00',
        premium_plus_plus: '999.00',
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

/* ---------- запуск ---------- */

const server = app.listen(config.port, () => {
    const mark = (ok) => (ok ? '✓' : '✗');
    console.log('');
    console.log('  GameTranslator backend');
    console.log(`  http://localhost:${config.port}  (health: /api/health)`);
    console.log(`  LLM      ${mark(llmReady)}  ${config.llm.model} @ ${config.llm.baseUrl}`);
    console.log(`  Tavily   ${mark(tavilyReady)}  ${tavilyReady ? 'ключ задан (проверяется при первом Pro-запросе)' : 'ключ не задан или заглушка'}`);
    console.log(`  Поиск    ${mark(WEB_SEARCH_PROVIDER !== 'off')}  ${WEB_SEARCH_PROVIDER.toUpperCase()}${WEB_SEARCH_PROVIDER === 'auto' ? ' (Tavily → DuckDuckGo)' : ''}`);
    if (config.tavilyProxy) console.log('  Прокси   ✓  Tavily идёт через ' + config.tavilyProxy.replace(/\/\/[^@]*@/, '//***@'));
    console.log(`  ЮKassa   ${mark(yookassaReady)}  ${yookassaReady ? 'платежи включены' : 'ключи не заданы — оплата отключена'}`);
    console.log('');
});

function shutdown(signal) {
    console.log(`\n[server] Получен ${signal}, останавливаемся…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
