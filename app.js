// ═══════════════════════════════════════════════════════
//  Color Palette Editor — app.js
// ═══════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────
const state = {
  formats: {},
  windows: [],
  activeWindow: null,
  selectedCells: [],   // [{win, row, col}]
  clipboard: null,     // [{row, col, color}]
  colorPicker: null,
  _pickerChanging: false,
  dragState: null,     // {win, startRow, startCol, baseSelection}
  db: null,
  dbReady: false,
};

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadFormats(), initDB()]);
  initColorPicker();
  initUI();
  initDrop();
  initDragSelection();
  await loadSavedPalettes();
  state.dbReady = true;
});

// ── IndexedDB ──────────────────────────────────────────
const DB_NAME = 'ColorPaletteEditor';
const DB_VER  = 1;
const STORE   = 'palettes';

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = e => { state.db = e.target.result; resolve(); };
    req.onerror   = e => { console.error('DB open failed', e); resolve(); };
  });
}

function dbSave(record) {
  if (!state.db) return;
  const tx = state.db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(record);
}

function dbDelete(id) {
  if (!state.db) return;
  const tx = state.db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
}

function dbLoadAll() {
  return new Promise((resolve) => {
    if (!state.db) return resolve([]);
    const tx  = state.db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => resolve([]);
  });
}

async function loadSavedPalettes() {
  const records = await dbLoadAll();
  for (const rec of records) {
    new PaletteWindow(rec.format, rec.pixels, {
      id:        rec.id,
      name:      rec.name,
      position:  rec.position,
      colLabels: rec.colLabels,
      memo:      rec.memo,
    });
  }
}

// ── UUID ───────────────────────────────────────────────
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Load Formats ───────────────────────────────────────
async function loadFormats() {
  const formatFiles = ['landscape.json', 'colorPalette16.json', 'leaves.json', 'grass.json'];
  const select = document.getElementById('format-select');
  for (const file of formatFiles) {
    try {
      const res = await fetch(`format/${file}`);
      if (!res.ok) continue;
      const fmt = await res.json();
      state.formats[fmt.name] = fmt;
      const opt = document.createElement('option');
      opt.value = fmt.name;
      opt.textContent = fmt.name;
      select.appendChild(opt);
    } catch (e) {
      console.warn('Failed to load format:', file, e);
    }
  }
}

// ── Color Picker ───────────────────────────────────────
function initColorPicker() {
  // Only Box — hue handled by custom slider
  state.colorPicker = new iro.ColorPicker('#iro-picker', {
    width: 200,
    color: '#808080',
    layout: [{ component: iro.ui.Box }],
  });

  // Snapshot before user starts dragging the SV box
  state.colorPicker.on('input:start', () => {
    if (state.selectedCells.length > 0 && state.activeWindow) {
      state.activeWindow._snapshotBefore();
    }
  });

  state.colorPicker.on('color:change', (color) => {
    if (state._pickerChanging) return;
    syncPickerToInputs(color);
    applyColorToSelected(colorToHex6(color));
  });

  // Hue range slider
  const hueSlider = document.getElementById('hue-slider');
  hueSlider.addEventListener('mousedown', () => {
    if (state.selectedCells.length > 0 && state.activeWindow)
      state.activeWindow._snapshotBefore();
  });
  hueSlider.addEventListener('input', () => {
    const h = parseInt(hueSlider.value);
    document.getElementById('hue-value').textContent = h;
    const { s, v } = state.colorPicker.color.hsv;
    state.colorPicker.color.set({ h, s, v });
  });

  // Text inputs — snapshot before applying
  const snapshotOnChange = (fn) => (...args) => {
    if (state.selectedCells.length > 0 && state.activeWindow)
      state.activeWindow._snapshotBefore();
    fn(...args);
  };

  document.getElementById('hex-input').addEventListener('change', snapshotOnChange(onHexInput));
  ['r-input', 'g-input', 'b-input'].forEach(id =>
    document.getElementById(id).addEventListener('change', snapshotOnChange(onRGBInput)));
  ['h-input', 's-input', 'v-input'].forEach(id =>
    document.getElementById(id).addEventListener('change', snapshotOnChange(onHSVInput)));

  document.getElementById('picker-close-btn').addEventListener('click', () => {
    document.getElementById('color-picker-panel').classList.add('hidden');
  });

  document.getElementById('copy-color-btn').addEventListener('click', copyColor);
  document.getElementById('paste-color-btn').addEventListener('click', pasteColor);
}

