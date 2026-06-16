// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'tests', '.auth', 'session.json');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests'),
  testMatch: '**/*.spec.js',

  // Jalankan berurutan sesuai nama file (01, 02, dst)
  fullyParallel: false,
  workers: 1,

  timeout: 30000,
  expect: { timeout: 10000 },

  // Global setup: reset & seed database testing SEBELUM semua test berjalan
  globalSetup: require.resolve('./tests/global-setup.js'),

  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    headless: false,
    slowMo: 200,
  },

  // ── WebServer: START server baru dengan DB facultyware_test ──────────────────
  // PENTING: Pastikan dev server sudah di-STOP sebelum menjalankan test ini,
  // karena reuseExistingServer: false akan error jika port 3000 sudah dipakai.
  webServer: {
    command: 'node bin/www',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 30000,
    // Override semua env vars — dotenv tidak akan menimpa yang sudah ada di process.env
    env: {
      DB_HOST: 'localhost',
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'facultyware_test',
      PORT: '3000',
      SESSION_SECRET: 'facultyware-a14-testing',
      NODE_ENV: 'test',
    },
  },

  projects: [
    // ── Setup: Login & simpan session (tanpa storageState awal) ──
    {
      name: 'setup',
      testMatch: '**/01-auth.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        slowMo: 200,
      },
    },

    // ── Test utama: gunakan session yang sudah tersimpan ──
    {
      name: 'facultyware',
      testMatch: [
        '**/02-projects.spec.js',
        '**/03-committees.spec.js',
        '**/04-budgets.spec.js',
        '**/05-tasks.spec.js',
        '**/06-expenses.spec.js',
        '**/07-progress.spec.js',
        '**/08-laporan-progress.spec.js',
      ],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        slowMo: 200,
        storageState: SESSION_FILE,
      },
    },
  ],
});
