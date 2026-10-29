// Automatic grouping of a dossier's lines by supplier on the firm side (Julien, 29/10/2026: « pré-regroupe sans demander de validation »).
// Display only: nothing is written, the firm's renames (supplier_aliases) stay the way to fix a tiers for good.

const LEGAL = new Set([
  "SARL",
  "SAS",
  "SASU",
  "SA",
  "EURL",
  "SCI",
  "SNC",
  "EI",
  "EIRL",
  "SCP",
  "SELARL",
  "STE",
  "SOCIETE",
  "ETS",
  "CIE",
]);

// Comparable form of a tiers name: upper case, no accents, no punctuation, no legal form.
export function tiersKey(name: string): string {
  return (name || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !LEGAL.has(w))
    .join(" ");
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

// Two tiers names are taken for the same supplier when one is the other followed by more words
// ("Leroy Merlin" / "Leroy Merlin Bricolage"), or when they differ by a typo (one letter in five at most, 5 letters minimum).
export function sameTiers(a: string, b: string): boolean {
  const ka = tiersKey(a);
  const kb = tiersKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (short.length >= 4 && long.startsWith(`${short} `)) return true;
  const ca = ka.replace(/ /g, "");
  const cb = kb.replace(/ /g, "");
  return (
    Math.min(ca.length, cb.length) >= 5 &&
    distance(ca, cb) <= Math.floor(Math.max(ca.length, cb.length) / 5)
  );
}

export type Groupe<T> = { key: string; name: string; names: string[]; lines: T[] };

// Groups lines whose tiers look alike. "Autre" (tiers not identified) is never merged with anything.
// The group is named after its most frequent tiers name, the shortest one on a tie.
export function regrouper<T extends { supplier: string }>(lines: T[]): Groupe<T>[] {
  const names = [...new Set(lines.map((l) => l.supplier))];
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n: string): string => {
    const p = parent.get(n)!;
    if (p === n) return n;
    const root = find(p);
    parent.set(n, root);
    return root;
  };
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      if (a !== "Autre" && b !== "Autre" && sameTiers(a, b)) parent.set(find(a), find(b));
    }

  const groups = new Map<string, T[]>();
  for (const l of lines) {
    const root = find(l.supplier);
    groups.set(root, [...(groups.get(root) ?? []), l]);
  }
  return [...groups.entries()].map(([root, ls]) => {
    const freq = new Map<string, number>();
    ls.forEach((l) => freq.set(l.supplier, (freq.get(l.supplier) ?? 0) + 1));
    const ranked = [...freq.entries()].sort(
      (x, y) => y[1] - x[1] || x[0].length - y[0].length || x[0].localeCompare(y[0]),
    );
    return { key: root, name: ranked[0]![0], names: ranked.map(([n]) => n), lines: ls };
  });
}
