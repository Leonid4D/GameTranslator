// Проверки статического фронтенда: ссылки на файлы, отсутствие inline-скриптов
// и обработчиков (нужно для строгого CSP), наличие вендорных библиотек.
// Запуск: npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relative) {
    return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('index.html ссылается только на существующие локальные файлы', () => {
    const html = read('index.html');
    const references = [...html.matchAll(/(?:src|href)="(?!https?:|mailto:|#|data:|about:)([^"]+)"/g)]
        .map((match) => match[1].split('?')[0]);

    assert.ok(references.length > 0, 'не найдено ни одной локальной ссылки');
    for (const reference of new Set(references)) {
        assert.ok(fs.existsSync(path.join(root, reference)), `нет файла: ${reference}`);
    }
});

test('ассеты версионированы, а статика не кэшируется как immutable', () => {
    const html = read('index.html');
    assert.match(html, /assets\/style\.css\?v=\d+\.\d+/, 'CSS должен подключаться с версией');
    assert.match(html, /assets\/app\.js\?v=\d+\.\d+/, 'JS должен подключаться с версией');

    const headers = read('_headers');
    const assetsBlock = headers.split('/assets/*')[1] || '';
    assert.equal(/immutable/.test(assetsBlock), false, '/assets/* не должен быть immutable без хэша в имени');
});

test('index.html не содержит inline-скриптов, кроме JSON-LD', () => {
    const html = read('index.html');
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)];

    for (const match of inlineScripts) {
        assert.match(match[1], /application\/ld\+json/, 'inline <script> без src допустим только для JSON-LD');
    }
});

test('index.html не содержит inline-обработчиков (нужно для CSP)', () => {
    const html = read('index.html');
    assert.equal(/\son[a-z]+\s*=/.test(html), false, 'найден inline-обработчик onclick/onsubmit');
});

test('about.html подключает вынесенные стили и скрипт', () => {
    const html = read('about.html');
    assert.match(html, /assets\/about\.css/);
    assert.match(html, /assets\/about\.js/);
    assert.equal(/\son[a-z]+\s*=/.test(html), false, 'найден inline-обработчик onclick');
    assert.equal(/<script>\s*\n/.test(html), false, 'остался inline <script>');
});

test('вендорные библиотеки лежат локально', () => {
    for (const file of ['assets/vendor/marked.min.js', 'assets/vendor/purify.min.js']) {
        const stats = fs.statSync(path.join(root, file));
        assert.ok(stats.size > 5000, `файл ${file} подозрительно маленький`);
    }
});

test('app.js санитайзит разметку и поддерживает структурированный ответ', () => {
    const source = read('assets/app.js');
    assert.match(source, /DOMPurify/);
    assert.match(source, /function sanitizeHtml/);
    assert.match(source, /function renderComparisonTable/);
    assert.match(source, /data-copy-row/);
    assert.match(source, /class="toast"|className = 'toast'/);
});

test('в разметке у языковых чипов есть коды языков', () => {
    const html = read('index.html');
    const chips = [...html.matchAll(/class="lang-chip[^"]*"(?:\s+data-code="([a-z]{2})")?/g)];
    assert.ok(chips.length >= 8, 'должно быть не меньше 8 языковых чипов');
    for (const chip of chips) assert.ok(chip[1], 'чип без data-code');
});

test('манифест, robots и sitemap на месте', () => {
    for (const file of ['manifest.json', 'robots.txt', 'sitemap.xml', '_headers']) {
        assert.ok(fs.existsSync(path.join(root, file)), `нет файла: ${file}`);
    }
    const manifest = JSON.parse(read('manifest.json'));
    assert.equal(manifest.display, 'standalone');
});
