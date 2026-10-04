export class CatalogLoader {
  constructor() {
    this.catalogData = null;
    this.unitCache = new Map();
  }

  async loadCatalog(url = 'data/catalog.json') {
    if (this.catalogData) return this.catalogData;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load catalog: ${res.statusText}`);
      }
      this.catalogData = await res.json();
      return this.catalogData;
    } catch (err) {
      console.error('[CatalogLoader Error]:', err);
      throw err;
    }
  }

  getUnitsForTrack(track, customUnits = []) {
    if (!track) return [];
    const units = [];

    // 1. Системные уроки из catalog.json (если трек связан с системным курсом)
    if (this.catalogData && track.lang && track.level) {
      const langData = this.catalogData.languages?.[track.lang];
      const levelData = langData?.levels?.[track.level];
      if (levelData?.units) {
        units.push(...levelData.units.map((u) => ({ ...u, isCustom: false })));
      }
    }

    // 2. Пользовательские уроки этой зоны
    if (Array.isArray(customUnits)) {
      units.push(...customUnits.map((u) => ({ ...u, isCustom: true })));
    }

    return units;
  }

  getUnitsForDomain(lang, level) {
    if (!this.catalogData) return [];
    const langData = this.catalogData.languages?.[lang];
    if (!langData) return [];
    const levelData = langData.levels?.[level];
    if (!levelData) return [];
    return levelData.units || [];
  }

  async loadUnit(unitRef) {
    // Если передан уже готовый объект урока (например, созданный пользователем)
    if (unitRef && typeof unitRef === 'object' && unitRef.id) {
      this.validateUnit(unitRef);
      return unitRef;
    }

    // Если передан путь к JSON-файлу
    if (this.unitCache.has(unitRef)) {
      return this.unitCache.get(unitRef);
    }

    try {
      const res = await fetch(unitRef);
      if (!res.ok) {
        throw new Error(`Failed to load unit from ${unitRef}: ${res.statusText}`);
      }
      const unit = await res.json();
      this.validateUnit(unit);
      this.unitCache.set(unitRef, unit);
      return unit;
    } catch (err) {
      console.error(`[Unit Load Error for ${unitRef}]:`, err);
      throw err;
    }
  }

  validateUnit(unit) {
    if (!unit.id || !unit.lang || !unit.title) {
      throw new Error('Invalid unit format: missing id, lang, or title');
    }
    return true;
  }
}

export const catalogLoader = new CatalogLoader();