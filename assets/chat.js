/* =========================================================
   Мини-чат «Обсудить перевод» — клиент.
   Безопасность (см. docs/mini-chat-proposal.md, раздел 5):
   • ответ модели вставляется ТОЛЬКО через textContent/createTextNode:
     никакой HTML-вставки, markdown, ссылок и картинок из ответа;
   • токен и история живут только в памяти (не localStorage);
   • чат ничего не применяет сам: правка — только по кнопке «Применить»;
   • без chatToken (кэш-хит, истёкшая сессия) чат открывается в stale-режиме
     с предложением обновить результат.
   ========================================================= */
'use strict';

(function () {
  const CHAT_LIMITS = {
    maxHistory: 8,
    maxHistoryChars: 6000,
    maxUserMessage: 1000,
    maxReply: 2000,
    maxActions: 3,
  };

  // UX-квоты: это продуктовое ограничение, а не защита.
  // Реальные лимиты — на сервере (12/мин и 150/сутки на IP).
  const QUOTAS = { free: 3, pro: 20, premium: 100 };
  const GLOSSARY_KEY = 'userGlossary';
  const GLOSSARY_MAX = 50;

  const state = {
    data: null,
    token: null,
    apiBase: '',
    rows: [],
    transcript: [],
    used: 0,
    busy: false,
    stale: false,
    applied: false,
    open: false,
    lastOpener: null,
    abort: null,
    timer: null,
  };

  const ui = {};

  /* ---------- утилиты ---------- */

  function t(key) {
    try {
      if (typeof window.tr === 'function') return window.tr(key);
    } catch (error) {
      /* ignore */
    }
    return key;
  }

  function toast(message, tone) {
    try {
      if (typeof window.showToast === 'function') window.showToast(message, tone);
    } catch (error) {
      /* ignore */
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function fmt(template, values) {
    let out = String(template || '');
    Object.keys(values || {}).forEach((key) => {
      out = out.split('{' + key + '}').join(String(values[key]));
    });
    return out;
  }

  function tierLevel() {
    const value = parseInt(localStorage.getItem('userTierLevel') || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function quotaLimit() {
    const tier = tierLevel();
    if (tier >= 2) return QUOTAS.premium;
    if (tier === 1) return QUOTAS.pro;
    return QUOTAS.free;
  }

  function isReadOnly() {
    return state.applied || state.stale || !state.token;
  }

  function rowsOf() {
    return Array.isArray(state.data && state.data.translations) ? state.data.translations : [];
  }

  function langName(lang) {
    const row = rowsOf().find((item) => item && item.lang === lang);
    return (row && (row.langName || row.lang)) || String(lang || '');
  }

  function rowByLang(lang) {
    return state.rows.find((row) => row && row.lang === lang) || null;
  }

  function showStatus(message, tone) {
    if (!ui.status) return;
    ui.status.textContent = message || '';
    ui.status.classList.toggle('gtchat__status--warn', tone === 'warn');
    ui.status.classList.toggle('gtchat__status--error', tone === 'error');
  }

  /* ---------- инициализация DOM ---------- */

  function init() {
    ui.root = document.getElementById('gtchat');
    if (!ui.root) return;
    ui.panel = ui.root.querySelector('.gtchat__panel');
    ui.log = document.getElementById('gtchatLog');
    ui.status = document.getElementById('gtchatStatus');
    ui.form = document.getElementById('gtchatForm');
    ui.input = document.getElementById('gtchatInput');
    ui.send = document.getElementById('gtchatSend');
    ui.quota = document.getElementById('gtchatQuota');
    ui.context = document.getElementById('gtchatContext');
    ui.refresh = document.getElementById('gtchatRefresh');
    if (!ui.panel || !ui.log || !ui.form || !ui.input) return;

    ui.form.addEventListener('submit', (event) => {
      event.preventDefault();
      send();
    });

    ui.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });

    ui.root.querySelectorAll('[data-chat-close]').forEach((button) => {
      button.addEventListener('click', hidePanel);
    });

    if (ui.refresh) {
      ui.refresh.addEventListener('click', () => {
        if (typeof window.searchTerm === 'function') window.searchTerm(true);
      });
    }

    // Делегирование: кнопки рендерятся внутри #answerBox и переживают перерисовку.
    document.addEventListener('click', (event) => {
      const openBtn = event.target.closest('[data-chat-open]');
      if (openBtn) {
        event.preventDefault();
        showPanel(openBtn);
        return;
      }
      const rowBtn = event.target.closest('[data-chat-row]');
      if (rowBtn) {
        event.preventDefault();
        showPanel(rowBtn, rowBtn.dataset.chatRow);
        return;
      }
      // Клик «внутри» определяем по пути события: кнопка действия может
      // удалить свою карточку из DOM ещё до всплытия — closest() тогда врёт.
      if (state.open && !event.composedPath().includes(ui.root)) {
        hidePanel();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!state.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        hidePanel();
        return;
      }
      if (event.key === 'Tab') trapFocus(event);
    });

    window.GTChat = window.GTChat || {};
    window.GTChat.retranslate = retranslate;
    window.GTChat.version = '1.0.0';

    if (state.data) renderAll();
  }

  function focusables() {
    if (!ui.panel) return [];
    return Array.from(
      ui.panel.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]')
    ).filter((node) => node.offsetParent !== null);
  }

  function trapFocus(event) {
    const list = focusables();
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  /* ---------- открытие / закрытие ---------- */

  function showPanel(opener, focusLang) {
    if (!state.data) {
      toast(t('chat_error_generic'), 'error');
      return;
    }
    state.lastOpener = opener || document.activeElement;
    state.open = true;
    ui.root.hidden = false;
    ui.root.classList.add('gtchat--open');
    document.body.classList.add('gtchat-open');
    if (opener) opener.setAttribute('aria-expanded', 'true');

    renderAll();

    if (focusLang) {
      const row = rowByLang(focusLang);
      if (row && row.official) {
        ui.input.value = fmt(t('chat_prefill_row'), { lang: langName(focusLang) });
      }
    }

    if (isReadOnly()) {
      if (ui.input) ui.input.disabled = true;
      if (ui.refresh) ui.refresh.hidden = !(state.stale || state.applied);
      showStatus(state.stale ? t('chat_stale') : t('chat_readonly_after_apply'));
    } else {
      if (ui.input) {
        ui.input.disabled = false;
        ui.input.focus({ preventScroll: true });
      }
      showStatus('');
    }
  }

  function hidePanel() {
    if (!state.open) return;
    state.open = false;
    ui.root.hidden = true;
    ui.root.classList.remove('gtchat--open');
    document.body.classList.remove('gtchat-open');
    if (state.lastOpener && typeof state.lastOpener.focus === 'function') {
      state.lastOpener.focus({ preventScroll: true });
    }
  }

  /* ---------- рендер ---------- */

  function updateContext() {
    if (!ui.context) return;
    const data = state.data || {};
    const langs = rowsOf()
      .map((row) => row.langName || row.lang)
      .join(', ');
    ui.context.textContent = [data.object || '', langs].filter(Boolean).join(' · ');
  }

  function updateFooter() {
    if (ui.quota) {
      const limit = quotaLimit();
      ui.quota.textContent = fmt(t('chat_quota'), { used: state.used, limit });
      ui.quota.classList.toggle('gtchat__quota--empty', state.used >= limit);
    }
    if (ui.refresh) ui.refresh.hidden = !(state.stale || state.applied);
    const readonly = isReadOnly();
    if (ui.input) {
      ui.input.disabled = readonly || state.busy;
      ui.input.setAttribute('aria-disabled', readonly || state.busy ? 'true' : 'false');
    }
    if (ui.send) ui.send.disabled = readonly || state.busy;
  }

  function renderAll() {
    updateContext();
    renderLog();
    updateFooter();
  }

  function renderLog() {
    if (!ui.log) return;
    ui.log.replaceChildren();
    if (state.transcript.length === 0) {
      ui.log.appendChild(buildEmptyState());
      return;
    }
    for (const entry of state.transcript) {
      if (entry.role === 'user') {
        const bubble = el('div', 'gtchat__msg gtchat__msg--user');
        bubble.appendChild(el('p', 'gtchat__text', entry.content));
        ui.log.appendChild(bubble);
        continue;
      }
      const bubble = el('div', 'gtchat__msg gtchat__msg--assistant');
      if (entry.content) bubble.appendChild(el('p', 'gtchat__text', entry.content));
      for (const action of entry.actions || []) {
        bubble.appendChild(buildActionCard(action));
      }
      ui.log.appendChild(bubble);
    }
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function buildEmptyState() {
    const wrap = el('div', 'gtchat__empty');
    wrap.appendChild(el('p', 'gtchat__empty-title', t('chat_empty_title')));
    wrap.appendChild(el('p', 'gtchat__empty-hint', t('chat_empty_hint')));
    const chips = el('div', 'gtchat__chips');
    [
      ['chat_chip_why', t('chat_chip_why_text')],
      ['chat_chip_variant', t('chat_chip_variant_text')],
      ['chat_chip_wrong', t('chat_chip_wrong_text')],
    ].forEach(([labelKey, text]) => {
      const chip = el('button', 'gtchat__chip', t(labelKey));
      chip.type = 'button';
      chip.addEventListener('click', () => {
        ui.input.value = text;
        ui.input.focus({ preventScroll: true });
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    return wrap;
  }

  function buildActionCard(action) {
    const card = el('div', 'gtchat__card');
    if (!action || typeof action.type !== 'string') return card;

    if (action.type === 'propose_edit') {
      card.classList.add('gtchat__card--edit');
      card.appendChild(el('p', 'gtchat__card-title', t('chat_edit_proposed') + ' · ' + langName(action.lang)));
      const row = rowByLang(action.lang);
      const was = row && row.official ? row.official : '—';
      const now = action.official || (action.alternatives && action.alternatives[0]) || '—';
      const diff = el('p', 'gtchat__diff');
      diff.appendChild(el('span', 'gtchat__diff-was', was));
      diff.appendChild(el('span', 'gtchat__diff-arrow', ' → '));
      diff.appendChild(el('span', 'gtchat__diff-now', now));
      card.appendChild(diff);
      if (Array.isArray(action.alternatives) && action.alternatives.length > 0) {
        card.appendChild(el('p', 'gtchat__alts', t('chat_alt_label') + ': ' + action.alternatives.join('; ')));
      }
      if (action.explanation) card.appendChild(el('p', 'gtchat__note', action.explanation));
      card.appendChild(el('span', 'badge badge-unverified gtchat__badge', t('chat_unverified')));

      if (state.applied) {
        card.appendChild(el('p', 'gtchat__note', t('chat_applied')));
        return card;
      }
      if (isReadOnly()) {
        card.appendChild(el('p', 'gtchat__note', state.stale ? t('chat_stale') : t('chat_readonly_after_apply')));
        return card;
      }

      const actions = el('div', 'gtchat__card-actions');
      const apply = el('button', 'btn btn-primary btn-small', t('chat_action_apply'));
      apply.type = 'button';
      apply.addEventListener('click', () => applyEdit(action, card));
      const dismiss = el('button', 'btn btn-secondary btn-small', t('chat_action_dismiss'));
      dismiss.type = 'button';
      dismiss.addEventListener('click', () => {
        card.remove();
      });
      actions.appendChild(apply);
      actions.appendChild(dismiss);
      card.appendChild(actions);
      return card;
    }

    if (action.type === 'refine_query') {
      card.classList.add('gtchat__card--refine');
      card.appendChild(el('p', 'gtchat__card-title', t('chat_refine')));
      const query = action.query || {};
      const summary = [
        query.game ? t('game_label') + ': ' + query.game : '',
        query.object ? t('term_label') + ': ' + query.object : '',
        query.subproject ? t('subproject_label') + ': ' + query.subproject : '',
        Array.isArray(query.targetLangs) && query.targetLangs.length ? t('langs_label') + ': ' + query.targetLangs.join(', ') : '',
      ]
        .filter(Boolean)
        .join(' · ');
      card.appendChild(el('p', 'gtchat__note', summary));
      const button = el('button', 'btn btn-primary btn-small', t('chat_action_refine'));
      button.type = 'button';
      button.addEventListener('click', () => refineQuery(query));
      card.appendChild(button);
      return card;
    }

    if (action.type === 'glossary_add') {
      card.classList.add('gtchat__card--glossary');
      card.appendChild(el('p', 'gtchat__card-title', t('chat_action_glossary')));
      card.appendChild(el('p', 'gtchat__diff', (action.term || '') + ' → ' + (action.translation || '')));
      if (action.added) {
        card.appendChild(el('p', 'gtchat__note', t('chat_glossary_added')));
        return card;
      }
      const button = el('button', 'btn btn-secondary btn-small', t('chat_action_glossary'));
      button.type = 'button';
      button.addEventListener('click', () => addToGlossary(action, card));
      card.appendChild(button);
      return card;
    }

    // answer
    if (action.text) card.appendChild(el('p', 'gtchat__text', action.text));
    return card;
  }

  /* ---------- действия пользователя ---------- */

  function applyEdit(action, card) {
    const row = rowByLang(action.lang);
    if (!row) {
      showStatus(t('chat_apply_failed'), 'error');
      return;
    }
    const previous = row.official || null;
    const details = {
      lang: action.lang,
      official: action.official || null,
      alternatives: Array.isArray(action.alternatives) ? action.alternatives : [],
      explanation: action.explanation || '',
      confidence: action.confidence || row.confidence,
      previousOfficial: previous,
    };
    document.dispatchEvent(new CustomEvent('gt-apply-edit', { detail: details }));
    state.applied = true;
    renderLog();
    updateFooter();
    showStatus(t('chat_readonly_after_apply'));
    if (typeof window.showToast === 'function') window.showToast(t('chat_applied'));
    if (card) card.remove();
  }

  function setLangChips(codes) {
    const wanted = (codes || []).filter(Boolean);
    if (wanted.length === 0) return;
    document.querySelectorAll('.lang-chip').forEach((chip) => {
      const active = wanted.includes(chip.dataset.code);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function refineQuery(query) {
    const gameInput = document.getElementById('gameInput');
    const objectInput = document.getElementById('objectInput');
    const subprojectInput = document.getElementById('subprojectInput');
    if (query.game && gameInput) gameInput.value = query.game;
    if (query.object && objectInput) objectInput.value = query.object;
    if (query.subproject && subprojectInput) subprojectInput.value = query.subproject;
    if (Array.isArray(query.targetLangs) && query.targetLangs.length > 0) setLangChips(query.targetLangs);
    if (typeof window.searchTerm === 'function') {
      window.searchTerm(true);
      showStatus(t('chat_refine_running'));
    } else {
      showStatus(t('chat_apply_failed'), 'error');
    }
  }

  function loadGlossary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOSSARY_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function addToGlossary(action, card) {
    const glossary = loadGlossary();
    const keys = Object.keys(glossary);
    if (keys.length >= GLOSSARY_MAX && !glossary[action.term]) {
      showStatus(t('chat_glossary_limit'), 'warn');
      return;
    }
    glossary[action.term] = action.translation;
    try {
      localStorage.setItem(GLOSSARY_KEY, JSON.stringify(glossary));
    } catch (error) {
      showStatus(t('chat_apply_failed'), 'error');
      return;
    }
    action.added = true;
    renderLog();
    if (typeof window.showToast === 'function') window.showToast(t('chat_glossary_added'));
  }

  /* ---------- отправка ---------- */

  function trimHistory() {
    const messages = state.transcript
      .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
      .filter((entry) => entry.content)
      .map((entry) => ({ role: entry.role, content: entry.content }));
    const tail = messages.slice(-CHAT_LIMITS.maxHistory);
    const result = [];
    let total = 0;
    for (let index = tail.length - 1; index >= 0; index -= 1) {
      total += tail[index].content.length;
      if (total > CHAT_LIMITS.maxHistoryChars) break;
      result.unshift(tail[index]);
    }
    return result;
  }

  async function send() {
    if (state.busy || isReadOnly()) return;
    const raw = String(ui.input.value || '').trim();
    if (!raw) return;
    if (raw.length > CHAT_LIMITS.maxUserMessage) {
      ui.input.value = raw.slice(0, CHAT_LIMITS.maxUserMessage);
      showStatus(t('chat_message_too_long'), 'warn');
      return;
    }
    if (state.used >= quotaLimit()) {
      showStatus(t('chat_quota_limit'), 'warn');
      return;
    }

    const history = trimHistory();
    state.transcript.push({ role: 'user', content: raw });
    renderLog();
    ui.input.value = '';
    state.used += 1;
    updateFooter();
    state.busy = true;
    updateFooter();
    showStatus(t('chat_typing'));
    if (ui.log) ui.log.setAttribute('aria-busy', 'true');

    const controller = new AbortController();
    state.abort = controller;
    state.timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch((state.apiBase || '') + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatToken: state.token,
          message: raw,
          history,
          rows: rowsOf().map((row) => ({
            lang: row.lang,
            official: row.official || null,
            alternatives: Array.isArray(row.alternatives) ? row.alternatives : [],
            confidence: row.confidence,
            verified: row.verified === true,
          })),
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        state.used = Math.max(0, state.used - 1);
        if (response.status === 401 || response.status === 409) {
          state.token = null;
          state.stale = true;
          ui.input.value = raw;
          showStatus(t('chat_session_expired'), 'warn');
        } else if (response.status === 429) {
          showStatus(fmt(t('chat_error_rate'), { sec: response.headers.get('Retry-After') || '60' }), 'warn');
        } else if (response.status === 503) {
          showStatus(t('chat_disabled'), 'error');
        } else if (response.status === 504) {
          showStatus(t('chat_error_timeout'), 'error');
        } else {
          showStatus((data && data.error) || t('chat_error_generic'), 'error');
        }
        return;
      }

      if (!data || typeof data.reply !== 'string') {
        state.used = Math.max(0, state.used - 1);
        showStatus(t('chat_error_generic'), 'error');
        return;
      }

      const actions = Array.isArray(data.actions) ? data.actions.slice(0, CHAT_LIMITS.maxActions) : [];
      state.transcript.push({ role: 'assistant', content: data.reply, actions });
      renderLog();
      if (data.meta && data.meta.blocked) showStatus(t('chat_refused_security'), 'warn');
      else if (data.meta && data.meta.degraded) showStatus(t('chat_error_generic'), 'warn');
      else showStatus('');
    } catch (error) {
      state.used = Math.max(0, state.used - 1);
      ui.input.value = raw;
      if (error && error.name === 'AbortError') showStatus(t('chat_error_timeout'), 'error');
      else showStatus(t('chat_error_network'), 'error');
    } finally {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.abort = null;
      state.busy = false;
      if (ui.log) ui.log.setAttribute('aria-busy', 'false');
      updateFooter();
      if (ui.input && !isReadOnly()) ui.input.focus({ preventScroll: true });
    }
  }

  /* ---------- события результата и языка ---------- */

  function onResult(event) {
    const detail = (event && event.detail) || {};
    const data = detail.data;
    if (!data || typeof data !== 'object') return;

    const token = typeof detail.chatToken === 'string' && detail.chatToken ? detail.chatToken : '';
    const tokenChanged = token !== state.token;
    state.data = data;
    state.apiBase = typeof detail.apiBase === 'string' ? detail.apiBase : state.apiBase;
    state.rows = rowsOf().map((row) => Object.assign({}, row));
    state.stale = !token;

    if (token && tokenChanged) {
      state.token = token;
      state.transcript = [];
      state.used = 0;
      state.applied = false;
    } else if (!token && tokenChanged) {
      state.token = null;
      state.transcript = [];
      state.used = 0;
    }

    if (state.open) {
      renderAll();
      showStatus(state.stale ? t('chat_stale') : '');
    }
  }

  function onClear() {
    state.data = null;
    state.token = null;
    state.rows = [];
    state.transcript = [];
    state.used = 0;
    state.applied = false;
    state.stale = false;
    if (state.open) hidePanel();
    if (ui.log) ui.log.replaceChildren();
    updateFooter();
  }

  function retranslate() {
    if (state.open) renderAll();
    else updateFooter();
  }

  /* ---------- старт ---------- */

  document.addEventListener('gt-result', onResult);
  document.addEventListener('gt-result-clear', onClear);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
