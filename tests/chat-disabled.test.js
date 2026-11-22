// Kill-switch: при CHAT_ENABLED=0 чат полностью выключен, а /api/translate
// не выдаёт chatToken — фронтенд в этом случае не рисует кнопки чата.
// Отдельный файл, потому что config читается один раз при require.
'use strict';

process.env.MOCK_LLM = '1';
process.env.CHAT_ENABLED = '0';
process.env.CHAT_SIGNING_KEY = 'test-chat-signing-key-0123456789abcdef';

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

test('при CHAT_ENABLED=0 /api/translate не выдаёт chatToken', async () => {
    const response = await fetch(baseUrl + '/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'Cyberpunk 2077', object: 'Johnny Silverhand', targetLangs: ['ru'] }),
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.chat, false);
    assert.equal(data.chatToken, null);
    assert.equal(data.meta.chat, false);
});

test('при CHAT_ENABLED=0 /api/chat отвечает 503 chat_disabled', async () => {
    const response = await fetch(baseUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatToken: 'a.b', message: 'привет', rows: [] }),
    });
    const data = await response.json();

    assert.equal(response.status, 503);
    assert.equal(data.code, 'chat_disabled');
});