function syncPickerToInputs(color) {
  document.getElementById('hex-input').value = color.hexString;
  document.getElementById('r-input').value   = color.red;
  document.getElementById('g-input').value   = color.green;
  document.getElementById('b-input').value   = color.blue;
  const hsv = color.hsv;
  const h = Math.round(hsv.h);
  document.getElementById('h-input').value   = h;
  document.getElementById('s-input').value   = Math.round(hsv.s);
  document.getElementById('v-input').value   = Math.round(hsv.v);
  // Sync custom hue slider
  document.getElementById('hue-slider').value  = h;
  document.getElementById('hue-value').textContent = h;
}

function setPickerColor(hex6) {
  if (!hex6 || hex6.length < 7) return;
  state._pickerChanging = true;
  const r = parseInt(hex6.slice(1, 3), 16);
  const g = parseInt(hex6.slice(3, 5), 16);
  const b = parseInt(hex6.slice(5, 7), 16);
  state.colorPicker.color.set({ r, g, b });
  syncPickerToInputs(state.colorPicker.color);
  state._pickerChanging = false;
}

function colorToHex6(color) {
  return '#' +
    color.red  .toString(16).padStart(2, '0') +
    color.green.toString(16).padStart(2, '0') +
    color.blue .toString(16).padStart(2, '0');
}

function onHexInput(e) {
  let v = e.target.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    state._pickerChanging = false; // let change:event propagate
    state.colorPicker.color.hexString = v;
  }
}

function onRGBInput() {
  const r = clamp(parseInt(document.getElementById('r-input').value) || 0, 0, 255);
  const g = clamp(parseInt(document.getElementById('g-input').value) || 0, 0, 255);
  const b = clamp(parseInt(document.getElementById('b-input').value) || 0, 0, 255);
  state.colorPicker.color.set({ r, g, b });
}

function onHSVInput() {
  const h = clamp(parseInt(document.getElementById('h-input').value) || 0, 0, 360);
  const s = clamp(parseInt(document.getElementById('s-input').value) || 0, 0, 100);
  const v = clamp(parseInt(document.getElementById('v-input').value) || 0, 0, 100);
  state.colorPicker.color.set({ h, s, v });
}

function applyColorToSelected(hex6) {
  for (const { win, row, col } of state.selectedCells) {
    win.setColor(row, col, hex6);
  }
  scheduleSaveActive();
}

function showPickerForCells(cells) {
  if (cells.length === 0) return;
  document.getElementById('color-picker-panel').classList.remove('hidden');
  const { win, row, col } = cells[0];
  setPickerColor(win.getColor(row, col));
}

// ── Copy / Paste (Excel-style) ─────────────────────────
function copyColor() {
  if (state.selectedCells.length === 0) return;
  // Record relative positions from top-left anchor
  const rows = state.selectedCells.map(c => c.row);
  const cols = state.selectedCells.map(c => c.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  state.clipboard = state.selectedCells.map(({ win, row, col }) => ({
    dRow: row - minRow,
    dCol: col - minCol,
    color: win.getColor(row, col),
  }));
}

function pasteColor() {
  if (!state.clipboard || state.selectedCells.length === 0) return;
  const win = state.activeWindow || state.selectedCells[0].win;
  // Anchor = top-left of current selection
  const anchorRow = Math.min(...state.selectedCells.map(c => c.row));
  const anchorCol = Math.min(...state.selectedCells.map(c => c.col));

  win._snapshotBefore();
  for (const { dRow, dCol, color } of state.clipboard) {
    const r = anchorRow + dRow;
    const c = anchorCol + dCol;
    if (r >= 0 && r < win.format.height && c >= 0 && c < win.format.width) {
      win.setColor(r, c, color);
    }
  }
  if (state.clipboard.length > 0) setPickerColor(state.clipboard[0].color);
  win._save();
}

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.ctrlKey && e.key === 'c') { e.preventDefault(); copyColor(); }
  if (e.ctrlKey && e.key === 'v') { e.preventDefault(); pasteColor(); }
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); state.activeWindow?._undo(); }
});

