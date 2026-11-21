// Юнит-тесты чистых функций бэкенда.
// Запуск: npm test
'use strict';

process.env.MOCK_LLM = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const {
    normalizeTargetLangs,
    translit,
    slugCandidates,
    isPrivateIp,
    assertPublicUrl,
    buildPrompt,
    extractJson,
    normalizeTranslationRows,
    translationsToMarkdown,
    verifyRows,
    normalizeForMatch,
    rateLimit,
    SUPPORTED_LANGS,
    PROMPT_VERSION,
} = app.helpers;

/* ---------- языки ---------- */

test('normalizeTargetLangs принимает коды и названия', () => {
    const result = normalizeTargetLangs(['ru', 'English', '🇷🇺 Русский', 'de']);
    assert.deepEqual(result.map((lang) => lang.code), ['ru', 'en', 'de']);
    assert.equal(result[0].name, 'Русский');
});

test('normalizeTargetLangs чистит мусор и дубли', () => {
    const result = normalizeTargetLangs('ru, RU ,, de, ru');
    assert.deepEqual(result.map((lang) => lang.code), ['ru', 'de']);
});

test('normalizeTargetLangs ограничивает список 12 языками', () => {
    const codes = Object.keys(SUPPORTED_LANGS).concat(['aa', 'bb', 'cc', 'dd', 'ee', 'ff']);
    assert.ok(normalizeTargetLangs(codes).length <= 12);
});

/* ---------- транслитерация и слаги ---------- */

test('translit переводит кириллицу в латиницу', () => {
    assert.equal(translit('Ведьмак 3'), 'vedmak 3');
    assert.equal(translit('Сильверхенд'), 'silverkhend');
});

test('slugCandidates находит латинские варианты для кириллического названия', () => {
    const slugs = slugCandidates('Ведьмак 3');
    assert.ok(slugs.includes('vedmak3'), `нет vedmak3: ${slugs.join(', ')}`);
    assert.ok(slugs.includes('vedmak'), `нет vedmak: ${slugs.join(', ')}`);
});

test('slugCandidates сохраняет прежнее поведение для латиницы', () => {
    const slugs = slugCandidates('The Witcher 3');
    assert.ok(slugs.includes('thewitcher3'));
    assert.ok(slugs.includes('witcher'));
});

/* ---------- SSRF ---------- */

test('isPrivateIp отсекает локальные и служебные диапазоны', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.5', '169.254.169.254', '100.64.1.1', '0.0.0.0', '224.0.0.1']) {
        assert.equal(isPrivateIp(ip), true, `должен быть приватным: ${ip}`);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
        assert.equal(isPrivateIp(ip), false, `должен быть публичным: ${ip}`);
    }
});

test('isPrivateIp отсекает IPv6-ловушки', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', '2002:7f00:1::', '64:ff9b::7f00:1', 'ff02::1']) {
        assert.equal(isPrivateIp(ip), true, `должен быть приватным: ${ip}`);
    }
    assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('assertPublicUrl блокирует локальные адреса и нестандартные порты', async () => {
    const blocked = [
        'http://127.0.0.1/',
        'http://localhost/',
        'http://[::1]/',
        'http://10.0.0.5/',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::ffff:127.0.0.1]/',
        'http://example.com:8080/',
        'ftp://example.com/',
        'http://some.internal/',
    ];

    for (const url of blocked) {
        await assert.rejects(() => assertPublicUrl(url), undefined, `должен быть заблокирован: ${url}`);
    }
});

test('assertPublicUrl пропускает публичный IP', async () => {
    const parsed = await assertPublicUrl('https://93.184.216.34/');
    assert.equal(parsed.hostname, '93.184.216.34');
});

/* ---------- промпт ---------- */

test('buildPrompt содержит языки, глоссарий и контекст', () => {
    const prompt = buildPrompt({
        game: 'Cyberpunk 2077',
        object: 'Johnny Silverhand',
        subproject: 'Phantom Liberty',
        targetLangs: [{ code: 'ru', name: 'Русский' }, { code: 'de', name: 'Deutsch' }],
        tone: 'lore',
        glossary: { Silverhand: 'Сильверхенд' },
        context: { blocks: [{ source: 'cyberpunk.fandom.com', title: 'Johnny Silverhand', text: 'Джонни Сильверхенд — рокер.' }], sources: [] },
        webBlock: 'Некий веб-контекст',
        structured: true,
    });

    assert.match(prompt, /ru \(Русский\)/);
    assert.match(prompt, /"Silverhand" -> "Сильверхенд"/);
    assert.match(prompt, /cyberpunk\.fandom\.com/);
    assert.match(prompt, /Некий веб-контекст/);
    assert.match(prompt, /JSON/);
});

