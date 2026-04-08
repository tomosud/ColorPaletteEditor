// ═══════════════════════════════════════════════════════
//  Color Palette Editor — app.js
// ═══════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────
const state = {
  formats: {},          // name → format object
  windows: [],          // list of PaletteWindow instances
  activeWindow: null,
  selectedCells: [],    // [{win, row, col}]
  clipboard: null,      // [{row, col, color}]
  colorPicker: null,    // iro.ColorPicker instance
  pickerTarget: null,   // current cells being edited
};

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFormats();
  initColorPicker();
  initUI();
  initDrop();
});

// ── Load Formats ───────────────────────────────────────
async function loadFormats() {
  const formatFiles = ['landscape.json'];
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
  state.colorPicker = new iro.ColorPicker('#iro-picker', {
    width: 200,
    color: '#808080',
    layout: [
      { component: iro.ui.Box },
      { component: iro.ui.Slider, options: { sliderType: 'hue' } },
      { component: iro.ui.Slider, options: { sliderType: 'alpha' } },
    ],
  });

  // Single named handler — never removed/re-added
  state._pickerChanging = false;
  state.colorPicker.on('color:change', (color) => {
    if (state._pickerChanging) return;
    syncPickerToInputs(color);
    applyColorToSelected(colorToHex8(color));
  });

  document.getElementById('hex-input').addEventListener('change', onHexInput);
  document.getElementById('r-input').addEventListener('change', onRGBInput);
  document.getElementById('g-input').addEventListener('change', onRGBInput);
  document.getElementById('b-input').addEventListener('change', onRGBInput);
  document.getElementById('a-input').addEventListener('change', onRGBInput);

  document.getElementById('picker-close-btn').addEventListener('click', () => {
    document.getElementById('color-picker-panel').classList.add('hidden');
  });

  document.getElementById('copy-color-btn').addEventListener('click', copyColor);
  document.getElementById('paste-color-btn').addEventListener('click', pasteColor);
}

