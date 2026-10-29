import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, ChevronDown, ChevronRight, Layers, List, Download, Eye, Inbox, Pencil, RotateCcw, Scissors, Search, Send, ListFilter, Sparkles, Undo2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AnnulerDecoupage, Decoupage } from "@/components/Decoupage";
import { FilterChip } from "@/components/FilterChip";
import { Pill, ReviewPill, TxStatusPill } from "@/components/StatusPill";
import { SortHeader } from "@/components/SortHeader";
import { compareBy, useSort } from "@/lib/sort";
import { formatDate, formatEUR, type Tx } from "@/lib/session";
import { matchesSearch, txHaystack } from "@/lib/priority";
import { regrouper, type Groupe } from "@/lib/regroupement";
import { cn } from "@/lib/utils";

type Upload = { id: string; transaction_id: string; storage_path: string; file_name: string };
export type Tab = "all" | "pending" | "waiting" | "answered" | "dismissed";
export const TABS: Tab[] = ["all", "pending", "waiting", "answered", "dismissed"];
type SortKey = "date" | "label" | "supplier" | "amount";

// Where a line stands for the firm: to review, sent and waiting, answered by the client, or not requested.
const stateOf = (t: Tx): Exclude<Tab, "all"> =>
  t.review_state === "pending" ? "pending" : t.review_state === "dismissed" ? "dismissed" : t.status === "a_faire" ? "waiting" : "answered";
// Lines still waiting for the client can be withdrawn too (demande de Julien, 29/10/2026).
// A bank line cut into operations (Simon 7) is replaced by them: it is never sent or reactivated as such.
const selectable = (t: Tx) => stateOf(t) !== "answered" && !t.decoupee;
const accountsOf = (t: Tx) => (t.counterpart_accounts ?? "").split(",").map((a) => a.trim()).filter(Boolean);
const PAGE = 100;
// Ids per update: hundreds of ids in one request make its URL too long.
const BATCH = 100;
const supplierLabel = (name: string) => (name === "Autre" ? "Tiers non identifié" : name);
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
// What is left to justify, as on the dashboard: requests not dismissed and still waiting for a document.
const toJustify = (ts: Tx[]) => ts.filter((t) => t.review_state !== "dismissed" && t.status === "a_faire").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
const GROUP_PAGE = 50;

