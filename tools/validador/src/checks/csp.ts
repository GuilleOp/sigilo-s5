// Interpretación de Content-Security-Policy: directivas por política y fuente efectiva de scripts.

/** Una política CSP: directiva (en minúsculas) → fuentes. */
export type CspPolicy = Map<string, string[]>;

/**
 * Interpreta el valor de la cabecera. Varias cabeceras llegan unidas por comas y cada una es una
 * política independiente (el navegador aplica todas).
 */
export function parseCsp(value: string): CspPolicy[] {
  return value
    .split(',')
    .map((policyText) => {
      const policy: CspPolicy = new Map();
      for (const directive of policyText.split(';')) {
        const tokens = directive.trim().split(/\s+/).filter(Boolean);
        const name = tokens[0]?.toLowerCase();
        // Ante directivas repetidas el navegador usa la primera.
        if (name !== undefined && !policy.has(name)) policy.set(name, tokens.slice(1));
      }
      return policy;
    })
    .filter((policy) => policy.size > 0);
}

/** Fuentes que gobiernan los scripts: `script-src` o, en su ausencia, `default-src`. */
export function effectiveScriptSources(policy: CspPolicy): string[] | null {
  return policy.get('script-src') ?? policy.get('default-src') ?? null;
}

/** Indica si alguna política fija `frame-ancestors 'none'`. */
export function hasFrameAncestorsNone(policies: readonly CspPolicy[]): boolean {
  return policies.some((policy) => {
    const sources = policy.get('frame-ancestors');
    return sources !== undefined && sources.length === 1 && sources[0] === "'none'";
  });
}

/** Extrae la CSP declarada en `<meta http-equiv="Content-Security-Policy">`, si la hay. */
export function metaCspOf(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if (!/http-equiv\s*=\s*["']?content-security-policy["']?/i.test(tag)) continue;
    const content = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if (content !== null) return content[2] ?? content[3] ?? null;
  }
  return null;
}
