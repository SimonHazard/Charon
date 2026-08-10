import { render, screen } from '@testing-library/react';
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
});
