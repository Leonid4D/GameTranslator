# GameTranslator

Адаптивный перевод игровых терминов: бэкенд собирает контекст из Fandom/Wikipedia
и просит LLM объяснить, как термин переведён в разных локализациях.

## Быстрый старт

```bash
npm install
cp .env.example Keys.env     # Windows: copy .env.example Keys.env
# вписать LLM_API_KEY (и при желании TAVILY_API_KEY, ключи ЮKassa)
npm start
```

Сервер поднимется на `http://localhost:3000`, проверка живости:

```bash
curl http://localhost:3000/api/health
```

Фронтенд — статический `index.html`. Откройте его напрямую или через GitHub Pages:
на `localhost`/`127.0.0.1` он сам обращается к `http://localhost:3000`,
на хостинге — к своему же домену (или к адресу из `localStorage.gtApiBase`).

Чтобы указать адрес бэкенда на опубликованном сайте, откройте консоль браузера:

```js
localStorage.setItem('gtApiBase', 'https://ваш-бэкенд.example.com');
```

## Переменные окружения

Файл `Keys.env` (приоритет) или `.env`. Полный список с комментариями — в `.env.example`.

| Переменная | Назначение |
|---|---|
| `PORT` | Порт сервера, по умолчанию 3000 |
| `LLM_BASE_URL` | OpenAI-совместимый эндпоинт (`https://api.deepseek.com/v1`, `https://api.openai.com/v1`, …) |
| `LLM_API_KEY` | Ключ провайдера. Без него `/api/translate` отвечает 503 |
| `LLM_MODEL` | Имя модели, по умолчанию `deepseek-chat` |
| `TAVILY_API_KEY` | Веб-контекст для Pro-режима. Пусто — Pro работает без поиска |
| `WEB_SEARCH_PROVIDER` | `auto` (Tavily → DuckDuckGo), `tavily`, `duckduckgo` или `off` |
| `TAVILY_PROXY` | Прокси только для Tavily (`http://user:pass@host:port`), если CDN блокирует IP |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | Платёжка. Пока пусто — оплата отключена (503) |
| `FRONTEND_ORIGIN` | Куда вернуть пользователя после оплаты |
| `CORS_ORIGINS` | Белый список источников через запятую; пусто — разрешены все |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | Ограничение запросов на IP |

## API

### `GET /api/health`

```json
{ "ok": true, "services": { "llm": true, "tavily": false, "yookassa": false }, "model": "deepseek-chat" }
```

### `POST /api/translate`

```json
{
  "game": "The Witcher 3",
  "object": "Silver Sword",
  "targetLangs": ["ru", "de"],
  "isPro": false,
  "tone": "lore",
  "glossary": { "Steel Sword": "Стальной меч" }
}
```

Ответ: `{ "answer": "…markdown…", "sources": [...], "meta": {...} }`.

### `POST /api/proxy-translate`

Загружает чужую страницу и отдаёт её HTML для показа в iframe. Требует `userTier >= 2`.
Локальные и служебные адреса блокируются (защита от SSRF), порты — только 80/443.

### `POST /api/create-payment`

```json
{ "plan": "premium" }
```

Тарифы: `premium` (299 ₽), `premium_plus` (599 ₽), `premium_plus_plus` (999 ₽).
Возвращает `confirmation_url` из ЮKassa. Без ключей — 503 с понятным текстом.

## Что важно знать

- **Pro-поиск** идёт по цепочке Tavily → DuckDuckGo. Если ключ Tavily невалиден или
  сервис недоступен, сервер не падает: пишет предупреждение в лог, на 10 минут уходит
  на DuckDuckGo и продолжает работу. Провайдер виден в ответе — `meta.webProvider`.
  DuckDuckGo — бесплатный best-effort: при массовых запросах он показывает капчу,
  тогда Pro-режим работает без веб-контекста (вики-контекст при этом остаётся).
  Для стабильного Pro нужен рабочий ключ Tavily.
- **Если Tavily отвечает 403 даже с новым ключом** — это блокировка на уровне CDN
  по IP/региону, а не проблема ключа (запрос без ключа получает 401, с любым ключом — 403).
  Решения: указать `TAVILY_PROXY` или запустить бэкенд вне РФ (Render, Railway, VPS).
- Если веб-поиск не нужен вообще, поставьте `WEB_SEARCH_PROVIDER=off`.
- **Уровень подписки** (`userTier`) приходит с клиента и хранится в `localStorage` —
  это демо-режим. Для реальных продаж нужна авторизация и проверка подписки на сервере.
- **`/api/proxy-translate`** — превью, а не полноценный перевод страницы: переводятся
  заголовок и ссылки нормализуются, контент остаётся на языке оригинала.
- Платежи не активируют подписку автоматически: нужен вебхук ЮKassa и хранилище пользователей.

## Структура

```
server.js       — Express-приложение (API, LLM, кэш контекста)
index.html      — интерфейс (одностраничный, без сборки)
about.html      — страница «О проекте»
Keys.env        — секреты (в git не попадает)
.env.example    — шаблон настроек
```
