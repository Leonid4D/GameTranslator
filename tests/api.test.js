// Smoke-тесты HTTP API. Работают без сети и без ключей: MOCK_LLM=1.
// Запуск: npm test
'use strict';

process.env.MOCK_LLM = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const app = require('../server');

let server;
let baseUrl;

test.before(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
    server.close();
});

async function postJson(path, body) {
    const response = await fetch(baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { response, data };
}

test('GET /api/health отвечает статусом и версией промпта', async () => {
    const response = await fetch(baseUrl + '/api/health');
    assert.equal(response.status, 200);
    const data = await response.json();

    assert.equal(data.ok, true);
    assert.equal(data.mock, true);
    assert.match(data.promptVersion, /^v\d/);
    assert.equal(data.services.llm, true);
    assert.ok(data.cache && typeof data.cache.entries === 'number');
});

test('POST /api/translate отдаёт структурированный ответ', async () => {
    const { response, data } = await postJson('/api/translate', {
        game: 'Cyberpunk 2077',
        object: 'Johnny Silverhand',
        targetLangs: ['ru', 'de'],
        isPro: false,
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data.translations));
    assert.equal(data.translations.length, 2);
    assert.deepEqual(data.translations.map((row) => row.lang), ['ru', 'de']);
    assert.match(data.answer, /Официальный перевод/);
    assert.equal(data.meta.structured, true);
    assert.equal(data.meta.mock, true);
    assert.ok(Array.isArray(data.sources));
});

test('POST /api/translate принимает старые названия языков', async () => {
    const { response, data } = await postJson('/api/translate', {
        game: 'The Witcher 3',
        object: 'Geralt of Rivia',
        targetLangs: ['Русский', 'English'],
    });

    assert.equal(response.status, 200);
    assert.deepEqual(data.translations.map((row) => row.lang), ['ru', 'en']);
});

test('GET /api/translate работает для curl-запросов', async () => {
    const response = await fetch(
        baseUrl + '/api/translate?game=Fallout%203&object=Vault%20101&langs=ru'
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.translations[0].lang, 'ru');
});

test('POST /api/translate без языков отвечает 400', async () => {
    const { response, data } = await postJson('/api/translate', { game: 'X', object: 'Y' });
    assert.equal(response.status, 400);
    assert.match(data.error, /targetLangs/);
});

test('POST /api/translate с битым JSON отвечает 400', async () => {
    const response = await fetch(baseUrl + '/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ не json',
    });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.match(data.error, /JSON/);
});

test('у API есть заголовки безопасности', async () => {
    const response = await fetch(baseUrl + '/api/health');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('неизвестный маршрут отвечает JSON-404', async () => {
    const response = await fetch(baseUrl + '/api/unknown');
    assert.equal(response.status, 404);
    const data = await response.json();
    assert.match(data.error, /не найден/);
});

test('proxy-translate закрыт для бесплатного уровня', async () => {
    const { response, data } = await postJson('/api/proxy-translate', {
        url: 'https://example.com/',
        targetLang: 'ru',
        userTier: 0,
    });
    assert.equal(response.status, 403);
    assert.match(data.error, /Premium/);
});

test('proxy-translate не ходит на локальные адреса (SSRF)', async () => {
    const { response, data } = await postJson('/api/proxy-translate', {
        url: 'http://127.0.0.1/secret',
        targetLang: 'ru',
        userTier: 2,
    });
    assert.equal(response.status, 502);
    assert.match(data.error, /запрещен|Не удалось загрузить/);
});

test('suggest в mock-режиме не ходит в сеть', async () => {
    const response = await fetch(baseUrl + '/api/suggest?q=Sil&game=Cyberpunk%202077');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.suggestions, []);
});

test('suggest проверяет длину запроса', async () => {
    const response = await fetch(baseUrl + '/api/suggest?q=a');
    assert.equal(response.status, 400);
});

test('create-payment без ключей отвечает 503', async () => {
    const { response, data } = await postJson('/api/create-payment', { plan: 'premium' });
    assert.equal(response.status, 503);
    assert.match(data.error, /Оплата не настроена/);
});

test('create-payment отвергает неизвестный тариф', async () => {
    const { response, data } = await postJson('/api/create-payment', { plan: 'gold' });
    assert.equal(response.status, 400);
    assert.match(data.error, /Неизвестный тариф/);
});
