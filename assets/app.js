/* =========================================================
   АДРЕС БЭКЕНДА
   По умолчанию: локально — http://localhost:3000, на сайте — тот же хост.
   Переопределить без правки кода можно из консоли:
     localStorage.setItem('gtApiBase', 'https://ваш-бэкенд.example.com')
   ========================================================= */
const API_BASE = (() => {
  const override = localStorage.getItem('gtApiBase');
  if (override) return override.replace(/\/+$/, '');
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
  return isLocal ? 'http://localhost:3000' : '';
})();

/* =========================================================
   ТЕМА ОФОРМЛЕНИЯ (светлая / тёмная)
   ========================================================= */
const THEME_KEY = 'gtTheme';

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* приватный режим */ }

  const btn = document.getElementById('themeToggle');
  if (btn) {
    const t = translations[uiLang] || translations.en;
    btn.textContent = next === 'light' ? '🌙' : '☀️';
    // Подпись описывает действие кнопки (куда переключим), а не текущую тему.
    const label = next === 'light' ? t.theme_to_dark : t.theme_to_light;
    btn.title = label || '';
    btn.setAttribute('aria-label', label || 'Theme');
  }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}

/* =========================================================
   УВЕДОМЛЕНИЯ (замена alert)
   ========================================================= */
let toastTimer = null;
function showToast(message, tone = 'info') {
  let toast = document.getElementById('gtToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gtToast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = String(message || '');
  toast.dataset.tone = tone;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

/* =========================================================
   СЛОВАРИ ПЕРЕВОДОВ ИНТЕРФЕЙСА
   ========================================================= */
const translations = {
  ru: {
    nav_about: "О проекте", nav_features: "Возможности", nav_examples: "Примеры", nav_contact: "Контакты",
    hero_title: "Адаптивный перевод в играх — на всех языках",
    hero_subtitle: "Мы сканируем вики, фандомы и официальные локализации, чтобы вы могли узнать, как звучит ваш любимый термин из игры в любой стране мира.",
    step1_label: "Игра или фандом",
    step1_placeholder: "Например: Cyberpunk 2077, The Witcher 3…",
    step2_label: "Герой, предмет или объект",
    step2_placeholder: "Например: Джонни Сильверхенд, Убежище 101…",
    search_btn: "Найти перевод",
    searching_btn: "Поиск…",
    loading: "🧠 Нейросеть анализирует вики и интернет…",
    result_title: "Результат для «{obj}»",
    features_title: "Возможности",
    feat1_title: "Мультиязычные вики",
    feat1_desc: "Собираем термины из википедий, фандомов и официальных сайтов более чем на 20 языках.",
    feat2_title: "Умный поиск",
    feat2_desc: "Ищет совпадения даже с учётом транслитерации и адаптаций: «Сильверхенд» ↔ «Silverhand».",
    feat3_title: "Сравнение локализаций",
    feat3_desc: "Показывает официальный перевод, адаптацию и оригинал в удобной таблице.",
    feat4_title: "Контекст и отсылки",
    feat4_desc: "Поясняем культурные адаптации: каламбуры, имена, идиомы и отсылки, потерянные при переводе.",
    feat5_title: "Сообщество",
    feat5_desc: "Переводчики и игроки сами дополняют базу знаний — с указанием источников и правок.",
    feat6_title: "Быстрый API",
    feat6_desc: "Для разработчиков — открытое API, чтобы подтягивать термины прямо в свои проекты.",
    feat7_title: "Единый язык сообщества",
    feat7_desc: "Помогаем игрокам из разных стран говорить об одних и тех же терминах — без путаницы и споров о переводе.",
    examples_title_a: "Примеры",
    examples_title_b: "адаптаций",
    footer_text: "© 2026 GameTranslator — проект об адаптивном переводе в играх.",
    footer_contact: "Связаться:",
    error_generic: "Ошибка сервера",
    error_connection: "Не удалось связаться с сервером.",
    step3_label: "Подпроект",
    step3_placeholder: "Сервер, плейс или режим — например, Hypixel, Doomspire…",
    optional_badge: "необязательно",
    langs_label: "Перевод на языки",
    langs_hint: "Выберите один или несколько",
    tos_title: "Пользовательское соглашение",
    tos_accept: "Принять",
    tos_decline: "Отклонить",
    tos_banner_text: "Вы отклонили пользовательское соглашение. Полноценные функции проекта могут быть ограничены.",
    tos_banner_btn: "Прочитать снова",
    history_empty: "История пуста",
    copy_btn: "Копировать",
    copied_btn: "Скопировано!",
    cache_from: "Из кэша · {time} назад",
    cache_refresh: "Обновить",
    time_sec: "сек", time_min: "мин", time_hour: "ч", time_day: "д",
    random_btn: "🎲 Случайный термин",
    faq_title: "Частые вопросы",
    faq_q1: "Откуда берутся переводы?",
    faq_a1: "Мы сканируем фандомные вики (Fandom, wiki.gg), официальные сайты и открытый интернет, а найденное передаём нейросети, которая составляет ответ на основе источников.",
    faq_q2: "Почему некоторые термины не находятся?",
    faq_a2: "Если термин не упомянут в открытых источниках ни на одном языке, нейросеть не сможет его найти. Попробуйте указать подпроект (сервер, плейс) или альтернативное название.",
    faq_q3: "Насколько точны переводы?",
    faq_a3: "Это ответы нейросети на основе реальных источников — ориентир, а не гарантия. Для официальной информации сверяйтесь с локализацией самой игры.",
    faq_q4: "Зачем нужно поле «Подпроект»?",
    faq_a4: "В Roblox, Minecraft и других играх с серверами и плейсами одно название может означать разные вещи. Подпроект помогает сузить поиск до нужного контекста.",
    faq_q5: "Можно ли сохранить результат?",
    faq_a5: "Да — кнопка «Копировать» сохранит ответ в буфер обмена, а ссылка из адресной строки браузера откроет тот же запрос.",
    faq_q6: "Почему нет перевода на мой язык?",
    faq_a6: "Мы ищем на всех языках, где есть источник. Если игра не имеет официальной локализации на вашем языке, перевода может не быть — но иногда сообщества всё равно придумывают свои названия.",
    faq_q7: "Кто управляет проектом?",
    faq_a7: "Это независимый проект. Наши принципы — политическая независимость, отсутствие санкций и отсутствие цензуры. Подробности — на странице «О проекте».",
    premium_btn: "⭐ Premium",
    tab_term: "Поиск термина",
    tab_page: "Перевод страницы",
    page_url_label: "Ссылка на страницу",
    page_url_placeholder: "https://ru.wikipedia.org/wiki/...",
    page_translate_btn: "Перевести страницу",
    page_hint: "Доступно только с подпиской Premium",
    sub_title: "⭐ GameTranslator Premium",
    sub_desc: "Поддержите проект и получите доступ к эксклюзивным функциям.",
    sub_feat1: "✅ Перевод целых страниц по ссылке",
    sub_feat2: "✅ Без лишней воды и ограничений",
    sub_feat3: "✅ Приоритетная очередь запросов",
    sub_period: "/ месяц",
    sub_pay_btn: "Оформить подписку",
    sub_close_btn: "Закрыть",
    sub_success: "Подписка оформлена! (Демо-режим)",
    sub_active: "⭐ Premium активен",
    pro_mode_toggle: "Pro-режим (умная модель)",
    pro_only_premium: "Pro-режим доступен только с Premium",
    ad_text: "Реклама: Играйте в лучшие игры со скидками!",
    ad_btn: "Убрать рекламу",
    export_csv: "Excel (CSV)",
    export_txt: "Текст (TXT)",
    sources_title: "Источники:",
    glossary_btn: "📖 Мой глоссарий",
    glossary_title: "📖 Личный глоссарий",
    glossary_desc: "Нейросеть будет использовать ваши переводы в приоритетном порядке.",
    glossary_save: "Добавить в словарь",
    glossary_empty: "Глоссарий пуст",
    premium_modal_title: "⭐ Premium активен",
    premium_modal_desc: "Спасибо за поддержку проекта! Вам доступны все эксклюзивные функции:",
    premium_feat_1: "Перевод целых страниц по ссылке",
    premium_feat_2: "Pro-режим (умная нейросеть)",
    premium_feat_3: "Чистый интерфейс (без рекламы)",
    premium_feat_4: "Личный глоссарий и приоритет",
    premium_feat_5: "Экспорт в Excel и TXT + Источники",
    premium_cancel: "Отменить",
    premium_plus_feat: "Перевод страниц (50/мес)",
    premium_plus_plus_feat: "Безлимитный перевод",
    premium_plus_plus_feat2: "Ранний доступ к новинкам",
    status_active: "активен",
    status_desc: "Спасибо за поддержку! Ваши функции:",
    premium_plus_glossary: "Импорт/Экспорт словаря",
    premium_plus_tone: "ИИ-Тональность (сленг, лор)",
    premium_plus_bulk: "Массовый перевод",
    tone_label: "Стиль перевода (ИИ)",
    tone_default: "По умолчанию",
    tone_lore: "Лорный / Литературный",
    tone_slang: "Сленговый / Геймерский",
    glossary_export: "📥 Экспорт (JSON)",
    glossary_import: "📤 Импорт (JSON)",
    glossary_import_success: "Глоссарий успешно импортирован!",
    glossary_import_error: "Ошибка чтения файла. Убедитесь, что это правильный JSON.",
    glossary_remove: "Удалить из глоссария",
    share_btn: "Поделиться",
    share_copied: "Ссылка скопирована!",
    copy_failed: "Не удалось скопировать",
    export_json: "JSON",
    export_md: "Markdown",
    lang_col: "Язык",
    official_col: "Официальный перевод",
    alternatives_col: "Другие варианты",
    confidence_col: "Уверенность",
    confidence_high: "высокая",
    confidence_medium: "средняя",
    confidence_low: "низкая",
    verified_badge: "подтверждено",
    verified_hint: "Термин встречается в найденных источниках",
    meta_wiki: "вики",
    meta_web: "веб",
    meta_structured: "сравнение",
    copy_row: "Копировать перевод",
    langs_required: "Выберите хотя бы один язык",
    paying_btn: "Оплата…",
    demo_payment_notice: "Платёжный сервис не настроен — включён демо-режим, подписка активирована локально.",
    payment_redirect: "Переходим к оплате…",
    theme_to_light: "Светлая тема",
    theme_to_dark: "Тёмная тема",
    loading_stage1: "🧠 Анализирую термин…",
    loading_stage2: "📚 Проверяю вики и фандомы…",
    loading_stage3: "🌐 Собираю контекст и переводы…",
    page_loading_title: "Загрузка и перевод страницы…",
    page_loading_text: "Пожалуйста, подождите. Это может занять до 30 секунд.",
    page_error_title: "Ошибка",
    premium_only_plus: "Доступно только с Premium+",
    cancel_sub_confirm: "Вы уверены, что хотите отменить подписку?",
    random_term_btn: "🎲 Случайный термин"
  },
  en: {
    nav_about: "About", nav_features: "Features", nav_examples: "Examples", nav_contact: "Contact",
    hero_title: "Adaptive game translation — in every language",
    hero_subtitle: "We scan wikis, fan sites and official localizations so you can find out how your favorite in-game term sounds anywhere in the world.",
    step1_label: "Game or franchise",
    step1_placeholder: "e.g. Cyberpunk 2077, The Witcher 3…",
    step2_label: "Character, item or object",
    step2_placeholder: "e.g. Johnny Silverhand, Vault 101…",
    search_btn: "Find translation",
    searching_btn: "Searching…",
    loading: "🧠 The AI is scanning wikis and the web…",
    result_title: "Result for “{obj}”",
    features_title: "Features",
    feat1_title: "Multilingual wikis",
    feat1_desc: "We collect terms from wikis, fandoms and official sites in 20+ languages.",
    feat2_title: "Smart search",
    feat2_desc: "Finds matches even across transliteration and adaptations: “Сильверхенд” ↔ “Silverhand”.",
    feat3_title: "Localization comparison",
    feat3_desc: "Shows official translation, adaptation and original in a clean table.",
    feat4_title: "Context & references",
    feat4_desc: "Explains cultural adaptations — puns, names, idioms and references lost in translation.",
    feat5_title: "Community",
    feat5_desc: "Translators and players enrich the knowledge base — with sources and edits.",
    feat6_title: "Fast API",
    feat6_desc: "For developers — an open API to pull terms into your own projects.",
    feat7_title: "One community language",
    feat7_desc: "Helps players from different countries talk about the same in-game terms — no confusion, no translation disputes.",
    examples_title_a: "Localization",
    examples_title_b: "examples",
    footer_text: "© 2026 GameTranslator — a project about adaptive game translation.",
    footer_contact: "Contact:",
    error_generic: "Server error",
    error_connection: "Could not reach the server.",
    step3_label: "Subproject",
    step3_placeholder: "Server, place or mode — e.g. Hypixel, Doomspire…",
    optional_badge: "optional",
    langs_label: "Translate to languages",
    langs_hint: "Select one or more",
    tos_title: "Terms of Service",
    tos_accept: "Accept",
    tos_decline: "Decline",
    tos_banner_text: "You have declined the Terms of Service. Full project features may be limited.",
    tos_banner_btn: "Read again",
    history_empty: "History is empty",
    copy_btn: "Copy",
    copied_btn: "Copied!",
    cache_from: "From cache · {time} ago",
    cache_refresh: "Refresh",
    time_sec: "s", time_min: "min", time_hour: "h", time_day: "d",
    random_btn: "🎲 Random term",
    faq_title: "FAQ",
    faq_q1: "Where do translations come from?",
    faq_a1: "We scan fandom wikis (Fandom, wiki.gg), official sites and the open web, then pass the findings to an AI that builds the answer based on sources.",
    faq_q2: "Why can't I find some terms?",
    faq_a2: "If a term isn't mentioned in open sources in any language, the AI can't find it. Try specifying a subproject (server, place) or an alternative name.",
    faq_q3: "How accurate are the translations?",
    faq_a3: "They're AI answers based on real sources — a guide, not a guarantee. Always check the official in-game localization for authoritative info.",
    faq_q4: "What is the 'Subproject' field for?",
    faq_a4: "In Roblox, Minecraft and other games with servers and places, one name can mean different things. The subproject narrows the search to the right context.",
    faq_q5: "Can I save the result?",
    faq_a5: "Yes — the Copy button saves the answer to your clipboard, and the URL in the address bar re-opens the same query.",
    faq_q6: "Why isn't there a translation to my language?",
    faq_a6: "We search all languages with sources. If the game has no official localization in your language, there may be no translation — though communities sometimes invent their own names.",
    faq_q7: "Who runs the project?",
    faq_a7: "It's an independent project. Our principles are political independence, no sanctions and no censorship. Details are on the About page.",
    premium_btn: "⭐ Premium",
    tab_term: "Term Search",
    tab_page: "Translate Page",
    page_url_label: "Page URL",
    page_url_placeholder: "https://en.wikipedia.org/wiki/...",
    page_translate_btn: "Translate Page",
    page_hint: "Available only with Premium subscription",
    sub_title: "⭐ GameTranslator Premium",
    sub_desc: "Support the project and unlock exclusive features.",
    sub_feat1: "✅ Translate entire pages by link",
    sub_feat2: "✅ No limits or wait times",
    sub_feat3: "✅ Priority request queue",
    sub_period: "/ month",
    sub_pay_btn: "Subscribe Now",
    sub_close_btn: "Close",
    sub_success: "Subscription active! (Demo mode)",
    sub_active: "⭐ Premium Active",
    pro_mode_toggle: "Pro mode (smart model)",
    pro_only_premium: "Pro mode is available only with Premium",
    ad_text: "Ad: Play the best games with discounts!",
    ad_btn: "Remove ads",
    export_csv: "Excel (CSV)",
    export_txt: "Text (TXT)",
    sources_title: "Sources:",
    glossary_btn: "📖 My Glossary",
    glossary_title: "📖 Personal Glossary",
    glossary_desc: "The AI will prioritize your translations.",
    glossary_save: "Add to glossary",
    glossary_empty: "Glossary is empty",
    premium_modal_title: "⭐ Premium Active",
    premium_modal_desc: "Thank you for supporting the project! You have access to all exclusive features:",
    premium_feat_1: "Translate entire pages by link",
    premium_feat_2: "Pro mode (smart neural network)",
    premium_feat_3: "Clean interface (no ads)",
    premium_feat_4: "Personal glossary and priority",
    premium_feat_5: "Export to Excel and TXT + Sources",
    premium_cancel: "Cancel",
    premium_plus_feat: "Page translation (50/mo)",
    premium_plus_plus_feat: "Unlimited translation",
    premium_plus_plus_feat2: "Early access",
    status_active: "active",
    status_desc: "Thank you for support! Your features:",
    premium_plus_glossary: "Glossary import/export",
    premium_plus_tone: "AI Tone (slang, lore)",
    premium_plus_bulk: "Bulk translation",
    tone_label: "AI Translation Tone",
    tone_default: "Default",
    tone_lore: "Lore / Literary",
    tone_slang: "Slang / Gamer",
    glossary_export: "📥 Export (JSON)",
    glossary_import: "📤 Import (JSON)",
    glossary_import_success: "Glossary imported successfully!",
    glossary_import_error: "Could not read the file. Make sure it is valid JSON.",
    glossary_remove: "Remove from glossary",
    share_btn: "Share",
    share_copied: "Link copied!",
    copy_failed: "Could not copy",
    export_json: "JSON",
    export_md: "Markdown",
    lang_col: "Language",
    official_col: "Official translation",
    alternatives_col: "Other variants",
    confidence_col: "Confidence",
    confidence_high: "high",
    confidence_medium: "medium",
    confidence_low: "low",
    verified_badge: "verified",
    verified_hint: "The term appears in the sources we found",
    meta_wiki: "wiki",
    meta_web: "web",
    meta_structured: "comparison",
    copy_row: "Copy translation",
    langs_required: "Select at least one language",
    paying_btn: "Processing…",
    demo_payment_notice: "Payment service is not configured — demo mode: the plan is activated locally.",
    payment_redirect: "Redirecting to checkout…",
    theme_to_light: "Light theme",
    theme_to_dark: "Dark theme",
    loading_stage1: "🧠 Analysing the term…",
    loading_stage2: "📚 Checking wikis and fandoms…",
    loading_stage3: "🌐 Collecting context and translations…",
    page_loading_title: "Loading and translating the page…",
    page_loading_text: "Please wait. This can take up to 30 seconds.",
    page_error_title: "Error",
    premium_only_plus: "Available with Premium+ only",
    cancel_sub_confirm: "Are you sure you want to cancel the subscription?",
    random_term_btn: "🎲 Random term"
  },
  es: {
    nav_about: "Acerca de", nav_features: "Funciones", nav_examples: "Ejemplos", nav_contact: "Contacto",
    hero_title: "Traducción adaptativa en videojuegos — en todos los idiomas",
    hero_subtitle: "Escaneamos wikis, fansites y localizaciones oficiales para que descubras cómo suena tu término favorito del juego en cualquier país del mundo.",
    step1_label: "Juego o franquicia",
    step1_placeholder: "Ej.: Cyberpunk 2077, The Witcher 3…",
    step2_label: "Personaje, objeto o término",
    step2_placeholder: "Ej.: Johnny Silverhand, Refugio 101…",
    search_btn: "Buscar traducción",
    searching_btn: "Buscando…",
    loading: "🧠 La IA está escaneando wikis e internet…",
    result_title: "Resultado para «{obj}»",
    features_title: "Funciones",
    feat1_title: "Wikis multilingües",
    feat1_desc: "Recopilamos términos de wikis, fandoms y sitios oficiales en más de 20 idiomas.",
    feat2_title: "Búsqueda inteligente",
    feat2_desc: "Encuentra coincidencias incluso con transliteración y adaptaciones: «Сильверхенд» ↔ «Silverhand».",
    feat3_title: "Comparación de localizaciones",
    feat3_desc: "Muestra la traducción oficial, la adaptación y el original en una tabla clara.",
    feat4_title: "Contexto y referencias",
    feat4_desc: "Explicamos las adaptaciones culturales: juegos de palabras, nombres, modismos y referencias que se pierden al traducir.",
    feat5_title: "Comunidad",
    feat5_desc: "Traductores y jugadores enriquecen la base de conocimiento — con fuentes y correcciones.",
    feat6_title: "API rápida",
    feat6_desc: "Para desarrolladores — una API abierta para integrar términos en tus proyectos.",
    examples_title_a: "Ejemplos de",
    examples_title_b: "adaptación",
    footer_text: "© 2026 GameTranslator — un proyecto sobre traducción adaptativa en videojuegos.",
    footer_contact: "Contacto:",
    error_generic: "Error del servidor",
    error_connection: "No se pudo conectar con el servidor.",
    feat7_title: "Un solo idioma comunitario",
    feat7_desc: "Ayuda a jugadores de diferentes países a hablar de los mismos términos del juego, sin confusión ni disputas de traducción."
  },
  pt: {
    nav_about: "Sobre", nav_features: "Recursos", nav_examples: "Exemplos", nav_contact: "Contato",
    hero_title: "Tradução adaptativa em jogos — em todos os idiomas",
    hero_subtitle: "Escaneamos wikis, fã-sites e localizações oficiais para você descobrir como o seu termo favorito do jogo soa em qualquer país do mundo.",
    step1_label: "Jogo ou franquia",
    step1_placeholder: "Ex.: Cyberpunk 2077, The Witcher 3…",
    step2_label: "Personagem, item ou objeto",
    step2_placeholder: "Ex.: Johnny Silverhand, Refúgio 101…",
    search_btn: "Buscar tradução",
    searching_btn: "Buscando…",
    loading: "🧠 A IA está escaneando wikis e a internet…",
    result_title: "Resultado para “{obj}”",
    features_title: "Recursos",
    feat1_title: "Wikis multilíngues",
    feat1_desc: "Coletamos termos de wikis, fandoms e sites oficiais em mais de 20 idiomas.",
    feat2_title: "Busca inteligente",
    feat2_desc: "Encontra correspondências mesmo com transliteração e adaptações: “Сильверхенд” ↔ “Silverhand”.",
    feat3_title: "Comparação de localizações",
    feat3_desc: "Mostra a tradução oficial, a adaptação e o original em uma tabela clara.",
    feat4_title: "Contexto e referências",
    feat4_desc: "Explicamos adaptações culturais: trocadilhos, nomes, expressões e referências perdidas na tradução.",
    feat5_title: "Comunidade",
    feat5_desc: "Tradutores e jogadores enriquecem a base de conhecimento — com fontes e correções.",
    feat6_title: "API rápida",
    feat6_desc: "Para desenvolvedores — uma API aberta para integrar termos aos seus projetos.",
    examples_title_a: "Exemplos de",
    examples_title_b: "adaptação",
    footer_text: "© 2026 GameTranslator — um projeto sobre tradução adaptativa em jogos.",
    footer_contact: "Contato:",
    error_generic: "Erro do servidor",
    error_connection: "Não foi possível conectar ao servidor.",
    feat7_title: "Uma linguagem comunitária",
    feat7_desc: "Ajuda jogadores de diferentes países a falar sobre os mesmos termos do jogo — sem confusão, sem disputas de tradução."
  },
  zh: {
    nav_about: "关于", nav_features: "功能", nav_examples: "示例", nav_contact: "联系",
    hero_title: "游戏自适应翻译 — 覆盖所有语言",
    hero_subtitle: "我们扫描维基、粉丝网站和官方本地化，让您了解最喜欢的游戏术语在世界上任何国家/地区的说法。",
    step1_label: "游戏或系列",
    step1_placeholder: "例如：Cyberpunk 2077、The Witcher 3…",
    step2_label: "角色、物品或对象",
    step2_placeholder: "例如：强尼·银手、101号避难所…",
    search_btn: "查找翻译",
    searching_btn: "搜索中…",
    loading: "🧠 AI 正在扫描维基和互联网…",
    result_title: "“{obj}” 的结果",
    features_title: "功能",
    feat1_title: "多语言维基",
    feat1_desc: "我们从维基、粉丝社区和官方网站收集 20 多种语言的术语。",
    feat2_title: "智能搜索",
    feat2_desc: "即使经过音译和改编也能找到匹配：“Сильверхенд” ↔ “Silverhand”。",
    feat3_title: "本地化对比",
    feat3_desc: "以清晰的表格展示官方翻译、改编和原文。",
    feat4_title: "语境与引用",
    feat4_desc: "解释文化改编：双关语、名称、习语以及翻译中丢失的引用。",
    feat5_title: "社区",
    feat5_desc: "译者和玩家共同丰富知识库 — 附来源和修订。",
    feat6_title: "快速 API",
    feat6_desc: "为开发者提供开放 API，可将术语直接接入您的项目。",
    examples_title_a: "本地化",
    examples_title_b: "示例",
    footer_text: "© 2026 GameTranslator — 一个关于游戏自适应翻译的项目。",
    footer_contact: "联系：",
    error_generic: "服务器错误",
    error_connection: "无法连接到服务器。",
    feat7_title: "统一的社区语言",
    feat7_desc: "帮助来自不同国家的玩家用相同的游戏术语交流——没有混淆，没有翻译争议。"
  },
  ja: {
    nav_about: "概要", nav_features: "機能", nav_examples: "例", nav_contact: "お問い合わせ",
    hero_title: "ゲームの適応翻訳 — あらゆる言語で",
    hero_subtitle: "ウィキ、ファンサイト、公式ローカライズをスキャンし、お気に入りのゲーム用語が世界中でどう呼ばれているかを調べます。",
    step1_label: "ゲームまたはシリーズ",
    step1_placeholder: "例：Cyberpunk 2077、The Witcher 3…",
    step2_label: "キャラクター、アイテム、オブジェクト",
    step2_placeholder: "例：ジョニー・シルヴァーハンド、ヴォールト101…",
    search_btn: "翻訳を検索",
    searching_btn: "検索中…",
    loading: "🧠 AI がウィキとインターネットをスキャンしています…",
    result_title: "「{obj}」の結果",
    features_title: "機能",
    feat1_title: "多言語ウィキ",
    feat1_desc: "20 以上の言語でウィキ、ファンダム、公式サイトから用語を収集します。",
    feat2_title: "スマート検索",
    feat2_desc: "音訳や適応を考慮しても一致を見つけます：「Сильверхенд」↔「Silverhand」。",
    feat3_title: "ローカライズ比較",
    feat3_desc: "公式翻訳、適応、原文を見やすい表で表示します。",
    feat4_title: "文脈と引用",
    feat4_desc: "文化的適応を解説：駄洒落、名前、慣用句、翻訳で失われる引用。",
    feat5_title: "コミュニティ",
    feat5_desc: "翻訳者とプレイヤーが知識ベースを充実させます — 出典と編集付き。",
    feat6_title: "高速 API",
    feat6_desc: "開発者向け — 用語をあなたのプロジェクトに取り込めるオープン API。",
    examples_title_a: "ローカライズ",
    examples_title_b: "の例",
    footer_text: "© 2026 GameTranslator — ゲームの適応翻訳に関するプロジェクト。",
    footer_contact: "お問い合わせ：",
    error_generic: "サーバーエラー",
    error_connection: "サーバーに接続できませんでした。",
    feat7_title: "コミュニティ共通の言語",
    feat7_desc: "異なる国のプレイヤーが同じゲーム用語で話せるようにします — 混乱も翻訳の争いもありません。"
  },
  de: {
    nav_about: "Über", nav_features: "Funktionen", nav_examples: "Beispiele", nav_contact: "Kontakt",
    hero_title: "Adaptive Spielübersetzung — in jeder Sprache",
    hero_subtitle: "Wir durchsuchen Wikis, Fanseiten und offizielle Lokalisierungen, damit Sie erfahren, wie Ihr Lieblingsbegriff aus dem Spiel in jedem Land der Welt klingt.",
    step1_label: "Spiel oder Franchise",
    step1_placeholder: "z. B. Cyberpunk 2077, The Witcher 3…",
    step2_label: "Charakter, Gegenstand oder Objekt",
    step2_placeholder: "z. B. Johnny Silverhand, Vault 101…",
    search_btn: "Übersetzung finden",
    searching_btn: "Suche läuft…",
    loading: "🧠 Die KI durchsucht Wikis und das Internet…",
    result_title: "Ergebnis für „{obj}“",
    features_title: "Funktionen",
    feat1_title: "Mehrsprachige Wikis",
    feat1_desc: "Wir sammeln Begriffe aus Wikis, Fandoms und offiziellen Seiten in über 20 Sprachen.",
    feat2_title: "Intelligente Suche",
    feat2_desc: "Findet Treffer auch bei Transliteration und Adaptionen: „Сильверхенд“ ↔ „Silverhand“.",
    feat3_title: "Lokalisierungsvergleich",
    feat3_desc: "Zeigt offizielle Übersetzung, Adaption und Original in einer übersichtlichen Tabelle.",
    feat4_title: "Kontext & Referenzen",
    feat4_desc: "Erklärt kulturelle Adaptionen: Wortspiele, Namen, Redewendungen und Anspielungen, die bei der Übersetzung verloren gehen.",
    feat5_title: "Community",
    feat5_desc: "Übersetzer und Spieler erweitern die Wissensbasis — mit Quellen und Korrekturen.",
    feat6_title: "Schnelle API",
    feat6_desc: "Für Entwickler — eine offene API, um Begriffe in eigene Projekte einzubinden.",
    examples_title_a: "Lokalisierungs",
    examples_title_b: "beispiele",
    footer_text: "© 2026 GameTranslator — ein Projekt zur adaptiven Spielübersetzung.",
    footer_contact: "Kontakt:",
    error_generic: "Serverfehler",
    error_connection: "Server konnte nicht erreicht werden.",
    feat7_title: "Eine Community-Sprache",
    feat7_desc: "Hilft Spielern aus verschiedenen Ländern, über dieselben Spielbegriffe zu sprechen — keine Verwirrung, keine Übersetzungsstreitigkeiten."
  },
  fr: {
    nav_about: "À propos", nav_features: "Fonctionnalités", nav_examples: "Exemples", nav_contact: "Contact",
    hero_title: "Traduction adaptative dans les jeux — dans toutes les langues",
    hero_subtitle: "Nous scannons les wikis, fansites et localisations officielles pour que vous découvriez comment votre terme préféré du jeu se dit dans n'importe quel pays du monde.",
    step1_label: "Jeu ou franchise",
    step1_placeholder: "ex. Cyberpunk 2077, The Witcher 3…",
    step2_label: "Personnage, objet ou terme",
    step2_placeholder: "ex. Johnny Silverhand, Abri 101…",
    search_btn: "Chercher la traduction",
    searching_btn: "Recherche…",
    loading: "🧠 L'IA analyse les wikis et Internet…",
    result_title: "Résultat pour « {obj} »",
    features_title: "Fonctionnalités",
    feat1_title: "Wikis multilingues",
    feat1_desc: "Nous collectons des termes depuis les wikis, fandoms et sites officiels dans plus de 20 langues.",
    feat2_title: "Recherche intelligente",
    feat2_desc: "Trouve des correspondances même avec translittération et adaptations : « Сильверхенд » ↔ « Silverhand ».",
    feat3_title: "Comparaison de localisations",
    feat3_desc: "Affiche la traduction officielle, l'adaptation et l'original dans un tableau clair.",
    feat4_title: "Contexte et références",
    feat4_desc: "Explique les adaptations culturelles : jeux de mots, noms, idiomes et références perdus à la traduction.",
    feat5_title: "Communauté",
    feat5_desc: "Traducteurs et joueurs enrichissent la base de connaissances — avec sources et corrections.",
    feat6_title: "API rapide",
    feat6_desc: "Pour les développeurs — une API ouverte pour intégrer les termes à vos projets.",
    examples_title_a: "Exemples de",
    examples_title_b: "localisation",
    footer_text: "© 2026 GameTranslator — un projet sur la traduction adaptative dans les jeux.",
    footer_contact: "Contact :",
    error_generic: "Erreur du serveur",
    error_connection: "Impossible de joindre le serveur.",
    feat7_title: "Un langage communautaire unique",
    feat7_desc: "Aide les joueurs de différents pays à parler des mêmes termes de jeu — sans confusion ni disputes de traduction."
  },
  pl: {
    nav_about: "O projekcie", nav_features: "Funkcje", nav_examples: "Przykłady", nav_contact: "Kontakt",
    hero_title: "Adaptacyjne tłumaczenie gier — we wszystkich językach",
    hero_subtitle: "Skanujemy wiki, strony fanowskie i oficjalne lokalizacje, abyś mógł sprawdzić, jak brzmi twój ulubiony termin z gry w każdym kraju świata.",
    step1_label: "Gra lub seria",
    step1_placeholder: "np. Cyberpunk 2077, The Witcher 3…",
    step2_label: "Postać, przedmiot lub obiekt",
    step2_placeholder: "np. Johnny Silverhand, Kryta 101…",
    search_btn: "Znajdź tłumaczenie",
    searching_btn: "Wyszukiwanie…",
    loading: "🧠 AI analizuje wiki i internet…",
    result_title: "Wynik dla „{obj}”",
    features_title: "Funkcje",
    feat1_title: "Wielojęzyczne wiki",
    feat1_desc: "Zbieramy terminy z wiki, fandomów i oficjalnych stron w ponad 20 językach.",
    feat2_title: "Inteligentne wyszukiwanie",
    feat2_desc: "Znajduje dopasowania nawet przy transliteracji i adaptacjach: „Сильверхенд” ↔ „Silverhand”.",
    feat3_title: "Porównanie lokalizacji",
    feat3_desc: "Pokazuje oficjalne tłumaczenie, adaptację i oryginał w przejrzystej tabeli.",
    feat4_title: "Kontekst i odniesienia",
    feat4_desc: "Wyjaśniamy adaptacje kulturowe: gry słowne, imiona, idiomy i odniesienia utracone w tłumaczeniu.",
    feat5_title: "Społeczność",
    feat5_desc: "Tłumacze i gracze wzbogacają bazę wiedzy — ze źródłami i poprawkami.",
    feat6_title: "Szybkie API",
    feat6_desc: "Dla programistów — otwarte API do pobierania terminów do własnych projektów.",
    examples_title_a: "Przykłady",
    examples_title_b: "lokalizacji",
    footer_text: "© 2026 GameTranslator — projekt o adaptacyjnym tłumaczeniu gier.",
    footer_contact: "Kontakt:",
    error_generic: "Błąd serwera",
    error_connection: "Nie można połączyć się z serwerem.",
    feat7_title: "Jeden język społeczności",
    feat7_desc: "Pomaga graczom z różnych krajów mówić o tych samych terminach z gry — bez zamieszania i sporów o tłumaczenie."
  },
  it: {
    nav_about: "Informazioni", nav_features: "Funzionalità", nav_examples: "Esempi", nav_contact: "Contatti",
    hero_title: "Traduzione adattiva nei giochi — in tutte le lingue",
    hero_subtitle: "Analizziamo wiki, siti dei fan e localizzazioni ufficiali per farti scoprire come suona il tuo termine preferito del gioco in qualsiasi paese del mondo.",
    step1_label: "Gioco o franchise",
    step1_placeholder: "es. Cyberpunk 2077, The Witcher 3…",
    step2_label: "Personaggio, oggetto o termine",
    step2_placeholder: "es. Johnny Silverhand, Rifugio 101…",
    search_btn: "Cerca traduzione",
    searching_btn: "Ricerca in corso…",
    loading: "🧠 L'IA sta analizzando wiki e internet…",
    result_title: "Risultato per «{obj}»",
    features_title: "Funzionalità",
    feat1_title: "Wiki multilingui",
    feat1_desc: "Raccogliamo termini da wiki, fandom e siti ufficiali in oltre 20 lingue.",
    feat2_title: "Ricerca intelligente",
    feat2_desc: "Trova corrispondenze anche con traslitterazione e adattamenti: «Сильверхенд» ↔ «Silverhand».",
    feat3_title: "Confronto delle localizzazioni",
    feat3_desc: "Mostra la traduzione ufficiale, l'adattamento e l'originale in una tabella chiara.",
    feat4_title: "Contesto e riferimenti",
    feat4_desc: "Spieghiamo gli adattamenti culturali: giochi di parole, nomi, modi di dire e riferimenti persi nella traduzione.",
    feat5_title: "Community",
    feat5_desc: "Traduttori e giocatori arricchiscono la base di conoscenza — con fonti e correzioni.",
    feat6_title: "API veloce",
    feat6_desc: "Per gli sviluppatori — un'API aperta per integrare i termini nei tuoi progetti.",
    examples_title_a: "Esempi di",
    examples_title_b: "adattamento",
    footer_text: "© 2026 GameTranslator — un progetto sulla traduzione adattiva nei giochi.",
    footer_contact: "Contatti:",
    error_generic: "Errore del server",
    error_connection: "Impossibile raggiungere il server.",
    feat7_title: "Un linguaggio comunitario unico",
    feat7_desc: "Aiuta i giocatori di diversi paesi a parlare degli stessi termini di gioco — senza confusione o dispute sulla traduzione."
  }
};

/* =========================================================
   ЛОГИКА i18n
   ========================================================= */
let uiLang = 'ru';
let lastResult = null; // { object, data, answerRaw, fromCache, timestamp }

// Строка интерфейса с фолбэком на английский: не все языки переведены полностью.
function tr(key) {
  const dict = translations[uiLang] || translations.en;
  if (dict[key] !== undefined) return dict[key];
  const fallback = translations.en[key];
  return fallback !== undefined ? fallback : key;
}

function detectInitialLang() {
  const saved = localStorage.getItem('uiLang');
  if (saved && translations[saved]) return saved;
  // Проект русскоязычный: без сохранённого выбора показываем русский интерфейс.
  return 'ru';
}

function applyLang(lang) {
  if (!translations[lang]) lang = 'ru';
  uiLang = lang;
  const t = translations[lang];

  document.documentElement.lang = lang;

  const fallback = translations.en;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = (t[key] !== undefined) ? t[key] : fallback[key];
    if (val !== undefined) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = (t[key] !== undefined) ? t[key] : fallback[key];
    if (val !== undefined) el.placeholder = val;
  });

  // Кнопка поиска — сохраняем состояние «в процессе»
  if (searchBtn.disabled) {
    searchBtn.textContent = t.searching_btn;
  } else {
    searchBtn.textContent = t.search_btn;
  }

  // Перерисовываем заголовок последнего результата
  if (lastResult && lastResult.data) renderResult(lastResult.data, {
    fromCache: lastResult.fromCache,
    timestamp: lastResult.timestamp
  });

  // Обновляем подписи темы после смены языка
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) applyTheme(document.documentElement.dataset.theme || 'dark');

  // Синхронизируем селект и сохраняем выбор
  uiLangSelect.value = lang;
  localStorage.setItem('uiLang', lang);
    if (typeof applyTosLang === 'function') applyTosLang();
}