// ── Drag Area Selection ────────────────────────────────
function initDragSelection() {
  document.addEventListener('mousemove', (e) => {
    if (!state.dragState) return;
    const el   = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.('.pixel-cell');
    if (!cell || !state.dragState.win.el.contains(cell)) return;

    const endRow = parseInt(cell.dataset.row);
    const endCol = parseInt(cell.dataset.col);
    const { win, startRow, startCol, baseSelection } = state.dragState;

    const rect = computeRectCells(win, startRow, startCol, endRow, endCol);
    const merged = mergeSelections(baseSelection, rect);
    applySelectionVisual(merged);
  });

  document.addEventListener('mouseup', () => {
    if (!state.dragState) return;
    state.dragState = null;
    if (state.selectedCells.length > 0) {
      showPickerForCells(state.selectedCells);
    } else {
      document.getElementById('color-picker-panel').classList.add('hidden');
    }
  });
}

function computeRectCells(win, r1, c1, r2, c2) {
  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
  const cells = [];
  for (let r = minR; r <= maxR; r++)
    for (let c = minC; c <= maxC; c++)
      cells.push({ win, row: r, col: c });
  return cells;
}

function mergeSelections(base, extra) {
  const merged = [...base];
  for (const cell of extra) {
    if (!merged.some(s => s.win === cell.win && s.row === cell.row && s.col === cell.col))
      merged.push(cell);
  }
  return merged;
}

function applySelectionVisual(cells) {
  // Clear all
  for (const w of state.windows)
    w.el.querySelectorAll('.pixel-cell.selected').forEach(c => c.classList.remove('selected'));
  // Apply
  state.selectedCells = cells;
  for (const { win, row, col } of cells) {
    const el = win.el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (el) el.classList.add('selected');
  }
}

// ── UI Init ────────────────────────────────────────────
let windowZBase = 10;

function initUI() {
  document.getElementById('new-palette-btn').addEventListener('click', () => {
    const name = document.getElementById('format-select').value;
    if (!name) { alert('Select a format first.'); return; }
    createPaletteWindow(state.formats[name]);
  });
}

// ── Palette Window ─────────────────────────────────────
class PaletteWindow {
  constructor(format, pixelData = null, opts = {}) {
    this.id        = opts.id   || generateId();
    this.name      = opts.name || format.name;
    this.format    = format;
    this.pixels    = pixelData || this._initPixels();
    this.colLabels = opts.colLabels || format.columns.map(c => c.label);
    this.memo      = opts.memo || '';
    this.el        = null;
    this._saveTimer = null;
    this._pastStack = [];   // undo history
    this._build(opts.position);
    state.windows.push(this);
    this._activate();
    this._save();
  }

  _initPixels() {
    return Array.from({ length: this.format.height }, () =>
      Array.from({ length: this.format.width }, () => '#808080')
    );
  }

  getColor(row, col) { return this.pixels[row]?.[col] ?? '#808080'; }

  setColor(row, col, hex6) {
    if (!this.pixels[row]) return;
    this.pixels[row][col] = hex6;
    const cell = this.el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.style.background = hex6;
  }

  // ── Undo ───────────────────────────────────────────
  _snapshotBefore() {
    this._pastStack.push(this.pixels.map(r => [...r]));
    if (this._pastStack.length > 50) this._pastStack.shift();
  }

  _undo() {
    if (this._pastStack.length === 0) return;
    this.pixels = this._pastStack.pop();
    // Refresh all cells visually
    for (let r = 0; r < this.format.height; r++)
      for (let c = 0; c < this.format.width; c++) {
        const cell = this.el.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (cell) cell.style.background = this.pixels[r][c] ?? '#808080';
      }
    // Update picker if selection still active
    if (state.selectedCells.some(s => s.win === this)) {
      const { row, col } = state.selectedCells.find(s => s.win === this);
      setPickerColor(this.getColor(row, col));
    }
    this._save();
  }

