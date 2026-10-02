import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toDrawingBlock } from '@/features/notes/drawing/drawing-format';
import { NoteRow } from '@/features/notes/note-row';
import { iconOnlyControlsWithoutTooltip } from '@/test/tooltip-contract';
import { note } from '@/test/workspace-fixture';

const renderCount = vi.hoisted(() => vi.fn());

vi.mock('@/app/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/providers')>();
  return {
    ...actual,
    useMessages: () => {
      renderCount();
      return actual.useMessages();
    },
  };
});

const allTags: readonly string[] = [];
const callbacks = {
  onCopy: vi.fn().mockResolvedValue(undefined),
  onSetStatus: vi.fn().mockResolvedValue(undefined),
  onExpand: vi.fn(),
  onFocusAttachments: vi.fn().mockResolvedValue(undefined),
  onCloseEditor: vi.fn(),
  onTagFilter: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onSetTags: vi.fn().mockResolvedValue(undefined),
  onAddAttachments: vi.fn().mockResolvedValue(undefined),
  onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
  onRetryCleanup: vi.fn().mockResolvedValue(undefined),
  onDirtyChange: vi.fn(),
};

describe('NoteRow render scope', () => {
  beforeEach(() => {
    renderCount.mockClear();
  });

  it('bails out when a parent snapshot changes but the Note identity stays stable', () => {
    const stableNote = note({ id: 'stable', body: 'Untouched Note' });
    const row = (item = stableNote) => (
      <NoteRow {...callbacks} allTags={allTags} copyState={null} expanded={false} note={item} />
    );
    const view = render(<AppProviders>{row()}</AppProviders>);

    view.rerender(<AppProviders>{row()}</AppProviders>);
    expect(renderCount).toHaveBeenCalledTimes(1);

    view.rerender(<AppProviders>{row({ ...stableNote, body: 'Changed Note' })}</AppProviders>);
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('NoteRow direct feedback', () => {
  const openNote = note({ id: 'row', body: 'Row Note' });
  const dot = () => document.querySelector('.note-status-dot');
  const statusButton = () => document.querySelector<HTMLButtonElement>('.note-status-button');

  it('flips status on activation and falls back to the stored status after a rejection', async () => {
    const request = deferred();
    const onSetStatus = vi.fn().mockReturnValue(request.promise);
    render(
      <AppProviders>
        <NoteRow
          {...callbacks}
          allTags={allTags}
          copyState={null}
          expanded={false}
          note={openNote}
          onSetStatus={onSetStatus}
        />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(onSetStatus).toHaveBeenCalledWith('row', 'done');
    expect(dot()?.getAttribute('data-status')).toBe('done');
    expect(document.querySelector('[data-note-id="row"]')?.getAttribute('data-status')).toBe(
      'done',
    );
    expect(statusButton()?.getAttribute('aria-pressed')).toBe('true');
    expect(statusButton()?.getAttribute('aria-busy')).toBe('true');
    expect(statusButton()?.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Mark open' })).toBe(statusButton());

    await act(async () => request.reject(new Error('unavailable')));
    expect(dot()?.getAttribute('data-status')).toBe('open');
    expect(statusButton()?.getAttribute('aria-pressed')).toBe('false');
    expect(statusButton()?.getAttribute('aria-busy')).toBe('false');
  });

  it('retargets a second activation and ends in the stored status', async () => {
    const first = deferred();
    const second = deferred();
    const onSetStatus = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const row = (item = openNote) => (
      <AppProviders>
        <NoteRow
          {...callbacks}
          allTags={allTags}
          copyState={null}
          expanded={false}
          note={item}
          onSetStatus={onSetStatus}
        />
      </AppProviders>
    );
    const view = render(row());

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark open' }));
    expect(onSetStatus.mock.calls).toEqual([
      ['row', 'done'],
      ['row', 'open'],
    ]);
    expect(dot()?.getAttribute('data-status')).toBe('open');

    // The first write lands; the newer intent stays visible until it settles too.
    view.rerender(row({ ...openNote, status: 'done' }));
    await act(async () => first.resolve());
    expect(dot()?.getAttribute('data-status')).toBe('open');
    expect(statusButton()?.getAttribute('aria-busy')).toBe('true');

    view.rerender(row({ ...openNote, status: 'open' }));
    await act(async () => second.resolve());
    expect(dot()?.getAttribute('data-status')).toBe('open');
    expect(statusButton()?.getAttribute('aria-busy')).toBe('false');
  });

  it('confirms a copy by swapping the icon in place without a row message', async () => {
    const row = (copyState: { status: 'copied' | 'error'; message: string } | null) => (
      <AppProviders>
        <NoteRow
          {...callbacks}
          allTags={allTags}
          copyState={copyState}
          expanded={false}
          note={openNote}
        />
      </AppProviders>
    );
    const view = render(row(null));
    const copy = screen.getByRole('button', { name: 'Copy Row Note as Markdown' });
    expect(copy.querySelector('.tabler-icon-copy')).not.toBeNull();

    view.rerender(row({ status: 'copied', message: 'Copied' }));
    expect(copy.hasAttribute('data-copied')).toBe(true);
    await waitFor(() => expect(copy.querySelector('.tabler-icon-check')).not.toBeNull());
    expect(copy.querySelector('.tabler-icon-copy')).toBeNull();
    expect(document.querySelector('.inline-success, .note-copy-state')).toBeNull();
    expect(screen.queryByText('Copied')).toBeNull();

    view.rerender(row(null));
    expect(copy.hasAttribute('data-copied')).toBe(false);
    await waitFor(() => expect(copy.querySelector('.tabler-icon-copy')).not.toBeNull());
    expect(copy.querySelector('.tabler-icon-check')).toBeNull();

    view.rerender(row({ status: 'error', message: 'Could not copy' }));
    expect(screen.getByRole('alert').textContent).toBe('Could not copy');
    expect(copy.hasAttribute('data-copied')).toBe(false);
  });
});

describe('NoteRow copy shortcut', () => {
  it('copies the focused Note with CmdOrCtrl+C and leaves selected text to native Copy', () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <NoteRow
          {...callbacks}
          allTags={allTags}
          copyState={null}
          expanded
          note={note({ id: 'row', body: 'Row Note\nSnippet line' })}
          onCopy={onCopy}
        />
      </AppProviders>,
    );
    const row = document.querySelector<HTMLElement>('[data-note-focus="row"]');
    if (!row) throw new Error('Row activation is missing');
    expect(row.getAttribute('aria-keyshortcuts')).toBe('Meta+C Control+C');
    row.focus();

    expect(fireEvent.keyDown(row, { key: 'c', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(row, { key: 'c', ctrlKey: true })).toBe(false);
    expect(onCopy.mock.calls).toEqual([['row'], ['row']]);

    // Held keys, other chords, and plain C do nothing.
    fireEvent.keyDown(row, { key: 'c', metaKey: true, repeat: true });
    fireEvent.keyDown(row, { key: 'C', metaKey: true, shiftKey: true });
    fireEvent.keyDown(row, { key: 'c', metaKey: true, altKey: true });
    fireEvent.keyDown(row, { key: 'c' });
    expect(onCopy).toHaveBeenCalledTimes(2);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(screen.getByText('Snippet line'));
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      expect(fireEvent.keyDown(row, { key: 'c', metaKey: true })).toBe(true);
      expect(onCopy).toHaveBeenCalledTimes(2);
    } finally {
      selection?.removeAllRanges();
    }

    // Editable text in the open editor keeps its native Copy.
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    expect(fireEvent.keyDown(textarea, { key: 'c', metaKey: true })).toBe(true);
    expect(onCopy).toHaveBeenCalledTimes(2);
  });
});

describe('NoteRow expanded state', () => {
  const row = (expanded: boolean, onExpand = vi.fn()) =>
    render(
      <AppProviders>
        <NoteRow
          {...callbacks}
          allTags={allTags}
          copyState={null}
          expanded={expanded}
          note={note({ id: 'row', body: 'Row Note' })}
          onExpand={onExpand}
        />
      </AppProviders>,
    );
  const edit = () => screen.getByRole('button', { name: 'Edit Row Note' });
  const activation = () => document.querySelector<HTMLElement>('[data-note-focus="row"]');

  it('reports a collapsed Note without controlling an editor', () => {
    const onExpand = vi.fn();
    row(false, onExpand);

    for (const control of [edit(), activation()]) {
      expect(control?.getAttribute('aria-expanded')).toBe('false');
      expect(control?.hasAttribute('aria-controls')).toBe(false);
    }
    fireEvent.click(edit());
    expect(onExpand).toHaveBeenCalledWith('row');
  });

  it('points the row and Edit controls at the open editor', () => {
    row(true);

    for (const control of [edit(), activation()]) {
      expect(control?.getAttribute('aria-expanded')).toBe('true');
      const controlled = control?.getAttribute('aria-controls');
      expect(controlled).toBeTruthy();
      expect(document.getElementById(controlled ?? '')?.hasAttribute('data-note-editor')).toBe(
        true,
      );
    }
  });

  it('moves focus into the open editor instead of expanding it again', () => {
    const onExpand = vi.fn();
    row(true, onExpand);
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    edit().focus();

    fireEvent.click(edit());
    expect(onExpand).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(textarea);

    // Preview unmounts the Markdown field, so Edit lands on the Write tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.queryByRole('textbox', { name: 'Markdown body' })).toBeNull();
    fireEvent.click(edit());
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Write' }));
    expect(onExpand).not.toHaveBeenCalled();
  });
});

describe('NoteRow Tooltip rule', () => {
  const taggedNote = (body = 'Agent handoff') =>
    note({
      id: 'row',
      body,
      tags: ['Agent', 'Research', 'Privacy'],
      attachments: [
        {
          id: 'a1',
          fileName: 'release-brief.pdf',
          relativePath: 'attachments/row/a1.pdf',
          createdAt: '2026-08-05T10:00:00.000Z',
        },
      ],
    });
  const row = (
    item = taggedNote(),
    copyState: { status: 'copied' | 'error'; message: string } | null = null,
  ) => (
    <AppProviders>
      <TooltipProvider closeDelay={0} delay={0}>
        <NoteRow {...callbacks} allTags={allTags} copyState={copyState} expanded note={item} />
      </TooltipProvider>
    </AppProviders>
  );
  const tooltipTexts = () =>
    [...document.querySelectorAll('[data-slot="tooltip-content"]')].map(
      (element) => element.textContent,
    );

  beforeEach(() => {
    applyLocale('en');
  });

  it('names every icon-only row and editor control in a Tooltip', () => {
    const view = render(row());

    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
    for (const control of document.querySelectorAll('.tag-filter-chip, .attachment-name')) {
      expect(control.hasAttribute('data-tooltip-trigger')).toBe(true);
    }
    expect(document.querySelector('.note-row-title[title]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show notes tagged Agent' })).toBeTruthy();

    // The in-place copy confirmation keeps the same named, Tooltip-bearing control.
    view.rerender(row(taggedNote(), { status: 'copied', message: 'Copied' }));
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
  });

  it('repeats each icon-only action in its Tooltip', async () => {
    const user = userEvent.setup();
    render(row());
    const remove = screen.getByRole('button', { name: 'Remove release-brief.pdf' });
    expect(remove.getAttribute('data-slot')).toBe('button');
    expect(remove.hasAttribute('data-tooltip-trigger')).toBe(true);

    for (const [name, text] of [
      ['Mark done', 'Mark done'],
      ['Edit Agent handoff', 'Edit'],
      ['Delete Agent handoff', 'Delete'],
      ['Show notes tagged Agent', 'Show notes tagged Agent'],
      ['Remove release-brief.pdf', 'Remove release-brief.pdf'],
      ['Remove tag Agent', 'Remove tag Agent'],
      ['Markdown help', 'Markdown help'],
      ['Draw', 'Draw'],
    ] as const) {
      const control = screen.getByRole('button', { name });
      await user.hover(control);
      await waitFor(() => expect(tooltipTexts()).toContain(text));
      await user.unhover(control);
      await waitFor(() => expect(tooltipTexts()).not.toContain(text));
    }
  });

  it('lets Escape close the editor while an editor control shows its Tooltip', async () => {
    const user = userEvent.setup();
    const onCloseEditor = vi.fn();
    render(
      <AppProviders>
        <NoteRow
          {...callbacks}
          allTags={allTags}
          copyState={null}
          expanded
          note={taggedNote()}
          onCloseEditor={onCloseEditor}
        />
      </AppProviders>,
    );
    // The editor focuses its Markdown field one frame after mounting; let that settle first.
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    const help = screen.getByRole('button', { name: 'Markdown help' });
    help.focus();
    await waitFor(() => expect(tooltipTexts()).toContain('Markdown help'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onCloseEditor).toHaveBeenCalledWith('row'));
    await waitFor(() => expect(tooltipTexts()).not.toContain('Markdown help'));
  });

  it('names the Preview drawing action and every drawing tool in a Tooltip', async () => {
    const user = userEvent.setup();
    const drawing = toDrawingBlock({
      viewBox: { x: 84, y: 84, width: 132, height: 72 },
      strokes: [
        {
          color: 'currentColor',
          width: 4,
          opacity: null,
          commands: [
            { op: 'M', x: 100, y: 100 },
            { op: 'L', x: 200, y: 140 },
          ],
        },
      ],
    });
    render(row(taggedNote(`Agent handoff\n\n${drawing}`)));

    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const editDrawing = screen.getByRole('button', { name: 'Edit drawing' });
    expect(editDrawing.classList.contains('note-drawing-edit')).toBe(true);
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);

    await user.click(screen.getByRole('tab', { name: 'Write' }));
    await user.click(screen.getByRole('button', { name: 'Draw' }));
    const dialog = await screen.findByRole('dialog', { name: 'Drawing' });
    expect(iconOnlyControlsWithoutTooltip(dialog)).toEqual([]);
    expect(iconOnlyControlsWithoutTooltip(document.body)).toEqual([]);
    // History tools are disabled controls, not merely silent Tooltips.
    for (const name of ['Undo', 'Redo', 'Clear drawing']) {
      expect((within(dialog).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    }
  });
});
