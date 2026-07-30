import { describe, expect, it } from 'vitest';

import { Route } from '@/routes/index';

describe('index route', () => {
  it('redirects the root route before rendering', () => {
    expect(Route.options.beforeLoad).toBeTypeOf('function');
  });
});
