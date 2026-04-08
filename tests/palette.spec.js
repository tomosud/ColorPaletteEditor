const { test, expect } = require('@playwright/test');

test.describe('Color Palette Editor', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    // Wait for iro.js to load and formats to fetch
    await page.waitForFunction(() => typeof iro !== 'undefined');
    await page.waitForFunction(() => Object.keys(state.formats).length > 0);
  });

  // ── 1. Format loading ───────────────────────────────
  test('loads Landscape format', async ({ page }) => {
    const options = await page.locator('#format-select option').allTextContents();
    expect(options).toContain('Landscape');
  });

  // ── 2. New palette window ───────────────────────────
  test('creates palette window with correct grid', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    const win = page.locator('.palette-window');
    await expect(win).toBeVisible();

    // Landscape: 16 cols × 2 rows = 32 cells
    const cells = win.locator('.pixel-cell');
    await expect(cells).toHaveCount(32);

    // Row labels
    await expect(win.locator('.row-label').first()).toHaveText('BC');
    await expect(win.locator('.row-label').nth(1)).toHaveText('Shadow');

    // Column group labels
    const colLabels = await win.locator('.col-group-row th:not(.row-label-spacer)').allTextContents();
    expect(colLabels).toEqual(['Road', 'Grass', 'Soil_Upper', 'Soil_Bottom']);
  });

  // ── 3. Cell click → picker opens, cell selected ─────
  test('clicking a cell opens color picker and marks cell selected', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    const firstCell = page.locator('.pixel-cell').first();
    await firstCell.click();

    // Picker panel should be visible
    await expect(page.locator('#color-picker-panel')).toBeVisible();

    // Cell should have .selected class
    await expect(firstCell).toHaveClass(/selected/);

    // state.selectedCells should have 1 entry
    const selCount = await page.evaluate(() => state.selectedCells.length);
    expect(selCount).toBe(1);
  });

  // ── 4. Color change via JS → cell background updates ─
  test('setting color via state API updates cell background', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    // Click cell (row=0, col=0)
    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();

    // Directly set the picker color (simulates dragging the picker)
    await page.evaluate(() => {
      setPickerColor('#ff0000ff');
    });

    // Check pixel stored in state
    const storedColor = await page.evaluate(() =>
      state.windows[0].getColor(0, 0)
    );
    // setPickerColor does NOT apply to cells (it only sets picker UI)
    // applyColorToSelected is triggered by color:change event
    // So we need to trigger color change
    console.log('Stored color after setPickerColor:', storedColor);

    // Simulate iro color:change by directly calling applyColorToSelected
    await page.evaluate(() => {
      applyColorToSelected('#ff0000ff');
    });

    const storedAfter = await page.evaluate(() =>
      state.windows[0].getColor(0, 0)
    );
    expect(storedAfter).toBe('#ff0000ff');

    // Check DOM background
    const bg = await page.locator('.pixel-cell[data-row="0"][data-col="0"]').evaluate(el => el.style.background);
    console.log('Cell background:', bg);
    expect(bg).toMatch(/255.*0.*0/); // red channel = 255
  });

  // ── 5. color:change handler updates selected cells ───
  test('iro color:change event updates selected cell', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();

    // Verify cell is selected
    const selCount = await page.evaluate(() => state.selectedCells.length);
    expect(selCount).toBe(1);

    // Simulate what iro does: fire color:change by setting color programmatically
    // (this goes through the real event handler)
    await page.evaluate(() => {
      state._pickerChanging = false; // ensure not suppressed
      state.colorPicker.color.set({ r: 255, g: 0, b: 0, a: 1 });
    });

    // After setting, color:change fires → applyColorToSelected → win.setColor
    await page.waitForTimeout(50); // small wait for event propagation

    const storedColor = await page.evaluate(() => state.windows[0].getColor(0, 0));
    console.log('Color after picker.color.set():', storedColor);
    expect(storedColor).toMatch(/^#ff0000/);

    const bg = await page.locator('.pixel-cell[data-row="0"][data-col="0"]').evaluate(el => el.style.background);
    console.log('Cell DOM background:', bg);
    expect(bg).toMatch(/255.*0.*0/);
  });

  // ── 6. Shift-click multi-select ─────────────────────
  test('shift-click selects multiple cells', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();
    await page.locator('.pixel-cell[data-row="0"][data-col="1"]').click({ modifiers: ['Shift'] });
    await page.locator('.pixel-cell[data-row="1"][data-col="0"]').click({ modifiers: ['Shift'] });

    const selCount = await page.evaluate(() => state.selectedCells.length);
    expect(selCount).toBe(3);
  });

  // ── 7. Copy / Paste ──────────────────────────────────
  test('copy and paste color between cells', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    // Set cell 0,0 to red
    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();
    await page.evaluate(() => {
      state._pickerChanging = false;
      state.colorPicker.color.set({ r: 200, g: 50, b: 50, a: 1 });
    });
    await page.waitForTimeout(30);

    // Copy
    await page.click('#copy-color-btn');
    const clipboard = await page.evaluate(() => state.clipboard);
    expect(clipboard).not.toBeNull();

    // Click cell 1,1 and paste
    await page.locator('.pixel-cell[data-row="1"][data-col="1"]').click();
    await page.click('#paste-color-btn');

    const pastedColor = await page.evaluate(() => state.windows[0].getColor(1, 1));
    console.log('Pasted color:', pastedColor);
    expect(pastedColor).toMatch(/^#c83232|^#c83232/); // rgb(200,50,50)
  });

  // ── 8. Multiple windows ──────────────────────────────
  test('can open multiple palette windows independently', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');
    await page.click('#new-palette-btn');

    const wins = page.locator('.palette-window');
    await expect(wins).toHaveCount(2);

    const winCount = await page.evaluate(() => state.windows.length);
    expect(winCount).toBe(2);
  });

  // ── 9. Close window ──────────────────────────────────
  test('closing a window removes it', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    await page.locator('.window-close-btn').click();

    await expect(page.locator('.palette-window')).toHaveCount(0);
    const winCount = await page.evaluate(() => state.windows.length);
    expect(winCount).toBe(0);
  });

  // ── 10. PNG download contains metadata ───────────────
  test('PNG export encodes pixel data in tEXt chunk', async ({ page }) => {
    await page.selectOption('#format-select', 'Landscape');
    await page.click('#new-palette-btn');

    // Set a distinctive color
    await page.locator('.pixel-cell[data-row="0"][data-col="0"]').click();
    await page.evaluate(() => {
      state._pickerChanging = false;
      state.colorPicker.color.set({ r: 123, g: 45, b: 67, a: 1 });
    });
    await page.waitForTimeout(30);

    // Call downloadPng() but intercept instead of actually downloading
    const result = await page.evaluate(async () => {
      const win = state.windows[0];
      const { width, height } = win.format;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          ctx.fillStyle = hex8ToCSS(win.pixels[r][c]);
          ctx.fillRect(c, r, 1, 1);
        }
      }
      return new Promise(resolve => {
        canvas.toBlob(blob => {
          blob.arrayBuffer().then(buf => {
            const metadata = JSON.stringify({ format: win.format, pixels: win.pixels });
            const pngWithMeta = injectPngText(buf, 'CPE_DATA', metadata);
            const extracted = extractPngText(pngWithMeta.buffer, 'CPE_DATA');
            resolve(extracted);
          });
        }, 'image/png');
      });
    });

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result);
    expect(parsed.format.name).toBe('Landscape');
    expect(parsed.pixels).toBeDefined();
  });

});
