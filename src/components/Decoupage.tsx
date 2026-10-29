import { useState } from "react";
import { toast } from "sonner";
import { Plus, Scissors, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { controleDecoupage, estGroupe, type Operation } from "@/lib/decoupage";
import { annulerDecoupage, decouper, lireReleve } from "@/lib/decoupage.functions";
import { RELEVE_COMMENT } from "@/lib/no-invoice";
import { formatDate, formatEUR, type Tx } from "@/lib/session";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/Aide";

type Upload = { id: string; transaction_id: string; storage_path: string; file_name: string };
type Row = { date: string; fournisseur: string; montant: string };

const vide = (date: string): Row => ({ date, fournisseur: "", montant: "" });
const versOperations = (rows: Row[]): Operation[] =>
  rows.map((r) => ({
    date: r.date,
    fournisseur: r.fournisseur.trim(),
    montant: Number(r.montant.replace(",", ".")) || 0,
  }));

// Simon 7: the firm cuts a monthly card debit or a grouped transfer into operations, from the statement read by
// Claude or typed by hand. The total must match the bank line; the operations arrive "À valider".
export function Decoupage({ tx, files, onDone }: { tx: Tx; files: Upload[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [vide(tx.date), vide(tx.date)]);
  const [busy, setBusy] = useState<string | null>(null);
  const c = controleDecoupage(Number(tx.amount), versOperations(rows));
  const suggere = estGroupe(tx.label) || tx.comment === RELEVE_COMMENT;

  async function lire(u: Upload) {
    setBusy(u.id);
    try {
      const r = await lireReleve({ data: { uploadId: u.id } });
      setRows(
        r.operations.map((o) => ({
          date: o.date,
          fournisseur: o.fournisseur,
          montant: o.montant.toFixed(2),
        })),
      );
      toast.success(
        `${r.operations.length} opérations lues (${r.cost.toFixed(3)} $). Vérifiez-les avant de découper.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function valider() {
    setBusy("decouper");
    try {
      const r = await decouper({
        data: { transactionId: tx.id, operations: versOperations(rows) },
      });
      toast.success(
        `Ligne découpée en ${r.created} opérations, à valider avant l'envoi au client.`,
      );
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {suggere ? (
          <Button size="sm" variant="outline">
            <Scissors /> Découper
          </Button>
        ) : (
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title="Découper en opérations (débit carte, virement groupé)"
            aria-label="Découper en opérations"
          >
            <Scissors />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Découper la ligne en opérations
            <InfoTip label="Découpage">
              Pour un débit carte ou un virement qui regroupe plusieurs achats : chaque opération devient une ligne à valider
              avec son propre fournisseur.
            </InfoTip></DialogTitle>
          <DialogDescription>
            {formatDate(tx.date)} · <span className="font-mono">{tx.label}</span> ·{" "}
            <strong>{formatEUR(Math.abs(Number(tx.amount)))}</strong>. Chaque opération devient une
            ligne « À valider » avec son fournisseur ; la ligne d'origine n'est plus montrée au
            client.
          </DialogDescription>
        </DialogHeader>

        {files.length > 0 && (
          <div className="space-y-2 rounded-xl bg-pale-2 p-3 text-sm">
            <p className="font-semibold text-primary">Relevé ou détail déposé :</p>
            {files.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2">
                <span className="truncate">{u.file_name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => lire(u)}
                >
                  <Sparkles /> {busy === u.id ? "Lecture…" : "Lire avec Claude"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-semibold">Date</th>
              <th className="py-1 pr-2 font-semibold">Fournisseur</th>
              <th className="py-1 pr-2 text-right font-semibold">Montant TTC</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <Input
                    type="date"
                    value={r.date}
                    onChange={(e) => set(i, { date: e.target.value })}
                    aria-label={`Date de l'opération ${i + 1}`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    value={r.fournisseur}
                    onChange={(e) => set(i, { fournisseur: e.target.value })}
                    aria-label={`Fournisseur de l'opération ${i + 1}`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={r.montant}
                    onChange={(e) => set(i, { montant: e.target.value })}
                    aria-label={`Montant de l'opération ${i + 1}`}
                  />
                </td>
                <td className="py-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={rows.length <= 2}
                    aria-label={`Retirer l'opération ${i + 1}`}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          size="sm"
          variant="ghost"
          className="justify-self-start"
          onClick={() => setRows((rs) => [...rs, vide(tx.date)])}
        >
          <Plus /> Ajouter une opération
        </Button>

        <div
          className={cn(
            "rounded-xl p-3 text-sm",
            c.ok ? "bg-mint-pale text-primary" : "bg-yellow-soft text-yellow-ink",
          )}
        >
          Total des opérations : <strong>{formatEUR(c.total)}</strong> sur{" "}
          {formatEUR(Math.abs(Number(tx.amount)))}
          {Math.abs(c.ecart) > 0.01 && (
            <>
              {" "}
              · écart de <strong>{formatEUR(c.ecart)}</strong>
            </>
          )}
          {!c.ok && (
            <ul className="mt-1 list-disc pl-5">
              {c.erreurs.slice(0, 4).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button disabled={!c.ok || busy !== null} onClick={valider}>
            <Scissors /> Découper en {rows.length} opérations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Undo, as long as no operation has been sent to the client: the operations are deleted, the line is back "À valider".
export function AnnulerDecoupage({ tx, onDone }: { tx: Tx; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        if (
          !window.confirm(
            "Annuler le découpage ? Les opérations créées sont supprimées et la ligne repasse « À valider ».",
          )
        )
          return;
        setBusy(true);
        try {
          const r = await annulerDecoupage({ data: { transactionId: tx.id } });
          toast.success(`Découpage annulé (${r.removed} opérations supprimées).`);
          onDone();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Undo2 /> Annuler le découpage
    </Button>
  );
}
