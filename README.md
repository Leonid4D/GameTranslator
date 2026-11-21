# GameTranslator

Адаптивный перевод игровых терминов: бэкенд собирает контекст из Fandom/Wikipedia
и просит LLM объяснить, как термин переведён в разных локализациях.

Что умеет сейчас:

- **сравнение локализаций** — ответ модели приходит структурированным (`translations[]`):
  официальный перевод, варианты, уверенность и пометка «подтверждено источником»;
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
  "meta": {
    "model": "deepseek-chat",
    "promptVersion": "v2-structured",
    "usedWiki": true,
    "usedWeb": false,
    "webProvider": null,
    "structured": true,
    "verifiedCount": 1,
    "latencyMs": 4200,
    "usage": { "prompt_tokens": 1213, "completion_tokens": 552 }
  }
}
```

`verified` — проверка без участия модели: перевод встречается в тексте собранных
источников. Если провайдер не поддерживает JSON-режим, сервер повторит запрос без
`response_format`, и тогда придут только `answer` + `meta.structured: false`
(клиент это поддерживает).

Пример без тела:

```bash
curl "http://localhost:3000/api/translate?game=Fallout%203&object=Vault%20101&langs=ru,de"
```

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
assets/style.css           — стили интерфейса, светлая/тёмная тема
assets/vendor/             — локальные marked.min.js и purify.min.js (без CDN)
assets/about.css, about.js — страница «О проекте»
index.html                 — разметка главной
about.html                 — страница «О проекте»
tests/                     — node:test: юниты, smoke API, проверки фронтенда
scripts/eval.js            — оценка качества перевода на эталонном наборе
scripts/eval-golden.json   — эталонные термины для eval
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
  официальным переводом, вариантами, уверенностью и пометкой «подтверждено источником»,
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