/* =========================================================
   ЭЛЕМЕНТЫ И СОСТОЯНИЕ
   ========================================================= */
const gameInput   = document.getElementById('gameInput');
const objectInput = document.getElementById('objectInput');
const step1       = document.getElementById('step1');
const step2       = document.getElementById('step2');
const connector   = document.getElementById('connector');
const connector2  = document.getElementById('connector2');
const step3       = document.getElementById('step3');
const subprojectInput = document.getElementById('subprojectInput');
const searchBtn   = document.getElementById('searchBtn');
const uiLangSelect = document.getElementById('uiLangSelect');

const resultContainer  = document.getElementById('resultContainer');
const loadingIndicator = document.getElementById('loadingIndicator');
const answerBox        = document.getElementById('answerBox');

/* =========================================================
   ПОДСВЕТКА ШАГОВ
   ========================================================= */
function updateStepState(input, step) {
  step.classList.toggle('filled', input.value.trim().length > 0);
  connector.classList.toggle('active', gameInput.value.trim().length > 0);
  connector2.classList.toggle('active', objectInput.value.trim().length > 0);
}
gameInput.addEventListener('input',   () => updateStepState(gameInput, step1));
objectInput.addEventListener('input', () => updateStepState(objectInput, step2));
subprojectInput.addEventListener('input', () => updateStepState(subprojectInput, step3));

gameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !objectInput.value.trim()) {
    e.preventDefault();
    objectInput.focus();
  }
});

/* =========================================================
   ВЫБОР ЯЗЫКОВ ПОИСКА (чипы)
   Код языка хранится в data-code, отображаемое название — в тексте.
   Последний активный чип снять нельзя: поиску нужен хотя бы один язык.
   ========================================================= */
function initLangChips() {
  const chips = Array.from(document.querySelectorAll('.lang-chip'));
  const sync = (chip) => chip.setAttribute('aria-pressed', chip.classList.contains('active') ? 'true' : 'false');

  chips.forEach((chip) => {
    if (!chip.dataset.code) chip.dataset.code = chip.textContent.replace(/^\S+\s/, '').trim();
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    sync(chip);

    chip.addEventListener('click', () => {
      const isActive = chip.classList.contains('active');
      if (isActive && chips.filter((c) => c.classList.contains('active')).length === 1) return;
      chip.classList.toggle('active');
      sync(chip);
    });

    chip.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chip.click();
      }
    });
  });
}

function selectedLangs() {
  return Array.from(document.querySelectorAll('.lang-chip.active'))
    .map((chip) => chip.dataset.code)
    .filter(Boolean);
}

/* =========================================================
   ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА ИНТЕРФЕЙСА
   ========================================================= */
