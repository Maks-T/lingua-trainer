const STORAGE_KEYS = {
  PROFILE: 'lingua_profile',
  PROFILES_CUSTOM: 'lingua_profiles_custom',
  TRACKS_CUSTOM: 'lingua_tracks_custom',
  CUSTOM_UNITS: 'lingua_custom_units',
  ACTIVE_TRACK: 'lingua_active_track',
  STATS: 'lingua_stats',
};

class StateManager {
  constructor() {
    this.subscribers = new Set();
    this.catalogProfiles = [];
    this.languages = {};
    this.customProfiles = this._loadJson(STORAGE_KEYS.PROFILES_CUSTOM, []);
    this.customTracks = this._loadJson(STORAGE_KEYS.TRACKS_CUSTOM, {});
    this.customUnits = this._loadJson(STORAGE_KEYS.CUSTOM_UNITS, {});
    this.stats = this._loadJson(STORAGE_KEYS.STATS, {});

    this.currentProfileId = localStorage.getItem(STORAGE_KEYS.PROFILE) || 'dad';
    this.activeTrackId = null;
    this.activeMode = 'puzzle'; // 'puzzle' | 'speller' | 'reader' | 'analyzer'
    this.activeUnit = null;
    this.activeDomain = { lang: 'de', level: 'a1' };
  }

