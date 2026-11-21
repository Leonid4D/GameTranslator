// Netlify build: собирает статику в netlify-site/ (publish-папка).
// Нужен, чтобы в деплой не попадали server.js, node_modules и прочие исходники.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'netlify-site');
const files = ['index.html', 'about.html', 'logo.png'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of files) {
    const from = path.join(root, file);
    if (!fs.existsSync(from)) {
        console.warn('[build] пропущен отсутствующий файл: ' + file);
        continue;
    }
    fs.copyFileSync(from, path.join(out, file));
    console.log('[build] ' + file + ' -> netlify-site/' + file);
}

console.log('[build] готово: ' + files.length + ' файл(ов) в netlify-site/');