uiLangSelect.addEventListener('change', (e) => applyLang(e.target.value));

/* =========================================================
   РЕНДЕР РЕЗУЛЬТАТА
   Ответ модели — недоверенный текст (в промпт попадает контент из интернета),
   поэтому перед вставкой в DOM всё санируется через DOMPurify.
   ========================================================= */
function sanitizeHtml(html) {
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }

  // Запасной санитайзер, если вендорный файл не загрузился.
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const isEventHandler = name.startsWith('on');
      const isDangerousUrl =
        ['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name) && /^\s*(javascript|vbscript|data:text\/html):/i.test(attr.value);
      if (isEventHandler || isDangerousUrl) el.removeAttribute(attr.name);
    });
  });
  return template.innerHTML;
}

function renderMarkdown(markdown) {
  const text = String(markdown || '');
  if (window.marked && typeof window.marked.parse === 'function') {
    return window.marked.parse(text);
  }
  return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
}

// Таблицы из markdown оборачиваем в скроллируемый контейнер, чтобы широкие
// таблицы не вылезали за карточку и не «уползал» весь сайт.
function renderAnswerHTML(markdown) {
  const container = document.createElement('div');
  container.innerHTML = sanitizeHtml(renderMarkdown(markdown));

  container.querySelectorAll('table').forEach((table) => {
    // Ширины колонок задаём через <colgroup>, иначе браузер сплющивает
    // «ЯЗЫК» и «Русский» в узкие столбики и ломает слова по буквам.
    const headerCells = table.querySelectorAll('thead th');
    const firstRow = table.querySelector('tr');
    const colCount = headerCells.length || (firstRow ? firstRow.children.length : 0);
    const widths = colCount === 2 ? [34, 66] : colCount === 3 ? [18, 27, 55] : colCount === 4 ? [16, 26, 36, 22] : null;
    if (widths) {
      table.style.tableLayout = 'fixed';
      const colgroup = document.createElement('colgroup');
      widths.forEach((w) => {
        const col = document.createElement('col');
        col.style.width = w + '%';
        colgroup.appendChild(col);
      });
      table.prepend(colgroup);
    }

    const wrap = document.createElement('div');
    wrap.className = 'answer-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  return container.innerHTML;
}

function renderMetaBadges(meta) {
  if (!meta) return '';
  const chips = [];
  if (meta.usedWiki) chips.push(`<span class="meta-chip">📚 ${escapeHtml(tr('meta_wiki'))}</span>`);
  if (meta.usedWeb) {
    const provider = meta.webProvider ? ` · ${escapeHtml(String(meta.webProvider))}` : '';
    chips.push(`<span class="meta-chip">🌐 ${escapeHtml(tr('meta_web'))}${provider}</span>`);
  }
  if (meta.structured) chips.push(`<span class="meta-chip">📊 ${escapeHtml(tr('meta_structured'))}</span>`);
  if (typeof meta.latencyMs === 'number' && meta.latencyMs > 0) {
    chips.push(`<span class="meta-chip">⏱ ${(meta.latencyMs / 1000).toFixed(1)} ${tr('time_sec')}</span>`);
  }
  return chips.length ? `<div class="meta-badges">${chips.join('')}</div>` : '';
}

function renderComparisonTable(rows) {
  const head =
    `<tr><th>${escapeHtml(tr('lang_col'))}</th>` +
    `<th>${escapeHtml(tr('official_col'))}</th>` +
    `<th>${escapeHtml(tr('alternatives_col'))}</th>` +
    `<th>${escapeHtml(tr('confidence_col'))}</th><th></th></tr>`;

  const body = rows
    .map((row) => {
      const official = row.official
        ? `<span class="translation-value">${escapeHtml(row.official)}</span>`
        : '<span class="muted">—</span>';
      const alternatives = Array.isArray(row.alternatives) && row.alternatives.length
        ? row.alternatives.map((alt) => `<span class="alt">${escapeHtml(alt)}</span>`).join('')
        : '<span class="muted">—</span>';
      const confidence = `<span class="badge badge-${escapeHtml(row.confidence || 'medium')}">${escapeHtml(
        tr('confidence_' + (row.confidence || 'medium'))
      )}</span>`;
      const verified = row.verified
        ? `<span class="badge badge-verified" title="${escapeHtml(row.evidence || tr('verified_hint'))}">✓ ${escapeHtml(
            tr('verified_badge')
          )}</span>`
        : '';

      // data-label нужен мобильной вёрстке: на узком экране таблица
      // превращается в карточки, где подпись колонки рисуется через ::before.
      return (
        `<tr>` +
        `<td data-label="${escapeHtml(tr('lang_col'))}"><span class="lang-name">${escapeHtml(
          row.langName || row.lang
        )}</span> <code>${escapeHtml(row.lang)}</code></td>` +
        `<td data-label="${escapeHtml(tr('official_col'))}">${official}</td>` +
        `<td data-label="${escapeHtml(tr('alternatives_col'))}" class="alts">${alternatives}</td>` +
        `<td data-label="${escapeHtml(tr('confidence_col'))}" class="badges-cell">${confidence}${verified}</td>` +
        `<td class="copy-cell"><button type="button" class="btn-row-copy" data-copy-row="${escapeHtml(
          row.lang
        )}" title="${escapeHtml(tr('copy_row'))}" aria-label="${escapeHtml(tr('copy_row'))}">⧉</button></td>` +
        `</tr>`
      );
    })
    .join('');

  const notes = rows
    .filter((row) => row.explanation)
    .map(
      (row) =>
        `<li><b>${escapeHtml(row.langName || row.lang)}:</b> ${escapeHtml(row.explanation)}</li>`
    )
    .join('');

  return (
    `<div class="answer-table-wrap"><table class="comparison-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
    (notes ? `<ul class="translation-notes">${notes}</ul>` : '')
  );
}

function renderSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';

  const items = sources
    .map((source) => {
      const title = escapeHtml(source.title || source.url || '');
      const url = typeof source.url === 'string' && /^https?:\/\//i.test(source.url) ? source.url : '';
      const label = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
        : title;
      const tag = source.source ? `<span class="source-tag">${escapeHtml(String(source.source))}</span>` : '';
      return `<li>${label} ${tag}</li>`;
    })
    .join('');

  return `<div class="sources-box"><h4>${escapeHtml(tr('sources_title'))}</h4><ul>${items}</ul></div>`;
}

function renderTools() {
  const buttons = [
    `<button class="btn-copy" data-copy>${escapeHtml(tr('copy_btn'))}</button>`,
    `<button class="btn-copy" data-share>${escapeHtml(tr('share_btn'))}</button>`,
  ];

  // Экспорт — платная функция, как и было; копирование и ссылка доступны всем.
  if (hasAccess(1)) {
    buttons.push(`<button class="btn-copy" data-export="csv">${escapeHtml(tr('export_csv'))}</button>`);
    buttons.push(`<button class="btn-copy" data-export="json">${escapeHtml(tr('export_json'))}</button>`);
    buttons.push(`<button class="btn-copy" data-export="md">${escapeHtml(tr('export_md'))}</button>`);
  }

  return `<div class="answer-tools">${buttons.join('')}</div>`;
}

function renderResult(data, opts = {}) {
  if (!data) return;

  const object = data.object || '';
  const rows = Array.isArray(data.translations) && data.translations.length > 0 ? data.translations : null;

  let cacheHtml = '';
  if (opts.fromCache && opts.timestamp) {
    cacheHtml = `<div class="cache-badge">
      <span>${escapeHtml(tr('cache_from').replace('{time}', timeAgo(opts.timestamp, uiLang)))}</span>
      <button data-refresh>${escapeHtml(tr('cache_refresh'))}</button>
    </div>`;
  }

  const summaryHtml = data.summary ? `<p class="answer-summary">${escapeHtml(data.summary)}</p>` : '';
  const bodyHtml = rows ? renderComparisonTable(rows) : renderAnswerHTML(data.answer || '');
  const headerHtml =
    `<div class="answer-header"><h3>${escapeHtml(tr('result_title').replace('{obj}', object))}</h3>` +
    `${renderTools()}</div>`;

  answerBox.innerHTML =
    cacheHtml +
    headerHtml +
    renderMetaBadges(data.meta) +
    summaryHtml +
    bodyHtml +
    renderSources(data.sources);

  answerBox.style.display = 'block';
}

// Ошибку показываем текстом (никакого innerHTML): сообщение приходит с сервера.
function renderError(message) {
  answerBox.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.className = 'result-error';
  paragraph.textContent = `😕 ${message}`;
  answerBox.appendChild(paragraph);
  answerBox.style.display = 'block';
}

/* =========================================================
   ОСНОВНАЯ ФУНКЦИЯ ПОИСКА
   ========================================================= */
const LOADING_STAGES = ['loading_stage1', 'loading_stage2', 'loading_stage3'];
let loadingTimer = null;

function startLoadingStages() {
  const label = loadingIndicator.querySelector('p');
  if (!label) return;
  let index = 0;
  label.textContent = tr(LOADING_STAGES[index]);
  stopLoadingStages();
  loadingTimer = setInterval(() => {
    index = (index + 1) % LOADING_STAGES.length;
    label.textContent = tr(LOADING_STAGES[index]);
  }, 1800);
}

function stopLoadingStages() {
  if (loadingTimer) clearInterval(loadingTimer);
  loadingTimer = null;
}

async function searchTerm(forceRefresh = false) {
  const game = gameInput.value.trim();
  const obj  = objectInput.value.trim();

  if (!game) { gameInput.focus(); return; }
  if (!obj)  { objectInput.focus(); return; }

  const langs = selectedLangs();
  if (langs.length === 0) {
    showToast(tr('langs_required'), 'warn');
    return;
  }

  const subproject = subprojectInput.value.trim();
  const tone = hasAccess(3) ? document.getElementById('toneSelect').value : 'default';
  const isPro = hasAccess(1) && proToggle.checked;
  const glossary = hasAccess(1) ? loadGlossary() : null;

  // История + URL
  saveToHistory(game);
  updateURL({ game, obj, subproject, langs, tone, isPro });
  hideHistory();
  hideSuggest();

  const ck = cacheKey({ game, obj, subproject, langs, tone, isPro, glossary });

  // Кэш
  if (!forceRefresh) {
    const cached = loadCache(ck);
    if (cached) {
      resultContainer.style.display = 'block';
      loadingIndicator.style.display = 'none';
      stopLoadingStages();
      lastResult = {
        object: obj,
        data: Object.assign({}, cached.data, { object: obj }),
        answerRaw: cached.data.answer || '',
        fromCache: true,
        timestamp: cached.ts
      };
      renderResult(lastResult.data, {
        fromCache: true,
        timestamp: cached.ts
      });
      return;
    }
  }

  resultContainer.style.display = 'block';
  loadingIndicator.style.display = 'block';
  answerBox.style.display = 'none';
  answerBox.innerHTML = '';
  searchBtn.disabled = true;
  searchBtn.textContent = tr('searching_btn');
  startLoadingStages();

  try {
    const response = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game,
        object: obj,
        subproject,
        targetLangs: langs,
        // --- ДАННЫЕ ДЛЯ БЭКЕНДА ---
        isPro,
        tone,
        glossary, // личный словарь (с 1 уровня)
        userTier: userTierLevel // 0, 1, 2 или 3 (демо-подписка)
      }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      // На опубликованном сайте без бэкенда /api/* отдаёт HTML-404.
      if (!API_BASE && (response.status === 404 || response.status === 405) && !data) {
        throw new Error('Бэкенд не подключён. Поднимите сервер (Render/VPS) и выполните в консоли браузера: ' +
          'localStorage.setItem("gtApiBase", "https://адрес-бэкенда")');
      }
      throw new Error(data && data.error ? data.error : `Сервер ответил ${response.status}.`);
    }
    if (!data || (!data.answer && !Array.isArray(data.translations))) {
      throw new Error(tr('error_generic'));
    }

    data.object = obj;
    saveCache(ck, data);

    lastResult = {
      object: obj,
      data,
      answerRaw: data.answer || '',
      fromCache: false,
      timestamp: Date.now()
    };
    renderResult(data);

  } catch (error) {
    lastResult = null;
    const isNetworkError = error instanceof TypeError;
    const message = isNetworkError
      ? `Не удалось связаться с бэкендом (${API_BASE || 'тот же адрес'}). Проверьте, что сервер запущен: npm start`
      : error.message || tr('error_connection');
    renderError(message);
  } finally {
    stopLoadingStages();
    loadingIndicator.style.display = 'none';
    searchBtn.disabled = false;
    searchBtn.textContent = tr('search_btn');
  }
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
/* =========================================================
   ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ
   ========================================================= */
const tosModal    = document.getElementById('tosModal');
const tosBanner   = document.getElementById('tosBanner');
const tosAccept   = document.getElementById('tosAccept');
const tosDecline  = document.getElementById('tosDecline');
const tosOpenLink = document.getElementById('tosOpenLink');
const tosBannerBtn = document.getElementById('tosBannerBtn');
const TOS_KEY = 'tosStatus';

function showTos() { tosModal.classList.add('visible'); }
function hideTos() { tosModal.classList.remove('visible'); }

function initTos() {
  const status = localStorage.getItem(TOS_KEY);
  if (status === 'accepted') { /* тихо */ }
  else if (status === 'declined') { tosBanner.classList.add('visible'); }
  else { showTos(); }
}

tosAccept.addEventListener('click', () => {
  localStorage.setItem(TOS_KEY, 'accepted');
  hideTos();
  tosBanner.classList.remove('visible');
});
tosDecline.addEventListener('click', () => {
  localStorage.setItem(TOS_KEY, 'declined');
  hideTos();
  tosBanner.classList.add('visible');
});
tosOpenLink.addEventListener('click', showTos);
tosBannerBtn.addEventListener('click', showTos);

// Переключение языковой версии внутри TOS при смене языка
function applyTosLang() {
  document.querySelectorAll('[data-tos-lang]').forEach(el => {
    const target = el.dataset.tosLang;
    el.style.display = (target === 'ru' && uiLang === 'ru') ||
                       (target === 'en' && uiLang !== 'ru') ? 'block' : 'none';
  });
}
/* =========================================================
   ИСТОРИЯ ПОИСКА
   ========================================================= */
const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 10;
const historyDropdown = document.getElementById('historyDropdown');

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function saveToHistory(game) {
  const h = loadHistory().filter(x => x !== game);
  h.unshift(game);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}
function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function hideHistory() {
  historyDropdown.classList.remove('visible');
}
function hideSuggest() {
  const dropdown = document.getElementById('suggestDropdown');
  if (dropdown) dropdown.classList.remove('visible');
}
function showHistory() {
  const h = loadHistory();
  if (!h.length) {
    historyDropdown.innerHTML = `<div class="history-empty">${escapeHtml(translations[uiLang].history_empty)}</div>`;
  } else {
    historyDropdown.innerHTML = h.map(g =>
      `<div class="history-item" data-game="${escapeHtml(g)}">${escapeHtml(g)}</div>`
    ).join('');
  }
  historyDropdown.classList.add('visible');
}
gameInput.addEventListener('focus', showHistory);
gameInput.addEventListener('input', () => {
  if (gameInput.value.trim()) hideHistory();
  else showHistory();
});
historyDropdown.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;
  gameInput.value = item.dataset.game;
  hideHistory();
  updateStepState(gameInput, step1);
  objectInput.focus();
});

/* =========================================================
   АВТОДОПОЛНЕНИЕ ТЕРМИНА
   Подсказки берём из вики игры (MediaWiki opensearch) через /api/suggest,
   чтобы не заставлять пользователя угадывать официальное написание.
   ========================================================= */
const suggestDropdown = document.getElementById('suggestDropdown');
let suggestTimer = null;
let suggestController = null;

function renderSuggestions(items) {
  if (!suggestDropdown) return;
  if (!Array.isArray(items) || items.length === 0) {
    hideSuggest();
    return;
  }

  suggestDropdown.innerHTML = items
    .slice(0, 6)
    .map((item) => {
      const title = escapeHtml(item.title || '');
      const snippet = item.snippet ? escapeHtml(String(item.snippet).slice(0, 90)) : '';
      return `<div class="history-item suggest-item" data-title="${title}"><span>${title}</span>${
        snippet ? `<small>${snippet}</small>` : ''
      }</div>`;
    })
    .join('');
  suggestDropdown.classList.add('visible');
}

async function fetchSuggestions(query) {
  const game = gameInput.value.trim();
  if (!game || query.length < 2) {
    hideSuggest();
    return;
  }

  try {
    if (suggestController) suggestController.abort();
    suggestController = new AbortController();

    const url = `${API_BASE}/api/suggest?q=${encodeURIComponent(query)}&game=${encodeURIComponent(game)}`;
    const response = await fetch(url, { signal: suggestController.signal });
    if (!response.ok) {
      hideSuggest();
      return;
    }
    const data = await response.json();
    renderSuggestions(data && data.suggestions);
  } catch {
    // Запрос отменён или сеть недоступна — молча прячем подсказки.
    hideSuggest();
  }
}

objectInput.addEventListener('input', () => {
  const query = objectInput.value.trim();
  clearTimeout(suggestTimer);
  if (query.length < 2) {
    hideSuggest();
    return;
  }
  suggestTimer = setTimeout(() => fetchSuggestions(query), 400);
});

// Подсказки идут в потоке разметки и не перекрывают чипы языков/кнопку поиска.
// Небольшая задержка нужна, чтобы клик по соседнему элементу успел завершиться.
objectInput.addEventListener('blur', () => {
  setTimeout(hideSuggest, 120);
});

if (suggestDropdown) {
  suggestDropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    e.preventDefault(); // не отдаём фокус и не успеваем спрятать список
    objectInput.value = item.dataset.title || '';
    hideSuggest();
    updateStepState(objectInput, step2);
    objectInput.focus();
  });
}
objectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideSuggest();
});

/* =========================================================
   КЭШ РЕЗУЛЬТАТОВ
   Ключ учитывает языки, стиль, Pro-режим и глоссарий: иначе ответ для одного
   набора языков подставлялся бы и для другого.
   ========================================================= */
const CACHE_KEY = 'searchCache';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 40;

function cacheKey({ game, obj, subproject, langs, tone, isPro, glossary }) {
  const glossaryKey = glossary && typeof glossary === 'object'
    ? Object.keys(glossary).sort().map((key) => `${key}=${glossary[key]}`).join(';')
    : '';
  const parts = [game, obj, subproject || '', (langs || []).join(','), tone || 'default', isPro ? 'pro' : 'std', glossaryKey];
  return parts.join('|').toLowerCase();
}

function loadCache(key) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const entry = all[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    // Совместимость со старым форматом { answer, ts }.
    const data = entry.data || (entry.answer ? { answer: entry.answer } : null);
    if (!data) return null;
    return { data, ts: entry.ts };
  } catch { return null; }
}

function saveCache(key, data) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { data, ts: Date.now() };

    // Держим кэш компактным: localStorage не резиновый.
    const entries = Object.entries(all).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    const trimmed = Object.fromEntries(entries.slice(0, CACHE_MAX_ENTRIES));
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Переполнили localStorage — чистим кэш и пробуем ещё раз.
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ [key]: { data, ts: Date.now() } }));
    } catch { /* ignore */ }
  }
}

function timeAgo(ts, lang) {
  const t = translations[lang] || translations.en;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff} ${t.time_sec}`;
  if (diff < 3600) return `${Math.floor(diff/60)} ${t.time_min}`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ${t.time_hour}`;
  return `${Math.floor(diff/86400)} ${t.time_day}`;
}

/* =========================================================
   URL СИНХРОНИЗАЦИЯ
   В ссылке живёт всё состояние запроса — ею можно поделиться.
   ========================================================= */
function updateURL({ game, obj, subproject, langs, tone, isPro }) {
  const params = new URLSearchParams();
  params.set('game', game);
  params.set('object', obj);
  if (subproject) params.set('sub', subproject);
  if (Array.isArray(langs) && langs.length > 0) params.set('langs', langs.join(','));
  if (tone && tone !== 'default') params.set('tone', tone);
  if (isPro) params.set('pro', '1');
  history.replaceState(null, '', '?' + params.toString());
}

function readURL() {
  const p = new URLSearchParams(window.location.search);
  return {
    game: p.get('game') || '',
    object: p.get('object') || '',
    sub: p.get('sub') || '',
    langs: (p.get('langs') || '').split(',').map((s) => s.trim()).filter(Boolean),
    tone: p.get('tone') || '',
    pro: p.get('pro') === '1'
  };
}

/* =========================================================
   КОПИРОВАНИЕ, ШАРИНГ, ЭКСПОРТ (делегирование)
   ========================================================= */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(String(text));
  }
  // Фолбэк для file:// и старых браузеров.
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea');
    area.value = String(text);
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(area);
    ok ? resolve() : reject(new Error('copy failed'));
  });
}

function flashButton(btn, text, timeout = 1500) {
  const original = btn.dataset.originalText || btn.textContent;
  btn.dataset.originalText = original;
  btn.textContent = text;
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, timeout);
}

function findTranslationRow(lang) {
  if (!lastResult || !lastResult.data || !Array.isArray(lastResult.data.translations)) return null;
  return lastResult.data.translations.find((row) => row.lang === lang) || null;
}

answerBox.addEventListener('click', async (e) => {
  if (e.target.closest('[data-refresh]')) {
    searchTerm(true);
    return;
  }

  const rowCopyBtn = e.target.closest('[data-copy-row]');
  if (rowCopyBtn) {
    const row = findTranslationRow(rowCopyBtn.dataset.copyRow);
    if (!row) return;
    const value = row.official || (row.alternatives && row.alternatives[0]) || '';
    try {
      await copyText(value);
      flashButton(rowCopyBtn, '✓');
      showToast(tr('copied_btn'));
    } catch {
      showToast(tr('copy_failed'), 'error');
    }
    return;
  }

  const shareBtn = e.target.closest('[data-share]');
  if (shareBtn) {
    try {
      await copyText(window.location.href);
      flashButton(shareBtn, tr('share_copied'));
    } catch {
      showToast(tr('copy_failed'), 'error');
    }
    return;
  }

  const exportBtn = e.target.closest('[data-export]');
  if (exportBtn) {
    exportResult(exportBtn.dataset.export, exportBtn);
    return;
  }

  const copyBtn = e.target.closest('[data-copy]');
  if (!copyBtn || !lastResult) return;
  try {
    await copyText(lastResult.answerRaw || '');
    flashButton(copyBtn, tr('copied_btn'));
  } catch {
    flashButton(copyBtn, '⚠️');
  }
});

/* =========================================================
   СЛУЧАЙНЫЙ ТЕРМИН
   ========================================================= */
const RANDOM_TERMS = [
  { game: 'Cyberpunk 2077', object: 'Johnny Silverhand' },
  { game: 'The Witcher 3', object: 'Geralt of Rivia' },
  { game: 'Fallout 3', object: 'Vault 101' },
  { game: 'Skyrim', object: 'Dragonrend' },
  { game: 'BioShock', object: 'Big Daddy' },
  { game: 'Minecraft', object: 'Creeper' },
  { game: 'Roblox', object: 'Doomspire Brickbattle' },
  { game: 'Dark Souls', object: 'Bonfire' },
  { game: 'Elden Ring', object: 'Malenia' },
  { game: 'Portal 2', object: 'Companion Cube' },
  { game: 'Half-Life 2', object: 'Gravity Gun' },
  { game: 'Hollow Knight', object: 'Grimm' },
];
document.getElementById('randomBtn').addEventListener('click', () => {
  const t = RANDOM_TERMS[Math.floor(Math.random() * RANDOM_TERMS.length)];
  gameInput.value = t.game;
  objectInput.value = t.object;
  subprojectInput.value = t.sub || '';
  updateStepState(gameInput, step1);
  updateStepState(objectInput, step2);
  updateStepState(subprojectInput, step3);
  searchTerm();
});

/* =========================================================
   ГОРЯЧАЯ КЛАВИША '/' — ФОКУС НА ПОИСК
   ========================================================= */
document.addEventListener('keydown', (e) => {
  // Если нажали '/' и при этом НЕ печатаем текст в другом поле
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    gameInput.focus();
    gameInput.select();
  }
});

/* =========================================================
   FAQ — РАСКРЫТИЕ
   ========================================================= */
document.querySelectorAll('.faq-q').forEach(q => {
  q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
});

/* =========================================================
   АВТОЗАПУСК ИЗ URL
   Восстанавливаем не только игру/термин, но и языки, стиль и Pro-режим:
   ссылкой из адресной строки можно поделиться.
   ========================================================= */
function initFromURL() {
  const u = readURL();
  if (!u.game || !u.object) return;

  gameInput.value = u.game;
  objectInput.value = u.object;
  if (u.sub) subprojectInput.value = u.sub;

  if (Array.isArray(u.langs) && u.langs.length > 0) {
    document.querySelectorAll('.lang-chip').forEach((chip) => {
      const active = u.langs.includes(chip.dataset.code);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  if (u.tone) {
    const toneSelect = document.getElementById('toneSelect');
    if (toneSelect) toneSelect.value = u.tone;
  }
  if (u.pro && proToggle && !proToggle.disabled) proToggle.checked = true;

  updateStepState(gameInput, step1);
  updateStepState(objectInput, step2);
  if (u.sub) updateStepState(subprojectInput, step3);

  setTimeout(() => searchTerm(), 100);
}

/* =========================================================
   ЗАПУСК
   ========================================================= */
/* =========================================================
   ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК (Термин / Страница)
   ========================================================= */
const tabs = document.querySelectorAll('.search-tab');
const tabContents = document.querySelectorAll('.tab-content');
const premiumLock = document.getElementById('premiumLock');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

/* =========================================================
   ЛОГИКА ПОДПИСКИ (DEMO)
   ========================================================= */
const subModal = document.getElementById('subModal');
const premiumBtn = document.getElementById('premiumBtn');
const subCloseBtn = document.getElementById('subCloseBtn');

// 0: Free, 1: Premium, 2: Premium+, 3: Premium++
let userTierLevel = parseInt(localStorage.getItem('userTierLevel') || '0');

// Хелпер для проверки доступа (включает уровни ниже)
function hasAccess(requiredLevel) {
  return userTierLevel >= requiredLevel;
}

// Элементы окна статуса
const premiumStatusModal = document.getElementById('premiumStatusModal');
const premiumStatusCloseBtn = document.getElementById('premiumStatusCloseBtn');
const cancelSubBtn = document.getElementById('cancelSubBtn');

const adBanner = document.getElementById('adBanner');
const proToggle = document.getElementById('proToggle');
const proSwitchLabel = document.getElementById('proSwitchLabel');
const glossaryModal = document.getElementById('glossaryModal');

const tierNames = ['', '⭐ Premium', '⭐ Premium+', '⭐ Premium++'];

function updatePremiumUI() {
  // 1. Кнопка в шапке
  if (userTierLevel > 0) {
    premiumBtn.textContent = tierNames[userTierLevel] + ' ' + translations[uiLang].status_active;
    premiumLock.style.display = 'none';
  } else {
    premiumBtn.textContent = translations[uiLang].premium_btn;
    premiumLock.style.display = 'inline';
  }

  // 2. Реклама (скрываем для всех платных)
  if (userTierLevel > 0) {
    adBanner.classList.remove('visible');
    document.body.classList.remove('has-ad-banner'); // Убираем отступ
  } else {
    adBanner.classList.add('visible');
    document.body.classList.add('has-ad-banner');    // Добавляем отступ
  }

  // 3. Pro-режим и Глоссарий (уровень 1+)
  proToggle.checked = userTierLevel >= 1 ? proToggle.checked : false;
  if (userTierLevel < 1) {
    proSwitchLabel.classList.add('disabled');
    proToggle.disabled = true;
    proSwitchLabel.title = translations[uiLang].pro_only_premium;
  } else {
    proSwitchLabel.classList.remove('disabled');
    proToggle.disabled = false;
    proSwitchLabel.title = "";
  }

  // 4. ИИ-Тональность (уровень 3+)
  const toneOptions = document.getElementById('toneOptions');
  if (userTierLevel >= 3) {
    toneOptions.style.display = 'flex';
  } else {
    toneOptions.style.display = 'none';
  }
}

// Обработчик кнопки Premium в шапке
premiumBtn.addEventListener('click', () => {
  if (userTierLevel === 0) {
    subModal.classList.add('visible');
  } else {
    // Генерируем список фич для окна статуса
    const features = [
      translations[uiLang].premium_feat_3, // Без рекламы
      translations[uiLang].premium_feat_2, // Pro-режим
      translations[uiLang].premium_feat_4, // Глоссарий
      translations[uiLang].premium_feat_5  // Экспорт
    ];
    if (userTierLevel >= 2) features.push(translations[uiLang].premium_plus_feat);
    if (userTierLevel >= 3) {
      features.push(translations[uiLang].premium_plus_plus_feat);
      features.push(translations[uiLang].premium_plus_plus_feat2);
    }

    document.getElementById('statusTitle').textContent = tierNames[userTierLevel] + ' ' + translations[uiLang].status_active;
    document.getElementById('statusDesc').textContent = translations[uiLang].status_desc;
    document.getElementById('statusFeatures').innerHTML = features.map(f => `<li>✅ ${f}</li>`).join('');
    
    premiumStatusModal.classList.add('visible');
  }
});

// Закрытие окна статуса
premiumStatusCloseBtn.addEventListener('click', () => {
  premiumStatusModal.classList.remove('visible');
});

// Отмена подписки (сброс на 0)
cancelSubBtn.addEventListener('click', () => {
  if (window.confirm(tr('cancel_sub_confirm'))) {
    userTierLevel = 0;
    localStorage.removeItem('userTierLevel');
    premiumStatusModal.classList.remove('visible');
    updatePremiumUI();
  }
});

// Закрытие окна тарифов
subCloseBtn.addEventListener('click', () => subModal.classList.remove('visible'));

/* Оформление подписки.
   Если бэкенд с настроенной ЮKassa отвечает confirmation_url — уводим на оплату.
   Иначе (ключи не заданы, локальный/статический хостинг) включаем демо-режим,
   но говорим об этом прямо, а не молча «оплачиваем». */
const TIER_PLANS = { 1: 'premium', 2: 'premium_plus', 3: 'premium_plus_plus' };

document.querySelectorAll('.buy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const selectedTier = parseInt(btn.getAttribute('data-tier'), 10);
    const plan = TIER_PLANS[selectedTier];
    if (!plan) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = tr('paying_btn');

    try {
      const response = await fetch(`${API_BASE}/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userTier: userTierLevel }),
      });

      let data = null;
      try { data = await response.json(); } catch { data = null; }

      if (response.ok && data && data.confirmation_url) {
        window.location.href = data.confirmation_url;
        return;
      }

      // Платёжный сервис недоступен — демо-активация локально.
      userTierLevel = selectedTier;
      localStorage.setItem('userTierLevel', userTierLevel);
      subModal.classList.remove('visible');
      updatePremiumUI();
      showToast(tr('demo_payment_notice'), 'warn');
    } catch {
      userTierLevel = selectedTier;
      localStorage.setItem('userTierLevel', userTierLevel);
      subModal.classList.remove('visible');
      updatePremiumUI();
      showToast(tr('demo_payment_notice'), 'warn');
    } finally {
      btn.disabled = false;
      document.querySelectorAll('.buy-btn').forEach((other) => {
        other.textContent = tr('sub_pay_btn');
      });
    }
  });
});