  _loadJson(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  _saveJson(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  initCatalogData(catalog) {
    this.catalogProfiles = catalog.profiles || [];
    this.languages = catalog.languages || {};

    const allProfiles = this.getProfiles();
    const profileExists = allProfiles.some((p) => p.id === this.currentProfileId);
    if (!profileExists && allProfiles.length > 0) {
      this.currentProfileId = allProfiles[0].id;
    }

    // Восстанавливаем сохраненный трек для профиля
    const savedTrackId = localStorage.getItem(`${STORAGE_KEYS.ACTIVE_TRACK}_${this.currentProfileId}`);
    const tracks = this.getTracks(this.currentProfileId);
    const track = tracks.find((t) => t.id === savedTrackId) || tracks[0];
    if (track) {
      this.activeTrackId = track.id;
      this.activeDomain = { lang: track.lang, level: track.level || 'custom', trackId: track.id };
    }

    this.notify('CATALOG_INITIALIZED');
  }

  getProfiles() {
    return [...this.catalogProfiles, ...this.customProfiles];
  }

  getProfile(id = this.currentProfileId) {
    return this.getProfiles().find((p) => p.id === id) || null;
  }

  createProfile({ name, avatar }) {
    const cleanName = (name || '').trim() || 'Новый ученик';
    const profileId = `profile_${Date.now()}`;
    const newProfile = {
      id: profileId,
      name: cleanName,
      avatar: (avatar || '').trim() || '👤',
      isCustom: true,
    };

    this.customProfiles.push(newProfile);
    this._saveJson(STORAGE_KEYS.PROFILES_CUSTOM, this.customProfiles);

    // Автоматически создаем начальный трек для нового профиля
    const initialTrack = {
      id: `track_${profileId}_de_init`,
      profileId,
      lang: 'de',
      level: 'a1',
      title: 'Немецкий: Стартовый трек',
      description: 'Базовый трек обучения',
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    this.customTracks[profileId] = [initialTrack];
    this._saveJson(STORAGE_KEYS.TRACKS_CUSTOM, this.customTracks);

    this.setProfile(profileId);
    this.notify('PROFILES_UPDATED');
    return newProfile;
  }

  deleteProfile(profileId) {
    const all = this.getProfiles();
    if (all.length <= 1) return false;

    this.customProfiles = this.customProfiles.filter((p) => p.id !== profileId);
    this._saveJson(STORAGE_KEYS.PROFILES_CUSTOM, this.customProfiles);
    delete this.customTracks[profileId];
    this._saveJson(STORAGE_KEYS.TRACKS_CUSTOM, this.customTracks);

    if (this.currentProfileId === profileId) {
      const remaining = this.getProfiles();
      this.setProfile(remaining[0].id);
    } else {
      this.notify('PROFILES_UPDATED');
    }
    return true;
  }

  setProfile(profileId) {
    this.currentProfileId = profileId;
    localStorage.setItem(STORAGE_KEYS.PROFILE, profileId);

    const tracks = this.getTracks(profileId);
    const savedTrackId = localStorage.getItem(`${STORAGE_KEYS.ACTIVE_TRACK}_${profileId}`);
    const track = tracks.find((t) => t.id === savedTrackId) || tracks[0] || null;

    if (track) {
      this.activeTrackId = track.id;
      this.activeDomain = { lang: track.lang, level: track.level || 'custom', trackId: track.id };
    } else {
      this.activeTrackId = null;
    }

    this.activeUnit = null;
    this.notify('PROFILE_CHANGED', { profileId, track: this.getActiveTrack() });
  }

  getTracks(profileId = this.currentProfileId) {
    const tracks = [];
    // Системные треки из catalog.json
    const catProfile = this.catalogProfiles.find((p) => p.id === profileId);
    if (catProfile && Array.isArray(catProfile.courses)) {
      catProfile.courses.forEach((c) => {
        const langMeta = this.languages[c.lang];
        const levelMeta = langMeta?.levels?.[c.level];
        tracks.push({
          id: `${profileId}_sys_${c.lang}_${c.level}`,
          profileId,
          lang: c.lang,
          level: c.level,
          title: `${langMeta?.flag || '🌐'} ${langMeta?.name || c.lang.toUpperCase()} (${levelMeta?.title || c.level.toUpperCase()})`,
          description: 'Системный академический курс',
          isCustom: false,
        });
      });
    }
    // Пользовательские изолированные треки
    const userTracks = this.customTracks[profileId] || [];
    return [...tracks, ...userTracks];
  }

  getActiveTrack() {
    const tracks = this.getTracks(this.currentProfileId);
    return tracks.find((t) => t.id === this.activeTrackId) || tracks[0] || null;
  }

  setActiveTrack(trackId) {
    this.activeTrackId = trackId;
    localStorage.setItem(`${STORAGE_KEYS.ACTIVE_TRACK}_${this.currentProfileId}`, trackId);
    const track = this.getActiveTrack();
    if (track) {
      this.activeDomain = { lang: track.lang, level: track.level || 'custom', trackId: track.id };
    }
    this.activeUnit = null;
    this.notify('TRACK_CHANGED', track);
  }

  createTrack(profileId, { lang, title, description }) {
    if (!this.customTracks[profileId]) {
      this.customTracks[profileId] = [];
    }
    const track = {
      id: `track_${profileId}_${Date.now()}`,
      profileId,
      lang: lang || 'de',
      title: (title || '').trim() || 'Новая учебная зона',
      description: (description || '').trim(),
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    this.customTracks[profileId].push(track);
    this._saveJson(STORAGE_KEYS.TRACKS_CUSTOM, this.customTracks);
    this.notify('TRACKS_UPDATED', track);
    return track;
  }

  deleteTrack(profileId, trackId) {
    if (!this.customTracks[profileId]) return false;
    this.customTracks[profileId] = this.customTracks[profileId].filter((t) => t.id !== trackId);
    this._saveJson(STORAGE_KEYS.TRACKS_CUSTOM, this.customTracks);
    delete this.customUnits[trackId];
    this._saveJson(STORAGE_KEYS.CUSTOM_UNITS, this.customUnits);

    if (this.activeTrackId === trackId) {
      const tracks = this.getTracks(profileId);
      this.setActiveTrack(tracks[0]?.id || null);
    } else {
      this.notify('TRACKS_UPDATED');
    }
    return true;
  }

  addCustomUnit(trackId, unitData) {
    if (!this.customUnits[trackId]) {
      this.customUnits[trackId] = [];
    }
    const unit = {
      ...unitData,
      id: unitData.id || `custom_unit_${Date.now()}`,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    this.customUnits[trackId].push(unit);
    this._saveJson(STORAGE_KEYS.CUSTOM_UNITS, this.customUnits);
    this.notify('CUSTOM_UNIT_ADDED', { trackId, unit });
    return unit;
  }

  getCustomUnits(trackId) {
    return this.customUnits[trackId] || [];
  }

  setMode(mode) {
    if (this.activeMode === mode) return;
    this.activeMode = mode;
    this.notify('MODE_CHANGED', mode);
  }

  setActiveUnit(unit) {
    this.activeUnit = unit;
    this.notify('UNIT_LOADED', unit);
  }

  recordAnswer(unitId, isCorrect) {
    if (!unitId) return;
    const profileId = this.currentProfileId;
    if (!this.stats[profileId]) {
      this.stats[profileId] = {};
    }
    if (!this.stats[profileId][unitId]) {
      this.stats[profileId][unitId] = { correct: 0, mistakes: 0, lastStudied: null };
    }

    const unitStat = this.stats[profileId][unitId];
    if (isCorrect) {
      unitStat.correct += 1;
    } else {
      unitStat.mistakes += 1;
    }
    unitStat.lastStudied = new Date().toISOString();
    this._saveJson(STORAGE_KEYS.STATS, this.stats);
    this.notify('STATS_UPDATED', { unitId, stat: unitStat });
  }

  getUnitStats(unitId) {
    return this.stats[this.currentProfileId]?.[unitId] || { correct: 0, mistakes: 0 };
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  notify(event, payload = null) {
    for (const listener of this.subscribers) {
      listener(event, payload, this);
    }
  }
}

export const state = new StateManager();