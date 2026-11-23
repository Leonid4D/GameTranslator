# GameTranslator

Адаптивный перевод игровых терминов: бэкенд собирает контекст из Fandom/Wikipedia
и просит LLM объяснить, как термин переведён в разных локализациях.

Что умеет сейчас:

- **сравнение локализаций** — ответ модели приходит структурированным (`translations[]`):
  официальный перевод, варианты, уверенность и пометка «проверено по источнику»;
- **реальные источники** — ссылки на фандом/вики, по которым собирался контекст;
- **автодополнение термина** из вики игры (MediaWiki opensearch);
- **транслитерация** — «Ведьмак 3» находится на латинском поддомене `vedmak.fandom.com`;
- **экспорт** результата в CSV (нормальная таблица для Excel), JSON и Markdown;
- **светлая/тёмная тема**, доступность (Esc/фокус в модалках), PWA-манифест и SEO-метаданные;
- **строгий CSP и санитайзер** разметки ответа — текст из интернета и ответ LLM не могут
  выполнить скрипт в браузере.

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

## Тесты и демо-режим

```bash
npm test              # юнит-тесты и smoke-тесты API (без сети и без ключей)
npm run check         # синтаксис server.js и фронтенд-скриптов
npm run build         # сборка статики для Netlify (netlify-site/)
npm run eval          # оценка качества перевода (нужен рабочий LLM_API_KEY)
npm run chat:redteam  # red-team мини-чата на живой модели (нужен рабочий LLM_API_KEY)
```

`MOCK_LLM=1 npm start` — детерминированный демо-режим: LLM и внешние сервисы не
вызываются, `/api/translate` отдаёт структурированный ответ-заглушку. Так интерфейс
можно смотреть локально без ключей и расходов на модель.

`npm run eval` прогоняет известные термины из `scripts/eval-golden.json` и печатает
процент попаданий — удобно сравнивать промпты и модели (`--limit`, `--min` в аргументах).
CI (`.github/workflows/ci.yml`) на каждый push/PR проверяет синтаксис, тесты и сборку.

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
| `LLM_MAX_TOKENS` | Лимит длины ответа модели (по умолчанию 1600) |
| `LLM_JSON_MODE` | `auto` (по умолчанию) / `on` / `off` — структурированный JSON-ответ |
| `WEB_SEARCH_TIMEOUT_MS` | Сколько ждать веб-поиск, мс (по умолчанию 10000; на Netlify ставьте 3000–5000) |
| `MOCK_LLM` | `1` — демо-режим без вызовов LLM и внешних сервисов |
| `SUGGEST_ENABLED` | `0` отключает автодополнение терминов (`/api/suggest`) |
| `LLM_DAILY_LIMIT` | Максимум LLM-запросов в сутки на инстанс (0 — без лимита) |
| `CHAT_ENABLED` | `0` — полностью выключить мини-чат (kill-switch) |
| `CHAT_SIGNING_KEY` | Секрет подписи сессии чата, ≥32 символа. **Без него в production чат выключен** (fail-closed). Сгенерировать: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `CHAT_RATE_MAX`, `CHAT_RATE_WINDOW_MS` | Лимит сообщений чата: по умолчанию 12 в минуту на IP |
| `CHAT_DAILY_PER_IP` | Дневной лимит сообщений чата на IP (по умолчанию 150; 0 — без лимита) |
| `CHAT_MAX_TOKENS`, `CHAT_TIMEOUT_MS` | Лимит ответа и таймаут чата (700 токенов / 8 с — под serverless Netlify) |

## API

### `GET /api/health`

```json
{
  "ok": true,
  "promptVersion": "v2-structured",
  "mock": false,
  "services": { "llm": true, "tavily": false, "yookassa": false },
  "webSearch": { "provider": "auto", "fallback": "duckduckgo" },
  "suggest": true,
  "chat": { "enabled": true, "promptVersion": "v1-chat", "signingKey": true },
  "cache": { "entries": 0, "ttlSec": 1800 },
  "dailyLlmLimit": 0,
  "model": "deepseek-chat"
}
```

### `POST /api/translate` (есть и `GET` с теми же параметрами в query)

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

`targetLangs` принимает коды (`ru`, `de`) или названия (`Русский`, `Deutsch`) — код в
ответе всегда нормализован. Ответ:

