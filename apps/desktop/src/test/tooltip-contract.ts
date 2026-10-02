/**
 * The Tooltip rule of docs/UX.md ("Shared control polish"): every icon-only control shows a
 * Tooltip with its short action label. Only dismiss-only "X" controls that close or clear the
 * surface they sit in, and change no Note data, are exempt.
 */
const exemptDismissNames = [
  /^Close$/u,
  /^Close notification$/u,
  /^Clear search and tag filter$/u,
  /^Clear tag filter /u,
  /^Dismiss folder error$/u,
];

function visibleText(element: Element): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (
      node instanceof Element &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !node.classList.contains('sr-only')
    )
      text += visibleText(node);
  }
  return text.trim();
}

/** Names of icon-only buttons that break the Tooltip rule (English locale). */
export function iconOnlyControlsWithoutTooltip(root: ParentNode): string[] {
  const violations: string[] = [];
  for (const button of root.querySelectorAll('button')) {
    if (visibleText(button)) continue; // visible text names it
    if (button.classList.contains('preferences-info-button')) continue; // toggletip holds the text
    const name = button.getAttribute('aria-label') ?? '(unnamed)';
    if (exemptDismissNames.some((pattern) => pattern.test(name))) continue;
    if (!button.hasAttribute('data-tooltip-trigger')) violations.push(name);
  }
  return violations;
}