// All the open lines of a dossier in one table: review, bulk actions, search, filters and sorting.
// Lines are grouped by supplier by default, without asking the firm (Julien, 29/10/2026); "Liste" shows them one by one.
export function LinesTable({ txs, uploads, onChanged, onRename, onDownload, onSaisie, initialTab }: {
  txs: Tx[]; uploads: Upload[]; onChanged: () => void;
  onRename: (detected: string, current: string) => Promise<string | null>; onDownload: (path: string) => void;
  onSaisie?: (uploadId: string) => void; initialTab?: Tab | undefined;
}) {
  const [tab, setTab] = useState<Tab>(() => initialTab ?? (txs.some((t) => t.review_state === "pending") ? "pending" : "all"));
  const [view, setView] = useState<"groupes" | "liste">("groupes");
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // Filter on one tiers. After a rename it keeps the old name until the lines are reloaded.
  const [supplier, setSupplier] = useState<{ name: string; was?: string } | null>(null);
  const [dir, setDir] = useState<"all" | "out" | "in">("all");
  const [account, setAccount] = useState("all");
  const [sort, toggleSort] = useSort<SortKey>({ key: "date", dir: "desc" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);

  const prefixes = [...new Set(txs.flatMap((t) => accountsOf(t).map((a) => a.slice(0, 3))))].sort();
  // Ignored once no line has that name any more (renamed or closed by a sync).
  const tiers = [supplier?.name, supplier?.was].find((n) => n !== undefined && txs.some((t) => t.supplier === n)) ?? null;
  const base = txs.filter(
    (t) =>
      (tiers === null || t.supplier === tiers) &&
      (dir === "all" || t.direction === dir) &&
      (account === "all" || accountsOf(t).some((a) => a.startsWith(account))) &&
      matchesSearch(txHaystack(t), query),
  );
  const count = (s: Exclude<Tab, "all">) => base.filter((t) => stateOf(t) === s).length;
  const get: Record<SortKey, (t: Tx) => string | number> = {
    date: (t) => t.date,
    label: (t) => t.label,
    supplier: (t) => t.supplier,
    amount: (t) => Math.abs(Number(t.amount)),
  };
  const rows = base.filter((t) => tab === "all" || stateOf(t) === tab).sort(compareBy(get[sort.key], sort.dir));
  const shown = rows.slice(0, limit);
  const groupValue: Record<SortKey, (g: Groupe<Tx>) => string | number> = {
    date: (g) => g.lines.reduce((m, t) => (t.date > m ? t.date : m), ""),
    label: (g) => g.name,
    supplier: (g) => g.name,
    amount: (g) => g.lines.reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
  };
  const groups = view === "groupes" ? regrouper(rows).sort(compareBy(groupValue[sort.key], sort.dir)) : [];
  const shownGroups = groups.slice(0, Math.ceil(limit / PAGE) * GROUP_PAGE);
  // A search or a tiers filter opens every group, so the lines found are visible at once.
  const isOpen = (g: Groupe<Tx>) => opened.has(g.key) || tiers !== null || query.trim() !== "";
  const toggleGroup = (key: string) =>
    setOpened((o) => {
      const n = new Set(o);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  const checkable = rows.filter(selectable);
  const allChecked = checkable.length > 0 && checkable.every((t) => sel.has(t.id));
  const selected = txs.filter((t) => sel.has(t.id) && selectable(t));
  const selPending = selected.filter((t) => t.review_state === "pending");
  const selDismissed = selected.filter((t) => t.review_state === "dismissed");
  const selWaiting = selected.filter((t) => stateOf(t) === "waiting");
  // Every request the client can see in this dossier, answered or not, whatever the filters.
  const allSent = txs.filter((t) => t.review_state === "sent");

  const toggle = (ids: string[], on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  async function setState(ids: string[], review_state: "sent" | "dismissed" | "pending", msg: string) {
    if (!ids.length) return;
    setBusy(true);
    const done: string[] = [];
    let failure: string | null = null;
    for (let i = 0; i < ids.length; i += BATCH) {
      const part = ids.slice(i, i + BATCH);
      const { error } = await supabase.from("transactions").update({ review_state }).in("id", part);
      if (error) { failure = error.message; break; }
      done.push(...part);
    }
    setBusy(false);
    if (done.length) { toggle(done, false); onChanged(); }
    if (failure) toast.error(done.length ? `${plural(done.length, "ligne")} sur ${ids.length} traitée${done.length > 1 ? "s" : ""}, puis erreur : ${failure}` : failure);
    else toast.success(msg);
  }
  // Withdrawing a request sends the line back to "À valider": the client no longer sees it (RLS shows "sent" lines only).
  // Nothing is deleted: comment, files and history stay, and the line can be sent again later.
  function withdraw(ids: string[], all = false) {
    const n = plural(ids.length, "demande");
    const what = all ? `toutes les demandes envoyées au client (${ids.length}), y compris celles auxquelles il a déjà répondu` : n;
    if (!window.confirm(`Retirer ${what} de l'espace du client ? ${ids.length > 1 ? "Les lignes repasseront" : "La ligne repassera"} « À valider » ; les fichiers et commentaires déjà reçus sont conservés.`)) return;
    void setState(ids, "pending", `${n} retirée${ids.length > 1 ? "s" : ""} de l'espace du client`);
  }
  // One payment line of the table, the same in both views.
  const line = (t: Tx) => {
    const files = uploads.filter((u) => u.transaction_id === t.id);
    const state = stateOf(t);
    return (
      <tr key={t.id} className={cn("align-top", sel.has(t.id) && "bg-mint-pale")}>
        <td className="px-3 py-2.5">
          {selectable(t) && (
            <Checkbox checked={sel.has(t.id)} onCheckedChange={(v) => toggle([t.id], v === true)}
              aria-label={`Sélectionner ${t.supplier}, ${formatEUR(Math.abs(Number(t.amount)))} le ${formatDate(t.date)}`} />
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums">{formatDate(t.date)}</td>
        <td className="max-w-[18rem] px-3 py-2.5">
          <div className="truncate font-mono" title={t.label}>{t.label}</div>
          {t.parent_id && <div className="mt-1 text-xs text-muted-foreground"><Scissors className="mr-1 inline h-3 w-3" />Opération issue d'un découpage</div>}
          {t.comment && <div className="mt-1 text-xs italic text-muted-foreground">« {t.comment} »</div>}
          {files.map((u) => (
            <div key={u.id} className="flex max-w-full items-center gap-2">
              <button type="button" onClick={() => onDownload(u.storage_path)}
                className="mt-1 flex min-h-6 min-w-0 items-center gap-1 py-1 text-xs font-semibold text-primary hover:underline">
                <Download className="h-3 w-3 shrink-0" /> <span className="truncate">{u.file_name}</span>
              </button>
              {onSaisie && t.direction === "out" && (
                <button type="button" onClick={() => onSaisie(u.id)} title="Faire saisir cette facture par Claude"
                  className="mt-1 flex min-h-6 shrink-0 items-center gap-1 rounded-full bg-pale-2 px-2 py-0.5 text-xs font-semibold text-primary hover:underline">
                  <Sparkles className="h-3 w-3" /> Saisie augmentée
                </button>
              )}
            </div>
          ))}
        </td>
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-1">
            <button type="button" title="Afficher seulement ce tiers" aria-label={`${supplierLabel(t.supplier)} : afficher seulement ce tiers`}
              onClick={() => filterBy(() => setSupplier({ name: t.supplier }))}
              className={cn("text-left hover:underline", t.supplier === "Autre" && "italic text-muted-foreground")}>
              {supplierLabel(t.supplier)}
            </button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" title="Corriger le tiers"
              aria-label={`Corriger le tiers ${t.supplier}`}
              onClick={() => renameTiers(t)}>
              <Pencil className="!size-3.5" />
            </Button>
          </span>
        </td>
        <td className="px-3 py-2.5">
          {accountsOf(t).map((a) => <span key={a} className="mr-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{a}</span>)}
        </td>
        <td className="px-3 py-2.5">
          {t.direction === "in"
            ? <Pill tone="ok" icon={ArrowDownLeft}>Vente</Pill>
            : <Pill tone="muted" icon={ArrowUpRight}>Achat</Pill>}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums">{formatEUR(Math.abs(Number(t.amount)))}</td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {t.decoupee ? (
              <>
                <Pill tone="muted" icon={Scissors}>Découpée en opérations</Pill>
                <AnnulerDecoupage tx={t} onDone={onChanged} />
              </>
            ) : state === "answered" ? <TxStatusPill status={t.status} /> : <ReviewPill state={t.review_state ?? "sent"} />}
            {state === "pending" && (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setState([t.id], "sent", "Ligne envoyée au client")}>
                  <Send /> Envoyer au client
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={busy} title="Ne pas demander" aria-label="Ne pas demander"
                  onClick={() => setState([t.id], "dismissed", "Ligne non demandée")}>
                  <Ban />
                </Button>
              </>
            )}
            {state === "dismissed" && !t.decoupee && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setState([t.id], "pending", "Ligne réactivée")}>
                <RotateCcw /> Réactiver
              </Button>
            )}
            {state === "waiting" && (
              <Button size="sm" variant="outline" disabled={busy} title="Ne plus montrer cette demande au client"
                onClick={() => withdraw([t.id])}>
                <Undo2 /> Retirer la demande
              </Button>
            )}
            {t.direction === "out" && !t.parent_id && !t.decoupee && state !== "dismissed" && (
              <Decoupage tx={t} files={files} onDone={onChanged} />
            )}
          </div>
        </td>
      </tr>
    );
  };

  const filterBy = (set: () => void) => { set(); setLimit(PAGE); };
  // A filter on the renamed tiers follows the new name, unless other lines keep the old one.
  async function renameTiers(t: Tx) {
    const keptByOthers = txs.some((x) => x.supplier === t.supplier && x.supplier_detected !== t.supplier_detected);
    const name = await onRename(t.supplier_detected, t.supplier);
    if (name && !keptByOthers) setSupplier((s) => (s?.name === t.supplier ? { name, was: t.supplier } : s));
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip size="sm" active={tab === "all"} onClick={() => filterBy(() => setTab("all"))} count={base.length}>Toutes</FilterChip>
        <FilterChip size="sm" active={tab === "pending"} onClick={() => filterBy(() => setTab("pending"))} count={count("pending")} icon={Eye}>À valider</FilterChip>
        <FilterChip size="sm" active={tab === "waiting"} onClick={() => filterBy(() => setTab("waiting"))} count={count("waiting")} icon={Send}>En attente du client</FilterChip>
        <FilterChip size="sm" active={tab === "answered"} onClick={() => filterBy(() => setTab("answered"))} count={count("answered")} icon={Inbox}>Réponses reçues</FilterChip>
        <FilterChip size="sm" active={tab === "dismissed"} onClick={() => filterBy(() => setTab("dismissed"))} count={count("dismissed")} icon={Ban}>Non demandées</FilterChip>
        {allSent.length > 0 && (
          <Button size="sm" variant="outline" disabled={busy} className="ml-auto"
            title="Remettre toutes les demandes de ce dossier « À valider » : le client ne les voit plus"
            onClick={() => withdraw(allSent.map((t) => t.id), true)}>
            <Undo2 /> Tout retirer de l'espace client ({allSent.length})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip size="sm" active={view === "groupes"} onClick={() => filterBy(() => setView("groupes"))} icon={Layers}>Par fournisseur</FilterChip>
        <FilterChip size="sm" active={view === "liste"} onClick={() => filterBy(() => setView("liste"))} icon={List}>Liste</FilterChip>
        <label className="relative min-w-[16rem] flex-1">
          <span className="sr-only">Rechercher une ligne</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => filterBy(() => setQuery(e.target.value))}
            placeholder="Libellé, tiers, montant ou date" className="h-9 bg-card pl-9" />
        </label>
        {tiers !== null && (
          <span className="inline-flex h-9 items-center gap-1 rounded-full border border-primary/30 bg-pale-2 pl-3 pr-1 text-sm font-semibold text-primary">
            Tiers : {supplierLabel(tiers)}
            <button type="button" aria-label={`Retirer le filtre sur le tiers ${supplierLabel(tiers)}`} onClick={() => filterBy(() => setSupplier(null))}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-pale focus-visible:outline-2 focus-visible:outline-primary">
              <X className="h-4 w-4" />
            </button>
          </span>
        )}
        <Select label="Sens" value={dir} onChange={(v) => filterBy(() => setDir(v as typeof dir))}
          options={[["all", "Achats et ventes"], ["out", "Achats"], ["in", "Ventes"]]} />
        {prefixes.length > 1 && (
          <Select label="Compte" value={account} onChange={(v) => filterBy(() => setAccount(v))}
            options={[["all", "Tous les comptes"], ...prefixes.map((p) => [p, `Compte ${p}`] as [string, string])]} />
        )}
      </div>

      {selected.length > 0 ? (
        <div role="region" aria-label="Actions groupées" className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-primary-foreground shadow-lg">
          <span className="mr-2 flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-mint" /> {plural(selected.length, "ligne")} sélectionnée{selected.length > 1 ? "s" : ""}
          </span>
          {selPending.length > 0 && (
            <>
              <Button size="sm" disabled={busy} className="bg-mint text-primary hover:bg-mint-soft focus-visible:ring-mint focus-visible:ring-offset-primary"
                onClick={() => setState(selPending.map((t) => t.id), "sent", `${plural(selPending.length, "ligne")} envoyée${selPending.length > 1 ? "s" : ""} au client`)}>
                <Send /> Envoyer au client ({selPending.length})
              </Button>
              <Button size="sm" variant="outline" disabled={busy}
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-mint focus-visible:ring-offset-primary"
                onClick={() => setState(selPending.map((t) => t.id), "dismissed", `${plural(selPending.length, "ligne")} non demandée${selPending.length > 1 ? "s" : ""}`)}>
                <Ban /> Ne pas demander ({selPending.length})
              </Button>
            </>
          )}
          {selDismissed.length > 0 && (
            <Button size="sm" variant="outline" disabled={busy}
              className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-mint focus-visible:ring-offset-primary"
              onClick={() => setState(selDismissed.map((t) => t.id), "pending", `${plural(selDismissed.length, "ligne")} réactivée${selDismissed.length > 1 ? "s" : ""}`)}>
              <RotateCcw /> Réactiver ({selDismissed.length})
            </Button>
          )}
          {selWaiting.length > 0 && (
            <Button size="sm" variant="outline" disabled={busy}
              className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-mint focus-visible:ring-offset-primary"
              onClick={() => withdraw(selWaiting.map((t) => t.id))}>
              <Undo2 /> Retirer la demande ({selWaiting.length})
            </Button>
          )}
          <button type="button" className="ml-auto rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint" onClick={() => setSel(new Set())}>
            Annuler la sélection
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Les lignes « À valider » ne sont pas visibles par le client tant que vous ne les avez pas envoyées.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="border-b bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="w-36 px-3 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 font-semibold">
                  <Checkbox checked={allChecked} disabled={checkable.length === 0}
                    onCheckedChange={(v) => toggle(checkable.map((t) => t.id), v === true)} />
                  Tout cocher{checkable.length > 0 && ` (${checkable.length})`}
                </label>
              </th>
              <SortHeader label="Date" k="date" sort={sort} onSort={toggleSort} firstDir="desc" />
              <SortHeader label="Libellé bancaire" k="label" sort={sort} onSort={toggleSort} />
              <SortHeader label="Tiers" k="supplier" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-3 py-2.5 font-semibold">Compte</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Sens</th>
              <SortHeader label="Montant" k="amount" sort={sort} onSort={toggleSort} firstDir="desc" align="right" />
              <th scope="col" className="px-3 py-2.5 font-semibold">Revue</th>
            </tr>
          </thead>
          {view === "liste" ? (
            <tbody className="divide-y">
              {shown.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Aucune ligne.</td></tr>
              )}
              {shown.map(line)}
            </tbody>
          ) : (
            <>
              {shownGroups.length === 0 && (
                <tbody><tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Aucune ligne.</td></tr></tbody>
              )}
              {shownGroups.map((g) => {
                const open = isOpen(g);
                const ids = g.lines.filter(selectable).map((t) => t.id);
                const pending = g.lines.filter((t) => stateOf(t) === "pending");
                const waiting = g.lines.filter((t) => stateOf(t) === "waiting");
                const answered = g.lines.filter((t) => stateOf(t) === "answered").length;
                const label = supplierLabel(g.name);
                return (
                  <tbody key={g.key} className="divide-y border-t-2 border-muted">
                    <tr className="bg-pale-2/50 align-middle">
                      <td className="px-3 py-2.5">
                        {ids.length > 0 && (
                          <Checkbox checked={ids.every((id) => sel.has(id))} onCheckedChange={(v) => toggle(ids, v === true)}
                            aria-label={`Sélectionner les ${ids.length} lignes de ${label}`} />
                        )}
                      </td>
                      <td colSpan={5} className="px-3 py-2.5">
                        <button type="button" aria-expanded={open} onClick={() => toggleGroup(g.key)}
                          className="flex w-full items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-primary">
                          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-primary" />}
                          <span className={cn("font-bold text-primary", g.name === "Autre" && "italic")}>{label}</span>
                          <span className="text-muted-foreground">· {plural(g.lines.length, "ligne")}</span>
                          {pending.length > 0 && <Pill tone="todo" icon={Eye}>{pending.length} à valider</Pill>}
                          {waiting.length > 0 && <Pill tone="info" icon={Send}>{waiting.length} en attente</Pill>}
                          {answered > 0 && <Pill tone="ok" icon={Inbox}>{answered} reçue{answered > 1 ? "s" : ""}</Pill>}
                        </button>
                        {g.names.length > 1 && (
                          <div className="ml-6 mt-0.5 text-xs text-muted-foreground">Regroupe : {g.names.map(supplierLabel).join(", ")}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <div className="font-bold tabular-nums">{formatEUR(toJustify(g.lines))}</div>
                        <div className="text-xs text-muted-foreground">à justifier</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {pending.length > 0 && (
                            <>
                              <Button size="sm" variant="outline" disabled={busy} title={`Envoyer au client les ${pending.length} lignes à valider de ${label}`}
                                onClick={() => setState(pending.map((t) => t.id), "sent", `${plural(pending.length, "ligne")} de ${label} envoyée${pending.length > 1 ? "s" : ""} au client`)}>
                                <Send /> Envoyer ({pending.length})
                              </Button>
                              <Button size="icon" variant="outline" className="h-8 w-8" disabled={busy}
                                title={`Ne pas demander les ${pending.length} lignes à valider de ${label}`} aria-label={`Ne pas demander les lignes de ${label}`}
                                onClick={() => setState(pending.map((t) => t.id), "dismissed", `${plural(pending.length, "ligne")} de ${label} non demandée${pending.length > 1 ? "s" : ""}`)}>
                                <Ban />
                              </Button>
                            </>
                          )}
                          {waiting.length > 0 && (
                            <Button size="sm" variant="outline" disabled={busy} title={`Ne plus montrer au client les ${waiting.length} demandes de ${label}`}
                              onClick={() => withdraw(waiting.map((t) => t.id))}>
                              <Undo2 /> Retirer ({waiting.length})
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && g.lines.map(line)}
                  </tbody>
                );
              })}
            </>
          )}
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5 text-sm text-muted-foreground">
          {view === "liste" ? (
            <>
              <span>{plural(shown.length, "ligne")} affichée{shown.length > 1 ? "s" : ""} sur {rows.length}</span>
              {rows.length > shown.length && (
                <Button variant="link" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Afficher les {Math.min(PAGE, rows.length - shown.length)} suivantes
                </Button>
              )}
            </>
          ) : (
            <>
              <span>{plural(shownGroups.length, "fournisseur")} affiché{shownGroups.length > 1 ? "s" : ""} sur {groups.length} ({plural(rows.length, "ligne")})</span>
              {groups.length > shownGroups.length && (
                <Button variant="link" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Afficher les {Math.min(GROUP_PAGE, groups.length - shownGroups.length)} suivants
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <ListFilter aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-md border border-input bg-card pl-9 pr-8 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
    </label>
  );
}