/* =========================================================
   ПЕРЕВОД СТРАНИЦЫ (IFRAME)
   ========================================================= */
const translatePageBtn = document.getElementById('translatePageBtn');
const pageUrlInput = document.getElementById('pageUrlInput');
const iframeModal = document.getElementById('iframeModal');
const iframeCloseBtn = document.getElementById('iframeCloseBtn');
const translatedFrame = document.getElementById('translatedFrame');
const iframeTitle = document.getElementById('iframeTitle');

translatePageBtn.addEventListener('click', async () => {
  const url = pageUrlInput.value.trim();

  // Проверка доступа (на бэкенде тоже стоит проверка userTier >= 2)
  if (!hasAccess(2)) {
    subModal.classList.add('visible');
    return;
  }

  if (!url) {
    pageUrlInput.focus();
    return;
  }

  iframeTitle.textContent = url;
  iframeModal.classList.add('visible');

  // Заглушка загрузки
  translatedFrame.srcdoc = `
    <div style="font-family: sans-serif; padding: 50px; text-align: center; color: #333;">
      <h2>${escapeHtml(tr('page_loading_title'))}</h2>
      <p>${escapeHtml(tr('page_loading_text'))}</p>
    </div>
  `;

  try {
    // Отправляем запрос на наш бэкенд
    const response = await fetch(`${API_BASE}/api/proxy-translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        targetLang: uiLang, // язык интерфейса = язык перевода заголовка
        userTier: userTierLevel
      })
    });

    if (!response.ok) {
      let message = '';
      try {
        const json = await response.json();
        message = json && json.error ? json.error : '';
      } catch {
        message = await response.text().catch(() => '');
      }
      throw new Error(message || `HTTP ${response.status}`);
    }

    // HTML уже очищен на бэкенде (скрипты и обработчики удалены).
    translatedFrame.srcdoc = await response.text();

  } catch (error) {
    console.error(error);
    translatedFrame.srcdoc = `
      <div style="font-family: sans-serif; padding: 50px; text-align: center; color: #d32f2f;">
        <h2>${escapeHtml(tr('page_error_title'))}</h2>
        <p>${escapeHtml(error.message || '')}</p>
      </div>
    `;
  }
});

iframeCloseBtn.addEventListener('click', () => {
  iframeModal.classList.remove('visible');
  translatedFrame.src = 'about:blank';
});

/* =========================================================
   ЭКСПОРТ РЕЗУЛЬТАТА
   CSV — настоящая таблица (язык / официальный перевод / варианты / пояснение),
   JSON — полный объект ответа, Markdown — исходный текст ответа.
   ========================================================= */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileSlug(value) {
  const slug = String(value || 'translation')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return slug || 'translation';
}

function escapeCsvCell(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildResultCsv(data) {
  const rows = [['lang', 'language', 'official', 'alternatives', 'literal', 'explanation', 'confidence', 'verified']];

  for (const row of data.translations || []) {
    rows.push([
      row.lang,
      row.langName,
      row.official || '',
      (row.alternatives || []).join('; '),
      row.literal || '',
      row.explanation || '',
      row.confidence || '',
      row.verified ? 'yes' : 'no',
    ]);
  }

  // Ответ без структуры (старые провайдеры) — кладём markdown в колонку перевода.
  if (rows.length === 1) rows.push(['', '', data.answer || '']);

  // BOM + ";" — так Excel с русской локалью открывает файл без «кракозябр».
  return '\uFEFF' + rows.map((cells) => cells.map(escapeCsvCell).join(';')).join('\r\n');
}

window.exportResult = function(format, button) {
  if (!lastResult || !lastResult.data) return;
  const data = lastResult.data;
  const slug = fileSlug(lastResult.object);

  try {
    if (format === 'csv') {
      downloadFile(`translation_${slug}.csv`, buildResultCsv(data), 'text/csv;charset=utf-8');
    } else if (format === 'json') {
      downloadFile(`translation_${slug}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    } else {
      downloadFile(`translation_${slug}.md`, data.answer || '', 'text/markdown;charset=utf-8');
    }
    if (button) flashButton(button, '✓');
  } catch {
    showToast(tr('copy_failed'), 'error');
    if (button) flashButton(button, '⚠️');
  }
};

const GLOSSARY_KEY = 'userGlossary';
const openGlossaryBtn = document.getElementById('openGlossaryBtn');
const saveGlossaryBtn = document.getElementById('saveGlossaryBtn');
const glossaryList = document.getElementById('glossaryList');

function loadGlossary() {
  return JSON.parse(localStorage.getItem(GLOSSARY_KEY) || '{}');
}

function renderGlossary() {
  const data = loadGlossary();
  const keys = Object.keys(data);
  if (!keys.length) {
    glossaryList.innerHTML = `<li style="color:var(--muted); text-align:center;">${escapeHtml(translations[uiLang].glossary_empty)}</li>`;
    return;
  }
  // Ключи глоссария — пользовательский ввод: экранируем и не вставляем в onclick.
  glossaryList.innerHTML = keys.map(k => `
    <li style="display:flex; justify-content:space-between; gap:8px; padding:8px 0; border-bottom:1px solid var(--border);">
      <span><b>${escapeHtml(k)}</b> → ${escapeHtml(data[k])}</span>
      <button type="button" class="glossary-remove" data-remove-glossary="${escapeHtml(k)}"
              title="${escapeHtml(tr('glossary_remove'))}" aria-label="${escapeHtml(tr('glossary_remove'))}"
              style="background:none; border:none; color:var(--danger); cursor:pointer;">✕</button>
    </li>
  `).join('');
}

function removeGlossaryEntry(key) {
  const data = loadGlossary();
  delete data[key];
  try { localStorage.setItem(GLOSSARY_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  renderGlossary();
}

glossaryList.addEventListener('click', (e) => {
  const button = e.target.closest('[data-remove-glossary]');
  if (!button) return;
  removeGlossaryEntry(button.dataset.removeGlossary);
});

openGlossaryBtn.addEventListener('click', () => {
  if (!hasAccess(1)) {
    subModal.classList.add('visible');
    return;
  }
  renderGlossary();
  glossaryModal.classList.add('visible');
});

function addGlossaryEntry() {
  const from = document.getElementById('glossaryFrom').value.trim();
  const to = document.getElementById('glossaryTo').value.trim();
  if (!from || !to) return;
  const data = loadGlossary();
  data[from] = to;
  try {
    localStorage.setItem(GLOSSARY_KEY, JSON.stringify(data));
  } catch {
    showToast(tr('copy_failed'), 'error');
    return;
  }
  document.getElementById('glossaryFrom').value = '';
  document.getElementById('glossaryTo').value = '';
  renderGlossary();
}

saveGlossaryBtn.addEventListener('click', addGlossaryEntry);

// Enter в полях глоссария = добавление
['glossaryFrom', 'glossaryTo'].forEach((id) => {
  const input = document.getElementById(id);
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGlossaryEntry();
    }
  });
});

