import { useState } from "react";
import { toast } from "sonner";
import { Check, FileX, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { libellePcg } from "@/lib/pcg";
import { CHOIX, choixPour, ecritureSansFacture, erreurCompte, type ChoixId } from "@/lib/sans-facture";
import { choisirEcriture, envoyerEcriture } from "@/lib/sans-facture.functions";
import { formatDate, formatEUR, type Tx } from "@/lib/session";

// The firm chooses the entry for a bank payment the client has no invoice for (Julien, 29/10/2026).
export function EcritureSansFacture({ tx, demo, onClose, onDone }: { tx: Tx | null; demo: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={tx !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileX className="h-5 w-5 text-primary" /> Choisir l'écriture</DialogTitle>
          <DialogDescription>Le client n'a pas de facture pour ce paiement : choisissez l'écriture à passer face à la transaction bancaire.</DialogDescription>
        </DialogHeader>
        {tx && <Content key={tx.id} tx={tx} demo={demo} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function Content({ tx, demo, onDone }: { tx: Tx; demo: boolean; onDone: () => void }) {
  const choix = choixPour(tx.direction);
  const initial = (tx.ecriture_choix as ChoixId | null | undefined) ?? choix[0]!.id;
  const [id, setId] = useState<ChoixId>(initial);
  const [compte, setCompte] = useState(tx.ecriture_compte ?? CHOIX.find((c) => c.id === initial)!.compte);
  const [busy, setBusy] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const envoyee = !!tx.ecriture_envoyee_le;
  const enregistre = !!tx.ecriture_compte && tx.ecriture_compte === compte.trim() && tx.ecriture_choix === id;
  const erreur = compte.trim() ? erreurCompte(id, compte) : null;
  const montant = Number(tx.amount);

  function pick(next: ChoixId) {
    setId(next);
    setCompte(CHOIX.find((c) => c.id === next)!.compte);
    setConfirmer(false);
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmer(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span className="font-semibold text-foreground">{tx.supplier}</span>
        <span>{formatEUR(Math.abs(montant))} {montant < 0 ? "payés" : "reçus"} le {formatDate(tx.date)}</span>
        <span className="font-mono">{tx.label}</span>
      </div>
      {tx.comment && <p className="rounded-lg border bg-muted/40 p-3 italic">Le client : « {tx.comment} »</p>}

      {envoyee ? (
        <p className="flex items-center gap-2 font-semibold text-primary">
          <Check className="h-4 w-4" /> Passée dans Pennylane en compte {tx.ecriture_compte} le {formatDate(tx.ecriture_envoyee_le!.slice(0, 10))}.
        </p>
      ) : (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="mb-1 font-semibold">Écriture</legend>
          {choix.map((c) => (
            <label key={c.id} className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-mint-pale">
              <input type="radio" name="choix" className="mt-1" checked={id === c.id} onChange={() => pick(c.id)} />
              <span>
                <span className="font-semibold">{c.label}{c.compte ? ` (${c.compte})` : ""}</span>
                <span className="block text-muted-foreground">{c.aide}</span>
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label htmlFor="ecriture-compte" className="font-semibold">Compte</label>
            <Input id="ecriture-compte" className="w-36 font-mono" inputMode="numeric" value={compte}
              placeholder={id === "charge" ? "ex. 6257" : "ex. 471"} onChange={(e) => setCompte(e.target.value)} />
            <span className={erreur ? "text-destructive" : "text-muted-foreground"}>{erreur ?? libellePcg(compte)}</span>
          </div>
        </fieldset>
      )}

      {!erreur && compte.trim() && (
        <table className="w-full border text-xs">
          <thead className="bg-muted/50">
            <tr><th className="px-2 py-1 text-left">Compte</th><th className="px-2 py-1 text-left">Libellé</th><th className="px-2 py-1 text-right">Débit</th><th className="px-2 py-1 text-right">Crédit</th></tr>
          </thead>
          <tbody>
            {ecritureSansFacture(compte.trim(), montant, tx.supplier).map((l) => (
              <tr key={l.compte} className="border-t">
                <td className="px-2 py-1 font-mono">{l.compte}</td>
                <td className="px-2 py-1">{l.libelle}</td>
                <td className="px-2 py-1 text-right tabular-nums">{l.debit ? formatEUR(l.debit) : ""}</td>
                <td className="px-2 py-1 text-right tabular-nums">{l.credit ? formatEUR(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!envoyee && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button variant={enregistre ? "outline" : "default"} disabled={busy || !!erreur || !compte.trim() || enregistre}
            onClick={() => act(() => choisirEcriture({ data: { id: tx.id, choix: id, compte: compte.trim() } }), "Écriture enregistrée.")}>
            <Save /> {enregistre ? "Choix enregistré" : "Enregistrer le choix"}
          </Button>
          {enregistre && demo && (
            confirmer ? (
              <>
                <span>L'écriture va remplacer la contrepartie de la transaction dans Pennylane. Confirmez-vous ?</span>
                <Button disabled={busy} onClick={() => act(() => envoyerEcriture({ data: { id: tx.id } }), "Écriture passée dans Pennylane.")}>
                  <Send /> {busy ? "Envoi en cours…" : "Confirmer l'envoi"}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setConfirmer(false)}>Annuler</Button>
              </>
            ) : (
              <Button onClick={() => setConfirmer(true)}><Send /> Envoyer dans Pennylane</Button>
            )
          )}
          {enregistre && !demo && <span className="text-xs text-muted-foreground">L'envoi dans Pennylane est réservé aux dossiers démo du hackathon.</span>}
        </div>
      )}
    </div>
  );
}