  _save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      dbSave({
        id:        this.id,
        name:      this.name,
        format:    this.format,
        pixels:    this.pixels,
        colLabels: this.colLabels,
        memo:      this.memo,
        position:  { top: parseInt(this.el.style.top), left: parseInt(this.el.style.left) },
      });
    }, 400);
  }

  _build(position) {
    const win = document.createElement('div');
    win.className = 'palette-window';
    win.id = this.id;
    const offset = state.windows.length * 30;
    win.style.top  = (position?.top  ?? 60 + offset) + 'px';
    win.style.left = (position?.left ?? 60 + offset) + 'px';
    this.el = win;

    // Titlebar
    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'window-name-input';
    nameInput.value = this.name;
    nameInput.addEventListener('change', () => {
      this.name = nameInput.value.trim() || this.format.name;
      nameInput.value = this.name;
      this._save();
    });
    // Prevent drag while editing name
    nameInput.addEventListener('mousedown', e => e.stopPropagation());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'window-close-btn';
    closeBtn.title = 'Close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    titlebar.appendChild(nameInput);
    titlebar.appendChild(closeBtn);
    makeDraggable(win, titlebar, () => this._save());
    win.appendChild(titlebar);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'window-toolbar';
    const dlBtn = document.createElement('button');
    dlBtn.textContent = 'Download PNG';
    dlBtn.addEventListener('click', () => this.downloadPng());
    toolbar.appendChild(dlBtn);
    win.appendChild(toolbar);

    // Grid
    const content = document.createElement('div');
    content.className = 'window-content';
    content.appendChild(this._buildGrid());
    win.appendChild(content);

    // Memo
    const memoArea = document.createElement('textarea');
    memoArea.className = 'window-memo';
    memoArea.placeholder = 'memo...';
    memoArea.value = this.memo;
    memoArea.addEventListener('mousedown', e => e.stopPropagation());
    memoArea.addEventListener('input', () => {
      this.memo = memoArea.value;
      this._save();
    });
    win.appendChild(memoArea);

    win.addEventListener('mousedown', () => this._activate());
    document.getElementById('workspace').appendChild(win);
  }

  _buildGrid() {
    const { format } = this;
    const hasColGroups = format.columns.some(c => c.segments?.length);
    const hasRowGroups = !!format.rowGroups;

    const table = document.createElement('table');
    table.className = 'grid-table';

    // ── Column headers ──
    if (hasColGroups) {
      // Row 1: group labels (with rowspan=2 corner)
      const groupRow = document.createElement('tr');
      groupRow.className = 'col-group-row';
      if (hasRowGroups) {
        const th = document.createElement('th');
        th.className = 'row-label-spacer row-group-spacer';
        th.rowSpan = 2;
        groupRow.appendChild(th);
      }
      const cornerTh = document.createElement('th');
      cornerTh.className = 'row-label-spacer';
      cornerTh.rowSpan = 2;
      groupRow.appendChild(cornerTh);
      for (let gi = 0; gi < format.columns.length; gi++) {
        const grp = format.columns[gi];
        const th = document.createElement('th');
        th.colSpan = grp.segments.length;
        th.textContent = grp.label;
        if (gi > 0) th.classList.add('group-divider');
        groupRow.appendChild(th);
      }
      table.appendChild(groupRow);

      // Row 2: segment labels (no leading cells, covered by rowspan)
      const segRow = document.createElement('tr');
      segRow.className = 'seg-row';
      for (let gi = 0; gi < format.columns.length; gi++) {
        const grp = format.columns[gi];
        for (let si = 0; si < grp.segments.length; si++) {
          const th = document.createElement('th');
          th.textContent = grp.segments[si].label;
          if (si === 0 && gi > 0) th.classList.add('group-divider');
          segRow.appendChild(th);
        }
      }
      table.appendChild(segRow);
    } else {
      // Simple single-row column labels
      const labelRow = document.createElement('tr');
      labelRow.className = 'col-group-row';
      if (hasRowGroups) {
        const th = document.createElement('th');
        th.className = 'row-label-spacer row-group-spacer';
        labelRow.appendChild(th);
      }
      const cornerTh = document.createElement('th');
      cornerTh.className = 'row-label-spacer';
      labelRow.appendChild(cornerTh);
      for (let ci = 0; ci < format.columns.length; ci++) {
        const col = format.columns[ci];
        const th = document.createElement('th');
        if (col.editable) {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'col-label-input';
          inp.value = this.colLabels[ci] ?? col.label;
          inp.addEventListener('mousedown', e => e.stopPropagation());
          const ci_ = ci;
          inp.addEventListener('change', () => {
            this.colLabels[ci_] = inp.value;
            this._save();
          });
          th.appendChild(inp);
        } else {
          th.textContent = this.colLabels[ci] ?? col.label;
        }
        labelRow.appendChild(th);
      }
      table.appendChild(labelRow);
    }

    // ── Data rows ──
    const colCount = format.width;
    let rowIndex = 0;

    const makeDataRow = (rowDef, isGroupFirst, groupRowspan) => {
      const tr = document.createElement('tr');

      if (hasRowGroups && isGroupFirst) {
        const td = document.createElement('td');
        td.className = 'row-group-label';
        td.rowSpan = groupRowspan;
        td.textContent = rowDef.groupLabel;
        tr.appendChild(td);
      }

      const labelTd = document.createElement('td');
      labelTd.className = 'row-label';
      labelTd.textContent = rowDef.label ?? `R${rowIndex}`;
      tr.appendChild(labelTd);

      for (let col = 0; col < colCount; col++) {
        const td = document.createElement('td');
        td.className = 'pixel-cell';
        td.dataset.row = rowIndex;
        td.dataset.col = col;
        td.style.background = this.pixels[rowIndex]?.[col] ?? '#808080';
        const _r = rowIndex, _c = col;
        td.addEventListener('mousedown', (e) => this._onCellMouseDown(e, _r, _c));
        tr.appendChild(td);
      }

      table.appendChild(tr);
      rowIndex++;
    };

    if (hasRowGroups) {
      for (const group of format.rowGroups) {
        for (let si = 0; si < group.rows.length; si++) {
          makeDataRow({ ...group.rows[si], groupLabel: group.label }, si === 0, group.rows.length);
        }
      }
    } else {
      for (const rowDef of format.rows) {
        makeDataRow(rowDef, false, 1);
      }
    }

    return table;
  }

  _onCellMouseDown(e, row, col) {
    e.preventDefault();
    this._activate();

    const isShift = e.shiftKey;
    const base = isShift ? [...state.selectedCells] : [];

    if (!isShift) {
      applySelectionVisual([]);
    }

    state.dragState = { win: this, startRow: row, startCol: col, baseSelection: base };

    // Apply initial 1×1 selection immediately
    const initial = mergeSelections(base, [{ win: this, row, col }]);
    applySelectionVisual(initial);
  }

  _activate() {
    for (const w of state.windows) w.el.classList.remove('active');
    this.el.classList.add('active');
    this.el.style.zIndex = ++windowZBase;
    state.activeWindow = this;
  }

  close() {
    if (!confirm(`"${this.name}" を閉じますか？`)) return;
    this.el.remove();
    state.windows.splice(state.windows.indexOf(this), 1);
    state.selectedCells = state.selectedCells.filter(c => c.win !== this);
    if (state.activeWindow === this) state.activeWindow = null;
    dbDelete(this.id);
  }

  // ── PNG export ───────────────────────────────────────
  downloadPng() {
    const { width, height } = this.format;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) {
        ctx.fillStyle = this.pixels[r][c] ?? '#808080';
        ctx.fillRect(c, r, 1, 1);
      }

    canvas.toBlob((blob) => {
      blob.arrayBuffer().then((buf) => {
        const meta = JSON.stringify({ id: this.id, name: this.name, format: this.format, pixels: this.pixels });
        const pngWithMeta = injectPngText(buf, 'CPE_DATA', meta);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pngWithMeta], { type: 'image/png' }));
        a.download = `${this.name}.png`;
        a.click();
      });
    }, 'image/png');
  }
}

