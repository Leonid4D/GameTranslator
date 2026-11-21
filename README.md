# GameTranslator

Адаптивный перевод игровых терминов: бэкенд собирает контекст из Fandom/Wikipedia
и просит LLM объяснить, как термин переведён в разных локализациях.

## Быстрый старт

Windows — двойной клик по `start.cmd` (см. раздел ниже). Вручную:

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

## Запуск на Windows (в один клик)

```
start.cmd
```

Двойной клик по `start.cmd` — скрипт сам:

1. подхватывает корневой сертификат Kaspersky и выставляет `NODE_EXTRA_CA_CERTS`,
   иначе антивирус подменяет TLS и Node падает с
   `self-signed certificate in certificate chain` (ответ 500 на каждый третий-второй запрос);
2. ставит зависимости, если папки `node_modules` нет;
3. запускает сервер и пишет адреса.

После этого откройте `index.html` (двойной клик) — интерфейс сам обратится
к `http://localhost:3000`. Проверка живости: <http://localhost:3000/api/health>.

Если запускаете вручную через `npm start` в своём терминале, сначала выполните:

```powershell
$env:NODE_EXTRA_CA_CERTS = "$env:USERPROFILE\.dsh\kaspersky-root.pem"
npm start
```

(файл сертификата создаёт `start.cmd`; без него возможны случайные 500 от антивируса).

## Диагностика Tavily

```
npm run tavily:check
```

Скрипт сам различает три ситуации: ключ неверный (401), блокировка IP/региона
(без ключа 401, с ключом 403), прокси/сеть недоступны. Код выхода: 0 — всё
работает, 2 — нужен прокси, 3 — ключ не принят, 4 — сеть.

## Прокси для Tavily: зачем и где взять

Tavily (как и многие американские AI-сервисы) режет авторизованные запросы
с российских IP на уровне CDN: без ключа API отвечает `401`, с любым ключом —
`403`. Смена ключа не помогает — проверено с новым и с заведомо мусорным ключом.

Два рабочих решения:

1. **Бэкенд вне РФ** (рекомендуется): на Netlify (он же рекомендован для сайта,
   см. раздел ниже), Render или VPS запросы уходят с зарубежного IP, блокировка
   исчезает сама, и заодно появляется публичный бэкенд для сайта. Прокси не нужен.
2. **HTTP-прокси с зарубежным IP** — если бэкенд должен остаться на домашнем ПК:
   - `TAVILY_PROXY=http://login:password@host:port` в `Keys.env`;
   - прокси применяется **только** к запросам Tavily, остальное идёт напрямую;
   - подойдёт дешёвый HTTP/HTTPS-прокси с IP Нидерландов/Германии/Финляндии
     (например, proxy6.net, proxyline, proxys.io — оплата картой РФ) или
     собственный VPS с установленным 3proxy/squid либо SSH-туннелем;
   - бесплатные публичные прокси не берите: они нестабильны, показывают капчу
     и логируют трафик (вместе с ключом).
   - проверить: `npm run tavily:check` → должно быть `[OK] Tavily работает`.

Отдельный вариант для самодельного релея: `TAVILY_BASE_URL` в `Keys.env`
перенаправляет запросы Tavily на свой эндпоинт (например, Cloudflare Worker,
проксирующий `https://api.tavily.com`).

## Деплой на Netlify (рекомендуется, без VPN)

В репозитории уже всё готово: `netlify.toml` (команда сборки и редирект `/api/*`
на функцию), `netlify/build.js` (складывает статику в `netlify-site/`) и
`netlify/functions/api.js` (обёртка `serverless-http` над Express-приложением из
`server.js`). Фронтенд и API живут на одном домене `*.netlify.app`, поэтому
`gtApiBase` не нужен, а запросы к Tavily идут с американского IP Netlify —
прокси тоже не нужен.

1. Открыть <https://app.netlify.com> и войти через GitHub.
2. **Add new site → Import an existing project → GitHub** → выбрать репозиторий
   `Leonid4D/GameTranslator` (при первом импорте Netlify попросит доступ к GitHub).
3. Настройки сборки подтянутся из `netlify.toml` (build: `node netlify/build.js`,
   publish: `netlify-site`, functions: `netlify/functions`) — менять не нужно.
4. **Site configuration → Environment variables** добавить:
   - `LLM_API_KEY` — ключ LLM (обязательно);
   - `TAVILY_API_KEY` — ключ Tavily (для Pro-поиска);
   - по желанию: `LLM_BASE_URL`, `LLM_MODEL`, `WEB_SEARCH_PROVIDER`,
     `LLM_TIMEOUT_MS=9000`.
   `Keys.env` в git не попадает — на Netlify секреты берутся только из env.
5. **Deploys → Trigger deploy → Clear cache and deploy site** (при импорте деплой
   запускается сам, но без ключей — поэтому после добавления env передеплойте).
6. Проверить `https://<имя>.netlify.app/api/health` — ожидается
   `{"ok":true,"services":{"llm":true,"tavily":true,...}}`, затем открыть сам сайт
   и перевести термин.
7. Дальше каждый `git push` в `main` Netlify собирает автоматически — панель
   нужна только чтобы менять переменные окружения.

Ограничения free-тарифа: функция живёт максимум ~10 секунд на запрос — обычный
перевод идёт 2–6 с, но самый долгий Pro-запрос может упереться в лимит (поэтому
советуем `LLM_TIMEOUT_MS=9000`: тогда вернётся аккуратная ошибка 504, а не 502 от
Netlify). Лимиты — 100 ГБ трафика и 125 000 вызовов функций в месяц.

Сайт с GitHub Pages после деплоя тоже можно связать с Netlify (необязательно):
в консоли на `leonid4d.github.io` выполнить
`localStorage.setItem('gtApiBase','https://<имя>.netlify.app')` и перезагрузить.

## Деплой бэкенда (Render)

⚠️ С российских провайдеров панель `dashboard.render.com` недоступна: TCP/TLS до
IP Render блокируется на уровне сети. Обход DPI (zapret) тут не помогает —
проверено: TLS к этим IP не проходит даже с чужим SNI. При этом хостить на Render
можно: приложения `*.onrender.com` открываются нормально, панель нужна только на
время деплоя (через VPN). Если VPN нет — используйте Netlify (раздел выше).

В репозитории лежит `render.yaml` — Blueprint для [Render](https://render.com):

1. New + → Blueprint → выбрать репозиторий `Leonid4D/GameTranslator`;
2. Render создаст web-service `game-translator-api` (free plan, Node);
3. в Variables вписать `LLM_API_KEY` и `TAVILY_API_KEY` (они помечены `sync: false`);
4. после деплоя проверить `https://<имя>.onrender.com/api/health`;
5. на опубликованном сайте (GitHub Pages) в консоли браузера один раз выполнить:

```js
localStorage.setItem('gtApiBase', 'https://<имя>.onrender.com');
```

и перезагрузить страницу. Бесплатный инстанс Render засыпает через ~15 минут
простоя — первый запрос после паузы идёт 30–60 секунд (можно пинговать
`/api/health` внешним cron-сервисом).
