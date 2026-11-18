import { state } from './core/state.js';
import { audio } from './core/audio.js';
import { catalogLoader } from './core/catalog.js';
import { getAllExerciseKeys } from './core/exercises.js';
import { escapeHtml, emptyState, toast } from './core/utils.js';
import { mountPuzzle, destroyPuzzle } from './modes/puzzle.js';
import { mountSpeller, destroySpeller } from './modes/speller.js';
import { mountQuiz, destroyQuiz } from './modes/quiz.js';
import { mountMatch, destroyMatch } from './modes/match.js';
import { mountDictation, destroyDictation } from './modes/dictation.js';
import { mountReader, destroyReader } from './modes/reader.js';
import { mountAnalyzer, destroyAnalyzer } from './modes/analyzer.js';

const MODE_HANDLERS = {
  puzzle: { mount: mountPuzzle, destroy: destroyPuzzle },
  speller: { mount: mountSpeller, destroy: destroySpeller },
  match: { mount: mountMatch, destroy: destroyMatch },
  quiz: { mount: mountQuiz, destroy: destroyQuiz },
  dictation: { mount: mountDictation, destroy: destroyDictation },
  reader: { mount: mountReader, destroy: destroyReader },
  analyzer: { mount: mountAnalyzer, destroy: destroyAnalyzer },
};

const MODE_HINTS = {
  puzzle: {
    title: 'Пазл предложений',
    keys: [
      ['клик / перетаскивание', 'переместить слово'],
      ['Enter', 'проверить / далее'],
      ['Backspace', 'убрать последнее слово'],
      ['Пробел', 'прослушать'],
    ],
  },
  speller: {
    title: 'Спеллер слов',
    keys: [
      ['буквы на клавиатуре', 'набрать слово'],
      ['Enter', 'проверить / далее'],
      ['Backspace', 'стереть букву'],
      ['Пробел', 'прослушать'],
    ],
  },
  match: {
    title: 'Пары слов',
    keys: [
      ['клик', 'выбрать карточку'],
      ['Esc', 'снять выбор'],
    ],
    note: 'Слова озвучиваются при выборе. Для уроков с английскими определениями можно переключиться на «Определение (EN)».',
  },
  quiz: {
    title: 'Вопросы к тексту',
    keys: [
      ['1–4', 'выбрать ответ'],
      ['Enter', 'следующий вопрос'],
      ['Пробел', 'прослушать вопрос'],
    ],
  },
  dictation: {
    title: 'Диктант на слух',
    keys: [
      ['Enter', 'проверить / далее'],
      ['Ctrl + Пробел', 'прослушать ещё раз'],
      ['Tab', 'следующий пропуск'],
    ],
    note: 'Для немецкого можно писать ae/oe/ue/ss вместо ä/ö/ü/ß.',
  },
  reader: {
    title: 'Умный ридер',
    keys: [
      ['клик по строке', 'прослушать предложение'],
      ['клик по слову', 'произношение и перевод'],
    ],
  },
  analyzer: {
    title: 'Текст-лаборатория',
    keys: [],
    note: 'Вставьте любой текст, разберите его и сохраните как урок в текущую учебную зону — все режимы тренировки заработают для него автоматически.',
  },
};

let currentModeName = null;
let loadRequestId = 0;

/* ---------------------------------------------------------
   Ссылки: ?profile=dad&course=en-b1&unit=en-b1-ted-smith&mode=quiz
   --------------------------------------------------------- */
function readRoute() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  return {
    profile: params.get('profile') || undefined,
    course: params.get('course') || undefined,
    unit: params.get('unit') || undefined,
    mode: mode && MODE_HANDLERS[mode] ? mode : undefined,
  };
}