// Read hex8 from iro color safely
function colorToHex8(color) {
  const r = color.red.toString(16).padStart(2, '0');
  const g = color.green.toString(16).padStart(2, '0');
  const b = color.blue.toString(16).padStart(2, '0');
  const a = Math.round(color.alpha * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}${a}`;
}

// Set iro color from hex8 string without triggering applyColorToSelected
function setPickerColor(hex8) {
  state._pickerChanging = true;
  const rgba = hex8ToRgba(hex8);
  state.colorPicker.color.set({ r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a / 255 });
  syncPickerToInputs(state.colorPicker.color);
  state._pickerChanging = false;
}

function syncPickerToInputs(color) {
  document.getElementById('hex-input').value = color.hexString;
  document.getElementById('r-input').value = color.red;
  document.getElementById('g-input').value = color.green;
  document.getElementById('b-input').value = color.blue;
  document.getElementById('a-input').value = Math.round(color.alpha * 255);
}

function onHexInput(e) {
  let v = e.target.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    state.colorPicker.color.hexString = v;
  }
}

function onRGBInput() {
  const r = parseInt(document.getElementById('r-input').value) || 0;
  const g = parseInt(document.getElementById('g-input').value) || 0;
  const b = parseInt(document.getElementById('b-input').value) || 0;
  const a = parseInt(document.getElementById('a-input').value);
  const alpha = isNaN(a) ? 1 : a / 255;
  state.colorPicker.color.set({ r, g, b, a: alpha });
}

function applyColorToSelected(hex8) {
  for (const { win, row, col } of state.selectedCells) {
    win.setColor(row, col, hex8);
  }
}

function showPickerForCells(cells) {
  state.pickerTarget = cells;
  const panel = document.getElementById('color-picker-panel');
  panel.classList.remove('hidden');

  if (cells.length > 0) {
    const { win, row, col } = cells[0];
    setPickerColor(win.getColor(row, col));
  }
}

// ── Copy / Paste ───────────────────────────────────────
function copyColor() {
  if (state.selectedCells.length === 0) return;
  state.clipboard = state.selectedCells.map(({ win, row, col }) => ({
    row, col, color: win.getColor(row, col),
  }));
}

function pasteColor() {
  if (!state.clipboard || state.selectedCells.length === 0) return;
  const src = state.clipboard[0].color;
  for (const { win, row, col } of state.selectedCells) {
    win.setColor(row, col, src);
    win.refreshCell(row, col);
  }
  if (state.selectedCells.length > 0) {
    setPickerColor(src);
  }
}

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'c') copyColor();
  if (e.ctrlKey && e.key === 'v') pasteColor();
});

// ── UI Init ────────────────────────────────────────────
function initUI() {
  document.getElementById('new-palette-btn').addEventListener('click', () => {
    const name = document.getElementById('format-select').value;
    if (!name) { alert('Select a format first.'); return; }
    createPaletteWindow(state.formats[name]);
  });
}

// ── Palette Window ─────────────────────────────────────
let windowZBase = 10;

class PaletteWindow {
  constructor(format, pixelData = null) {
    this.format = format;
    this.id = `win-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // pixelData: array[row][col] = '#rrggbbaa'
    this.pixels = pixelData || this._initPixels();
    this.el = null;
    this._build();
    state.windows.push(this);
    this._activate();
  }

  _initPixels() {
    const { height, width } = this.format;
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => '#808080ff')
    );
  }

  getColor(row, col) { return this.pixels[row][col]; }

  setColor(row, col, hex8) {
    this.pixels[row][col] = hex8;
    this.refreshCell(row, col);
  }

  refreshCell(row, col) {
    const cell = this.el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.style.background = hex8ToCSS(this.pixels[row][col]);
  }

  _build() {
    const win = document.createElement('div');
    win.className = 'palette-window';
    win.id = this.id;
    win.style.top = (60 + state.windows.length * 30) + 'px';
    win.style.left = (60 + state.windows.length * 30) + 'px';
    this.el = win;

    // Titlebar
    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    titlebar.innerHTML = `
      <span class="window-title">${this.format.name}</span>
      <button class="window-close-btn" title="Close">✕</button>
    `;
    titlebar.querySelector('.window-close-btn').addEventListener('click', () => this.close());
    makeDraggable(win, titlebar);
    win.appendChild(titlebar);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'window-toolbar';
    toolbar.innerHTML = `<button class="dl-btn">Download PNG</button>`;
    toolbar.querySelector('.dl-btn').addEventListener('click', () => this.downloadPng());
    win.appendChild(toolbar);

    // Content
    const content = document.createElement('div');
    content.className = 'window-content';
    content.appendChild(this._buildGrid());
    win.appendChild(content);

    win.addEventListener('mousedown', () => this._activate());
    document.getElementById('workspace').appendChild(win);
  }

  _buildGrid() {
    const { format } = this;
    const table = document.createElement('table');
    table.className = 'grid-table';

    // ── Row 1: column group labels ──
    const colGroupRow = document.createElement('tr');
    colGroupRow.className = 'col-group-row';
    // corner
    const corner = document.createElement('th');
    corner.className = 'row-label-spacer';
    colGroupRow.appendChild(corner);

    for (let gi = 0; gi < format.columns.length; gi++) {
      const grp = format.columns[gi];
      const th = document.createElement('th');
      th.colSpan = grp.segments.length;
      th.textContent = grp.label;
      if (gi > 0) th.classList.add('group-divider');
      colGroupRow.appendChild(th);
    }
    table.appendChild(colGroupRow);

    // ── Row 2: segment labels ──
    const segRow = document.createElement('tr');
    segRow.className = 'seg-row';
    const segCorner = document.createElement('th');
    segRow.appendChild(segCorner);

    let colIndex = 0;
    for (let gi = 0; gi < format.columns.length; gi++) {
      const grp = format.columns[gi];
      for (let si = 0; si < grp.segments.length; si++) {
        const th = document.createElement('th');
        th.textContent = grp.segments[si].label;
        if (si === 0 && gi > 0) th.classList.add('group-divider');
        segRow.appendChild(th);
        colIndex++;
      }
    }
    table.appendChild(segRow);

    // ── Data rows ──
    for (let row = 0; row < format.height; row++) {
      const tr = document.createElement('tr');
      const rowLabel = document.createElement('td');
      rowLabel.className = 'row-label';
      rowLabel.textContent = format.rows[row]?.label ?? `R${row}`;
      tr.appendChild(rowLabel);

      let col = 0;
      for (let gi = 0; gi < format.columns.length; gi++) {
        const grp = format.columns[gi];
        for (let si = 0; si < grp.segments.length; si++) {
          const td = document.createElement('td');
          td.className = 'pixel-cell';
          if (si === 0 && gi > 0) td.classList.add('group-divider');
          td.dataset.row = row;
          td.dataset.col = col;
          td.style.background = hex8ToCSS(this.pixels[row][col]);
          // Capture col by value — `col` is a shared variable that changes each iteration
          const _col = col;
          td.addEventListener('mousedown', (e) => this._onCellClick(e, row, _col));
          tr.appendChild(td);
          col++;
        }
      }
      table.appendChild(tr);
    }

    return table;
  }

  _onCellClick(e, row, col) {
    this._activate();
    const isShift = e.shiftKey;

    if (!isShift) {
      // deselect all other windows' cells
      for (const w of state.windows) w._clearSelection();
      state.selectedCells = [];
    }

    // toggle this cell
    const existing = state.selectedCells.findIndex(c => c.win === this && c.row === row && c.col === col);
    if (existing >= 0) {
      state.selectedCells.splice(existing, 1);
      this._setCellSelected(row, col, false);
    } else {
      state.selectedCells.push({ win: this, row, col });
      this._setCellSelected(row, col, true);
    }

    if (state.selectedCells.length > 0) {
      showPickerForCells(state.selectedCells);
    } else {
      document.getElementById('color-picker-panel').classList.add('hidden');
    }
  }

  _setCellSelected(row, col, sel) {
    const cell = this.el.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.toggle('selected', sel);
  }

  _clearSelection() {
    this.el.querySelectorAll('.pixel-cell.selected').forEach(c => c.classList.remove('selected'));
  }

  _activate() {
    for (const w of state.windows) w.el.classList.remove('active');
    this.el.classList.add('active');
    this.el.style.zIndex = ++windowZBase;
    state.activeWindow = this;
  }

  close() {
    this.el.remove();
    const idx = state.windows.indexOf(this);
    if (idx >= 0) state.windows.splice(idx, 1);
    state.selectedCells = state.selectedCells.filter(c => c.win !== this);
    if (state.activeWindow === this) state.activeWindow = null;
  }

  // ── PNG export ───────────────────────────────────────
  downloadPng() {
    const { width, height } = this.format;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        ctx.fillStyle = hex8ToCSS(this.pixels[r][c]);
        ctx.fillRect(c, r, 1, 1);
      }
    }

    canvas.toBlob((blob) => {
      blob.arrayBuffer().then((buf) => {
        const metadata = JSON.stringify({
          format: this.format,
          pixels: this.pixels,
        });
        const pngWithMeta = injectPngText(buf, 'CPE_DATA', metadata);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pngWithMeta], { type: 'image/png' }));
        a.download = `${this.format.name}.png`;
        a.click();
      });
    }, 'image/png');
  }
}

