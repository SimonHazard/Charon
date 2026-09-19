import { describe, expect, test } from 'bun:test';

import { validateManifestVersions, validateReleaseVersion } from './check-release-version';

const versions = {
  rootPackage: '0.1.0',
  desktopPackage: '0.1.0',
  cargoPackage: '0.1.0',
  tauri: '0.1.0',
};

describe('release version gate', () => {
  test('uses one consistent manifest version without a pre-existing tag', () => {
    expect(validateManifestVersions(versions)).toBe('0.1.0');
  });

  test('accepts one matching generated tag version', () => {
    expect(validateReleaseVersion('v0.1.0', versions)).toBe('0.1.0');
  });

  test('rejects malformed tags', () => {
    expect(() => validateReleaseVersion('release-0.1.0', versions)).toThrow('vX.Y.Z');
  });

  test('rejects malformed manifest versions', () => {
    expect(() => validateManifestVersions({ ...versions, rootPackage: 'release-0.1.0' })).toThrow(
      'invalid release version release-0.1.0',
    );
  });

  test('rejects drift in every manifest', () => {
    expect(() => validateManifestVersions({ ...versions, desktopPackage: '0.1.1' })).toThrow(
      'desktopPackage=0.1.1',
    );
  });

  test('rejects a tag that does not match the manifest version', () => {
    expect(() => validateReleaseVersion('v0.1.1', versions)).toThrow(
      'does not match manifest version 0.1.0',
    );
  });
});