function buildShareUrl() {
  const params = new URLSearchParams();
  params.set('profile', state.currentProfileId);
  const track = state.getActiveTrack();
  if (track) params.set('course', state.getTrackKey(track));
  if (state.activeUnit?.id) params.set('unit', state.activeUnit.id);
  params.set('mode', state.activeMode);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/** Адресная строка всегда показывает текущий профиль → курс → урок → режим. */
function syncUrl() {
  const url = buildShareUrl();
  if (url !== window.location.href) {
    window.history.replaceState(null, '', url);
  }
}

async function shareLesson() {
  const url = buildShareUrl();
  const unit = state.activeUnit;
  const title = unit ? getUnitDisplayTitle(unit) : 'Lingua Studio';
  try {
    await navigator.clipboard.writeText(url);
    toast('Ссылка на урок скопирована', 'success');
  } catch {
    // Буфер обмена недоступен (например, не HTTPS) — пробуем системное меню «Поделиться»
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      window.prompt('Скопируйте ссылку:', url);
    }
  }
}

/* ---------------------------------------------------------
   Шапка: профиль, курс, урок, прогресс
   --------------------------------------------------------- */
function renderProfileSelect() {
  const select = document.getElementById('profile-select');
  const avatar = document.getElementById('profile-avatar');
  if (!select) return;

  select.innerHTML = '';
  state.getProfiles().forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === state.currentProfileId;
    select.appendChild(option);
  });
  if (avatar) avatar.textContent = state.getProfile()?.avatar || '👤';
}

function renderTrackSelect() {
  const trackSelect = document.getElementById('course-select');
  if (!trackSelect) return;

  trackSelect.innerHTML = '';
  const tracks = state.getTracks(state.currentProfileId);
  const activeTrack = state.getActiveTrack();

  if (!tracks.length) {
    trackSelect.innerHTML = '<option value="">Нет учебных зон</option>';
    trackSelect.disabled = true;
    return;
  }

  trackSelect.disabled = false;
  tracks.forEach((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.title;
    option.selected = activeTrack?.id === track.id;
    trackSelect.appendChild(option);
  });
}

function getUnitDisplayTitle(unit) {
  return unit?.title || unit?.name || 'Урок';
}

function renderLessonProgress() {
  const scoreEl = document.getElementById('lesson-score');
  const bar = document.getElementById('lesson-progress-bar');
  const pctEl = document.getElementById('lesson-progress-pct');
  const unit = state.activeUnit;

  const keys = getAllExerciseKeys(unit);
  const stats = unit ? state.getUnitStats(unit.id) : { correct: 0, mistakes: 0, done: [] };
  const doneSet = new Set(stats.done || []);
  const done = keys.filter((k) => doneSet.has(k)).length;
  const pct = keys.length ? Math.round((done / keys.length) * 100) : 0;

  if (bar) bar.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;

  const correct = stats.correct || 0;
  const mistakes = stats.mistakes || 0;
  const total = correct + mistakes;
  if (scoreEl) scoreEl.textContent = unit ? `✓ ${correct} · ✕ ${mistakes}` : '';
  document.getElementById('stat-correct').textContent = String(correct);
  document.getElementById('stat-mistakes').textContent = String(mistakes);
  document.getElementById('stat-accuracy').textContent = total ? `${Math.round((correct / total) * 100)}%` : '—';
  document.getElementById('stat-done').textContent = `Пройдено заданий: ${done} из ${keys.length}`;
}

function renderMotto() {
  const card = document.getElementById('motto-card');
  const track = state.getActiveTrack();
  const lang = state.activeUnit?.lang || track?.lang || 'de';
  const motto = state.languages?.[lang]?.motto;
  if (!card) return;
  card.dataset.lang = lang;
  document.getElementById('motto-target').textContent = motto?.target || 'Lingua Studio';
  document.getElementById('motto-ru').textContent = motto?.ru || 'Немного практики каждый день.';
}

