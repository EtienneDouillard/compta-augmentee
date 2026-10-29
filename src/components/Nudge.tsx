import { CheckCircle2 } from "lucide-react";

// Green nudge (Simon): how much is already done across the whole dossier, to keep the client going.
export function Nudge({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const left = total - done;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="mt-5 flex items-center gap-4 rounded-2xl bg-mint-pale p-4 text-primary">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint">
        <CheckCircle2 className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {done === 0
            ? `C'est parti : ${total} élément${total > 1 ? "s" : ""} à traiter, chaque réponse compte.`
            : left === 0
              ? `Bravo, les ${total} éléments sont traités !`
              : `Bravo, déjà ${done} élément${done > 1 ? "s" : ""} traité${done > 1 ? "s" : ""} sur ${total} ! Plus que ${left}.`}
        </p>
        <div
          role="progressbar"
          aria-label="Avancement du dossier"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-2 overflow-hidden rounded-full bg-mint-soft"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
