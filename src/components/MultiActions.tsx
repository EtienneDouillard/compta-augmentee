import { useRef, useState } from "react";
import { Check, FileX, FolderOpen, Handshake, Mail, MailPlus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SupplierAvatar } from "@/components/brand";
import { ContactParCabinet } from "@/components/ContactParCabinet";
import { formatDate, formatEUR, type SupplierGroup, type Tx } from "@/lib/session";
import { ACCEPT, mailtoFactures, useDepot } from "@/lib/use-depot";
import { useClientDossier } from "@/routes/_authenticated/espace.index";
import { NO_INVOICE_NOTE_SALE, NO_INVOICE_WARNING } from "@/lib/no-invoice";

type Mode = "upload" | "email" | "none" | "cabinet";

// Actions for several suppliers at once (retour de Simon): the client picks suppliers on the home page,
// then deposits, sends by e-mail or declares "no invoice" for all their payments still to do. "Mon comptable s'en
// charge" (retour de Julien, point 8): one authorisation per selected purchase supplier, as on the supplier page.
export function MultiActions({
  dossierId,
  groups,
  onClear,
}: {
  dossierId: string;
  groups: SupplierGroup[];
  onClear: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [comment, setComment] = useState("");
  const [autorises, setAutorises] = useState<Set<string>>(new Set());
  const dossier = useClientDossier(dossierId);
  const d = useDepot(dossierId);
  if (!groups.length) return null;

  const pending = groups.flatMap((g) => g.txs.filter((t) => t.status === "a_faire"));
  const total = pending.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const out = pending.filter((t) => t.direction === "out");
  const inn = pending.filter((t) => t.direction === "in");
  const n = groups.length;
  const achats = groups
    .filter((g) => g.direction === "out")
    .map((g) => ({ g, txs: g.txs.filter((t) => t.status === "a_faire") }))
    .filter((x) => x.txs.length);

  function autorise(key: string) {
    const next = new Set(autorises).add(key);
    setAutorises(next);
    if (achats.every((x) => next.has(x.g.key))) {
      setAutorises(new Set());
      setMode(null);
      onClear();
    }
  }

  async function noInvoice() {
    if (await d.mark(pending, "sans_facture", comment)) {
      setComment("");
      setMode(null);
      onClear();
    }
  }
  async function email() {
    if (await d.mark(pending, "email")) {
      setMode(null);
      onClear();
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-auto text-sm">
            <strong>
              {n} sélectionné{n > 1 ? "s" : ""}
            </strong>{" "}
            · {pending.length} paiement{pending.length > 1 ? "s" : ""} · {formatEUR(total)}
          </span>
          <Button onClick={() => setMode("upload")}>
            <Upload /> Déposer
          </Button>
          <Button variant="outline" onClick={() => setMode("email")}>
            <Mail /> Par e-mail
          </Button>
          <Button variant="outline" onClick={() => setMode("none")}>
            <FileX /> Pas de facture
          </Button>
          {achats.length > 0 && (
            <Button variant="outline" onClick={() => setMode("cabinet")}>
              <Handshake /> Mon comptable s'en charge
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClear} aria-label="Annuler la sélection">
            <X />
          </Button>
        </div>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "upload"
                ? "Déposer les factures"
                : mode === "email"
                  ? "Envoyer les factures par e-mail"
                  : mode === "cabinet"
                    ? "Mon comptable s'en charge"
                    : "Je n'ai pas de facture"}
            </DialogTitle>
            <DialogDescription>
              {n} fournisseur{n > 1 ? "s" : ""}, {pending.length} paiement
              {pending.length > 1 ? "s" : ""} à justifier.
            </DialogDescription>
          </DialogHeader>

          {mode === "upload" && (
            <div className="space-y-5">
              {d.checking && (
                <p
                  role="status"
                  className="rounded-lg bg-pale-2 p-2 text-sm font-semibold text-primary"
                >
                  Vérification des factures (fournisseur et montant)…
                </p>
              )}
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="flex items-center gap-3 font-bold text-primary">
                    <SupplierAvatar name={g.name} className="h-8 w-8 text-xs" /> {g.name}
                  </p>
                  <ul className="mt-2 divide-y rounded-lg border">
                    {g.txs
                      .filter((t) => t.status === "a_faire")
                      .map((t) => (
                        <DepotRow
                          key={t.id}
                          tx={t}
                          busy={d.busy}
                          bilanText={bilanText(d.bilanOf(t))}
                          onFiles={(f) => d.upload(f, [t])}
                        />
                      ))}
                  </ul>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Formats acceptés : PDF, JPG ou PNG. Chaque facture est vérifiée (fournisseur et
                montant).
              </p>
            </div>
          )}

          {mode === "email" && (
            <div className="space-y-4">
              {[
                { list: out, to: dossier.data?.collect_email, label: "Factures d'achat" },
                {
                  list: inn,
                  to: dossier.data?.collect_email_customers,
                  label: "Factures de vente",
                },
              ]
                .filter((x) => x.list.length)
                .map((x) => (
                  <div key={x.label} className="rounded-xl border bg-pale-2 p-3">
                    <p className="text-sm font-semibold">{x.label}</p>
                    {x.to ? (
                      <>
                        <code className="mt-1 block break-all font-mono font-semibold text-primary">
                          {x.to}
                        </code>
                        <Button asChild className="mt-3">
                          <a href={mailtoFactures(x.to, x.list)}>
                            <MailPlus /> Ouvrir ma messagerie
                          </a>
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Adresse pas encore renseignée par votre cabinet : utilisez plutôt le dépôt.
                      </p>
                    )}
                  </div>
                ))}
              <p className="text-sm text-muted-foreground">
                Votre messagerie s'ouvre avec l'adresse déjà remplie : joignez-y les factures en PDF
                (ou transférez les e-mails qui les contiennent), puis envoyez.
              </p>
              <Button size="lg" variant="outline" disabled={d.busy} onClick={email}>
                <Check /> C'est fait, je les ai envoyées
              </Button>
            </div>
          )}

          {mode === "cabinet" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Pour chaque fournisseur, vous autorisez votre cabinet à lui écrire à votre place
                pour obtenir les factures manquantes. Rien n'est envoyé au fournisseur depuis cet
                écran.
              </p>
              {inn.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Les clients sélectionnés ne sont pas concernés : seuls les fournisseurs sont
                  listés.
                </p>
              )}
              {achats.map(({ g, txs }) => (
                <div key={g.key} className="rounded-xl border p-4">
                  <p className="mb-3 flex items-center gap-3 font-bold text-primary">
                    <SupplierAvatar name={g.name} className="h-8 w-8 text-xs" /> {g.name}
                    <span className="ml-auto text-sm font-normal text-muted-foreground">
                      {txs.length} paiement{txs.length > 1 ? "s" : ""}
                    </span>
                  </p>
                  {autorises.has(g.key) ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Check className="h-4 w-4" /> Autorisation transmise à votre cabinet
                    </p>
                  ) : (
                    <ContactParCabinet
                      dossierId={dossierId}
                      supplier={g.name}
                      client={dossier.data?.name ?? ""}
                      paiements={txs}
                      adresseDossier={dossier.data?.collect_email}
                      onDone={() => autorise(g.key)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {mode === "none" && (
            <div>
              <label htmlFor="multi-comment" className="text-sm font-semibold">
                Votre commentaire (facultatif)
              </label>
              <Textarea
                id="multi-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-2"
              />
              {out.length > 0 && <Warning text={NO_INVOICE_WARNING} />}
              {inn.length > 0 && <Warning text={NO_INVOICE_NOTE_SALE} />}
              <Button size="lg" className="mt-4" disabled={d.busy} onClick={noInvoice}>
                Je confirme : pas de facture pour ces {pending.length} paiement
                {pending.length > 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function bilanText(b: ReturnType<ReturnType<typeof useDepot>["bilanOf"]>) {
  if (!b.lues) return null;
  const doubt = b.fournisseursDouteux.length
    ? ` · fournisseur lu : ${b.fournisseursDouteux.join(", ")}`
    : "";
  if (b.etat === "non_valable")
    return `⚠ ${b.nonValables.join(", ")} n'est pas une facture : déposez la facture définitive`;
  if (b.etat === "complet") return `✓ Facture vérifiée${doubt}`;
  if (b.etat === "partiel") return `⚠ Reste ${formatEUR(b.reste)} à justifier${doubt}`;
  if (b.etat === "excedent")
    return `⚠ Factures au-delà du montant payé (${formatEUR(b.totalLu)})${doubt}`;
  return null;
}

function DepotRow({
  tx,
  busy,
  bilanText,
  onFiles,
}: {
  tx: Tx;
  busy: boolean;
  bilanText: string | null;
  onFiles: (f: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span className="w-24">{formatDate(tx.date)}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={tx.label}>
        {tx.label}
      </span>
      <span className="font-bold tabular-nums">{formatEUR(Math.abs(Number(tx.amount)))}</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        <FolderOpen /> Ajouter
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {bilanText && (
        <span className="basis-full text-xs font-semibold text-primary">{bilanText}</span>
      )}
    </li>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="mt-3 whitespace-pre-line rounded-lg border border-yellow/60 bg-yellow-soft/60 p-3 text-sm text-yellow-ink">
      {text}
    </p>
  );
}
