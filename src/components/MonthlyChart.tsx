import { BarChart3 } from "lucide-react";
import { formatEUR } from "@/lib/session";
import { parMois, type Mois } from "@/lib/par-mois";
import { cn } from "@/lib/utils";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const libelle = (m: string) => `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

// Histogramme (Simon) : ce qui est justifié et ce qui reste à justifier, mois par mois, en euros.
export function MonthlyChart({ txs, className }: { txs: { date: string; amount: number | string; status: string }[]; className?: string }) {
  const data = parMois(txs);
  if (!data.length) return null;
  const max = Math.max(...data.map((m) => m.justifie + m.aJustifier), 1);
  const years = [...new Set(data.map((m) => m.mois.slice(0, 4)))];
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-sm", className)} aria-labelledby="histo-titre">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="histo-titre" className="flex items-center gap-2 text-base font-semibold text-primary">
          <BarChart3 className="h-4 w-4" /> Mois par mois, {years.length > 1 ? `${years[0]} – ${years.at(-1)}` : years[0]}
        </h2>
        <ul className="flex gap-3 text-xs text-muted-foreground" aria-label="Légende">
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-primary" /> Justifié</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-yellow" /> À justifier</li>
        </ul>
      </div>
      <div aria-hidden className="mt-3 flex h-28 items-end gap-1 border-b border-cream-3">
        {data.map((m) => <Barre key={m.mois} m={m} max={max} />)}
      </div>
      <div aria-hidden className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
        {data.map((m) => (
          <span key={m.mois} className="flex-1 truncate text-center">{libelle(m.mois).split(" ")[0]}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Montants justifiés et à justifier par mois</caption>
        <thead><tr><th scope="col">Mois</th><th scope="col">Justifié</th><th scope="col">À justifier</th></tr></thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.mois}><th scope="row">{libelle(m.mois)}</th><td>{formatEUR(m.justifie)}</td><td>{formatEUR(m.aJustifier)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// One stacked bar: to justify on top, a 2px gap, justified at the base. The hover zone is the whole column.
function Barre({ m, max }: { m: Mois; max: number }) {
  const h = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="group relative flex h-full flex-1 flex-col justify-end">
      {m.aJustifier > 0 && <div className="rounded-t-[4px] bg-yellow" style={{ height: h(m.aJustifier) }} />}
      {m.aJustifier > 0 && m.justifie > 0 && <div className="h-0.5 shrink-0" />}
      {m.justifie > 0 && <div className={cn("bg-primary", m.aJustifier === 0 && "rounded-t-[4px]")} style={{ height: h(m.justifie) }} />}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs shadow-md group-hover:block">
        <div className="font-semibold">{libelle(m.mois)}</div>
        <div>Justifié : {formatEUR(m.justifie)}</div>
        <div>À justifier : {formatEUR(m.aJustifier)}</div>
      </div>
    </div>
  );
}
