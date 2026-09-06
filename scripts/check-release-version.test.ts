import { describe, expect, test } from 'bun:test';

import { validateReleaseVersion } from './check-release-version';

const versions = {
  rootPackage: '0.1.0',
  desktopPackage: '0.1.0',
  cargoPackage: '0.1.0',
  tauri: '0.1.0',
};

describe('release version gate', () => {
  test('accepts one matching annotated tag version', () => {
    expect(validateReleaseVersion('v0.1.0', versions)).toBe('0.1.0');
  });

  test('rejects malformed tags', () => {
    expect(() => validateReleaseVersion('release-0.1.0', versions)).toThrow('vX.Y.Z');
  });

  test('rejects drift in every manifest', () => {
    expect(() =>
      validateReleaseVersion('v0.1.0', { ...versions, desktopPackage: '0.1.1' }),
    ).toThrow('desktopPackage=0.1.1');
  });
});
