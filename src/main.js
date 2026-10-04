import { state } from './core/state.js';
import { audio } from './core/audio.js';
import { catalogLoader } from './core/catalog.js';
import { mountPuzzle, destroyPuzzle } from './modes/puzzle.js';
import { mountSpeller, destroySpeller } from './modes/speller.js';
import { mountReader, destroyReader } from './modes/reader.js';
import { mountAnalyzer, destroyAnalyzer } from './modes/analyzer.js';

const MODE_HANDLERS = {
  puzzle: { mount: mountPuzzle, destroy: destroyPuzzle },
  speller: { mount: mountSpeller, destroy: destroySpeller },
  reader: { mount: mountReader, destroy: destroyReader },
  analyzer: { mount: mountAnalyzer, destroy: destroyAnalyzer },
};

let currentModeName = 'puzzle';

function updateStatsUI() {
  const correctEl = document.getElementById('stat-correct');
  const mistakesEl = document.getElementById('stat-mistakes');
  if (!state.activeUnit) {
    if (correctEl) correctEl.textContent = '0';
    if (mistakesEl) mistakesEl.textContent = '0';
    return;
  }
  const currentStats = state.getUnitStats(state.activeUnit.id);
  if (correctEl) correctEl.textContent = String(currentStats.correct || 0);
  if (mistakesEl) mistakesEl.textContent = String(currentStats.mistakes || 0);
}

function renderProfileSelect() {
  const select = document.getElementById('profile-select');
  if (!select) return;

  select.innerHTML = '';
  const profiles = state.getProfiles();
  profiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = `${profile.avatar} ${profile.name}`;
    if (profile.id === state.currentProfileId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function renderTrackSelect() {
  const trackSelect = document.getElementById('course-select');
  if (!trackSelect) return;

  trackSelect.innerHTML = '';
  const tracks = state.getTracks(state.currentProfileId);
  const activeTrack = state.getActiveTrack();

  if (!tracks.length) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Нет созданных зон';
    trackSelect.appendChild(emptyOpt);
    return;
  }

  tracks.forEach((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.title;
    if (activeTrack && activeTrack.id === track.id) {
      option.selected = true;
    }
    trackSelect.appendChild(option);
  });
}

async function renderUnitSelectAndLoad(targetUnitId = null) {
  const unitSelect = document.getElementById('unit-select');
  const workspace = document.getElementById('app-workspace');
  if (!unitSelect || !workspace) return;

  unitSelect.innerHTML = '';
  const activeTrack = state.getActiveTrack();
  if (!activeTrack) {
    unitSelect.innerHTML = '<option value="">Нет активного трека</option>';
    unitSelect.disabled = true;
    return;
  }

  const customUnits = state.getCustomUnits(activeTrack.id);
  const units = catalogLoader.getUnitsForTrack(activeTrack, customUnits);

  if (!units.length) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'В треке нет уроков';
    unitSelect.appendChild(emptyOpt);
    unitSelect.disabled = true;

    workspace.innerHTML = `
      <div class="exercise-wrapper" style="text-align: center; padding: 40px 20px;">
        <h3 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">В этой учебной зоне пока пусто</h3>
        <p style="color: #64748b; font-size: 0.9rem; max-width: 460px; margin: 0 auto 16px;">
          Вы можете разобрать любой текст во вкладке <strong>«Текст-лаборатория»</strong> и сохранить его сюда как отдельный урок.
        </p>
      </div>
    `;
    return;
  }

  unitSelect.disabled = false;
  units.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = (u.isCustom ? '★ ' : '') + (u.title || u.name);
    unitSelect.appendChild(opt);
  });

  const selectedUnitMeta = units.find((u) => u.id === targetUnitId) || units[0];

  if (selectedUnitMeta) {
    unitSelect.value = selectedUnitMeta.id;
    try {
      workspace.innerHTML = `
        <div class="loading-placeholder">
          <div class="spinner"></div>
          <p>Загрузка модуля ${(selectedUnitMeta.title || selectedUnitMeta.name)}...</p>
        </div>
      `;
      const unitData = await catalogLoader.loadUnit(selectedUnitMeta.file || selectedUnitMeta);
      state.setActiveUnit(unitData);
    } catch (err) {
      workspace.innerHTML = `
        <div class="feedback-banner show error" style="margin-top: 40px;">
          Ошибка загрузки файла урока: ${err.message}
        </div>
      `;
    }
  }
}

