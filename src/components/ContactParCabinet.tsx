import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCabinet } from "@/lib/cabinet";
import { demandeFournisseur } from "@/lib/demande-fournisseur";
import { EMAIL } from "@/lib/email";
import { emailsFournisseur } from "@/lib/saisie.functions";
import { meQuery, type Tx } from "@/lib/session";

// Simon: the client lets the firm ask the supplier. The supplier's e-mail read on another invoice is offered first,
// else the client types it. The firm gets the request in its questions panel; nothing is sent to the supplier here.
export function ContactParCabinet({ dossierId, supplier, client, paiements, adresseDossier, onDone }: {
  dossierId: string; supplier: string; client: string; paiements: Tx[]; adresseDossier: string | null | undefined; onDone: () => void;
}) {
  const qc = useQueryClient();
  const cabinet = useCabinet();
  // Addresses are found by the supplier name stored on the payments (a grouped name may drop "acompte", "solde"…).
  const tiers = paiements[0]?.supplier ?? supplier;
  const known = useQuery({ queryKey: ["emails-fournisseur", dossierId, tiers], queryFn: () => emailsFournisseur({ data: { dossierId, supplier: tiers } }) });
  const emails = known.data?.emails ?? [];
  const [choice, setChoice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const to = (choice ?? emails[0] ?? "") === "autre" || !emails.length ? typed.trim() : (choice ?? emails[0]!);
  const ok = EMAIL.test(to) && paiements.length > 0;
  // The full e-mail the firm will send (Simon): shown to the client before authorising, and handed to the firm as is.
  const d = demandeFournisseur({ fournisseur: supplier, client, referenceClient: ref, paiements, adresseDossier, cabinet: cabinet.name });

  async function authorize() {
    setBusy(true);
    try {
      const me = await qc.fetchQuery(meQuery);
      const question = `Le client autorise le cabinet à contacter ${supplier} (${to}) pour obtenir les factures manquantes.\n\nÀ : ${to}\nObjet : ${d.subject}\n\n${d.body}`;
      const ins = await supabase.from("cabinet_questions").insert({
        dossier_id: dossierId, user_email: me?.email ?? null, question, context: `achat:${supplier}`,
      });
      if (ins.error) throw ins.error;
      const upd = await supabase.from("transactions")
        .update({ comment: `Cabinet autorisé à contacter le fournisseur (${to}).` })
        .in("id", paiements.map((t) => t.id));
      if (upd.error) throw upd.error;
      toast.success(`C'est noté : votre cabinet va contacter ${supplier}.`);
      qc.invalidateQueries({ queryKey: ["client-txs"] });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {known.isLoading ? (
        <p className="text-sm text-muted-foreground">🔎…</p>
      ) : emails.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="font-semibold">📧 E-mail de {supplier}</legend>
          {[...emails, "autre"].map((e) => (
            <label key={e} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`email-fournisseur-${supplier}`} checked={(choice ?? emails[0]) === e} onChange={() => setChoice(e)} />
              {e === "autre" ? "Une autre adresse" : <code className="font-mono font-semibold text-primary">{e}</code>}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="font-semibold">📧 E-mail de {supplier}</p>
      )}
      {(!emails.length || choice === "autre") && (
        <Input type="email" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ex. factures@fournisseur.fr" className="bg-card" aria-label="E-mail du fournisseur" />
      )}
      <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N° client (facultatif)" className="bg-card" aria-label="Référence client" />
      <details>
        <summary className="cursor-pointer text-sm font-semibold">✉️ Voir le mail</summary>
        <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border bg-pale-2 p-3 font-sans text-sm text-muted-foreground">{`Objet : ${d.subject}\n\n${d.body}`}</pre>
      </details>
      <Button size="xl" disabled={busy || !ok} onClick={authorize}>
        <Handshake /> J'autorise
      </Button>
    </div>
  );
}
