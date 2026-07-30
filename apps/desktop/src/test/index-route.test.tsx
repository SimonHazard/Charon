import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { m } from '@/paraglide/messages.js';
import { Route } from '@/routes/index';

describe('index route', () => {
  it('renders its localized title', () => {
    const IndexRoute = Route.options.component;

    if (!IndexRoute) {
      throw new Error('The index route must expose a component');
    }

    render(<IndexRoute />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(m.home_title());
  });
});