```json
{
  "answer": "…markdown (таблица + пояснения)…",
  "summary": "1–3 предложения общего вывода",
  "translations": [
    {
      "lang": "ru",
      "langName": "Русский",
      "official": "Серебряный меч",
      "alternatives": ["Серебряный клинок"],
      "literal": null,
      "explanation": "Почему так переведено",
      "confidence": "high",
      "verified": true,
      "evidence": "vedmak.fandom.com — Silver Sword"
    }
  ],
  "sources": [{ "title": "…", "url": "https://…", "source": "vedmak.fandom.com" }],
  "chat": true,
  "chatToken": "eyJ2IjoxLCJnYW1lIjoi….<hmac>",
  "meta": {
    "model": "deepseek-chat",
    "promptVersion": "v2-structured",
    "usedWiki": true,
    "usedWeb": false,
    "webProvider": null,
    "structured": true,
    "verifiedCount": 1,
    "chat": true,
    "latencyMs": 4200,
    "usage": { "prompt_tokens": 1213, "completion_tokens": 552 }
  }
}
```

`chatToken` — HMAC-подпись результата для мини-чата (TTL 30 минут, привязан к хешу
строк перевода). Если чат выключен (`CHAT_ENABLED=0`) или нет ключа подписи, поля
`chat`/`chatToken` = `false`/`null`, и клиент не рисует кнопку чата.

`verified` — проверка без участия модели: перевод встречается в тексте собранных
источников. Если провайдер не поддерживает JSON-режим, сервер повторит запрос без
`response_format`, и тогда придут только `answer` + `meta.structured: false`
(клиент это поддерживает).

Пример без тела:

```bash
curl "http://localhost:3000/api/translate?game=Fallout%203&object=Vault%20101&langs=ru,de"
```

### `POST /api/chat` — мини-чат по результату перевода

Чат привязан к одному результату, не имеет tools, доступа к сети и состояния на
сервере. Модель возвращает только текст и до 3 предложений-действий
(`answer`, `propose_edit`, `refine_query`, `glossary_add`); ничего не применяется
автоматически — только по кнопке пользователя.

```json
{
  "chatToken": "eyJ2IjoxLCJnYW1lIjoi….<hmac>",
  "message": "Почему «Сильверхенд», а не «Серебряная рука»?",
  "history": [{ "role": "user", "content": "Это официальный перевод?" }],
  "rows": [
    { "lang": "ru", "official": "Джонни Сильверхенд", "alternatives": [], "confidence": "high", "verified": true }
  ]
}
```

Ответ:

```json
{
  "reply": "«Сильверхенд» — транслитерация фамилии…",
  "actions": [
    {
      "type": "propose_edit",
      "lang": "ru",
      "official": "Джонни Сильверхенд",
      "alternatives": ["Джонни Среброрук"],
      "explanation": "…",
      "confidence": "high",
      "verified": false,
      "source": "model"
    }
  ],
  "meta": { "model": "deepseek-chat", "promptVersion": "v1-chat", "latencyMs": 2100, "blocked": false, "rejectedActions": 0 }
}
```

Коды ошибок:

| Код | Значение |
|---|---|
| 401 `chat_token_invalid` / `chat_token_expired` | Токена нет, подпись неверна или истекли 30 минут — нужно обновить результат |
| 409 `chat_rows_mismatch` | Строки результата изменились (подмена или применённая правка) — обновите результат |
| 400 `chat_message_too_long` / `chat_history_too_long` / `chat_message_empty` | Сообщение >1000 символов, история >8 сообщений/6000 символов, пустое сообщение |
| 429 `chat_rate_limit` / `chat_daily_limit` / `chat_daily_limit_global` | 12/мин, 150/сутки на IP или общий суточный бюджет LLM |
| 503 `chat_disabled` / `chat_signing_key_missing` | Чат выключен флагом или на сервере нет `CHAT_SIGNING_KEY` |
| 504 `chat_timeout` | Модель не ответила за 8 секунд |

```bash
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" \
  -d '{"chatToken":"…","message":"Почему так?","rows":[{…}]}'
```

Red-team проверка на живой модели: `npm run chat:redteam` (см.
`scripts/chat-injection-eval.js`). Корпус атак и слои защиты подробно описаны в
[docs/mini-chat-proposal.md](docs/mini-chat-proposal.md).

### `GET /api/suggest?q=…&game=…`

Автодополнение терминов из вики игры (MediaWiki opensearch, фолбэк — Wikipedia).
Отдаёт до 6 подсказок: `{ "provider": "fandom", "suggestions": [{ "title", "url", "snippet", "source" }] }`.
Кэшируется на 10 минут, отключается через `SUGGEST_ENABLED=0`.