function createPaletteWindow(format, pixelData = null, opts = {}) {
  return new PaletteWindow(format, pixelData, opts);
}

function scheduleSaveActive() {
  if (state.activeWindow) state.activeWindow._save();
}

// ── Draggable window ───────────────────────────────────
function makeDraggable(el, handle, onMoved) {
  let ox, oy;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button,input')) return;
    e.preventDefault();
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    const onMove = (e) => {
      el.style.left = (e.clientX - ox) + 'px';
      el.style.top  = (e.clientY - oy) + 'px';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMove);
      onMoved?.();
    }, { once: true });
  });
}

// ── Drop (PNG / JSON) ──────────────────────────────────
function initDrop() {
  const overlay = document.getElementById('drop-overlay');
  document.addEventListener('dragover', (e) => { e.preventDefault(); overlay.classList.add('active'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) overlay.classList.remove('active'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.name.endsWith('.json')) handleJsonDrop(file);
    else if (file.type === 'image/png' || file.name.endsWith('.png')) handlePngDrop(file);
  });
}

function handleJsonDrop(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.format && data.pixels) {
        createPaletteWindow(data.format, data.pixels, { id: data.id, name: data.name });
      } else if (data.name && data.width) {
        state.formats[data.name] = data;
        addFormatOption(data);
        createPaletteWindow(data);
      }
    } catch { alert('Invalid JSON.'); }
  };
  reader.readAsText(file);
}

