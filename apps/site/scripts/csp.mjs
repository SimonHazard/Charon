import { createHash } from 'node:crypto';

/** Inline `<script>` bodies: Astro's island loaders and the page's own small scripts. */
const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gu;

/** CSP source expressions for every inline script of one HTML document. */
export function inlineScriptHashes(html) {
  return [...html.matchAll(inlineScript)].map(
    ([, body]) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`,
  );
}

/** The `_headers` policy allows exactly the inline scripts the build emitted (ADR 0034). */
export function withScriptHashes(headers, hashes) {
  const allowed = [...new Set(hashes)].sort().join(' ');
  return headers.replace("script-src 'self'", `script-src 'self'${allowed ? ` ${allowed}` : ''}`);
}
