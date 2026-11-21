#!/usr/bin/env node
/*
 * check-tavily.js — диагностика веб-поиска Tavily для Pro-режима.
 *
 * Запуск:  npm run tavily:check
 *
 * Что проверяет:
 *   1. доступен ли api.tavily.com вообще (запрос без ключа должен дать 401);
 *   2. что отвечает сервис на ваш ключ (200 — всё ок, 403 — блокировка IP/региона);
 *   3. работает ли TAVILY_PROXY из Keys.env, если он задан.
 *
 * Коды выхода: 0 — Tavily работает, 2 — блокировка/нужен прокси, 3 — ключ
 * не принят, 4 — сеть/прокси недоступны, 1 — ключ не задан.
 */
'use strict';

const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, 'Keys.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const KEY = (process.env.TAVILY_API_KEY || '').trim();
const PROXY_RAW = (process.env.TAVILY_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
const BASE = (process.env.TAVILY_BASE_URL || 'https://api.tavily.com').trim().replace(/\/+$/, '');

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
        return undefined;
    }
}

function maskSecret(value) {
    if (!value) return '<пусто>';
    if (value.length <= 10) return '***';
    return value.slice(0, 5) + '…' + value.slice(-4);
}

function maskProxy(raw) {
    if (!raw) return 'нет (запросы идут напрямую)';
    return raw.replace(/\/\/[^@/]+@/, '//***@');
}

async function ping(label, headers) {
    const client = axios.create({
        timeout: 25000,
        proxy: parseProxy(PROXY_RAW),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    const started = Date.now();
    try {
        const response = await client.post(
            BASE + '/search',
            { query: 'The Witcher 3 Silver Sword localization', search_depth: 'basic', max_results: 2 },
            { headers, validateStatus: () => true }
        );
        return { label, status: response.status, ms: Date.now() - started, data: response.data };
    } catch (error) {
        return { label, error: error.message, code: error.code, ms: Date.now() - started };
    }
}

function printHeader() {
    console.log('');
    console.log('  Tavily: диагностика веб-поиска для Pro-режима');
    console.log('  -----------------------------------------------------------');
    console.log('  эндпоинт : ' + BASE);
    console.log('  ключ     : ' + maskSecret(KEY));
    console.log('  прокси   : ' + maskProxy(PROXY_RAW));
    console.log('');
}

(async () => {
    printHeader();

    if (!KEY) {
        console.log('  [FAIL] TAVILY_API_KEY не задан в Keys.env.');
        console.log('         Без ключа Pro-режим работает только на вики-контексте.');
        console.log('         Ключ: https://app.tavily.com (бесплатный тариф).');
        process.exit(1);
    }

    // 1. Анонимный запрос: по нему видно, доходит ли трафик до API вообще.
    const anon = await ping('anonymous', {});
    if (anon.error) {
        console.log('  [FAIL] Сеть: ' + anon.error + (anon.code ? ' (' + anon.code + ')' : ''));
        if (PROXY_RAW) {
            console.log('         Похоже, прокси не отвечает. Проверьте TAVILY_PROXY:');
            console.log('         http://[login:password@]host:port');
        } else {
            console.log('         Проверьте интернет/фаервол.');
        }
        process.exit(4);
    }
    console.log('  [1/2] Запрос без ключа : HTTP ' + anon.status + '  (' + anon.ms + ' мс)');

    // 2. Запрос с ключом.
    const auth = await ping('authorized', { Authorization: 'Bearer ' + KEY });
    if (auth.error) {
        console.log('  [FAIL] Запрос с ключом не прошёл: ' + auth.error);
        process.exit(4);
    }
    console.log('  [2/2] Запрос с ключом  : HTTP ' + auth.status + '  (' + auth.ms + ' мс)');
    console.log('');

    if (auth.status === 200) {
        const count = Array.isArray(auth.data && auth.data.results) ? auth.data.results.length : 0;
        console.log('  [OK] Tavily работает. Результатов в тестовом поиске: ' + count + '.');
        console.log('       Pro-режим будет использовать веб-поиск (meta.webProvider = "tavily").');
        process.exit(0);
    }

    if (auth.status === 401) {
        console.log('  [FAIL] Ключ не принят (HTTP 401).');
        console.log('         Создайте новый ключ на https://app.tavily.com и обновите');
        console.log('         строку TAVILY_API_KEY= в Keys.env. Код менять не нужно.');
        process.exit(3);
    }

    if (auth.status === 403) {
        if (anon.status === 401) {
            console.log('  [BLOCKED] API Tavily живо (без ключа отвечает 401), но запрос');
            console.log('            с ключом режется CDN (403) — это блокировка по IP/региону,');
            console.log('            а не проблема ключа. Смена ключа не поможет.');
        } else {
            console.log('  [BLOCKED] CDN Tavily отвечает 403 даже без ключа — IP заблокирован.');
        }
        console.log('');
        console.log('  Что делать (любой вариант):');
        console.log('    1) TAVILY_PROXY в Keys.env — HTTP-прокси с зарубежным IP:');
        console.log('       TAVILY_PROXY=http://login:password@host:port');
        console.log('    2) Запустить бэкенд вне РФ (Render/Railway/VPS) — тогда прокси не нужен.');
        console.log('    3) Пока ничего нет — оставить Pro на вики-контексте:');
        console.log('       это работает, но без результатов веб-поиска.');
        process.exit(2);
    }

    console.log('  [WARN] Неожиданный ответ HTTP ' + auth.status + '.');
    console.log('         Тело: ' + JSON.stringify(auth.data).slice(0, 300));
    process.exit(4);
})();
