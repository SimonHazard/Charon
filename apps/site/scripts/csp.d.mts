/** CSP source expressions for every inline script of one HTML document. */
export function inlineScriptHashes(html: string): string[];
/** The `_headers` policy allows exactly the inline scripts the build emitted (ADR 0034). */
export function withScriptHashes(headers: string, hashes: readonly string[]): string;
