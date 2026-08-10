import { defineConfig, devices } from '@playwright/test';

const desktopOnly = process.env.CHARON_DESKTOP_ONLY_E2E === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  grepInvert: desktopOnly ? /site / : undefined,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 800, height: 600 } },
    },
  ],
  webServer: [
    {
      command: 'bun run dev',
      cwd: '.',
      port: 1420,
      reuseExistingServer: true,
    },
    ...(desktopOnly
      ? []
      : [
          {
            command: 'bun run build && bun run preview -- --host 127.0.0.1 --port 4321',
            cwd: '../site',
            port: 4321,
            reuseExistingServer: true,
          },
        ]),
  ],
});
