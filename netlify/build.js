// Netlify build: собирает статику в netlify-site/ (publish-папка).
// Нужен, чтобы в деплой не попадали server.js, node_modules и прочие исходники.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'netlify-site');

// Статические файлы и каталоги, которые должны попасть в деплой.
// _headers Netlify читает именно из publish-папки.
const copies = ['index.html', 'about.html', 'logo.png', 'manifest.json', 'robots.txt', 'sitemap.xml', '_headers'];

function copyDirectory(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name);
        const target = path.join(to, entry.name);
        if (entry.isDirectory()) copyDirectory(source, target);
        else fs.copyFileSync(source, target);
    }
}

function copyFile(relative) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) {
        console.warn('[build] пропущен отсутствующий файл: ' + relative);
        return false;
    }
    const target = path.join(out, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return true;
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of copies) copyFile(file);

// Стили, скрипты и вендорные библиотеки (marked, DOMPurify).
copyDirectory(path.join(root, 'assets'), path.join(out, 'assets'));

// Проверяем, что фронтенд не ссылается на несуществующие файлы.
const assetPaths = ['assets/style.css', 'assets/app.js', 'assets/about.css', 'assets/about.js', 'assets/vendor/marked.min.js', 'assets/vendor/purify.min.js'];
const missing = assetPaths.filter((file) => !fs.existsSync(path.join(out, file)));
if (missing.length > 0) {
    console.error('[build] ОШИБКА: в сборке нет файлов: ' + missing.join(', '));
    process.exit(1);
}

console.log('[build] готово: netlify-site/ (статика + assets)');