// Экспорт глоссария
document.getElementById('exportGlossaryBtn').addEventListener('click', () => {
  if (!hasAccess(2)) {
    showToast(tr('premium_only_plus'), 'warn');
    return;
  }
  const data = loadGlossary();
  downloadFile('gametranslator_glossary.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
});

// Импорт глоссария
document.getElementById('importGlossaryBtn').addEventListener('click', () => {
  if (!hasAccess(2)) {
    showToast(tr('premium_only_plus'), 'warn');
    return;
  }
  document.getElementById('glossaryFile').click();
});

document.getElementById('glossaryFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (typeof imported === 'object' && imported !== null) {
        const current = loadGlossary();
        const merged = { ...current, ...imported };
        localStorage.setItem(GLOSSARY_KEY, JSON.stringify(merged));
        renderGlossary();
        showToast(tr('glossary_import_success'));
      }
    } catch {
      showToast(tr('glossary_import_error'), 'error');
    }
    e.target.value = ''; // Сбрасываем input
  };
  reader.readAsText(file);
});

/* =========================================================
   ХУК В applyLang И ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
const originalApplyLang = applyLang;
applyLang = function(lang) {
  originalApplyLang(lang);
  updatePremiumUI();
  if (tabContents[1].classList.contains('active') && !hasAccess(2)) {
     premiumLock.style.display = 'inline';
  }
};

/* =========================================================
   ДОСТУПНОСТЬ МОДАЛЬНЫХ ОКОН
   Esc и клик по фону закрывают окно, aria-hidden синхронизируется с классом.
   ========================================================= */
