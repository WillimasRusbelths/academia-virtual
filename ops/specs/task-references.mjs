/** Expande referencias completas, abreviadas y rangos; no infiere cobertura semántica. */
export function extractRequirementReferences(text) {
  const references = new Set();
  const chains = /\b(FR|SC)-\d{3}(?:\s*[–/-]\s*(?:(?:FR|SC)-)?\d{3})*/g;
  const parts = /(?:(FR|SC)-)?(\d{3})(?:\s*[–-]\s*(?:(FR|SC)-)?(\d{3}))?/g;
  for (const chain of text.matchAll(chains)) {
    let prefix = chain[1];
    for (const part of chain[0].matchAll(parts)) {
      prefix = part[1] ?? prefix;
      if (part[3] && part[3] !== prefix) throw new Error('Rango entre familias diferentes');
      const start = Number(part[2]), end = Number(part[4] ?? part[2]);
      if (start < 1 || end < start) throw new Error('Rango de requisitos inválido');
      for (let n = start; n <= end; n++) references.add(`${prefix}-${String(n).padStart(3, '0')}`);
    }
  }
  return [...references].sort();
}