function renderHints() {
  const card = document.getElementById('hint-card');
  if (!card) return;
  const meta = MODE_HINTS[state.activeMode] || MODE_HINTS.puzzle;
  card.innerHTML = `
    <h3 class="side-card-title">${escapeHtml(meta.title)}: подсказки</h3>
    ${
      meta.keys.length
        ? `<ul>${meta.keys.map(([k, v]) => `<li><kbd>${escapeHtml(k)}</kbd> ${escapeHtml(v)}</li>`).join('')}</ul>`
        : ''
    }
    ${meta.note ? `<p style="margin-top:10px">${escapeHtml(meta.note)}</p>` : ''}
  `;
}

function updateDeleteUnitButton(unitMeta) {
  const btn = document.getElementById('btn-delete-unit');
  if (btn) btn.hidden = !unitMeta?.isCustom;
}

async function renderUnitSelectAndLoad(targetUnitId = null) {
  const requestId = ++loadRequestId;
  const unitSelect = document.getElementById('unit-select');
  const workspace = document.getElementById('app-workspace');
  if (!unitSelect || !workspace) return;

  unitSelect.innerHTML = '';
  const activeTrack = state.getActiveTrack();
  if (!activeTrack) {
    unitSelect.innerHTML = '<option value="">Нет активной зоны</option>';
    unitSelect.disabled = true;
    updateDeleteUnitButton(null);
    state.setActiveUnit(null);
    return;
  }

  const units = catalogLoader.getUnitsForTrack(activeTrack, state.getCustomUnits(activeTrack.id));

  if (!units.length) {
    unitSelect.innerHTML = '<option value="">В зоне пока нет уроков</option>';
    unitSelect.disabled = true;
    updateDeleteUnitButton(null);
    state.setActiveUnit(null);
    return;
  }

  unitSelect.disabled = false;
  units.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = (u.isCustom ? '★ ' : '') + getUnitDisplayTitle(u);
    unitSelect.appendChild(opt);
  });

  const savedUnitId = targetUnitId || state.getLastUnitId(activeTrack.id);
  const selectedUnitMeta = units.find((u) => u.id === savedUnitId) || units[0];
  unitSelect.value = selectedUnitMeta.id;
  updateDeleteUnitButton(selectedUnitMeta);

  workspace.innerHTML = `
    <div class="loading-placeholder">
      <div class="spinner"></div>
      <p>Загрузка: ${escapeHtml(getUnitDisplayTitle(selectedUnitMeta))}…</p>
    </div>
  `;

  try {
    const unitData = await catalogLoader.loadUnit(selectedUnitMeta.isCustom ? selectedUnitMeta : selectedUnitMeta.file);
    // Пока грузили, пользователь мог выбрать другой урок — устаревший ответ игнорируем
    if (requestId !== loadRequestId) return;
    state.setLastUnitId(activeTrack.id, unitData.id);
    state.setActiveUnit(unitData);
  } catch (err) {
    if (requestId !== loadRequestId) return;
    state.activeUnit = null;
    renderLessonProgress();
    syncUrl();
    workspace.innerHTML = emptyState(
      '⚠️',
      'Не удалось загрузить урок',
      `${escapeHtml(err.message)}<br>Проверьте, что файл урока существует, и выберите другой урок.`
    );
  }
}

/* ---------------------------------------------------------
   Режимы
   --------------------------------------------------------- */
function highlightModeTab(mode) {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    if (active) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function mountCurrentMode() {
  const workspace = document.getElementById('app-workspace');
  if (!workspace) return;

  const mode = MODE_HANDLERS[state.activeMode] ? state.activeMode : 'puzzle';
  currentModeName = mode;
  highlightModeTab(mode);
  renderHints();

  if (!state.activeUnit && mode !== 'analyzer') {
    workspace.innerHTML = emptyState(
      '📭',
      'В этой учебной зоне пока нет уроков',
      'Откройте <strong>«Текст-лабораторию»</strong>, вставьте любой текст и сохраните его как урок — здесь появятся упражнения.'
    );
    return;
  }

  workspace.innerHTML = '';
  MODE_HANDLERS[mode].mount(workspace, state.activeUnit);
}

function destroyCurrentMode() {
  if (currentModeName) MODE_HANDLERS[currentModeName]?.destroy();
  currentModeName = null;
}

function remountMode() {
  destroyCurrentMode();
  mountCurrentMode();
}

/* ---------------------------------------------------------
   Окно настроек
   --------------------------------------------------------- */
function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  renderProfilesList();
  renderTracksList();
  modal.hidden = false;
  document.getElementById('input-profile-name')?.focus();
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.hidden = true;
}

