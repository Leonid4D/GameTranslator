// Netlify-функция: весь Express-API проекта.
// server.js экспортирует готовое Express-приложение (app), поэтому здесь только
// обёртка serverless-http. Локально всё по-прежнему запускается через
// "node server.js" или start.cmd — там app.listen вызывается напрямую.

const serverless = require('serverless-http');
const app = require('../../server');

const expressHandler = serverless(app);

// В Netlify функция живёт по адресу /.netlify/functions/api, а rewrite-правило
// из netlify.toml может отдать ей как исходный путь /api/translate, так и
// /.netlify/functions/api/translate. Приводим оба варианта к /api/...
const FUNCTION_PREFIX = '/.netlify/functions/api';

function normalizePath(rawPath) {
    if (typeof rawPath !== 'string' || rawPath === '') return '/api/health';
    if (rawPath === FUNCTION_PREFIX) return '/api/health';
    if (rawPath.startsWith(FUNCTION_PREFIX + '/')) {
        return '/api' + rawPath.slice(FUNCTION_PREFIX.length);
    }
    return rawPath;
}

exports.handler = async function (event, context) {
    event.path = normalizePath(event.path);
    if (event.rawPath) event.rawPath = normalizePath(event.rawPath);
    return expressHandler(event, context);
};
