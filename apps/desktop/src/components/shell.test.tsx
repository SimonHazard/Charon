import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers';
import { AppShell } from '@/components/app-shell';

describe('single shelf shell', () => {
  it('renders one main landmark without navigation, rail, inspector, or footer', () => {
    render(
      <AppProviders>
        <AppShell>
          <p>content</p>
        </AppShell>
      </AppProviders>,
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.querySelector('.section-rail')).toBeNull();
    expect(document.querySelector('.context-inspector')).toBeNull();
    expect(document.querySelector('footer')).toBeNull();
    expect(screen.getByAltText('Charon')).toBeTruthy();
  });

  it('keeps native drag chrome compact and opens ordinary Help as an anchored Popover', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <AppShell>
          <p>content</p>
        </AppShell>
      </AppProviders>,
    );

    const titlebar = document.querySelector('.titlebar');
    expect(titlebar?.getAttribute('data-tauri-drag-region')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('Capture text')).toBeTruthy();
    expect(screen.getByText('Shift Shift').tagName).toBe('KBD');
    expect(screen.getByText('⌘/Ctrl + Shift + Space').tagName).toBe('KBD');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
