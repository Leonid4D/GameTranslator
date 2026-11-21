// Оценка качества перевода на эталонном наборе терминов.
//
// Запуск:
//   npm run eval                 — весь набор
//   npm run eval -- --limit 5    — первые 5 терминов
//   npm run eval -- --min 70     — минимальный процент попаданий (по умолчанию 50)
//
// Нужен настоящий LLM_API_KEY (Keys.env или переменная окружения).
// Скрипт поднимает Express-приложение на свободном порту и дергает /api/translate
// так же, как это делает фронтенд.
'use strict';

const { once } = require('node:events');
const app = require('../server');

const golden = require('./eval-golden.json');
const { normalizeForMatch } = app.helpers;

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        if (!key.startsWith('--')) continue;
        const name = key.slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
        args[name] = value;
    }
    return args;
}

function collectText(data) {
    const parts = [];
    for (const row of data.translations || []) {
        for (const value of [row.official, row.literal, ...(row.alternatives || [])]) {
            if (value) parts.push(value);
        }
    }
    parts.push(data.answer || '');
    return normalizeForMatch(parts.join(' \n '));
}

async function translate(baseUrl, entry) {
    const response = await fetch(baseUrl + '/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game: entry.game,
            object: entry.object,
            targetLangs: [entry.lang],
            isPro: false,
        }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
        throw new Error((data && data.error) || `HTTP ${response.status}`);
    }
    return data;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const minPercent = Number(args.min) || 50;
    const limit = Number(args.limit) || golden.length;
    const entries = golden.slice(0, Math.max(1, limit));

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    console.log(`\n  Оценка качества: ${entries.length} терминов, порог ${minPercent}%\n`);

    let passed = 0;
    const failures = [];

    try {
        for (const entry of entries) {
            let data;
            try {
                data = await translate(baseUrl, entry);
            } catch (error) {
                console.log(`  ✗ ${entry.game} — ${entry.object}: ${error.message}`);
                failures.push({ entry, reason: error.message });
                continue;
            }

            const haystack = collectText(data);
            const hit = entry.expect.find((variant) => haystack.includes(normalizeForMatch(variant)));
            const actual = (data.translations && data.translations[0] && data.translations[0].official) || '—';
            const verified = data.meta && data.meta.verifiedCount > 0 ? ' ✓источник' : '';

            if (hit) {
                passed += 1;
                console.log(`  ✓ ${entry.game} — ${entry.object} → ${actual}${verified}`);
            } else {
                const expected = entry.expect.join(' / ');
                console.log(`  ✗ ${entry.game} — ${entry.object}: ожидалось «${expected}», получено «${actual}»`);
                failures.push({ entry, actual });
            }
        }
    } finally {
        server.close();
    }

    const percent = Math.round((passed / entries.length) * 100);
    console.log(`\n  Итог: ${passed}/${entries.length} (${percent}%), порог ${minPercent}%`);
    if (failures.length > 0) {
        console.log('  Промахи: ' + failures.map(({ entry }) => `${entry.game} / ${entry.object}`).join(', '));
    }
    console.log('');

    process.exit(percent >= minPercent ? 0 : 1);
}

main().catch((error) => {
    console.error('Ошибка eval:', error.message || error);
    process.exit(2);
});