test('buildPrompt без контекста просит честно сказать об этом', () => {
    const prompt = buildPrompt({
        game: 'X',
        object: 'Y',
        targetLangs: ['ru'],
        context: { blocks: [], sources: [] },
        structured: false,
    });
    assert.match(prompt, /Контекста из вики нет/);
    assert.match(prompt, /Markdown/);
});

/* ---------- разбор ответа модели ---------- */

test('extractJson разбирает чистый JSON, фенс и текст вокруг', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
    assert.deepEqual(extractJson('Вот ответ: {"a":3} — готово'), { a: 3 });
    assert.equal(extractJson('не JSON'), null);
    assert.equal(extractJson(''), null);
});

test('normalizeTranslationRows отбрасывает неизвестные языки и добивает пропущенные', () => {
    const langs = [{ code: 'ru', name: 'Русский' }, { code: 'de', name: 'Deutsch' }];
    const rows = normalizeTranslationRows(
        [
            { lang: 'ru', official: 'Сильверхенд', alternatives: ['Джонни'], confidence: 'high' },
            { lang: 'fr', official: 'Silverhand' },
            { lang: 'RU', official: 'дубль' },
        ],
        langs
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0].lang, 'ru');
    assert.equal(rows[0].confidence, 'high');
    assert.equal(rows[1].lang, 'de');
    assert.equal(rows[1].official, null);
    assert.equal(rows[1].confidence, 'low');
});

test('normalizeTranslationRows возвращает null без валидных строк', () => {
    assert.equal(normalizeTranslationRows([], [{ code: 'ru', name: 'Русский' }]), null);
    assert.equal(normalizeTranslationRows(null, []), null);
});

test('translationsToMarkdown строит таблицу и экранирует разделители', () => {
    const markdown = translationsToMarkdown({
        summary: 'Итог',
        rows: [
            {
                lang: 'ru',
                langName: 'Русский',
                official: 'Термин | с палкой',
                alternatives: [],
                explanation: 'Пояснение',
                confidence: 'high',
                verified: true,
            },
        ],
    });

    assert.match(markdown, /Итог/);
    assert.match(markdown, /\| Язык \| Официальный перевод \|/);
    assert.match(markdown, /Термин \\\| с палкой/);
    assert.match(markdown, /проверено по источнику/);
    assert.match(markdown, /\*\*Русский:\*\* Пояснение/);
});

/* ---------- проверка источников ---------- */

test('verifyRows помечает термин, встречающийся в контексте', () => {
    const rows = [
        { lang: 'ru', langName: 'Русский', official: 'Сильверхенд', alternatives: [], verified: false },
        { lang: 'de', langName: 'Deutsch', official: 'Silberhand', alternatives: [], verified: false },
    ];
    const blocks = [{ source: 'cyberpunk.fandom.com', title: 'Johnny', text: 'Джонни Сильверхенд — главный герой.' }];

    const verified = verifyRows(rows, blocks);

    assert.equal(verified, 1);
    assert.equal(rows[0].verified, true);
    assert.match(rows[0].evidence, /cyberpunk\.fandom\.com/);
    assert.equal(rows[1].verified, false);
});

test('verifyRows не путает регистр и пунктуацию', () => {
    const rows = [{ lang: 'ru', langName: 'Русский', official: '«Убежище 101»', alternatives: [] }];
    const blocks = [{ source: 'fallout.fandom.com', title: 'Vault 101', text: 'Убежище 101 находится в Вашингтоне' }];
    assert.equal(verifyRows(rows, blocks), 1);
});

test('normalizeForMatch убирает пунктуацию', () => {
    assert.equal(normalizeForMatch('«Джонни Сильверхенд»!'), 'джонни сильверхенд');
});

/* ---------- rate limit ---------- */

test('rateLimit возвращает 429 после исчерпания лимита', () => {
    const limiter = rateLimit({ max: 2, windowMs: 60000 });
    const req = { ip: '203.0.113.7' };
    let calls = 0;

    const makeRes = () => ({
        headers: {},
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; },
    });

    limiter(req, makeRes(), () => { calls += 1; });
    limiter(req, makeRes(), () => { calls += 1; });

    const res = makeRes();
    limiter(req, res, () => { calls += 1; });

    assert.equal(calls, 2);
    assert.equal(res.code, 429);
    assert.ok(res.headers['Retry-After']);
});

/* ---------- версия промпта ---------- */

test('PROMPT_VERSION задана', () => {
    assert.match(PROMPT_VERSION, /^v\d/);
});