function renderProfilesList() {
  const container = document.getElementById('profiles-list');
  if (!container) return;
  container.innerHTML = '';

  const profiles = state.getProfiles();
  profiles.forEach((p) => {
    const card = document.createElement('div');
    card.className = `item-card${p.id === state.currentProfileId ? ' current' : ''}`;
    card.innerHTML = `
      <div class="item-info">
        <div class="item-name">${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</div>
        <div class="item-desc">${p.isCustom ? 'Пользовательский' : 'Из каталога'}${p.id === state.currentProfileId ? ' · текущий' : ''}</div>
      </div>
      ${
        p.isCustom && profiles.length > 1
          ? '<button type="button" class="btn-delete-item" title="Удалить профиль" aria-label="Удалить профиль">🗑</button>'
          : '<span class="badge-tag">Каталог</span>'
      }
    `;
    card.querySelector('.btn-delete-item')?.addEventListener('click', () => {
      if (confirm(`Удалить профиль «${p.name}» вместе с его зонами и уроками?`)) {
        state.deleteProfile(p.id);
        renderProfilesList();
        toast('Профиль удалён');
      }
    });
    container.appendChild(card);
  });
}

function renderTracksList() {
  const container = document.getElementById('tracks-list');
  if (!container) return;
  container.innerHTML = '';

  const tracks = state.getTracks(state.currentProfileId);
  if (!tracks.length) {
    container.innerHTML = '<div class="muted">Зон пока нет</div>';
    return;
  }

  tracks.forEach((t) => {
    const unitsCount = state.getCustomUnits(t.id).length;
    const card = document.createElement('div');
    card.className = `item-card${t.id === state.getActiveTrack()?.id ? ' current' : ''}`;
    card.innerHTML = `
      <div class="item-info">
        <div class="item-name">${escapeHtml(t.title)}</div>
        <div class="item-desc">${escapeHtml(t.description || t.lang.toUpperCase())}${unitsCount ? ` · своих уроков: ${unitsCount}` : ''}</div>
      </div>
      ${
        t.isCustom
          ? '<button type="button" class="btn-delete-item" title="Удалить зону" aria-label="Удалить зону">🗑</button>'
          : '<span class="badge-tag">Курс</span>'
      }
    `;
    card.querySelector('.btn-delete-item')?.addEventListener('click', () => {
      if (confirm(`Удалить зону «${t.title}» и все её уроки?`)) {
        state.deleteTrack(state.currentProfileId, t.id);
        renderTracksList();
        toast('Зона удалена');
      }
    });
    container.appendChild(card);
  });
}