function addFormatOption(fmt) {
  const select = document.getElementById('format-select');
  if ([...select.options].some(o => o.value === fmt.name)) return;
  const opt = document.createElement('option');
  opt.value = fmt.name; opt.textContent = fmt.name;
  select.appendChild(opt);
}

function handlePngDrop(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const json = extractPngText(e.target.result, 'CPE_DATA');
    if (!json) { alert('No palette data in this PNG.'); return; }
    try {
      const data = JSON.parse(json);
      createPaletteWindow(data.format, data.pixels, { id: data.id, name: data.name });
    } catch { alert('Failed to parse palette data.'); }
  };
  reader.readAsArrayBuffer(file);
}

// ── PNG tEXt chunk helpers ─────────────────────────────
function crc32(buf) {
  if (!crc32._t) {
    crc32._t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crc32._t[i] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crc32._t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function injectPngText(buf, keyword, text) {
  const src = new Uint8Array(buf);
  const enc = new TextEncoder();
  const kwB = enc.encode(keyword), txB = enc.encode(text);
  const data = new Uint8Array(kwB.length + 1 + txB.length);
  data.set(kwB); data[kwB.length] = 0; data.set(txB, kwB.length + 1);

  const typeBytes = enc.encode('tEXt');
  const forCrc   = new Uint8Array(typeBytes.length + data.length);
  forCrc.set(typeBytes); forCrc.set(data, typeBytes.length);
  const crc = crc32(forCrc);

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  new DataView(chunk.buffer).setUint32(8 + data.length, crc);

  let i = 8;
  while (i < src.length) {
    const len  = new DataView(src.buffer, src.byteOffset + i).getUint32(0);
    const type = String.fromCharCode(...src.slice(i + 4, i + 8));
    if (type === 'IDAT') {
      const out = new Uint8Array(src.length + chunk.length);
      out.set(src.slice(0, i)); out.set(chunk, i); out.set(src.slice(i), i + chunk.length);
      return out;
    }
    i += 12 + len;
  }
  return src;
}

function extractPngText(buf, keyword) {
  const src = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  const dec = new TextDecoder();
  let i = 8;
  while (i < src.length - 8) {
    const dv  = new DataView(src.buffer, src.byteOffset + i);
    const len  = dv.getUint32(0);
    const type = String.fromCharCode(...src.slice(i + 4, i + 8));
    if (type === 'tEXt') {
      const data    = src.slice(i + 8, i + 8 + len);
      const nullIdx = data.indexOf(0);
      if (nullIdx >= 0 && dec.decode(data.slice(0, nullIdx)) === keyword)
        return dec.decode(data.slice(nullIdx + 1));
    }
    i += 12 + len;
  }
  return null;
}

// ── Utilities ──────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
