import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://127.0.0.1:4173',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    // The interface follows the browser language; the suite reads the Chinese source text unless a test asks for English.
    locale: 'zh-TW',
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'https://127.0.0.1:4173', ignoreHTTPSErrors: true, reuseExistingServer: !process.env.CI, timeout: 120000 },
    { command: 'node scripts/serve-test.mjs', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI, timeout: 30000 },
  ],
});
