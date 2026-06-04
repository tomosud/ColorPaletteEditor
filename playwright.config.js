const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:8099',
    headless: true,
  },
  webServer: {
    command: 'node scripts/dev-server.js',
    url: 'http://localhost:8099',
    reuseExistingServer: true,
  },
});
