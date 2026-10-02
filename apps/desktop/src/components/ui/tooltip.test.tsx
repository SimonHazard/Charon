import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KeyboardEvent } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');

describe('Tooltip primitive', () => {
  it('keeps the rendered control slot that CSS keys on', () => {
    render(
      <>
        <Tooltip>
          <TooltipTrigger
            aria-label="Remove"
            render={<Button disabled size="icon-sm" type="submit" variant="ghost" />}
          />
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
        <ToggleGroup>
          <Tooltip>
            <TooltipTrigger render={<ToggleGroupItem aria-label="Pen" value="pen" />} />
            <TooltipContent>Pen</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </>,
    );
    const remove = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement;
    expect(remove.getAttribute('data-slot')).toBe('button');
    expect(remove.hasAttribute('data-tooltip-trigger')).toBe(true);
    expect(remove.type).toBe('submit');
    expect(remove.disabled).toBe(true);
    const pen = screen.getByRole('button', { name: 'Pen' });
    expect(pen.getAttribute('data-slot')).toBe('toggle-group-item');
    expect(pen.hasAttribute('data-tooltip-trigger')).toBe(true);
    expect(
      [...document.querySelectorAll('[data-tooltip-trigger]')].map((element) =>
        element.getAttribute('data-slot'),
      ),
    ).toEqual(['button', 'toggle-group-item']);
  });

  it('closes on Escape without claiming the key from the surface behind it', async () => {
    const user = userEvent.setup();
    const escapes: { defaultPrevented: boolean }[] = [];
    const onSurfaceKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escapes.push({ defaultPrevented: event.defaultPrevented });
    };
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: stands in for an editor or Popover surface.
      <div onKeyDown={onSurfaceKeyDown}>
        <Tooltip>
          <TooltipTrigger aria-label="Draw" render={<Button size="icon-sm" variant="ghost" />} />
          <TooltipContent>Draw</TooltipContent>
        </Tooltip>
      </div>,
    );
    const draw = screen.getByRole('button', { name: 'Draw' });
    draw.focus();
    await waitFor(() => expect(tooltip()?.textContent).toBe('Draw'));

    await user.keyboard('{Escape}');
    expect(escapes).toEqual([{ defaultPrevented: false }]);
    await waitFor(() => expect(tooltip()).toBeNull());
    expect(document.activeElement).toBe(draw);
  });
});
