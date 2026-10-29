import { requireClient } from "@/lib/session";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HelpChat } from "@/components/HelpChat";
import { ContactParCabinet } from "@/components/ContactParCabinet";
import { InvoiceSourceSetup } from "@/components/InvoiceSourceSetup";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, CloudUpload, Copy, FileText, FolderOpen, Info, Mail, MailPlus, PartyPopper, Sparkles, Upload,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Nudge } from "@/components/Nudge";
import { EtApres, InfoTip, SousTitre } from "@/components/Aide";
import { AIDE_CHOIX, INFOBULLES, SOUS_TITRES, type AideChoix, type Choix } from "@/lib/aide-client";
import { SupplierAvatar } from "@/components/brand";
import { GroupStatePill, TxStatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { groupBySupplier, formatDate, formatEUR, type SupplierGroup, type Tx } from "@/lib/session";
import { stepOrder } from "@/lib/priority";
import type { Bilan } from "@/lib/controle-depot";
import { ACCEPT, mailtoFactures, useDepot } from "@/lib/use-depot";
import { useSupplierSites } from "@/lib/use-sites";
import { demandeFournisseur, mailtoDemande } from "@/lib/demande-fournisseur";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { estGroupe } from "@/lib/decoupage";
import { useClientDossier, useClientTxs } from "./espace.index";

import { NO_INVOICE_NOTE_SALE, NO_INVOICE_WARNING, PHOTO_SANS_FACTURE_NOTE } from "@/lib/no-invoice";

export const Route = createFileRoute("/_authenticated/espace/$supplier")({
  beforeLoad: requireClient,
  head: ({ params }) => ({
    meta: [
      { title: `${params.supplier} — PBC List` },
      { name: "description", content: `Factures à transmettre pour ${params.supplier}.` },
      { property: "og:title", content: `${params.supplier} — PBC List` },
      { property: "og:description", content: `Factures à transmettre pour ${params.supplier}.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupplierPage,
});

function SupplierPage() {
  const { supplier } = Route.useParams();
  const { txs, dossierId } = useClientTxs();
  // Stable order, so "Étape X sur N", Précédent and Suivant do not move after each answer.
  const steps = stepOrder(groupBySupplier(txs.data ?? []));
  const idx = steps.findIndex((g) => g.key === supplier);

  if (txs.isLoading)
    return <div className="min-h-screen bg-background"><AppHeader space="client" /><p className="p-8 text-muted-foreground">Chargement…</p></div>;
  if (idx < 0 || !dossierId)
    return (
      <div className="min-h-screen bg-background"><AppHeader space="client" />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p>Ce fournisseur n'a plus de demande en attente.</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/espace">Retour</Link></Button>
        </main>
      </div>
    );
  const all = txs.data ?? [];
  const done = all.filter((t) => t.status !== "a_faire").length;
  // Keyed by group so the selection starts afresh on each step.
  return <SupplierStep key={supplier} steps={steps} idx={idx} dossierId={dossierId} progress={{ done, total: all.length }} />;
}

function SupplierStep({ steps, idx, dossierId, progress }: {
  steps: SupplierGroup[]; idx: number; dossierId: string; progress: { done: number; total: number };
}) {
  const group = steps[idx]!;
  const navigate = useNavigate();
  const dossier = useClientDossier(dossierId);
  const { busy, checking, preview, bilanOf, upload, mark } = useDepot(dossierId);
  const siteOf = useSupplierSites(dossierId);
  const pending = group.txs.filter((t) => t.status === "a_faire");
  // All the payments still to do are selected at first: one click answers the whole supplier.
  const [sel, setSel] = useState<Set<string>>(() => new Set(pending.map((t) => t.id)));
  const [mode, setMode] = useState<"upload" | "email" | "none" | "source" | "demande" | "cabinet" | null>(null);
  // Coming from the sources catalogue (#source): open the source setup directly.
  useEffect(() => { if (typeof window !== "undefined" && window.location.hash === "#source") setMode("source"); }, []);
  const [comment, setComment] = useState("");

  const selected = pending.filter((t) => sel.has(t.id));
  const isSale = group.direction === "in";
  const collect = isSale ? dossier.data?.collect_email_customers : dossier.data?.collect_email;
  const noun = isSale ? "encaissement" : "paiement";
  const thisOne = isSale ? "cet encaissement" : "ce paiement";
  const plural = (n: number) => (n > 1 ? "s" : "");
  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });

  const uploadFiles = (files: File[], targets: Tx[]) => upload(files, targets);
  const markEmail = () => mark(selected, "email");
  async function markNoInvoice() {
    if (await mark(selected, "sans_facture", comment)) {
      setComment("");
      setMode(null);
    }
  }

  function goNext() {
    const nextG = steps.slice(idx + 1).find((g) => g.state !== "done") ?? steps.find((g, i) => i !== idx && g.state !== "done");
    if (nextG) navigate({ to: "/espace/$supplier", params: { supplier: nextG.key } });
    else navigate({ to: "/espace/termine" });
  }
  function goPrevious() {
    const prev = steps[idx - 1];
    if (prev) navigate({ to: "/espace/$supplier", params: { supplier: prev.key } });
    else navigate({ to: "/espace" });
  }

  const answered = group.txs.length - pending.length;
  return (
    <div className="min-h-screen bg-background pb-32 sm:text-[17px]">
      <AppHeader space="client" /><HelpChat groupKey={group.key} raised />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/espace" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Retour à la liste
          </Link>
          <div className="flex items-center gap-3 text-sm font-semibold text-primary">
            Étape {idx + 1} sur {steps.length}
            {steps.length <= 12 && (
              <span aria-hidden className="hidden gap-1 sm:flex">
                {steps.map((g, i) => (
                  <span key={g.key} className={cn("h-1.5 w-6 rounded-full", i === idx ? "bg-primary" : g.state === "done" ? "bg-primary/40" : "bg-cream-3")} />
                ))}
              </span>
            )}
          </div>
        </div>

        <Nudge done={progress.done} total={progress.total} />

        <div className="mt-6 flex items-start gap-4">
          <SupplierAvatar name={group.name} site={siteOf(group.name)} className="h-16 w-16 text-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight sm:text-3xl">{group.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {isSale ? "Votre client" : "Fournisseur"} · {group.txs.length} {noun}{plural(group.txs.length)} · total{" "}
              <strong className="text-foreground">{formatEUR(group.total)}</strong>
              {answered > 0 && ` · ${answered} déjà traité${plural(answered)}`}
            </p>
          </div>
          <GroupStatePill state={group.state} className="hidden sm:inline-flex" />
        </div>

        {pending.length === 0 && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl bg-mint-pale p-5 text-primary">
            <PartyPopper className="h-8 w-8 shrink-0" />
            <div>
              <p className="font-bold">Merci, tout est traité pour {group.name}.</p>
              <p className="text-sm">Passez à l'étape suivante avec le bouton « Suivant ».</p>
            </div>
          </div>
        )}

        {pending.length > 0 && <SousTitre className="mt-6">{SOUS_TITRES.paiements}</SousTitre>}
        <div className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
          {pending.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-pale-2 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3 font-semibold text-primary">
                <Checkbox
                  className="h-5 w-5"
                  checked={selected.length === pending.length}
                  onCheckedChange={(v) => setSel(new Set(v === true ? pending.map((t) => t.id) : []))}
                />
                Tout sélectionner pour {isSale ? "ce client" : "ce fournisseur"}
              </label>
              <span className="text-sm text-muted-foreground">
                {selected.length} sélectionné{plural(selected.length)} ·{" "}
                <strong className="text-foreground">{formatEUR(selected.reduce((s, t) => s + Math.abs(Number(t.amount)), 0))}</strong>
              </span>
            </div>
          )}
          <div aria-hidden className="hidden gap-x-4 border-b px-4 py-2 pl-12 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] sm:pr-32">
            <span>{isSale ? "Encaissé le" : "Payé le"}</span><span className="inline-flex items-center gap-1">Libellé bancaire <InfoTip label="Libellé bancaire" className="h-5 w-5">{INFOBULLES.libelle}</InfoTip></span><span className="text-right">Montant</span>
          </div>
          <ul className="divide-y">
            {group.txs.map((t) => (
              <TxRow
                key={t.id}
                tx={t}
                isSale={isSale}
                bilan={bilanOf(t)}
                selected={sel.has(t.id)}
                onToggle={(on) => toggle(t.id, on)}
                onFiles={(f) => !busy && uploadFiles(f, [t])}
              />
            ))}
          </ul>
        </div>

        {pending.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl sm:text-2xl">
              {selected.length === 0
                ? "Sélectionnez au moins une ligne ci-dessus"
                : selected.length === 1
                  ? "Votre choix"
                  : `Votre choix (${selected.length})`}
            </h2>
            {selected.length > 0 && <SousTitre>{SOUS_TITRES.choix}</SousTitre>}
            <div inert={selected.length === 0 || preview} className={cn("mt-5", (selected.length === 0 || preview) && "opacity-50")}>
              {checking && (
                <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-pale-2 p-3 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4 animate-pulse" /> Vérification de la facture (fournisseur et montant)…
                </p>
              )}
              <div className={cn("grid gap-3", isSale ? "sm:grid-cols-2" : "sm:grid-cols-2 md:grid-cols-3")}>
                {!isSale && (
                  <ChoiceTile emoji="🤖" tone="mint" open={mode === "source"} onToggle={() => setMode(mode === "source" ? null : "source")}
                    title="Automatiser" desc="Claude trouve où récupérer les factures de ce fournisseur, puis les collecte seul chaque mois." aide={AIDE_CHOIX.source} />
                )}
                <ChoiceTile emoji="📤" tone="mint" open={mode === "upload"} onToggle={() => setMode(mode === "upload" ? null : "upload")}
                  title="Déposer" desc="Envoyez la facture depuis votre ordinateur ou votre téléphone." aide={AIDE_CHOIX.upload} />
                <ChoiceTile emoji="🚫" tone="yellow" open={mode === "none"} onToggle={() => setMode(mode === "none" ? null : "none")}
                  title="Pas de facture" desc="Un mot d'explication aide votre comptable." aide={AIDE_CHOIX.none} />
                {!isSale && (
                  <ChoiceTile emoji="✉️" tone="pale" open={mode === "demande"} onToggle={() => setMode(mode === "demande" ? null : "demande")}
                    title="Demande par mail au fournisseur" desc="Un mail prêt à envoyer, depuis votre messagerie." aide={AIDE_CHOIX.demande} />
                )}
                {!isSale && (
                  <ChoiceTile emoji="🤝" tone="pale" open={mode === "cabinet"} onToggle={() => setMode(mode === "cabinet" ? null : "cabinet")}
                    title="Mon comptable s'en charge" desc="Il écrit au fournisseur pour vous." aide={AIDE_CHOIX.cabinet} />
                )}
              </div>

              {mode && <div className="mt-4"><EtApres>{AIDE_CHOIX[mode as Choix].apres}</EtApres></div>}

              {mode === "demande" && !isSale && (
                <ChoicePanel>
                  <DemandeParMail supplier={group.name} client={dossier.data?.name ?? ""} paiements={selected} adresseDossier={collect} />
                </ChoicePanel>
              )}

              {mode === "cabinet" && !isSale && (
                <ChoicePanel>
                  <ContactParCabinet dossierId={dossierId} supplier={group.name} client={dossier.data?.name ?? ""} paiements={selected}
                    adresseDossier={collect} onDone={() => setMode(null)} />
                </ChoicePanel>
              )}

              {mode === "source" && !isSale && (
                <ChoicePanel>
                  <InvoiceSourceSetup dossierId={dossierId} supplier={group.name} onFiles={busy ? undefined : (f) => upload(f, selected)} />
                </ChoicePanel>
              )}

              {mode === "upload" && (
                <ChoicePanel>
                  <DropZone busy={busy} several={selected.length > 1} noun={noun} onFiles={(f) => uploadFiles(f, selected)} />
                  {!isSale && selected.some((t) => estGroupe(t.label)) && (
                    <ReleveGroupe busy={busy} onFiles={(f) => upload(f, selected.filter((t) => estGroupe(t.label)), { releve: true })} />
                  )}
                  {!isSale && <PhotoSansFacture busy={busy} onFiles={(f) => upload(f, selected, { photoSansFacture: true })} />}
                </ChoicePanel>
              )}

              {mode === "email" && (
                <ChoicePanel>
                  {collect ? (
                    <>
                      <p className="font-semibold">Transférez vos factures à cette adresse : elles arrivent directement dans votre dossier.</p>
                      <div className="mt-3 flex flex-col gap-3 rounded-xl border bg-pale-2 p-3 sm:flex-row sm:items-center">
                        <code className="flex-1 break-all px-1 font-mono font-semibold text-primary">{collect}</code>
                        <Button variant="outline" size="lg" onClick={() => { navigator.clipboard.writeText(collect); toast.success("Adresse copiée"); }}>
                          <Copy /> Copier
                        </Button>
                      </div>
                      <Button asChild size="xl" className="mt-4">
                        <a href={mailtoFactures(collect, selected)}><MailPlus /> Ouvrir ma messagerie</a>
                      </Button>
                      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0" />
                          Votre messagerie s'ouvre avec l'adresse déjà remplie : joignez-y la facture en PDF (ou transférez l'e-mail qui la contient), puis envoyez.
                        </li>
                        <li className="flex gap-2">
                          <Info className="mt-0.5 h-4 w-4 shrink-0" />
                          {isSale
                            ? `Depuis votre logiciel de facturation, vous pouvez aussi ajouter cette adresse en copie lorsque vous envoyez une facture à ${group.name}.`
                            : `Dans votre compte ${group.name}, vous pouvez aussi ajouter cette adresse comme e-mail de réception des factures : elles nous arriveront automatiquement.`}
                        </li>
                      </ul>
                      <Button size="xl" variant="outline" className="mt-5" disabled={busy} onClick={markEmail}>
                        <Check /> C'est fait, je les ai envoyées
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      L'adresse de réception n'est pas encore renseignée par votre cabinet. Utilisez plutôt le dépôt de fichiers.
                    </p>
                  )}
                </ChoicePanel>
              )}

              {mode === "none" && (
                <ChoicePanel>
                  <label htmlFor="no-invoice-comment" className="text-sm font-semibold">Votre commentaire (facultatif)</label>
                  <Textarea id="no-invoice-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                    placeholder={isSale ? "Par exemple : apport, virement entre mes comptes…" : "Par exemple : facture introuvable, achat personnel…"}
                    className="mt-2 bg-card md:text-base" />
                  <NoInvoiceWarning text={isSale ? NO_INVOICE_NOTE_SALE : NO_INVOICE_WARNING} />
                  <Button size="xl" className="mt-5" disabled={busy} onClick={markNoInvoice}>
                    Je confirme : pas de facture pour {selected.length > 1 ? `ces ${selected.length} ${noun}s` : thisOne}
                  </Button>
                </ChoicePanel>
              )}
            </div>
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3 px-4 py-3">
          <Button size="xl" variant="outline" className="w-auto" onClick={goPrevious}>
            <ArrowLeft /> Précédent
          </Button>
          <Button size="xl" className="flex-1 sm:ml-auto sm:flex-none" onClick={goNext}>
            Suivant <ArrowRight className="text-mint" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx, isSale, bilan, selected, onToggle, onFiles }: {
  tx: Tx; isSale: boolean; bilan: Bilan; selected: boolean; onToggle: (on: boolean) => void; onFiles: (f: File[]) => void;
}) {
  const todo = tx.status === "a_faire";
  const amount = formatEUR(Math.abs(Number(tx.amount)));
  return (
    <li
      className={cn("flex items-center gap-3 px-4 py-3", todo && selected && "bg-mint-pale/70")}
      onDragOver={(e) => todo && e.preventDefault()}
      onDrop={(e) => { if (!todo) return; e.preventDefault(); onFiles([...e.dataTransfer.files]); }}
    >
      {todo ? (
        <Checkbox className="h-5 w-5" checked={selected} onCheckedChange={(v) => onToggle(v === true)}
          aria-label={`Sélectionner le paiement du ${formatDate(tx.date)} de ${amount}`} />
      ) : (
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-soft text-primary">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-x-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] sm:items-center">
        <span className="order-2 text-sm text-muted-foreground sm:order-none sm:font-mono sm:text-foreground">
          <span className="sm:hidden">{isSale ? "Encaissé le " : "Payé le "}</span>{formatDate(tx.date)}
        </span>
        <span className="order-3 min-w-0 sm:order-none">
          <span className="block truncate font-mono text-sm text-muted-foreground" title={tx.label}>{tx.label}</span>
          {tx.comment && <span className="block truncate text-sm italic text-muted-foreground" title={tx.comment}>« {tx.comment} »</span>}
          <BilanLine bilan={bilan} />
        </span>
        <span className="order-1 font-bold tabular-nums sm:order-none sm:text-right">{amount}</span>
      </div>
      <TxStatusPill status={tx.status} />
    </li>
  );
}

const TILE = { mint: "bg-mint-soft text-primary", pale: "bg-pale text-primary", yellow: "bg-yellow-soft text-yellow-ink" };

// The short description stays visible under the title (retour de Julien); the "?" says when to pick it and what follows.
function ChoiceTile({ emoji, tone, open, onToggle, title, desc, aide }: {
  emoji: string; tone: keyof typeof TILE; open: boolean; onToggle: () => void; title: string; desc: string; aide: AideChoix;
}) {
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={onToggle}
        className={cn(
          "flex h-full w-full items-center gap-3 rounded-2xl bg-card p-4 pr-10 text-left shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-col sm:pr-4 sm:pt-5 sm:text-center",
          open ? "border-2 border-primary" : "border hover:border-primary/40",
        )}>
        <span aria-hidden className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl", TILE[tone])}>
          {emoji}
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold leading-snug text-primary">{title}</span>
          <span className="mt-1 block text-sm leading-snug text-muted-foreground">{desc}</span>
        </span>
      </button>
      <InfoTip label={title} className="absolute right-2 top-2">
        <p><strong>Quand le choisir ?</strong> {aide.quand}</p>
        <p className="mt-2"><strong>Et ensuite ?</strong> {aide.apres}</p>
      </InfoTip>
    </div>
  );
}

function ChoicePanel({ children }: { children: ReactNode }) {
  return <div className="mt-4 rounded-2xl border-2 border-primary bg-card p-5 shadow-sm sm:p-6">{children}</div>;
}

// Simon 7: a monthly card debit or a grouped transfer covers several purchases. The client deposits the statement;
// the firm cuts the line into operations and then asks for each invoice.
function ReleveGroupe({ busy, onFiles }: { busy: boolean; onFiles: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-4 rounded-xl border border-dashed bg-pale-2 p-4 text-sm">
      <p className="font-semibold text-primary">Ce paiement regroupe plusieurs achats (débit carte du mois, virement groupé) ?</p>
      <p className="mt-1 text-muted-foreground">
        Déposez plutôt le relevé de carte ou le détail du virement : votre cabinet découpera ce paiement en opérations, puis vous
        demandera la facture de chacune.
      </p>
      <Button variant="outline" size="lg" className="mt-3" disabled={busy} onClick={() => input.current?.click()}>
        <FileText /> Déposer le relevé ou le détail
      </Button>
      <input ref={input} type="file" accept={ACCEPT} className="hidden"
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}

// Retour de Stéphane: a photo instead of a missing invoice (fuel pump…), accepted as an exception, without VAT.
function PhotoSansFacture({ busy, onFiles }: { busy: boolean; onFiles: (f: File[]) => void }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
        Pas de facture du tout ? Je n'ai qu'une photo (par exemple la pompe à carburant)
      </button>
      {open && (
        <div className="mt-3">
          <NoInvoiceWarning text={PHOTO_SANS_FACTURE_NOTE} />
          <Button variant="outline" size="lg" className="mt-3" disabled={busy} onClick={() => input.current?.click()}>
            <Camera /> Déposer la photo (sans TVA déductible)
          </Button>
          <input ref={input} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
            onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
      )}
    </div>
  );
}

// "Demande par mail au fournisseur" (retour de Julien, point 9): the text opens in the client's own mail app,
// nothing is sent by the app.
function DemandeParMail({ supplier, client, paiements, adresseDossier }: {
  supplier: string; client: string; paiements: Tx[]; adresseDossier: string | null | undefined;
}) {
  const [to, setTo] = useState("");
  const [ref, setRef] = useState("");
  const d = demandeFournisseur({ fournisseur: supplier, client, referenceClient: ref, paiements, adresseDossier });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          <span>E-mail du fournisseur (facultatif)</span>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ex. factures@fournisseur.fr" className="bg-card font-normal" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>Votre référence client chez lui (facultatif)</span>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. n° de client ou de contrat" className="bg-card font-normal" />
        </label>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border bg-pale-2 p-3 font-sans text-sm text-muted-foreground">{`Objet : ${d.subject}\n\n${d.body}`}</pre>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg"><a href={mailtoDemande(to, d)}><MailPlus /> Ouvrir ma messagerie</a></Button>
        <Button variant="outline" size="lg" onClick={() => { navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`); toast.success("Texte copié"); }}>
          <Copy /> Copier le texte
        </Button>
      </div>
    </div>
  );
}

// What Claude read on the files of one payment.
function BilanLine({ bilan: b }: { bilan: Bilan }) {
  if (!b.lues) return null;
  const doubt = b.fournisseursDouteux.length > 0;
  const text =
    b.etat === "complet" ? "Facture vérifiée : le montant correspond"
    : b.etat === "partiel" ? `Déposé ${formatEUR(b.totalLu)} · reste ${formatEUR(b.reste)} à justifier : ajoutez une facture`
    : b.etat === "excedent" ? `Factures déposées : ${formatEUR(b.totalLu)}, au-delà du montant payé`
    : b.etat === "non_valable" ? `${b.nonValables.join(", ")} n'est pas une facture : déposez la facture définitive`
    : "Pièce reçue, vérifiée par votre cabinet";
  const ok = b.etat === "complet" && !doubt && !b.nonValables.length;
  return (
    <span className={cn("mt-0.5 block text-sm font-semibold", ok ? "text-primary" : "text-yellow-ink")}>
      {ok ? "✓ " : "⚠ "}{text}
      {doubt && <span className="block font-normal">Fournisseur lu sur la facture : {b.fournisseursDouteux.join(", ")}. Est-ce bien la bonne ?</span>}
    </span>
  );
}

function DropZone({ busy, several, noun, onFiles }: { busy: boolean; several: boolean; noun: string; onFiles: (f: File[]) => void }) {
  const files = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) onFiles([...e.dataTransfer.files]); }}
      className={cn("flex flex-col items-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-8", over ? "border-primary bg-pale" : "border-input bg-pale-2/60")}
    >
      <CloudUpload aria-hidden className="h-9 w-9 text-primary" />
      <p className="mt-2 font-bold text-primary">{busy ? "Envoi en cours…" : "Glissez vos factures ici"}</p>
      <p className="text-sm text-muted-foreground">ou</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="lg" disabled={busy} onClick={() => files.current?.click()}>
          <FolderOpen /> Choisir des fichiers
        </Button>
        <Button variant="outline" size="lg" className="sm:hidden" disabled={busy} onClick={() => photo.current?.click()}>
          <Camera /> Prendre une photo
        </Button>
      </div>
      <input ref={files} type="file" multiple accept={ACCEPT} className="hidden" onChange={pick} />
      <input ref={photo} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={pick} />
      <p className="mt-3 text-sm text-muted-foreground">Formats acceptés : <strong>PDF, JPG ou PNG</strong></p>
      {several && (
        <p className="mt-2 text-sm text-muted-foreground">
          Plusieurs fichiers d'un coup : ils sont associés aux {noun}s sélectionnés, dans l'ordre des dates.
        </p>
      )}
    </div>
  );
}

function NoInvoiceWarning({ text }: { text: string }) {
  const [title, ...lines] = text.split("\n");
  return (
    <div role="note" className="mt-4 flex gap-3 rounded-xl border border-yellow/60 bg-yellow-soft/60 p-4 text-sm text-yellow-ink">
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-2">
        <p className="font-bold">{title}</p>
        <ul className="space-y-1">
          {lines.filter((l) => l.startsWith("–")).map((l) => <li key={l}>{l}</li>)}
        </ul>
        {lines.filter((l) => !l.startsWith("–")).map((l) => <p key={l}>{l}</p>)}
      </div>
    </div>
  );
}
