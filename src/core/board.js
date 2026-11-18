/**
 * Доска «банк фишек → зона сборки» для пазла и спеллера.
 * Поддерживает клик, перетаскивание мышью (HTML5 DnD) и перестановку внутри зоны.
 */
import { audio } from './audio.js';

export function createBoard({ zoneEl, bankEl, items, chipClass = () => '', placeholderHtml = '', slots = 0, onChange = () => {} }) {
  let bank = [...items];
  let selected = [];
  let locked = false;
  let dragInfo = null; // { id, from: 'bank' | 'zone' }

  const findIndex = (list, id) => list.findIndex((i) => i.id === id);

  function moveToZone(id, beforeId = null) {
    const fromBank = findIndex(bank, id);
    let item;
    if (fromBank !== -1) {
      [item] = bank.splice(fromBank, 1);
    } else {
      const fromZone = findIndex(selected, id);
      if (fromZone === -1) return;
      [item] = selected.splice(fromZone, 1);
    }
    const insertAt = beforeId ? findIndex(selected, beforeId) : -1;
    if (insertAt === -1) selected.push(item);
    else selected.splice(insertAt, 0, item);
    render();
    onChange();
  }

  function moveToBank(id) {
    const idx = findIndex(selected, id);
    if (idx === -1) return;
    const [item] = selected.splice(idx, 1);
    bank.push(item);
    render();
    onChange();
  }

  function makeChip(item, where) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip ${chipClass(item)}${locked ? ' locked' : ''}`;
    chip.textContent = item.text;
    chip.dataset.id = item.id;
    if (locked) {
      chip.tabIndex = -1;
      return chip;
    }
    chip.draggable = true;
    chip.addEventListener('click', () => {
      audio.playClick();
      if (where === 'bank') moveToZone(item.id);
      else moveToBank(item.id);
    });
    chip.addEventListener('dragstart', (e) => {
      dragInfo = { id: item.id, from: where };
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      zoneEl.classList.remove('drag-over');
      dragInfo = null;
    });
    return chip;
  }

  function render() {
    zoneEl.innerHTML = '';
    zoneEl.classList.toggle('is-empty', selected.length === 0 && !slots);
    if (!selected.length && placeholderHtml && !slots) {
      zoneEl.innerHTML = placeholderHtml;
    }
    selected.forEach((item) => zoneEl.appendChild(makeChip(item, 'zone')));
    for (let i = selected.length; i < slots; i += 1) {
      const slot = document.createElement('span');
      slot.className = 'chip letter locked';
      slot.style.opacity = '0.35';
      slot.style.borderStyle = 'dashed';
      slot.innerHTML = '&nbsp;';
      zoneEl.appendChild(slot);
    }

    bankEl.innerHTML = '';
    bank.forEach((item) => bankEl.appendChild(makeChip(item, 'bank')));
  }

  // Приём перетаскивания в зону сборки
  zoneEl.addEventListener('dragover', (e) => {
    if (locked || !dragInfo) return;
    e.preventDefault();
    zoneEl.classList.add('drag-over');
  });
  zoneEl.addEventListener('dragleave', (e) => {
    if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('drag-over');
  });
  zoneEl.addEventListener('drop', (e) => {
    if (locked || !dragInfo) return;
    e.preventDefault();
    zoneEl.classList.remove('drag-over');
    const overChip = e.target.closest?.('.chip[data-id]');
    const beforeId = overChip && overChip.dataset.id !== dragInfo.id ? overChip.dataset.id : null;
    audio.playClick();
    moveToZone(dragInfo.id, beforeId);
  });

  // Возврат в банк перетаскиванием
  bankEl.addEventListener('dragover', (e) => {
    if (locked || dragInfo?.from !== 'zone') return;
    e.preventDefault();
  });
  bankEl.addEventListener('drop', (e) => {
    if (locked || dragInfo?.from !== 'zone') return;
    e.preventDefault();
    audio.playClick();
    moveToBank(dragInfo.id);
  });

  render();

  return {
    get selected() {
      return selected;
    },
    get bank() {
      return bank;
    },
    /** Переносит из банка первую фишку с данным текстом (для ввода с клавиатуры). */
    takeByText(text) {
      if (locked) return false;
      const lower = text.toLowerCase();
      const item = bank.find((i) => i.text.toLowerCase() === lower);
      if (!item) return false;
      audio.playClick();
      moveToZone(item.id);
      return true;
    },
    pop() {
      if (locked || !selected.length) return;
      audio.playClick();
      moveToBank(selected[selected.length - 1].id);
    },
    clear() {
      if (locked || !selected.length) return;
      audio.playClick();
      bank = [...bank, ...selected];
      selected = [];
      render();
      onChange();
    },
    lock() {
      locked = true;
      render();
    },
    setZoneState(type) {
      zoneEl.classList.remove('state-success', 'state-error');
      if (type) zoneEl.classList.add(`state-${type}`);
    },
  };
}
