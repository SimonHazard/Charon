/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tauriConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
);
const tauriBootstrap = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
const tauriBuildScript = readFileSync(resolve(process.cwd(), 'src-tauri/build.rs'), 'utf8');
const shellAdapter = readFileSync(resolve(process.cwd(), 'src-tauri/src/ipc/shell.rs'), 'utf8');
const cargoManifest = readFileSync(resolve(process.cwd(), 'src-tauri/Cargo.toml'), 'utf8');
const notificationAdapter = readFileSync(
  resolve(process.cwd(), 'src-tauri/src/ipc/notification.rs'),
  'utf8',
);
const captureAdapter = readFileSync(resolve(process.cwd(), 'src-tauri/src/ipc/capture.rs'), 'utf8');
const desktopPackage = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const mainCapability = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/main.json'), 'utf8'),
);

const csp =
  "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";

describe('desktop window contract', () => {
  it('opens the compact first-run shelf without restricting restored window sizes', () => {
    const [mainWindow] = tauriConfig.app.windows;

    expect(mainWindow).toMatchObject({
      label: 'main',
      width: 480,
      height: 720,
      minWidth: 400,
      minHeight: 480,
      resizable: true,
      fullscreen: false,
    });
    expect(mainWindow.maxWidth).toBeUndefined();
    expect(mainWindow.maxHeight).toBeUndefined();
  });

  it('restores only saved size, position, and maximized state', () => {
    const plugin = tauriBootstrap.match(
      /\.plugin\(\s*tauri_plugin_window_state::Builder::default\(\)([\s\S]*?)\.build\(\),?\s*\)/u,
    )?.[1];

    expect(plugin).toBeDefined();
    expect(plugin).toContain('.with_state_flags(');
    expect(
      [...(plugin ?? '').matchAll(/StateFlags::(\w+)/gu)].map((match) => match[1]).sort(),
    ).toEqual(['MAXIMIZED', 'POSITION', 'SIZE']);
    expect(tauriBootstrap).not.toContain('StateFlags::VISIBLE');
  });

  it('creates the main window hidden and always shows it once its state is restored', () => {
    const [mainWindow] = tauriConfig.app.windows;
    const setup = tauriBootstrap.match(/\.setup\(\|app\| \{([\s\S]*?)\n {8}\}\)/u)?.[1] ?? '';
    const firstStatement = setup
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('//'));

    expect(mainWindow.visible).toBe(false);
    // Shown before any other setup work: a failed show fails setup instead of
    // leaving Charon running without a visible window.
    expect(firstStatement).toBe('reveal_main(app.handle())?;');
    expect(tauriBootstrap).toMatch(
      /fn reveal_main<R: tauri::Runtime>\(app: &tauri::AppHandle<R>\) -> tauri::Result<\(\)> \{\s*if let Some\(window\) = app\.get_webview_window\("main"\) \{\s*let _ = window\.unminimize\(\);\s*window\.show\(\)\?;/u,
    );
    expect(tauriBootstrap).toMatch(
      /tauri_plugin_single_instance::init\(\|app, _args, _cwd\| \{\s*let _ = reveal_main\(app\);/u,
    );
  });

  it('hides instead of closing on macOS, reopens from the Dock, and stops capture on exit', () => {
    const closeToHide = tauriBootstrap.match(
      /if let tauri::WindowEvent::CloseRequested \{ api, \.\. \} = event \{([\s\S]*?)\n {12}\}/u,
    )?.[1];

    // Closing hides only when the shell says so: always on macOS, elsewhere only while the
    // background-mode tray icon exists (ADR 0023).
    expect(closeToHide).toMatch(
      /window\.label\(\) == "main"\s*&& ipc::shell::close_hides\(window\.app_handle\(\)\)\s*&& window\.hide\(\)\.is_ok\(\)/u,
    );
    expect(closeToHide).toContain('api.prevent_close();');
    expect(shellAdapter).toContain(
      'hides_on_close(cfg!(target_os = "macos"), background_active(app))',
    );
    expect(shellAdapter).toMatch(
      /fn hides_on_close\(is_macos: bool, background_active: bool\) -> bool \{\s*is_macos \|\| background_active\s*\}/u,
    );
    expect(tauriBootstrap).toMatch(
      /#\[cfg\(target_os = "macos"\)\]\s*if matches!\(event, tauri::RunEvent::Reopen \{ \.\. \}\) \{\s*let _ = reveal_main\(app\);/u,
    );
    expect(tauriBootstrap).toMatch(
      /if matches!\(event, tauri::RunEvent::Exit\) \{\s*ipc::capture::shutdown\(app\);/u,
    );
    expect(tauriBootstrap).toMatch(
      /matches!\(event, tauri::WindowEvent::Destroyed\) \{\s*ipc::capture::shutdown\(window\.app_handle\(\)\);/u,
    );
  });

  it('never makes the capture worker wait for the main thread that quits', () => {
    // Window getters wait for the main thread, which joins the capture worker on quit: the
    // worker reads the focus that `WindowEvent::Focused` recorded instead.
    expect(tauriBootstrap).toMatch(
      /if let tauri::WindowEvent::Focused\(focused\) = event \{\s*if window\.label\(\) == "main" \{\s*ipc::shell::set_main_focused\(window\.app_handle\(\), \*focused\);/u,
    );
    for (const adapter of [captureAdapter, notificationAdapter]) {
      expect(adapter).not.toMatch(/\.is_(focused|visible|minimized|maximized)\(\)/u);
      expect(adapter).toContain('super::shell::main_focused(app)');
    }
    // Quitting waits for a capture in progress only for a bounded time.
    expect(captureAdapter).toContain('const SHUTDOWN_WAIT: Duration = Duration::from_secs(2);');
    expect(captureAdapter).not.toMatch(/\.send\(CaptureWorkerMessage::Stop\)/u);
  });

  it('routes Cmd+Q on macOS through the draft-safe quit request', () => {
    // Tauri's default macOS Quit terminates at once; Charon replaces only that item.
    expect(tauriBootstrap).toMatch(
      /#\[cfg\(target_os = "macos"\)\]\s*let builder = builder\s*\.menu\(ipc::shell::app_menu\)\s*\.on_menu_event\(\|app, event\| ipc::shell::handle_app_menu_event\(app, &event\)\);/u,
    );
    expect(shellAdapter).toMatch(
      /MenuItem::with_id\(app, APP_MENU_QUIT, &title, true, Some\("CmdOrCtrl\+Q"\)\)/u,
    );
    expect(shellAdapter).toMatch(
      /if event\.id\(\) == APP_MENU_QUIT \{\s*tray::request_quit\(app\);/u,
    );
    // No exit is ever prevented: the guard runs before Charon asks to exit.
    expect(tauriBootstrap).not.toContain('prevent_exit');
  });

  it('builds the background-mode tray from Rust on macOS and Windows only', () => {
    const tauriDependency = cargoManifest.match(/^\[dependencies\][\s\S]*?^tauri = (.*)$/mu)?.[1];
    const trayTarget = cargoManifest.match(
      /^\[target\.'cfg\(any\(target_os = "macos", target_os = "windows"\)\)'\.dependencies\]\ntauri = (.*)$/mu,
    )?.[1];

    // Linux never compiles Tauri's tray (no AppIndicator library is loaded there).
    expect(tauriDependency).toBe('{ version = "=2.11.5", features = [] }');
    expect(trayTarget).toBe('{ version = "=2.11.5", features = ["tray-icon"] }');
    expect(cargoManifest.match(/"tray-icon"/gu)).toHaveLength(1);
    expect(cargoManifest).not.toContain('linux-libxdo');
    expect(tauriConfig.app.trayIcon).toBeUndefined();
    for (const packaging of [tauriConfig.bundle.linux.deb, tauriConfig.bundle.linux.rpm]) {
      expect(JSON.stringify(packaging)).not.toMatch(/appindicator|xdo/iu);
    }
    // The webview gets no tray or menu permission; the tray menu holds only Open and Quit, and
    // the third item is the macOS app menu's Quit.
    expect(JSON.stringify(mainCapability)).not.toMatch(/core:(tray|menu)/u);
    expect([...shellAdapter.matchAll(/MenuItem::with_id\(/gu)]).toHaveLength(3);
  });

  it('shows the capture notification from Rust only, with fixed labels and no Note data', () => {
    // ADR 0024: the official plugin, pinned exactly; no webview permission or JS package.
    expect(cargoManifest).toMatch(/^tauri-plugin-notification = "=2\.4\.0"$/mu);
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_notification::init())');
    expect(JSON.stringify(mainCapability)).not.toMatch(/notification:/u);
    expect(
      Object.keys({ ...desktopPackage.dependencies, ...desktopPackage.devDependencies }),
    ).not.toContain('@tauri-apps/plugin-notification');
    expect(
      [...notificationAdapter.matchAll(/\.(title|body)\(([^)]*)\)/gu)].map(
        (match) => `${match[1]}(${match[2]})`,
      ),
    ).toEqual(['title(&labels.notification_title)', 'body(&labels.notification_body)']);
    // The capture path passes only the app handle: neither the Note's text nor its id.
    expect(
      [...captureAdapter.matchAll(/notify_capture\(([^)]*)\)/gu)].map((match) => match[1]),
    ).toEqual(['app']);
  });

  it('pins the production webview content security policy', () => {
    expect(tauriConfig.app.security.csp).toBe(csp);
  });

  it('grants only the named webview permissions used by the shelf', () => {
    expect(mainCapability.permissions).toEqual([
      'allow-workspace-choose-directory',
      'allow-workspace-choose-attachments',
      'allow-workspace-bootstrap',
      'allow-workspace-bootstrap-default',
      'allow-workspace-open-or-create',
      'allow-workspace-snapshot',
      'allow-workspace-execute',
      'allow-clipboard-compose-and-write',
      'allow-capture-capabilities',
      'allow-capture-open',
      'allow-capture-request-permission',
      'allow-capture-composer-ready',
      'allow-capture-set-shortcut',
      'allow-preferences-read',
      'allow-preferences-reset',
      'allow-preferences-set-background-mode',
      'allow-preferences-set-capture-notifications',
      'allow-preferences-set-rich-capture',
      'allow-shell-set-labels',
      'allow-shell-quit',
      'allow-shell-cancel-quit',
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:window:allow-destroy',
      'core:window:allow-start-dragging',
      'core:window:allow-internal-toggle-maximize',
      'core:resources:allow-close',
      {
        identifier: 'opener:allow-open-url',
        scope: {
          allow: [
            { url: 'https://github.com/SimonHazard/Charon/releases/latest' },
            { url: 'https://github.com/SimonHazard/Charon' },
            { url: 'https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md' },
          ],
        },
      },
      'process:allow-restart',
      'updater:allow-check',
      'updater:allow-download',
      'updater:allow-install',
    ]);
  });

  it('scopes every registered custom command through the app manifest and the capability', () => {
    const handler = tauriBootstrap.match(/tauri::generate_handler!\[([\s\S]*?)\]/u)?.[1] ?? '';
    const registered = [...handler.matchAll(/ipc::\w+::(\w+),/gu)].map((match) => match[1]).sort();
    const manifest = tauriBuildScript.match(
      /AppManifest::new\(\)\.commands\(&\[([\s\S]*?)\]\)/u,
    )?.[1];
    const declared = [...(manifest ?? '').matchAll(/"(\w+)"/gu)].map((match) => match[1]).sort();
    const allowed = mainCapability.permissions
      .filter((permission: unknown): permission is string => typeof permission === 'string')
      .filter((permission: string) => permission.startsWith('allow-'))
      .map((permission: string) => permission.slice('allow-'.length).replaceAll('-', '_'))
      .sort();

    expect(registered).toHaveLength(21);
    expect(declared).toEqual(registered);
    expect(allowed).toEqual(registered);
    expect(tauriBuildScript).toContain('tauri_build::try_build(');
  });

  it('strips plugin commands that no capability allows from release builds', () => {
    expect(tauriConfig.build.removeUnusedCommands).toBe(true);
  });

  it('registers exactly the custom commands invoked by the frontend IPC clients', () => {
    const registered = [...tauriBootstrap.matchAll(/ipc::\w+::(\w+),/gu)]
      .map((match) => match[1])
      .sort();
    const ipcDirectory = resolve(process.cwd(), 'src/lib/ipc');
    const invoked = readdirSync(ipcDirectory)
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => {
        const source = readFileSync(resolve(ipcDirectory, file), 'utf8');
        return [...source.matchAll(/invoke(?:<[^>]+>)?\('([^']+)'/gu)].map((match) => match[1]);
      })
      .sort();

    expect(registered).toEqual(invoked);
  });

  it('configures native desktop bundles without mobile or download-only installers', () => {
    expect(tauriConfig.bundle.targets).toEqual(
      expect.arrayContaining(['app', 'deb', 'appimage', 'nsis', 'msi']),
    );
    expect(tauriConfig.bundle.windows.webviewInstallMode.type).not.toBe('downloadBootstrapper');
    expect(tauriConfig.bundle.linux.deb.depends).toContain('libwebkit2gtk-4.1-0');
    expect(tauriConfig.bundle.android).toBeUndefined();
  });

  it('pins the signed updater to the public GitHub release endpoint', () => {
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauriConfig.plugins.updater).toEqual({
      endpoints: ['https://github.com/SimonHazard/Charon/releases/latest/download/latest.json'],
      pubkey:
        'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVBQjExRENFRTEyRjQ0NzgKUldSNFJDL2h6aDJ4NnBQSDNLNGJZSUlIWFZ4Q29XYzBXV1NIZE9ONWV0M3pKT3NLNWw5M1FZN3oK',
    });
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_updater::Builder::new().build())');
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_opener::init())');
    expect(tauriBootstrap).toContain('.plugin(tauri_plugin_process::init())');
  });
});