/* Управление окном настроек (Модалка) */
function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  renderProfilesList();
  renderTracksList();
  modal.hidden = false;
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
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <div class="item-name">${p.avatar} ${p.name}</div>
        <div class="item-desc">${p.isCustom ? 'Пользовательский' : 'Предустановленный'}</div>
      </div>
      ${
        p.isCustom && profiles.length > 1
          ? `<button type="button" class="btn-delete-item" data-id="${p.id}" title="Удалить профиль">🗑</button>`
          : '<span class="badge-tag">Основной</span>'
      }
    `;

    card.querySelector('.btn-delete-item')?.addEventListener('click', () => {
      if (confirm(`Удалить профиль "${p.name}"?`)) {
        state.deleteProfile(p.id);
        renderProfilesList();
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
    container.innerHTML = '<div style="color: #64748b; font-size: 0.85rem;">Зон пока нет</div>';
    return;
  }

  tracks.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <div class="item-name">${t.title}</div>
        <div class="item-desc">${t.description || t.lang.toUpperCase()}</div>
      </div>
      ${
        t.isCustom
          ? `<button type="button" class="btn-delete-item" data-id="${t.id}" title="Удалить трек">🗑</button>`
          : '<span class="badge-tag">Курс</span>'
      }
    `;

    card.querySelector('.btn-delete-item')?.addEventListener('click', () => {
      if (confirm(`Удалить зону "${t.title}" и все её уроки?`)) {
        state.deleteTrack(state.currentProfileId, t.id);
        renderTracksList();
      }
    });

    container.appendChild(card);
  });
}

function mountCurrentMode() {
  const workspace = document.getElementById('app-workspace');
  if (!workspace) return;

  const mode = state.activeMode || 'puzzle';
  currentModeName = mode;

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    if (btn.dataset.mode === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (!state.activeUnit && mode !== 'analyzer') {
    return;
  }

  const handler = MODE_HANDLERS[mode];
  if (handler) {
    workspace.innerHTML = '';
    handler.mount(workspace, state.activeUnit);
  }
}

function destroyCurrentMode() {
  const handler = MODE_HANDLERS[currentModeName];
  if (handler) {
    handler.destroy();
  }
}

function initEventHandlers() {
  // Навигация режимов
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetMode = btn.dataset.mode;
      if (targetMode && targetMode !== state.activeMode) {
        audio.playClick();
        state.setMode(targetMode);
      }
    });
  });

  // Смена профиля через Select
  document.getElementById('profile-select')?.addEventListener('change', (e) => {
    const profileId = e.target.value;
    if (!profileId) return;
    audio.playClick();
    state.setProfile(profileId);
  });

  // Смена трека (зоны)
  document.getElementById('course-select')?.addEventListener('change', (e) => {
    const trackId = e.target.value;
    if (!trackId) return;
    audio.playClick();
    state.setActiveTrack(trackId);
  });

  // Смена урока
  document.getElementById('unit-select')?.addEventListener('change', (e) => {
    const unitId = e.target.value;
    if (!unitId) return;
    audio.playClick();
    renderUnitSelectAndLoad(unitId);
  });

  // Скорость воспроизведения
  document.getElementById('audio-rate-select')?.addEventListener('change', (e) => {
    const rate = parseFloat(e.target.value) || 1.0;
    audio.setRate(rate);
  });

  // Модалка настроек
  document.getElementById('btn-open-settings')?.addEventListener('click', openSettingsModal);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettingsModal);
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettingsModal();
  });

  // Вкладки в настройках
  document.querySelectorAll('.modal-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.modal-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-pane-${targetTab}`)?.classList.add('active');
    });
  });

  // Создание профиля
  document.getElementById('form-create-profile')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('input-profile-name');
    const avatarSelect = document.getElementById('select-profile-avatar');
    const name = nameInput.value.trim();
    const avatar = avatarSelect.value;
    if (!name) return;
    audio.playSuccess();
    state.createProfile({ name, avatar });
    nameInput.value = '';
    renderProfilesList();
  });

  // Создание трека (зоны)
  document.getElementById('form-create-track')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const langSelect = document.getElementById('input-track-lang');
    const titleInput = document.getElementById('input-track-title');
    const descInput = document.getElementById('input-track-desc');
    const title = titleInput.value.trim();
    if (!title) return;
    audio.playSuccess();
    state.createTrack(state.currentProfileId, {
      lang: langSelect.value,
      title,
      description: descInput.value.trim(),
    });
    titleInput.value = '';
    descInput.value = '';
    renderTracksList();
  });
}

function subscribeToState() {
  state.subscribe((event) => {
    switch (event) {
      case 'PROFILE_CHANGED':
      case 'PROFILES_UPDATED':
        renderProfileSelect();
        renderTrackSelect();
        renderUnitSelectAndLoad();
        break;

      case 'TRACK_CHANGED':
      case 'TRACKS_UPDATED':
      case 'CUSTOM_UNIT_ADDED':
        renderTrackSelect();
        renderUnitSelectAndLoad();
        break;

      case 'UNIT_LOADED':
        updateStatsUI();
        destroyCurrentMode();
        mountCurrentMode();
        break;

      case 'MODE_CHANGED':
        destroyCurrentMode();
        mountCurrentMode();
        break;

      case 'STATS_UPDATED':
        updateStatsUI();
        break;
    }
  });
}

async function bootstrap() {
  initEventHandlers();
  subscribeToState();

  try {
    const catalog = await catalogLoader.loadCatalog('data/catalog.json');
    state.initCatalogData(catalog);

    renderProfileSelect();
    renderTrackSelect();
    await renderUnitSelectAndLoad();
  } catch (err) {
    const workspace = document.getElementById('app-workspace');
    if (workspace) {
      workspace.innerHTML = `
        <div class="feedback-banner show error" style="margin-top: 40px;">
          Критическая ошибка инициализации каталога: ${err.message}
        </div>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);