// Histogramme du client (retour de Simon) : montant justifié et à justifier, mois par mois.
// The base has no closing date per dossier: the exercise is taken as the calendar year of the requests.
import { round2 } from "@/lib/ventilation";

type Ligne = { date: string; amount: number | string; status: string };
export type Mois = { mois: string; justifie: number; aJustifier: number };

const MAX_MOIS = 24;

function moisEntre(debut: string, fin: string) {
  const out: string[] = [];
  let [y, m] = debut.split("-").map(Number) as [number, number];
  const [yf, mf] = fin.split("-").map(Number) as [number, number];
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// One calendar year: its 12 months. Several years: from the first month to the last, the latest 24 at most.
export function parMois(lignes: Ligne[]): Mois[] {
  if (!lignes.length) return [];
  const dates = lignes.map((l) => l.date.slice(0, 7)).sort();
  const first = dates[0]!, last = dates.at(-1)!;
  const mois = first.slice(0, 4) === last.slice(0, 4)
    ? moisEntre(`${first.slice(0, 4)}-01`, `${first.slice(0, 4)}-12`)
    : moisEntre(first, last).slice(-MAX_MOIS);
  const acc = new Map(mois.map((m) => [m, { mois: m, justifie: 0, aJustifier: 0 }]));
  for (const l of lignes) {
    const row = acc.get(l.date.slice(0, 7));
    if (!row) continue;
    const v = Math.abs(Number(l.amount));
    if (l.status === "a_faire") row.aJustifier += v;
    else row.justifie += v;
  }
  return [...acc.values()].map((r) => ({ ...r, justifie: round2(r.justifie), aJustifier: round2(r.aJustifier) }));
}