function initModals() {
  const overlays = Array.from(document.querySelectorAll('.modal-overlay'));

  overlays.forEach((overlay) => {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', overlay.classList.contains('visible') ? 'false' : 'true');

    // Окно соглашения закрывается только кнопками «Принять»/«Отклонить».
    overlay.addEventListener('click', (event) => {
      if (event.target !== overlay || overlay.id === 'tosModal') return;
      overlay.classList.remove('visible');
    });
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const element = mutation.target;
      if (!element.classList || !element.classList.contains('modal-overlay')) return;

      const isOpen = element.classList.contains('visible');

      // Фокус нельзя прятать от скринридеров: сначала уводим его из окна.
      if (!isOpen && element.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      element.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

      if (isOpen) {
        const focusable = element.querySelector('input, select, textarea, button');
        if (focusable) focusable.focus({ preventScroll: true });
      }
    });
  });
  overlays.forEach((overlay) => observer.observe(overlay, { attributes: true, attributeFilter: ['class'] }));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const visible = overlays.filter((overlay) => overlay.classList.contains('visible') && overlay.id !== 'tosModal');
    if (visible.length > 0) visible[visible.length - 1].classList.remove('visible');
  });
}

/* =========================================================
   ОБЩИЕ ОБРАБОТЧИКИ ИНТЕРФЕЙСА
   ========================================================= */
function initUiListeners() {
  const form = document.getElementById('searchForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      searchTerm();
    });
  }

  // Раньше это были inline onclick — они несовместимы со строгим CSP.
  const bannerButton = document.querySelector('#adBanner .btn-premium');
  if (bannerButton) bannerButton.addEventListener('click', () => subModal.classList.add('visible'));

  const glossaryClose = document.getElementById('glossaryCloseBtn');
  if (glossaryClose) glossaryClose.addEventListener('click', () => glossaryModal.classList.remove('visible'));

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && iframeModal.classList.contains('visible')) {
      iframeModal.classList.remove('visible');
      translatedFrame.src = 'about:blank';
    }
  });
}

/* =========================================================
   МОБИЛЬНОЕ МЕНЮ (ГАМБУРГЕР)
   ========================================================= */
const burgerBtn = document.getElementById('burgerBtn');
const navLinks = document.getElementById('navLinks');

if (burgerBtn && navLinks) {
  burgerBtn.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}
initTheme();
initLangChips();
initModals();
initUiListeners();
applyLang(detectInitialLang());
initTos();
initFromURL();