function createPaletteWindow(format, pixelData = null) {
  return new PaletteWindow(format, pixelData);
}

// ── Draggable ──────────────────────────────────────────
function makeDraggable(el, handle) {
  let ox, oy;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
  function onMove(e) {
    el.style.left = (e.clientX - ox) + 'px';
    el.style.top = (e.clientY - oy) + 'px';
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
  }
}

// ── Drop (PNG / JSON) ─────────────────────────────────
function initDrop() {
  const workspace = document.getElementById('workspace');
  const overlay = document.getElementById('drop-overlay');

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    overlay.classList.add('active');
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) overlay.classList.remove('active');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.name.endsWith('.json')) {
      handleJsonDrop(file);
    } else if (file.name.endsWith('.png') || file.type === 'image/png') {
      handlePngDrop(file);
    }
  });
}

function handleJsonDrop(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.format && data.pixels) {
        createPaletteWindow(data.format, data.pixels);
      } else if (data.name && data.width) {
        // it's a format definition
        state.formats[data.name] = data;
        addFormatOption(data);
        createPaletteWindow(data);
      }
    } catch {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

function addFormatOption(fmt) {
  const select = document.getElementById('format-select');
  if ([...select.options].some(o => o.value === fmt.name)) return;
  const opt = document.createElement('option');
  opt.value = fmt.name;
  opt.textContent = fmt.name;
  select.appendChild(opt);
}

function handlePngDrop(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const buf = e.target.result;
    const json = extractPngText(buf, 'CPE_DATA');
    if (!json) { alert('No palette data found in this PNG.'); return; }
    try {
      const data = JSON.parse(json);
      createPaletteWindow(data.format, data.pixels);
    } catch {
      alert('Failed to parse palette data from PNG.');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── PNG tEXt chunk helpers ─────────────────────────────
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function injectPngText(buf, keyword, text) {
  const src = new Uint8Array(buf);
  const enc = new TextEncoder();
  const kwBytes = enc.encode(keyword);
  const txtBytes = enc.encode(text);
  // chunk data: keyword + null + text
  const chunkData = new Uint8Array(kwBytes.length + 1 + txtBytes.length);
  chunkData.set(kwBytes);
  chunkData[kwBytes.length] = 0;
  chunkData.set(txtBytes, kwBytes.length + 1);

  const chunkType = enc.encode('tEXt');
  const chunkFull = new Uint8Array(chunkType.length + chunkData.length);
  chunkFull.set(chunkType);
  chunkFull.set(chunkData, chunkType.length);
  const crc = crc32(chunkFull);

  // Build tEXt chunk bytes
  const chunk = new Uint8Array(4 + 4 + chunkData.length + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, chunkData.length);
  chunk.set(chunkType, 4);
  chunk.set(chunkData, 8);
  dv.setUint32(8 + chunkData.length, crc);

  // Find IDAT offset and inject before it
  let i = 8; // skip PNG signature
  while (i < src.length) {
    const len = new DataView(src.buffer, src.byteOffset + i).getUint32(0);
    const type = String.fromCharCode(...src.slice(i + 4, i + 8));
    if (type === 'IDAT') {
      // inject here
      const out = new Uint8Array(src.length + chunk.length);
      out.set(src.slice(0, i));
      out.set(chunk, i);
      out.set(src.slice(i), i + chunk.length);
      return out;
    }
    i += 4 + 4 + len + 4;
  }
  return src; // fallback: unchanged
}

function extractPngText(buf, keyword) {
  const src = new Uint8Array(buf);
  const dec = new TextDecoder();
  let i = 8;
  while (i < src.length - 8) {
    const dv = new DataView(src.buffer, src.byteOffset + i);
    const len = dv.getUint32(0);
    const type = String.fromCharCode(...src.slice(i + 4, i + 8));
    if (type === 'tEXt') {
      const data = src.slice(i + 8, i + 8 + len);
      const nullIdx = data.indexOf(0);
      if (nullIdx < 0) { i += 12 + len; continue; }
      const kw = dec.decode(data.slice(0, nullIdx));
      if (kw === keyword) {
        return dec.decode(data.slice(nullIdx + 1));
      }
    }
    i += 12 + len;
  }
  return null;
}

// ── Utilities ──────────────────────────────────────────
function hex8ToRgba(hex8) {
  if (!hex8 || hex8.length < 7) return { r: 128, g: 128, b: 128, a: 255 };
  const r = parseInt(hex8.slice(1, 3), 16);
  const g = parseInt(hex8.slice(3, 5), 16);
  const b = parseInt(hex8.slice(5, 7), 16);
  const a = hex8.length >= 9 ? parseInt(hex8.slice(7, 9), 16) : 255;
  return { r, g, b, a };
}

function hex8ToCSS(hex8) {
  const { r, g, b, a } = hex8ToRgba(hex8);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}
