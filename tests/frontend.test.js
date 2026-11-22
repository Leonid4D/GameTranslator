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

/* ---------- мини-чат «Обсудить перевод» ---------- */

test('chat.js существует, версионирован и подключён до app.js', () => {
    const stats = fs.statSync(path.join(root, 'assets/chat.js'));
    assert.ok(stats.size > 3000, 'chat.js подозрительно маленький');

    const html = read('index.html');
    assert.match(html, /assets\/chat\.js\?v=\d+\.\d+\.\d+/, 'chat.js должен подключаться с версией');
    const chatIndex = html.indexOf('assets/chat.js');
    const appIndex = html.indexOf('assets/app.js');
    assert.ok(chatIndex !== -1 && appIndex !== -1 && chatIndex < appIndex, 'chat.js должен идти до app.js');
    assert.match(html, /id="gtchat"/, 'нет контейнера чата');
});

test('chat.js не вставляет HTML и не исполняет динамический код', () => {
    const source = read('assets/chat.js');
    for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'srcdoc', 'createContextualFragment', 'eval(', 'new Function']) {
        assert.equal(source.includes(forbidden), false, `в chat.js найден запрещённый ${forbidden}`);
    }
    assert.equal(/setTimeout\(\s*['"`]/.test(source), false, 'строковый setTimeout недопустим');
});

test('chat.js не подключает markdown/санитайзер и не создаёт ссылки/картинки', () => {
    const source = read('assets/chat.js');
    for (const forbidden of ['marked', 'DOMPurify', 'renderMarkdown', 'renderAnswerHTML', 'sanitizeHtml']) {
        assert.equal(source.includes(forbidden), false, `в chat.js найден ${forbidden}`);
    }
    assert.equal(source.includes("createElement('a')") || source.includes('createElement("a")'), false);
    assert.equal(source.includes("createElement('img')") || source.includes('createElement("img")'), false);
    assert.equal(/\.href\s*=/.test(source), false, 'chat.js не должен ставить href');
    assert.equal(/\.src\s*=/.test(source), false, 'chat.js не должен ставить src');
});

test('лимиты чата на клиенте совпадают с каноном', () => {
    const source = read('assets/chat.js');
    for (const [name, value] of [
        ['maxHistory', '8'],
        ['maxHistoryChars', '6000'],
        ['maxUserMessage', '1000'],
        ['maxReply', '2000'],
        ['maxActions', '3'],
    ]) {
        assert.match(source, new RegExp(name + ':\\s*' + value + '\\b'), `лимит ${name} должен быть ${value}`);
    }
});

test('токен и история чата не попадают в storage', () => {
    const source = read('assets/chat.js');
    assert.equal(source.includes('sessionStorage'), false, 'sessionStorage недопустим');
    assert.equal(/localStorage\.setItem\([^)]*chatToken/i.test(source), false, 'chatToken нельзя сохранять');
    assert.equal(/localStorage\.setItem\([^)]*transcript/i.test(source), false, 'историю нельзя сохранять');
    // localStorage допустим только для UX-квоты и существующего глоссария.
    const stores = [...source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(([^)]*)\)/g)].map((m) => m[1].trim());
    for (const store of stores) {
        assert.match(store, /GLOSSARY_KEY|userTierLevel/, `неожиданное использование localStorage: ${store}`);
    }
});

test('кэш не сохраняет chatToken, а правка применяется только событием', () => {
    const source = read('assets/app.js');
    assert.match(source, /function cacheSafeData/, 'нет функции очистки кэша');
    assert.match(source, /delete safe\.chatToken/, 'chatToken должен вырезаться из кэша');
    assert.match(source, /addEventListener\('gt-apply-edit'/, 'app.js должен слушать применение правки');
    const chat = read('assets/chat.js');
    assert.match(chat, /gt-apply-edit/, 'чат должен отправлять событие применения');
    assert.equal((chat.match(/gt-apply-edit/g) || []).length, 1, 'правка должна применяться только в одном месте');
});

test('разметка чата доступна и совместима с CSP', () => {
    const html = read('index.html');
    assert.match(html, /id="gtchat"/);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-labelledby="gtchatTitle"/);
    assert.match(html, /role="log"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /maxlength="1000"/);
    const chatBlock = html.slice(html.indexOf('id="gtchat"'), html.indexOf('</aside>'));
    assert.equal(/\son[a-z]+\s*=/.test(chatBlock), false, 'inline-обработчики в чате недопустимы');
    const headers = read('_headers');
    assert.match(headers, /script-src 'self'/);
    assert.equal(/script-src[^;]*unsafe-inline/.test(headers), false, 'CSP не должна разрешать inline-скрипты');
    assert.equal(/script-src[^;]*unsafe-eval/.test(headers), false, 'CSP не должна разрешать eval');
});

test('точки входа чата есть в рендере результата', () => {
    const source = read('assets/app.js');
    assert.match(source, /function renderTools\(chatAvailable/, 'renderTools должен знать о чате');
    assert.match(source, /data-chat-open/, 'нет кнопки «Обсудить перевод»');
    assert.match(source, /data-chat-row/, 'нет кнопки «Уточнить» у строки');
    assert.match(source, /gt-result/, 'нет события результата для чата');
    assert.match(source, /apiBase: API_BASE/, 'чат должен получать адрес API');
});

test('i18n-ключи чата есть в RU и EN', () => {
    const source = read('assets/app.js');
    for (const key of ['chat_open', 'chat_title', 'chat_placeholder', 'chat_unverified', 'chat_disclaimer', 'chat_apply_failed']) {
        const matches = source.split(key + ':').length - 1;
        assert.ok(matches >= 2, `ключ ${key} должен быть в RU и EN (найдено ${matches})`);
    }
});

test('сборка включает chat.js', () => {
    const build = read('netlify/build.js');
    assert.match(build, /assets\/chat\.js/, 'build.js не проверяет наличие chat.js');
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.scripts.check, /assets\/chat\.js/, 'npm run check не проверяет chat.js');
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'версия должна быть SemVer');
});
