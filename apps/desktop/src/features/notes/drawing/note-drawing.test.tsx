import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import {
  type Drawing,
  findDrawingBlocks,
  toDrawingBlock,
} from '@/features/notes/drawing/drawing-format';
import { NoteEditor } from '@/features/notes/note-editor';
import { NotePreview } from '@/features/notes/note-preview';
import { NoteRow, noteHeadline } from '@/features/notes/note-row';
import { filterNotes } from '@/features/notes/search';
import { note } from '@/test/workspace-fixture';

vi.mock('@/lib/platform', () => ({ isTauriRuntime: () => false }));

const drawing: Drawing = {
  viewBox: { x: 84, y: 84, width: 132, height: 72 },
  strokes: [
    {
      color: 'currentColor',
      width: 4,
      opacity: null,
      commands: [
        { op: 'M', x: 100, y: 100 },
        { op: 'Q', cx: 150, cy: 120, x: 175, y: 130 },
        { op: 'L', x: 200, y: 140 },
      ],
    },
  ],
};
const block = toDrawingBlock(drawing);

function stubCanvas(canvas: Element) {
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 960,
      height: 600,
      right: 960,
      bottom: 600,
      x: 0,
      y: 0,
    }),
  });
}

function drawStroke(canvas: Element, points: readonly (readonly [number, number])[]) {
  const [first, ...rest] = points;
  if (!first) return;
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    button: 0,
    buttons: 1,
    clientX: first[0],
    clientY: first[1],
  });
  for (const [x, y] of rest)
    fireEvent.pointerMove(canvas, { pointerId: 1, buttons: 1, clientX: x, clientY: y });
  const last = rest.at(-1) ?? first;
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: last[0], clientY: last[1] });
}

function editor(body: string) {
  const props = {
    note: note({ id: 'note-1', body }),
    allTags: [],
    onSave: vi.fn().mockResolvedValue(undefined),
    onSetTags: vi.fn().mockResolvedValue(undefined),
    onAddAttachments: vi.fn().mockResolvedValue(undefined),
    onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
    onRetryCleanup: vi.fn().mockResolvedValue(undefined),
    onDirtyChange: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <AppProviders>
      <NoteEditor {...props} />
    </AppProviders>,
  );
  const textarea = screen.getByRole('textbox', { name: 'Markdown body' }) as HTMLTextAreaElement;
  return { props, textarea };
}

async function openCanvas(trigger: HTMLElement) {
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Drawing' });
  // The modal moves focus inside on open, so Escape and shortcuts reach it.
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  const canvas = within(dialog).getByRole('img', { name: 'Drawing canvas' });
  stubCanvas(canvas);
  return { dialog, canvas };
}

describe('drawing preview', () => {
  it('renders a valid drawing from validated values only', () => {
    const { container } = render(
      <AppProviders>
        <NotePreview body={`Before\n\n${block}\n\nAfter`} label="Preview" />
      </AppProviders>,
    );
    const svg = container.querySelector('figure.note-drawing svg[role="img"]');
    expect(svg?.getAttribute('aria-label')).toBe('Drawing');
    expect(svg?.getAttribute('viewBox')).toBe('84 84 132 72');
    expect([...(svg?.children ?? [])].map((child) => child.tagName.toLowerCase())).toEqual([
      'path',
    ]);
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M100 100Q150 120 175 130L200 140');
    expect(container.querySelector('pre')).toBeNull();
    // Without an edit handler the preview stays read-only.
    expect(screen.queryByRole('button', { name: 'Edit drawing' })).toBeNull();
  });

  it('leaves hostile or invalid svg blocks as inert code', () => {
    const hostile = [
      '```svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-charon-drawing="1" onload="alert(1)">',
      '<script>alert(1)</script><image href="https://example.com/a.png"/><foreignObject><div/></foreignObject>',
      '</svg>',
      '```',
      '',
      '```svg',
      block.split('\n').slice(1, -1).join('\n').replace('fill="none"', 'fill="none" style="x"'),
      '```',
    ].join('\n');
    const { container } = render(
      <AppProviders>
        <NotePreview body={hostile} label="Preview" />
      </AppProviders>,
    );
    expect(container.querySelectorAll('pre code')).toHaveLength(2);
    expect(container.querySelector('svg, script, image, foreignObject, img, figure')).toBeNull();
    const handlers = [...container.querySelectorAll('*')].flatMap((element) =>
      element.getAttributeNames().filter((name) => name.startsWith('on')),
    );
    expect(handlers).toEqual([]);
  });
});

