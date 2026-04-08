const { test, expect } = require('@playwright/test');

test.describe('Color Palette Editor', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof iro !== 'undefined');
    await page.waitForFunction(() => state.dbReady === true, { timeout: 10000 });
  });

  // ── 1. Format loading ───────────────────────────────
  test('loads formats', async ({ page }) => {
    const options = await page.locator('#format-select option').allTextContents();
    expect(options).toContain('Landscape');
    expect(options).toContain('colorPalette16');
    expect(options).toContain('Leaves');
    expect(options).toContain('Grass');
  });

  // ── 2. New palette window ───────────────────────────
  test('creates Landscape window with 32 cells', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    const win = page.locator('.palette-window');
    await expect(win).toBeVisible();
    await expect(win.locator('.pixel-cell')).toHaveCount(32);

    // Row labels
    await expect(win.locator('.row-label').first()).toHaveText('BC');
    await expect(win.locator('.row-label').nth(1)).toHaveText('Shadow');

    // Col group labels
    const colLabels = await win.locator('.col-group-row th:not(.row-label-spacer)').allTextContents();
    expect(colLabels).toEqual(['Road', 'Grass', 'Soil_Upper', 'Soil_Bottom']);
  });

  // ── 3. colorPalette16 row groups ───────────────────
  test('colorPalette16 has row groups and 128 cells', async ({ page }) => {
    await page.selectOption('#format-select', 'colorPalette16');
    await page.click('#new-palette-btn');

    const win = page.locator('.palette-window');
    await expect(win.locator('.pixel-cell')).toHaveCount(128); // 16 cols × 8 rows

    const groupLabels = await win.locator('.row-group-label').allTextContents();
    expect(groupLabels).toEqual(['Spring', 'Summer', 'Autumn', 'Winter']);
  });

  // ── 4. Cell click → picker opens, cell selected ────
  test('clicking a cell opens picker and selects it', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();

    await expect(page.locator('#color-picker-panel')).toBeVisible();
    await expect(page.locator('.pixel-cell[data-row="0"][data-col="0"]')).toHaveClass(/selected/);

    const selCount = await page.evaluate(() => state.selectedCells.length);
    expect(selCount).toBe(1);
  });

  // ── 5. iro color:change updates selected cell ───────
  test('iro color:change updates selected cell', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();

    await page.evaluate(() => {
      state._pickerChanging = false;
      state.colorPicker.color.set({ r: 255, g: 0, b: 0 });
    });
    await page.waitForTimeout(50);

    const stored = await page.evaluate(() => state.windows[0].getColor(0, 0));
    expect(stored).toMatch(/^#ff0000/);

    const bg = await page.locator('.pixel-cell[data-row="0"][data-col="0"]').evaluate(el => el.style.background);
    expect(bg).toMatch(/255.*0.*0/);
  });

  // ── 6. Area drag selection ──────────────────────────
  test('drag selects a rectangle of cells', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    // Simulate drag from (0,0) to (1,2) via mousedown + mousemove + mouseup
    const cell00 = page.locator('.pixel-cell[data-row="0"][data-col="0"]');
    const cell12 = page.locator('.pixel-cell[data-row="1"][data-col="2"]');
    const box00  = await cell00.boundingBox();
    const box12  = await cell12.boundingBox();

    await page.mouse.move(box00.x + 5, box00.y + 5);
    await page.mouse.down();
    await page.mouse.move(box12.x + 5, box12.y + 5);
    await page.mouse.up();

    const selCount = await page.evaluate(() => state.selectedCells.length);
    expect(selCount).toBe(6); // 2 rows × 3 cols
  });

  // ── 7. Shift-click adds to selection ───────────────
  test('shift-click adds cells to selection', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();
    await page.locator('.pixel-cell[data-row="0"][data-col="1"]').click({ modifiers: ['Shift'] });
    await page.locator('.pixel-cell[data-row="1"][data-col="0"]').click({ modifiers: ['Shift'] });

    const selCount = await page.evaluate(() => state.selectedCells.length);
    expect(selCount).toBe(3);
  });

  // ── 8. Copy / Paste ─────────────────────────────────
  test('copy and paste color', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();
    await page.evaluate(() => {
      state._pickerChanging = false;
      state.colorPicker.color.set({ r: 200, g: 50, b: 50 });
    });
    await page.waitForTimeout(30);

    await page.click('#copy-color-btn');

    await page.locator('.pixel-cell[data-row="1"][data-col="1"]').click();
    await page.click('#paste-color-btn');

    const pasted = await page.evaluate(() => state.windows[0].getColor(1, 1));
    expect(pasted).toMatch(/^#c83232/);
  });

  // ── 9. Custom window name ───────────────────────────
  test('window name is editable', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    const nameInput = page.locator('.window-name-input').first();
    await expect(nameInput).toHaveValue('Landscape');

    await nameInput.fill('MyPalette');
    await nameInput.press('Enter');
    await page.waitForTimeout(500); // debounce

    const name = await page.evaluate(() => state.windows[0].name);
    expect(name).toBe('MyPalette');
  });

  // ── 10. IndexedDB persistence ───────────────────────
  test('palette persists after reload', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    // Set a distinctive color
    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();
    await page.evaluate(() => {
      state._pickerChanging = false;
      state.colorPicker.color.set({ r: 42, g: 137, b: 200 });
    });
    await page.waitForTimeout(600); // wait for debounced save

    // Reload
    await page.reload();
    await page.waitForFunction(() => state.dbReady === true, { timeout: 10000 });

    // Window should be restored
    const winCount = await page.evaluate(() => state.windows.length);
    expect(winCount).toBeGreaterThan(0);

    const color = await page.evaluate(() => state.windows[0].getColor(0, 0));
    expect(color).toMatch(/^#2a89c8/);
  });

  // ── 11. Multiple windows ─────────────────────────────
  test('multiple windows are independent', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');
    await page.click('#new-palette-btn');

    await expect(page.locator('.palette-window')).toHaveCount(2);
    expect(await page.evaluate(() => state.windows.length)).toBe(2);
  });

  // ── 12. Close window ────────────────────────────────
  test('closing a window removes it from DB', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');
    const id = await page.evaluate(() => state.windows[0].id);

    await page.locator('.window-close-btn').click();
    await expect(page.locator('.palette-window')).toHaveCount(0);

    // Reload - window should not come back
    await page.reload();
    await page.waitForFunction(() => state.dbReady === true, { timeout: 10000 });
    expect(await page.evaluate(() => state.windows.length)).toBe(0);
  });

  // ── 13. PNG export with metadata ───────────────────
  test('PNG export contains CPE_DATA chunk', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    const result = await page.evaluate(async () => {
      const win = state.windows[0];
      const { width, height } = win.format;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      for (let r = 0; r < height; r++)
        for (let c = 0; c < width; c++) {
          ctx.fillStyle = win.pixels[r][c] ?? '#808080';
          ctx.fillRect(c, r, 1, 1);
        }
      return new Promise(resolve => {
        canvas.toBlob(blob => {
          blob.arrayBuffer().then(buf => {
            const meta = JSON.stringify({ id: win.id, name: win.name, format: win.format, pixels: win.pixels });
            const png  = injectPngText(buf, 'CPE_DATA', meta);
            resolve(extractPngText(png.buffer, 'CPE_DATA'));
          });
        }, 'image/png');
      });
    });

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result);
    expect(parsed.format.name).toBe('Landscape');
    expect(parsed.id).toBeTruthy();
    expect(parsed.name).toBeTruthy();
  });

  // ── 14. HSV inputs sync ─────────────────────────────
  test('HSV inputs are synced when picker changes', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');
    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();

    // Set a known color
    await page.evaluate(() => {
      state._pickerChanging = false;
      state.colorPicker.color.set({ h: 120, s: 100, v: 50 }); // pure green half-value
    });
    await page.waitForTimeout(50);

    const h = await page.locator('#h-input').inputValue();
    const s = await page.locator('#s-input').inputValue();
    const v = await page.locator('#v-input').inputValue();
    expect(parseInt(h)).toBeCloseTo(120, -1);
    expect(parseInt(s)).toBe(100);
    expect(parseInt(v)).toBe(50);
  });

});
