/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('French typography', () => {
  it('keeps punctuation attached with non-breaking spaces', () => {
    const messages = readFileSync(resolve(process.cwd(), 'messages/fr.json'), 'utf8');

    expect(messages).not.toMatch(/ [?!;:]/u);
  });
});