### `POST /api/proxy-translate`

Загружает чужую страницу и отдаёт её HTML для показа в iframe. Требует `userTier >= 2`.
Локальные и служебные адреса блокируются (SSRF), порты — только 80/443, каждый
редирект проверяется заново. Из HTML удаляются скрипты, inline-обработчики и
`javascript:`-ссылки; iframe на клиенте открывается с `sandbox`.

### `POST /api/create-payment`

```json
{ "plan": "premium" }
```

Тарифы: `premium` (349 ₽), `premium_plus` (699 ₽), `premium_plus_plus` (1290 ₽) —
цены синхронизированы с витриной в `index.html`.
Возвращает `confirmation_url` из ЮKassa. Фронтенд сам пробует создать платёж и
уводит на оплату; если ключей нет (503) — включает демо-режим и честно сообщает об этом.

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
server.js                  — Express-приложение: API, LLM, контекст, безопасность
assets/app.js              — логика интерфейса (тема, поиск, рендер, экспорт)
assets/chat.js             — мини-чат: безопасный рендер, действия, stale-режим
assets/style.css           — стили интерфейса, светлая/тёмная тема
assets/vendor/             — локальные marked.min.js и purify.min.js (без CDN)
assets/about.css, about.js — страница «О проекте»
index.html                 — разметка главной
about.html                 — страница «О проекте»
tests/                     — node:test: юниты, smoke API, проверки фронтенда
scripts/eval.js            — оценка качества перевода на эталонном наборе
scripts/eval-golden.json   — эталонные термины для eval
scripts/chat-injection-eval.js — red-team мини-чата на живой модели
docs/mini-chat-proposal.md — предложение по чату: модель угроз AI Injection и защита
netlify/build.js           — сборка статики в netlify-site/
netlify/functions/api.js   — serverless-обёртка Express-приложения
_headers                   — CSP и security-заголовки для Netlify
manifest.json, robots.txt, sitemap.xml — PWA и SEO
Keys.env                   — секреты (в git не попадает)
.env.example               — шаблон настроек
```

## Безопасность

- **CSP и security-заголовки** (`_headers` публикуются вместе со статикой): скрипты
  только со своего origin, inline-обработчиков `onclick` в разметке больше нет.
- **Санитайзер ответа** — markdown от LLM рендерится через marked и чистится DOMPurify
  (вендорные копии в `assets/vendor/`). В промпт попадает текст из интернета, поэтому
  ответ модели считается недоверенным.
- **SSRF в прокси-переводе**: адрес и каждый редирект проверяются `assertPublicUrl`,
  приватные диапазоны (включая IPv6, NAT64/6to4), нестандартные порты и внутренние
  домены блокируются; из чужого HTML вырезаются скрипты и обработчики.
- **Ограничение расходов**: `max_tokens`, суточный лимит `LLM_DAILY_LIMIT`, rate limit
  на IP, кэш контекста и веб-поиска.
- **Кэш на клиенте** учитывает языки, стиль, Pro-режим и глоссарий — ответ для одного
  набора языков больше не подменяет другой.
- **Мини-чат не имеет привилегий**: у модели нет tools, доступа к сети и серверного
  состояния; контекст результата доверяется только после проверки HMAC-подписи
  `chatToken` и хеша строк (подмена → 409). Вывод модели — недоверенный JSON: белый
  список из 4 действий, обрезка длин, вырезание HTML/Markdown/URL, детект canary-строки.
  Правка применяется только кнопкой пользователя; ответ рендерится как plain text
  (`textContent`), markdown в чате отключён. История и токен живут только в памяти.
  Токен чата вырезается из клиентского кэша (`cacheSafeData`).

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

### Текущий прод

- Сайт: <https://game-translator-leonid.netlify.app>
- Панель: <https://app.netlify.com/projects/game-translator-leonid>
- API — serverless-функция `netlify/functions/api.js`; переменные окружения заданы
  в Netlify: `LLM_API_KEY`, `TAVILY_API_KEY`, `LLM_BASE_URL`, `LLM_TIMEOUT_MS=9000`,
  `WEB_SEARCH_PROVIDER=auto`. Tavily с американского IP Netlify работает — Pro
  отвечает `meta.webProvider: "tavily"`.
- Деплой сделан через Netlify CLI (git-интеграция не понадобилась).

### Как обновить сайт

```bash
# один раз: установить CLI и войти (откроется браузер для Authorize)
npm install -g netlify-cli
netlify login

