import { describe, expect, test } from 'bun:test';

import {
  excludedNonMessageKeys,
  extractMessageKeys,
  findMissingMessageKeys,
} from './check-message-keys';

describe('Rust message-key catalog guard', () => {
  test('extracts message-key contexts without treating error codes as keys', () => {
    const fixture = `
      let (code, message_key) = ("workspace_unavailable", "workspace_error_not_open");
      let error = WorkspaceIpcError { message_key: "workspace_missing" };
      fn message_key(self) -> &'static str {
        match self { Self::Warning => "capture_warning_fixture" }
      }
      let code = "workspace_unknown";
    `;

    expect([...extractMessageKeys(fixture)].sort()).toEqual([
      'capture_warning_fixture',
      'workspace_error_not_open',
      'workspace_missing',
    ]);
    expect(excludedNonMessageKeys).toContain('workspace_unavailable');
    expect(excludedNonMessageKeys).toContain('workspace_unknown');
  });

  test('reports a missing fixture key', () => {
    expect(
      findMissingMessageKeys(
        ['workspace_error_not_open', 'workspace_missing'],
        ['workspace_error_not_open'],
      ),
    ).toEqual(['workspace_missing']);
  });

  test('the checked-in Rust tree passes the guard', async () => {
    const result = Bun.spawnSync([process.execPath, `${import.meta.dir}/check-message-keys.ts`]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('verified ');
  });
});