/* ---------------------------------------------------------
   Тема
   --------------------------------------------------------- */
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f3f6fb');
  try {
    localStorage.setItem('lingua_theme', theme);
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------
   События
   --------------------------------------------------------- */
function initEventHandlers() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetMode = btn.dataset.mode;
      if (targetMode && targetMode !== state.activeMode) {
        audio.playClick();
        state.setMode(targetMode);
      }
    });
  });

  document.getElementById('profile-select')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    audio.playClick();
    state.setProfile(e.target.value);
  });

  document.getElementById('course-select')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    audio.playClick();
    state.setActiveTrack(e.target.value);
  });

  document.getElementById('unit-select')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    audio.playClick();
    renderUnitSelectAndLoad(e.target.value);
  });

  document.getElementById('btn-share')?.addEventListener('click', shareLesson);

  document.getElementById('btn-delete-unit')?.addEventListener('click', () => {
    const track = state.getActiveTrack();
    const unit = state.activeUnit;
    if (!track || !unit?.isCustom) return;
    if (confirm(`Удалить урок «${getUnitDisplayTitle(unit)}»?`)) {
      state.deleteCustomUnit(track.id, unit.id);
      toast('Урок удалён');
    }
  });

  const rateSelect = document.getElementById('audio-rate-select');
  if (rateSelect) {
    const current = String(audio.playbackRate);
    if (![...rateSelect.options].some((o) => o.value === current)) {
      rateSelect.insertAdjacentHTML('beforeend', `<option value="${current}">${current}×</option>`);
    }
    rateSelect.value = current;
    rateSelect.addEventListener('change', (e) => audio.setRate(parseFloat(e.target.value) || 1));
  }

  document.getElementById('btn-theme')?.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('btn-reset-progress')?.addEventListener('click', () => {
    const unit = state.activeUnit;
    if (!unit) return;
    if (confirm('Сбросить статистику и прогресс этого урока?')) {
      state.resetUnitStats(unit.id);
      toast('Прогресс урока сброшен');
    }
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettingsModal);
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettingsModal();
  });

  document.querySelectorAll('.modal-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab-pane-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  document.getElementById('form-create-profile')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('input-profile-name');
    const name = nameInput.value.trim();
    if (!name) return;
    audio.playSuccess();
    state.createProfile({ name, avatar: document.getElementById('select-profile-avatar').value });
    nameInput.value = '';
    renderProfilesList();
    renderTracksList();
    toast(`Профиль «${name}» создан`, 'success');
  });

  document.getElementById('form-create-track')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('input-track-title');
    const descInput = document.getElementById('input-track-desc');
    const title = titleInput.value.trim();
    if (!title) return;
    audio.playSuccess();
    const track = state.createTrack(state.currentProfileId, {
      lang: document.getElementById('input-track-lang').value,
      title,
      description: descInput.value.trim(),
    });
    state.setActiveTrack(track.id);
    titleInput.value = '';
    descInput.value = '';
    renderTracksList();
    toast(`Зона «${title}» создана и выбрана`, 'success');
  });
}

function subscribeToState() {
  state.subscribe((event, payload) => {
    switch (event) {
      case 'PROFILE_CHANGED':
      case 'PROFILES_UPDATED':
        renderProfileSelect();
        renderTrackSelect();
        renderUnitSelectAndLoad();
        break;

      case 'TRACK_CHANGED':
      case 'TRACKS_UPDATED':
        renderTrackSelect();
        renderUnitSelectAndLoad();
        break;

      case 'CUSTOM_UNIT_ADDED':
        renderTrackSelect();
        renderUnitSelectAndLoad(payload?.unit?.id);
        break;

      case 'UNIT_LOADED':
        renderLessonProgress();
        renderMotto();
        remountMode();
        syncUrl();
        break;

      case 'MODE_CHANGED':
        remountMode();
        syncUrl();
        break;

      case 'STATS_UPDATED':
        renderLessonProgress();
        break;

      default:
        break;
    }
  });
}

async function bootstrap() {
  initEventHandlers();
  subscribeToState();
  const route = readRoute();
  if (route.mode) state.activeMode = route.mode;
  highlightModeTab(state.activeMode);
  renderHints();

  try {
    const catalog = await catalogLoader.loadCatalog('data/catalog.json');
    state.initCatalogData(catalog, route);
    renderProfileSelect();
    renderTrackSelect();
    renderMotto();
    await renderUnitSelectAndLoad(route.unit || null);
  } catch (err) {
    const workspace = document.getElementById('app-workspace');
    if (workspace) {
      workspace.innerHTML = emptyState('⚠️', 'Не удалось загрузить каталог курсов', escapeHtml(err.message));
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