describe('drawing summaries and search', () => {
  it('uses a localized placeholder instead of SVG lines in headlines', () => {
    expect(noteHeadline(block, 'Drawing')).toEqual({ title: 'Drawing', snippet: '' });
    expect(noteHeadline(`# Plan\n\n${block}\n\nNext step`, 'Dessin')).toEqual({
      title: 'Plan',
      snippet: 'Dessin Next step',
    });
    expect(noteHeadline('Plain body')).toEqual({ title: 'Plain body', snippet: '' });
  });

  it('excludes drawing source from the search haystack', () => {
    const notes = [
      note({ id: 'drawing', body: `Sketch of the flow\n\n${block}` }),
      note({ id: 'numbers', body: 'Budget 175 130' }),
    ];
    const ids = (query: string) => filterNotes(notes, { query, tag: null }).map((item) => item.id);
    expect(ids('175 130')).toEqual(['numbers']);
    expect(ids('currentColor')).toEqual([]);
    expect(ids('data-charon-drawing')).toEqual([]);
    expect(ids('sketch')).toEqual(['drawing']);
  });
});

describe('drawing in the note editor', () => {
  it('inserts exactly one block at the caret through the draft and restores focus', async () => {
    const { props, textarea } = editor('First paragraph\n\nSecond paragraph');
    textarea.setSelectionRange(16, 16);
    const trigger = screen.getByRole('button', { name: 'Draw' });
    const { dialog, canvas } = await openCanvas(trigger);
    const insert = within(dialog).getByRole('button', { name: 'Insert' });
    expect((insert as HTMLButtonElement).disabled).toBe(true);
    drawStroke(canvas, [
      [100, 100],
      [140, 120],
      [180, 150],
      [220, 150],
    ]);
    expect(canvas.querySelectorAll('path[data-stroke-key]')).toHaveLength(1);
    expect((insert as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(insert);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const blocks = findDrawingBlocks(textarea.value);
    expect(blocks).toHaveLength(1);
    expect(textarea.value.slice(0, blocks[0]?.start)).toBe('First paragraph\n\n');
    expect(textarea.value.slice(blocks[0]?.end)).toBe('\n\nSecond paragraph');
    expect(blocks[0]?.drawing.strokes[0]?.commands[0]).toEqual({ op: 'M', x: 100, y: 100 });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('edits the drawing under the caret and replaces only its block', async () => {
    const body = `Intro\n\n${block}\n\nOutro`;
    const { textarea } = editor(body);
    textarea.setSelectionRange(body.indexOf('<path'), body.indexOf('<path'));
    const { dialog, canvas } = await openCanvas(screen.getByRole('button', { name: 'Draw' }));
    expect(canvas.querySelectorAll('path[data-stroke-key]')).toHaveLength(1);
    drawStroke(canvas, [
      [400, 300],
      [450, 320],
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const blocks = findDrawingBlocks(textarea.value);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.drawing.strokes).toHaveLength(2);
    expect(textarea.value.startsWith('Intro\n\n```svg\n')).toBe(true);
    expect(textarea.value.endsWith('```\n\nOutro')).toBe(true);
  });

  it('edits a drawing from Preview and keeps the other drawings intact', async () => {
    const other = toDrawingBlock({
      ...drawing,
      strokes: [{ ...(drawing.strokes[0] as Drawing['strokes'][number]), color: '#30a46c' }],
    });
    const body = `${block}\n\nMiddle\n\n${other}`;
    const user = userEvent.setup();
    editor(body);
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const edits = screen.getAllByRole('button', { name: 'Edit drawing' });
    expect(edits).toHaveLength(2);
    const { dialog, canvas } = await openCanvas(edits[1] as HTMLElement);
    expect(canvas.querySelectorAll('path[data-stroke-key]')).toHaveLength(1);
    // Erasing the only stroke leaves Save unavailable for an empty drawing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eraser' }));
    drawStroke(canvas, [
      [170, 125],
      [180, 135],
    ]);
    expect(canvas.querySelectorAll('path[data-stroke-key]')).toHaveLength(0);
    expect(
      (within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.keyDown(dialog, { key: 'z', ctrlKey: true });
    expect(canvas.querySelectorAll('path[data-stroke-key]')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pen' }));
    drawStroke(canvas, [
      [500, 500],
      [560, 520],
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Write' }));
    const value = (screen.getByRole('textbox', { name: 'Markdown body' }) as HTMLTextAreaElement)
      .value;
    expect(value.startsWith(`${block}\n\nMiddle\n\n\`\`\`svg\n`)).toBe(true);
    const blocks = findDrawingBlocks(value);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.drawing.strokes.map((stroke) => stroke.color)).toEqual([
      '#30a46c',
      'currentColor',
    ]);
  });

  it('edits only top-level drawings from Preview, never a quoted or listed copy', async () => {
    const quoted = block
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const listed = `${block
      .split('\n')
      .map((line, index) => (index ? `  ${line}` : `- ${line}`))
      .join('\n')}\n- next`;
    // The same drawing three times: in a quote, in a list item, and at the top level.
    const body = `${quoted}\n\n${listed}\n\n${block}\n\nAfter`;
    const user = userEvent.setup();
    editor(body);
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const preview = screen.getByTestId('note-preview');
    expect(within(preview).getAllByRole('img', { name: 'Drawing' })).toHaveLength(3);
    const edits = within(preview).getAllByRole('button', { name: 'Edit drawing' });
    expect(edits).toHaveLength(1);
    expect(edits[0]?.closest('blockquote, li')).toBeNull();

    const { dialog, canvas } = await openCanvas(edits[0] as HTMLElement);
    drawStroke(canvas, [
      [500, 500],
      [560, 520],
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Write' }));
    const value = (screen.getByRole('textbox', { name: 'Markdown body' }) as HTMLTextAreaElement)
      .value;
    // The nested copies are untouched, the top-level one is replaced in place, and nothing is added.
    expect(value.startsWith(`${quoted}\n\n${listed}\n\n\`\`\`svg\n`)).toBe(true);
    expect(value.endsWith('```\n\nAfter')).toBe(true);
    expect(value.match(/```svg/gu)).toHaveLength(3);
    const blocks = findDrawingBlocks(value);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.drawing.strokes).toHaveLength(2);
  });

  it('inserts from Preview before a fence the body never closes', async () => {
    const body = 'Intro\n\n```js\nconst unfinished = true;';
    const user = userEvent.setup();
    editor(body);
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const { dialog, canvas } = await openCanvas(screen.getByRole('button', { name: 'Draw' }));
    drawStroke(canvas, [
      [100, 100],
      [160, 140],
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Write' }));
    const value = (screen.getByRole('textbox', { name: 'Markdown body' }) as HTMLTextAreaElement)
      .value;
    const blocks = findDrawingBlocks(value);
    expect(blocks).toHaveLength(1);
    expect(value.slice(0, blocks[0]?.start)).toBe('Intro\n\n');
    expect(value.slice(blocks[0]?.end)).toBe('\n\n```js\nconst unfinished = true;');
  });

  it('keeps row Copy and editor Save shortcuts out of the drawing dialog', async () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <NoteRow
          allTags={[]}
          copyState={null}
          expanded
          note={note({ id: 'note-1', body: 'Original' })}
          onAddAttachments={vi.fn().mockResolvedValue(undefined)}
          onCloseEditor={vi.fn()}
          onCopy={onCopy}
          onDelete={vi.fn()}
          onDirtyChange={vi.fn()}
          onExpand={vi.fn()}
          onFocusAttachments={vi.fn().mockResolvedValue(undefined)}
          onRemoveAttachment={vi.fn().mockResolvedValue(undefined)}
          onRetryCleanup={vi.fn().mockResolvedValue(undefined)}
          onSave={onSave}
          onSetStatus={vi.fn().mockResolvedValue(undefined)}
          onSetTags={vi.fn().mockResolvedValue(undefined)}
          onTagFilter={vi.fn()}
        />
      </AppProviders>,
    );
    const { dialog } = await openCanvas(screen.getByRole('button', { name: 'Draw' }));
    const inside = document.activeElement as HTMLElement;
    expect(dialog.contains(inside)).toBe(true);
    // Neither shortcut is claimed inside the modal; it keeps focus and stays open.
    expect(fireEvent.keyDown(inside, { key: 'c', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(inside, { key: 's', metaKey: true })).toBe(true);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Drawing' })).toBe(dialog);
  });

  it('asks before discarding strokes and keeps the editor open on Escape', async () => {
    const user = userEvent.setup();
    const { props, textarea } = editor('Original');
    const { dialog, canvas } = await openCanvas(screen.getByRole('button', { name: 'Draw' }));
    drawStroke(canvas, [[10, 10]]);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByText('Discard this drawing?')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: 'Keep drawing' }),
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Keep drawing' }));
    expect(within(dialog).queryByText('Discard this drawing?')).toBeNull();
    expect(canvas.querySelectorAll('path[data-stroke-key]')).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(await within(dialog).findByText('Discard this drawing?')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(textarea.value).toBe('Original');
    expect(props.onClose).not.toHaveBeenCalled();

    // Without strokes, Escape closes the drawing immediately and only the drawing.
    await openCanvas(screen.getByRole('button', { name: 'Draw' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
