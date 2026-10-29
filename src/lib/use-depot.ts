import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bilanDepot, resteAFaire, type Bilan } from "@/lib/controle-depot";
import { controlerDepot, etatDepots, type PieceDeposee } from "@/lib/saisie.functions";
import { PHOTO_SANS_FACTURE_COMMENT } from "@/lib/no-invoice";
import { formatDate, formatEUR, meQuery, type Tx } from "@/lib/session";

export const ACCEPT = "application/pdf,image/jpeg,image/png";

// The client's deposits: upload, Claude's check of supplier and amount, and what is left to justify.
// Shared by the supplier page and the multi-supplier actions of the home page.
export function useDepot(dossierId: string | null | undefined) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // A cabinet user previewing the client space never acts on the client's behalf.
  const preview = !!useQuery(meQuery).data?.preview;
  const blocked = () => {
    if (preview) toast.info("Aperçu cabinet : les actions du client sont désactivées.");
    return preview;
  };
  const [checking, setChecking] = useState(false);
  const depots = useQuery({
    queryKey: ["client-depots", dossierId],
    enabled: !!dossierId,
    queryFn: () => etatDepots({ data: { dossierId: dossierId! } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["client-txs"] });
    qc.invalidateQueries({ queryKey: ["client-depots"] });
  };
  const bilanOf = (t: Tx, pieces: PieceDeposee[] = depots.data?.pieces ?? []): Bilan => {
    const mine = pieces.filter((p) => p.transactionId === t.id);
    return bilanDepot(
      Number(t.amount),
      t.supplier,
      mine.filter((p) => p.lue),
      mine.filter((p) => !p.lue).length,
    );
  };

  function announce(t: Tx, b: Bilan) {
    const when = `${t.direction === "in" ? "l'encaissement" : "le paiement"} du ${formatDate(t.date)} (${t.supplier})`;
    for (const f of b.fournisseursDouteux)
      toast.warning(
        `La facture semble émise par « ${f} » et non par ${t.supplier} : est-ce bien la bonne ?`,
        { duration: 10000 },
      );
    for (const nv of b.nonValables)
      toast.warning(
        `Ce document est ${nv}, pas une facture : ${"il ne justifie ni la dépense ni la TVA (seule une facture permet de déduire la TVA : CGI art. 271, II ; BOI-TVA-DED-40-10-10 § 30)"}. Déposez la facture définitive pour ${when}.`,
        { duration: 12000 },
      );
    if (b.etat === "complet") toast.success(`Facture vérifiée : le montant correspond à ${when}.`);
    else if (b.etat === "partiel")
      toast.warning(
        `Il reste ${formatEUR(b.reste)} à justifier pour ${when} : ajoutez la facture manquante.`,
        { duration: 10000 },
      );
    else if (b.etat === "excedent")
      toast.warning(
        `Les factures déposées (${formatEUR(b.totalLu)}) dépassent ${when} de ${formatEUR(-b.reste)} : vérifiez qu'il s'agit des bonnes.`,
        {
          duration: 10000,
        },
      );
  }

  // Files go to the targets in order (the last target takes the extra files).
  // photoSansFacture: a photo standing in for a missing invoice (no VAT): not read by Claude, noted for the firm.
  async function upload(files: File[], targets: Tx[], opts: { photoSansFacture?: boolean } = {}) {
    if (blocked()) return;
    if (files.length === 0 || !dossierId) return;
    if (targets.length === 0) {
      toast.error("Sélectionnez au moins une ligne.");
      return;
    }
    const bad = files.find((f) => !ACCEPT.split(",").includes(f.type));
    if (bad) {
      toast.error(`« ${bad.name} » n'est pas un PDF, JPG ou PNG.`);
      return;
    }
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const tx = targets[Math.min(i, targets.length - 1)]!;
        const safe = f.name.replace(/[^\w.-]+/g, "_");
        const path = `${dossierId}/${tx.id}/${Date.now()}-${safe}`;
        const up = await supabase.storage.from("factures").upload(path, f, { contentType: f.type });
        if (up.error) throw up.error;
        const ins = await supabase
          .from("uploads")
          .insert({
            dossier_id: dossierId,
            transaction_id: tx.id,
            storage_path: path,
            file_name: f.name,
          })
          .select("id")
          .single();
        if (ins.error) throw ins.error;
        uploaded.push(ins.data.id);
      }
      const touched = targets.slice(0, files.length);
      toast.success(files.length > 1 ? `${files.length} fichiers envoyés` : "Fichier envoyé");
      if (opts.photoSansFacture) {
        const upd = await supabase
          .from("transactions")
          .update({ status: "depose", comment: PHOTO_SANS_FACTURE_COMMENT })
          .in(
            "id",
            touched.map((t) => t.id),
          );
        if (upd.error) throw upd.error;
        toast.info("C'est noté : photo justificative, sans TVA déductible.");
        refresh();
        return;
      }

      // Claude reads each invoice: supplier and amount are checked against the payment (never blocks the deposit).
      setChecking(true);
      await Promise.all(
        uploaded.map((id) => controlerDepot({ data: { uploadId: id } }).catch(() => null)),
      );
      const pieces = (await etatDepots({ data: { dossierId } }).catch(() => null))?.pieces;
      setChecking(false);
      const bilans = touched.map((t) => ({ t, b: pieces ? bilanOf(t, pieces) : null }));
      // A payment only partly covered stays to do, so the client adds the missing invoice.
      const complete = bilans.filter(({ b }) => !resteAFaire(b)).map(({ t }) => t.id);
      if (complete.length) {
        const upd = await supabase
          .from("transactions")
          .update({ status: "depose", comment: null })
          .in("id", complete);
        if (upd.error) throw upd.error;
      }
      for (const { t, b } of bilans) if (b) announce(t, b);
      refresh();
    } catch (e) {
      toast.error("L'envoi a échoué : " + (e as Error).message);
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }

  async function mark(targets: Tx[], status: "email" | "sans_facture", comment?: string) {
    if (blocked()) return false;
    const ids = targets.map((t) => t.id);
    if (!ids.length) {
      toast.error("Sélectionnez au moins une ligne.");
      return false;
    }
    setBusy(true);
    const patch = status === "email" ? { status } : { status, comment: comment?.trim() || null };
    const { error } = await supabase.from("transactions").update(patch).in("id", ids);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(status === "email" ? "C'est noté, merci !" : "C'est noté");
    refresh();
    return true;
  }

  return { busy, checking, preview, bilanOf, upload, mark };
}

// For the e-mail choice: the client's own mail app opens on the dossier address; the PDF is attached by hand
// (a mailto: link cannot carry an attachment, RFC 6068).
export function mailtoFactures(to: string, txs: Tx[]) {
  const names = [...new Set(txs.map((t) => t.supplier))];
  const lines = txs
    .map((t) => `- ${t.supplier}, ${formatDate(t.date)} : ${formatEUR(Math.abs(Number(t.amount)))}`)
    .join("\n");
  const subject = `Factures ${names.length === 1 ? names[0] : `${names.length} fournisseurs`}`;
  const body = `Factures jointes en PDF, pour :\n${lines}\n`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
