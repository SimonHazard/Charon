import { useEffect, useState } from 'react';

import type { AppLocale } from '@/app/locale';
import { useQuitRequest } from '@/app/quit-request-context';
import { useNativePreferences } from '@/features/preferences/preferences-context';
import type { ShellClient } from '@/lib/ipc/shell-client';
import { m } from '@/paraglide/messages.js';

/**
 * Connects the Rust-owned tray (ADR 0023) and capture notification (ADR 0024)
 * to the webview: it listens for the tray's Quit first, then sends the localized
 * native labels, again whenever the language changes. A quit request runs the
 * draft guard before Charon exits.
 */
export function ShellBridge({
  client,
  enabled,
  locale,
}: {
  client: ShellClient;
  enabled: boolean;
  locale: AppLocale;
}) {
  const { confirmQuit } = useQuitRequest();
  const { refresh } = useNativePreferences();
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let stop: (() => void) | undefined;
    void client
      .subscribeQuitRequest(() => {
        if (!active) return;
        void confirmQuit()
          .then((safe) => (safe ? client.quit() : client.cancelQuit()))
          .catch(() => undefined);
      })
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        stop = unlisten;
        setListening(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop?.();
      setListening(false);
    };
  }, [client, confirmQuit, enabled]);

  useEffect(() => {
    if (!listening) return;
    void client
      .setLabels({
        trayOpen: m.tray_open({}, { locale }),
        trayQuit: m.tray_quit({}, { locale }),
        trayTooltip: m.tray_tooltip({}, { locale }),
        notificationTitle: m.notification_capture_title({}, { locale }),
        notificationBody: m.notification_capture_body({}, { locale }),
      })
      // Sending labels can restore a persisted background mode; refresh shows it.
      .then(() => refresh())
      .catch(() => undefined);
  }, [client, listening, locale, refresh]);

  return null;
}