# после любых изменений в коде/интерфейсе:
deploy.cmd
# или вручную:
npm run build
netlify deploy --prod --dir=netlify-site --functions=netlify/functions --no-build
```

Сборка копирует в `netlify-site/` не только HTML и логотип, но и `assets/`
(стили, скрипты, вендорные библиотеки), `manifest.json`, `robots.txt`,
`sitemap.xml` и `_headers` — из последнего Netlify берёт CSP и security-заголовки.
Если какой-то файл забыт, сборка падает с понятной ошибкой, а не публикует битый сайт.

`git push` сам деплой НЕ запускает (проект не привязан к Git). Привязать
репозиторий можно в панели: Project configuration → Build & deploy →
Link repository, тогда Netlify будет собирать на каждый push.

### Если разворачиваете с нуля

1. Создать сайт: `netlify sites:create --name <имя> --account-slug <team>`
   (или **Add new site → Import an existing project** в панели).
2. Залить секреты: `netlify env:import env-file --site <имя>` (или панель →
   Environment variables).
3. Задеплоить: `netlify deploy --prod --dir=netlify-site --functions=netlify/functions --no-build`.

⚠️ Новые сайты Netlify по умолчанию закрыты SSO для команды: вместо контента
отдаётся `401 Login Redirect`. Сделать публичным: панель → Project configuration →
Access & security → снять «Require SSO», либо через API
`PATCH /api/v1/sites/<site_id>` с телом `{"sso_login": false}`.

Ограничения free-тарифа: функция живёт максимум ~10 секунд на запрос — обычный
перевод идёт 2–6 с, но самый долгий Pro-запрос может упереться в лимит. Поэтому
на Netlify советуем `LLM_TIMEOUT_MS=9000` (аккуратная ошибка 504 вместо 502 от
Netlify) и `WEB_SEARCH_TIMEOUT_MS=3000–5000`, чтобы веб-поиск успевал завершиться
внутри бюджета функции. Лимиты — 100 ГБ трафика и 125 000 вызовов функций в месяц.

Сайт с GitHub Pages тоже можно связать с Netlify (необязательно): в консоли на
`leonid4d.github.io` выполнить
`localStorage.setItem('gtApiBase','https://game-translator-leonid.netlify.app')` и перезагрузить.

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

## Изменения версии 1.1

**Интерфейс**

- CSS и JS вынесены из `index.html` в `assets/`; `marked` и `DOMPurify` лежат
  локально в `assets/vendor/` (раньше интерфейс падал целиком, если CDN недоступен).
- Ответ модели приходит структурированным: таблица сравнения локализаций с
  официальным переводом, вариантами, уверенностью и пометкой «проверено по источнику»,
  кнопка копирования у каждой строки.
- Источники теперь настоящие (ссылки на фандом/вики), а не демо-заглушки.
- Экспорт результата в CSV (таблица для Excel), JSON и Markdown; кнопка «Поделиться».
- Состояние запроса живёт в URL: языки, стиль и Pro-режим восстанавливаются из ссылки.
- Кэш учитывает языки, стиль, Pro-режим и глоссарий; старые записи совместимы.
- Автодополнение термина (Fandom/Wikipedia), транслитерация кириллицы для поиска
  латинских вики-слогов (`Ведьмак 3` → `vedmak.fandom.com`).
- Светлая/тёмная тема с учётом системной настройки; меню, модалки и подсказки
  закрываются по Esc; `aria`-атрибуты и фокус; уведомления вместо `alert`.
- Русский интерфейс по умолчанию; недостающие строки переводов подставляются из английского.
- PWA-манифест, Open Graph/Twitter-мета, JSON-LD, `robots.txt` и `sitemap.xml`.

**Бэкенд**

- JSON-режим модели с автоматическим фолбэком на markdown, `max_tokens`, повтор на
  временных ошибках, `MOCK_LLM` для тестов и демо, суточный лимит LLM.
- `GET /api/translate` (для curl и встраивания), `/api/suggest` (автодополнение).
- Проверка источников без модели: `verified` / `evidence` в каждой строке ответа.
- Заголовки безопасности для API, ограничение размера ответа, `no-store` для `/api/*`.
- Прокси-перевод: ручная обработка редиректов с повторной SSRF-проверкой, вырезание
  скриптов/inline-обработчиков, `sandbox` у iframe.
- Цены тарифов синхронизированы с витриной (349/699/1290 ₽).
- `LICENSE` MIT и `package.json` больше не расходятся.

**Инфраструктура**

- `npm test` — 43 теста (`node:test`): юниты, smoke API в mock-режиме, проверки фронтенда.
- `npm run check`, `npm run build`, `npm run eval`; CI на GitHub Actions.
- `netlify/build.js` копирует `assets/` и статические файлы, валидирует сборку.
- README и `.env.example` обновлены под новые переменные.

## Изменения версии 1.2 (мини-чат)

**Возможности**

- Кнопка **«Обсудить перевод»** в шапке результата и **«Уточнить»** у каждой строки
  таблицы: диалог с моделью ровно об этом переводе. Дровер на десктопе, bottom sheet
  на мобильном; страница при этом остаётся видимой.
- Модель может объяснить перевод, предложить правку (diff «было → станет» с
  пометкой «предложено моделью, не проверено источником»), предложить уточнить
  запрос или добавить термин в глоссарий.
- Правка меняет таблицу **только по кнопке «Применить»**, после этого чат становится
  read-only до обновления результата; «Повторить поиск с уточнением» заполняет форму
  и запускает поиск заново.

| Десктоп | Мобильный |
|---|---|
| ![Мини-чат на десктопе](docs/screenshots/chat-desktop.png) | ![Мини-чат на мобильном](docs/screenshots/chat-mobile.png) |
- Квоты: free 3 / Pro 20 / Premium+ 100 сообщений на результат — продуктовое
  ограничение; реальные лимиты — 12/мин и 150/сутки на IP на сервере.
- Кэш-хит открывает чат в stale-режиме с кнопкой «Обновить результат» (в кэше
  токена нет — он там принципиально не хранится).

**Безопасность (AI Injection)**

- `chatToken`: HMAC-SHA256, TTL 30 минут, привязан к хешу строк результата; без
  `CHAT_SIGNING_KEY` в production чат выключен (fail-closed).
- У чата нет tools, function calling, сети и серверного состояния; контекст — только
  структурированные поля результата и заголовки источников (raw-текст вики не передаётся).
- Системный промпт — серверная константа с canary-строкой; клиентский текст уходит в
  блоки `<untrusted_*>`, попытка «закрыть» тег нейтрализуется.
- Ответ модели: строгий JSON, белый список 4 действий, обрезка длин, вырезание
  HTML/Markdown/URL/картинок, детект canary (утечка → блокировка и security-лог).
- Валидация на сервере: неизвестные действия и поля отбрасываются и логируются;
  повторное использование подделанных/просроченных токенов и чужих строк — 401/409.
- Противодействие злоупотреблениям: сообщения ≤1000 символов, история ≤8 сообщений
  и 6000 символов, ответ ≤700 токенов / 2000 символов, лимиты на IP, общий дневной
  бюджета LLM, `CHAT_ENABLED=0` как kill-switch.

**Инфраструктура**

- `npm test` — 84 теста: +30 тестов чата (контракт, токен, валидация действий,
  canary, XSS, подмена строк, история, лимиты) и +10 статических проверок фронтенда
  (запрет `innerHTML`, markdown, ссылок/картинок из ответа, версии ассетов, CSP).
- `npm run chat:redteam` — red-team по живому API (`scripts/chat-injection-eval.js`):
  override инструкций, prompt leak, canary, HTML/XSS, markdown-эксфильтрация,
  `javascript:`-ссылки, подделка действий, отравление истории, bidi, jailbreak,
  транспортные проверки и уровень false-refusal.
- Документ с моделью угроз и слоями защиты: `docs/mini-chat-proposal.md`.
- Версия 1.2.0; ассеты подключены с `?v=`, `/assets/*` отдаются с `must-revalidate`.

## Лицензия

Исходный код открыт для чтения, но **не является open source**: все права
защищены (source-available). Лицензия на использование, копирование, изменение
и распространение не предоставляется — полные условия в файле [LICENSE](LICENSE).

- Версии до v1.2.0 включительно публиковались под MIT; уже полученные копии
  сохраняют права по MIT, текущая и последующие версии — «все права защищены».
- Библиотеки в `assets/vendor/` (`marked`, `DOMPurify`) остаются под их
  собственными MIT-лицензиями, их уведомления сохраняются.

