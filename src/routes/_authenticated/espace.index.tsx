import { requireClient } from "@/lib/session";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpChat } from "@/components/HelpChat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowDownWideNarrow, ArrowRight, Building2, CalendarCheck, LayoutGrid, List, CheckCircle2, ChevronDown, ChevronRight, Clock, ReceiptText, Search, ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader, CabinetContact } from "@/components/AppHeader";
import { MultiActions } from "@/components/MultiActions";
import { MonthlyChart } from "@/components/MonthlyChart";
import { Nudge } from "@/components/Nudge";
import { SourcesSummary } from "@/components/SourcesSummary";
import { Checkbox } from "@/components/ui/checkbox";
import { useSupplierSites } from "@/lib/use-sites";
import { SupplierAvatar } from "@/components/brand";
import { FilterChip } from "@/components/FilterChip";
import { GroupStatePill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { useCabinet } from "@/lib/cabinet";
import { matchesSearch, prioritize, txHaystack } from "@/lib/priority";
import { chooseDossier, meQuery, groupBySupplier, formatDate, formatEUR, type SupplierGroup, type Tx } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/espace/")({
  beforeLoad: requireClient,
  head: () => ({
    meta: [
      { title: "Mes factures à transmettre — PBC List" },
      { name: "description", content: "Les factures fournisseurs que votre cabinet attend." },
      { property: "og:title", content: "Mes factures à transmettre — PBC List" },
      { property: "og:description", content: "Les factures fournisseurs que votre cabinet attend." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Espace,
});

export function useClientTxs() {
  const me = useQuery(meQuery);
  const dossierId = me.data?.dossierId;
  const txs = useQuery({
    queryKey: ["client-txs", dossierId],
    enabled: !!dossierId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("dossier_id", dossierId!)
        .eq("is_open", true)
        .eq("review_state", "sent")
        .order("date")
        .order("id");
      if (error) throw error;
      return data as Tx[];
    },
  });
  return { me, txs, dossierId };
}

export function useClientDossier(dossierId: string | null | undefined) {
  return useQuery({
    queryKey: ["dossier", dossierId],
    enabled: !!dossierId,
    queryFn: async () =>
      (await supabase.from("dossiers").select("name, collect_email, collect_email_customers").eq("id", dossierId!).single()).data,
  });
}

// "3 fournisseurs", "1 client" or "2 fournisseurs ou clients", depending on what is left to do.
function counterparts(groups: SupplierGroup[]) {
  const s = groups.length > 1 ? "s" : "";
  const out = groups.some((g) => g.direction === "out");
  const inn = groups.some((g) => g.direction === "in");
  const noun = out && inn ? `fournisseur${s} ou client${s}` : inn ? `client${s}` : `fournisseur${s}`;
  return `${groups.length} ${noun}`;
}

const todoCount = (g: SupplierGroup) => g.txs.filter((t) => t.status === "a_faire").length;
// Amount still to justify for a supplier (Simon: sort by it, largest first).
const toJustify = (g: SupplierGroup) => g.txs.filter((t) => t.status === "a_faire").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

// Payment dates (Stéphane): those still to justify, or all of them once the supplier is done.
function paymentDates(g: SupplierGroup) {
  const days = (g.txs.some((t) => t.status === "a_faire") ? g.txs.filter((t) => t.status === "a_faire") : g.txs).map((t) => t.date).sort();
  const verb = g.direction === "in" ? "Encaissé" : "Payé";
  return !days.length ? "" : days[0] === days.at(-1)
    ? `${verb} le ${formatDate(days[0]!)}`
    : `${verb}s du ${formatDate(days[0]!)} au ${formatDate(days.at(-1)!)}`;
}

function Espace() {
  const cabinet = useCabinet();
  const { me, txs, dossierId } = useClientTxs();
  const dossier = useClientDossier(dossierId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "todo" | "done">("all");
  const [dir, setDir] = useState<"all" | "out" | "in">("all");
  const [order, setOrder] = useState<"priority" | "amount" | "name">("priority");
  const [view, setView] = useState<"cards" | "list">("cards");
  // Several suppliers answered at once (Simon): their payments still to do.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const siteOf = useSupplierSites(dossierId);
  const qc = useQueryClient();
  async function switchDossier(id: string) {
    chooseDossier(id);
    setPicked(new Set());
    await qc.invalidateQueries({ queryKey: meQuery.queryKey });
  }

  const all = txs.data ?? [];
  const steps = prioritize(groupBySupplier(all));
  const remaining = all.filter((t) => t.status === "a_faire").length;
  const pendingGroups = steps.filter((g) => g.state !== "done");
  const next = pendingGroups[0];
  const years = [...new Set(all.filter((t) => t.status === "a_faire").map((t) => t.date.slice(0, 4)))].sort();
  const bothDirections = steps.some((g) => g.direction === "in") && steps.some((g) => g.direction === "out");

  const ordered =
    order === "priority" ? steps
    : order === "amount" ? [...steps].sort((a, b) => toJustify(b) - toJustify(a))
    : [...steps].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const visible = ordered.filter(
    (g) =>
      (status === "all" || (status === "done") === (g.state === "done")) &&
      (dir === "all" || g.direction === dir) &&
      g.txs.some((t) => matchesSearch(txHaystack(t), query)),
  );
  // Bulk actions (Simon): every supplier still to do among those shown can be ticked at once.
  const pickable = visible.filter((g) => g.state !== "done");
  const allPicked = pickable.length > 0 && pickable.every((g) => picked.has(g.key));
  const pick = (key: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(key); else n.delete(key);
      return n;
    });
  const filtered = query.trim() !== "" || status !== "all" || dir !== "all";

  return (
    <div className="min-h-screen bg-background pb-28 sm:text-[17px]">
      <AppHeader space="client" /><HelpChat raised={picked.size > 0} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {me.data && !me.data.dossierId ? (
          <p className="text-muted-foreground">Votre compte n'est rattaché à aucun dossier. Contactez votre cabinet.</p>
        ) : txs.isLoading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : (
          <>
            {/* Simon: the whole width is used and the client scrolls less: greeting and summary side by side. */}
            <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <div className="flex flex-col">
            <h1 className="text-2xl sm:text-3xl">Bonjour,</h1>
            {dossier.data?.name && (
              <p className="mt-1 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Building2 aria-hidden className="h-4 w-4 shrink-0" />
                {(me.data?.dossiers.length ?? 0) > 1 && !me.data?.preview ? (
                  <select aria-label="Changer de dossier" value={dossierId ?? ""} onChange={(e) => switchDossier(e.target.value)}
                    className="max-w-full truncate bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {me.data!.dossiers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : <span className="truncate">{dossier.data.name}</span>}
              </p>
            )}
            {remaining === 0 && (
              <p className="mt-3 max-w-2xl text-muted-foreground">
                {all.length === 0 ? "Aucune facture ne vous est demandée pour le moment." : "Merci pour vos réponses."}
              </p>
            )}
            <Nudge done={all.length - remaining} total={all.length} className="flex-1" />
            </div>

            {remaining === 0 ? (
              <section className="rounded-3xl bg-primary px-6 py-10 text-center text-primary-foreground sm:px-12">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mint text-primary">
                  <CheckCircle2 className="h-9 w-9" />
                </span>
                <h2 className="mt-5 text-2xl text-primary-foreground sm:text-3xl">Tout est à jour, merci !</h2>
                <p className="mt-2 text-primary-foreground/80">Nous n'attendons aucune facture de votre part pour le moment.</p>
              </section>
            ) : (
              <section className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-xl shadow-primary/20 sm:p-8">
                <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border-[56px] border-teal-2/60" />
                <div className="relative flex flex-1 flex-col justify-center">
                  {years.length > 0 && (
                    <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mint">
                      <CalendarCheck className="h-4 w-4" /> Opérations {years.length > 1 ? `${years[0]} – ${years.at(-1)}` : years[0]}
                    </p>
                  )}
                  <h2 className="mt-3 max-w-2xl text-2xl leading-tight text-primary-foreground sm:text-3xl">
                    Il nous manque {remaining} facture{remaining > 1 ? "s" : ""}
                    {remaining > 1 && pendingGroups.length > 1 ? ", réparties chez " : ", chez "}
                    {counterparts(pendingGroups)}
                  </h2>
                  {next && (
                    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                      <Link
                        to="/espace/$supplier"
                        params={{ supplier: next.key }}
                        className="inline-flex h-14 items-center gap-2 rounded-xl bg-mint px-7 text-lg font-bold text-primary shadow-lg transition-colors hover:bg-mint-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                      >
                        Je continue <ArrowRight className="h-5 w-5" />
                      </Link>
                      <span className="text-primary-foreground/85">
                        Prochaine étape : <strong className="text-primary-foreground">{next.name}</strong>, {todoCount(next)} facture
                        {todoCount(next) > 1 ? "s" : ""} à transmettre
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}
            </div>

            {(dossierId || all.length > 0) && (
              <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
                {dossierId && <SourcesSummary dossierId={dossierId} suppliers={[...new Set(all.filter((t) => t.direction === "out").map((t) => t.supplier))]} />}
                <MonthlyChart txs={all} className="h-full" />
              </div>
            )}

            {steps.length > 0 && (
              <div className="mt-8 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="relative flex-1 sm:min-w-[16rem]">
                    <span className="sr-only">Rechercher</span>
                    <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Rechercher un fournisseur, un montant, une date"
                      className="h-12 w-full rounded-xl border border-input bg-card pl-11 pr-3 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="relative sm:shrink-0">
                    <span className="sr-only">Ordre d'affichage</span>
                    <ArrowDownWideNarrow aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                    <select
                      value={order}
                      onChange={(e) => setOrder(e.target.value as "priority" | "amount" | "name")}
                      className="h-12 w-full appearance-none rounded-xl border border-input bg-card pl-11 pr-10 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="priority">Par priorité</option>
                      <option value="amount">Par montant à justifier (décroissant)</option>
                      <option value="name">Par ordre alphabétique</option>
                    </select>
                    <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {pickable.length > 0 && (
                    <label className="mr-1 flex cursor-pointer items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold text-primary">
                      <Checkbox checked={allPicked} onCheckedChange={(v) => setPicked(new Set(v === true ? pickable.map((g) => g.key) : []))} />
                      Tout cocher
                    </label>
                  )}
                  <FilterChip active={status === "todo"} onClick={() => setStatus((s) => (s === "todo" ? "all" : "todo"))} icon={Clock}>
                    À faire
                  </FilterChip>
                  <FilterChip active={status === "done"} onClick={() => setStatus((s) => (s === "done" ? "all" : "done"))} icon={CheckCircle2}>
                    Terminé
                  </FilterChip>
                  {bothDirections && (
                    <>
                      <span aria-hidden className="mx-1 h-6 w-px bg-cream-3" />
                      <FilterChip active={dir === "out"} onClick={() => setDir((d) => (d === "out" ? "all" : "out"))} icon={ShoppingBag}>
                        Achats
                      </FilterChip>
                      <FilterChip active={dir === "in"} onClick={() => setDir((d) => (d === "in" ? "all" : "in"))} icon={ReceiptText}>
                        Ventes
                      </FilterChip>
                    </>
                  )}
                  <span className="ml-auto inline-flex rounded-full border bg-card p-0.5" role="group" aria-label="Affichage">
                    {(["cards", "list"] as const).map((v) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                        className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", view === v ? "bg-primary text-primary-foreground" : "text-primary")}>
                        {v === "cards" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />} {v === "cards" ? "Cartes" : "Liste"}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
            )}

            {filtered && visible.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-cream-3 bg-card/60 p-6 text-center">
                <p className="text-muted-foreground">Aucun résultat pour cette recherche.</p>
                <Button variant="outline" className="mt-3" onClick={() => { setQuery(""); setStatus("all"); setDir("all"); }}>
                  Tout afficher
                </Button>
              </div>
            )}

            {(["out", "in"] as const).map((d) => {
              const list = visible.filter((g) => g.direction === d);
              if (!list.length) return null;
              const todo = list.reduce((n, g) => n + todoCount(g), 0);
              const Icon = d === "out" ? ShoppingBag : ReceiptText;
              return (
                <section key={d} className="mt-8">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <h2 className="flex items-center gap-3 text-xl sm:text-2xl">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pale text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      {d === "out" ? "Achats — factures fournisseurs manquantes" : "Ventes — factures clients manquantes"}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      {todo} à transmettre · {list.length} {d === "out" ? "fournisseur" : "client"}{list.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {view === "cards" ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((g) => (
                        <SupplierCard key={g.key} g={g} site={siteOf(g.name)} picked={picked.has(g.key)} onPick={(on) => pick(g.key, on)} />
                      ))}
                    </div>
                  ) : (
                    <ul className="mt-4 divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
                      {list.map((g) => (
                        <SupplierRow key={g.key} g={g} site={siteOf(g.name)} picked={picked.has(g.key)} onPick={(on) => pick(g.key, on)} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </>
        )}

        {dossierId && !me.data?.preview && (
          <MultiActions dossierId={dossierId} groups={steps.filter((g) => picked.has(g.key) && g.state !== "done")}
            onClear={() => setPicked(new Set())} />
        )}

        {(cabinet.email || cabinet.phone) && (
          <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            Une question ? {cabinet.name} vous répond : <CabinetContact />
          </div>
        )}
      </main>
    </div>
  );
}

function SupplierCard({ g, site, picked, onPick }: { g: SupplierGroup; site: string | null; picked: boolean; onPick: (on: boolean) => void }) {
  const done = g.txs.length - todoCount(g);
  const noun = g.direction === "in" ? "encaissement" : "paiement";
  const dates = paymentDates(g);
  return (
    <div className="relative">
    {g.state !== "done" && (
      <Checkbox className="absolute left-3 top-3 z-10 h-5 w-5 bg-card" checked={picked} onCheckedChange={(v) => onPick(v === true)}
        aria-label={`Sélectionner ${g.name} pour une action groupée`} />
    )}
    <Link
      to="/espace/$supplier"
      params={{ supplier: g.key }}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-4 pl-10 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        g.state === "done" ? "bg-card/60" : "bg-card shadow-sm",
        picked && "border-primary ring-2 ring-primary/30",
      )}
    >
      <SupplierAvatar name={g.name} site={site} />
      <div className="min-w-0 flex-1">
        {/* Simon: the full name, wrapped if needed, never cut. */}
        <div className="break-words text-lg font-bold leading-snug text-primary">{g.name}</div>
        <div className="text-sm text-muted-foreground">
          {g.txs.length} {noun}{g.txs.length > 1 ? "s" : ""} · <span className="font-semibold text-foreground">{formatEUR(g.total)}</span>
        </div>
        {dates && <div className="text-sm text-muted-foreground">{dates}</div>}
        {g.state === "progress" && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-cream-2">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((done / g.txs.length) * 100)}%` }} />
            </span>
            {done} sur {g.txs.length} traité{done > 1 ? "s" : ""}
          </div>
        )}
        <GroupStatePill state={g.state} className="mt-2" />
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
    </div>
  );
}

// List view (Simon): one compact row per supplier, ticked for a bulk action.
function SupplierRow({ g, site, picked, onPick }: { g: SupplierGroup; site: string | null; picked: boolean; onPick: (on: boolean) => void }) {
  const left = toJustify(g);
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", picked && "bg-mint-pale/70")}>
      {g.state !== "done" ? (
        <Checkbox className="h-5 w-5" checked={picked} onCheckedChange={(v) => onPick(v === true)} aria-label={`Sélectionner ${g.name} pour une action groupée`} />
      ) : (
        <span aria-hidden className="h-5 w-5" />
      )}
      <Link to="/espace/$supplier" params={{ supplier: g.key }} className="group flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <SupplierAvatar name={g.name} site={site} className="h-9 w-9 text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold text-primary">{g.name}</span>
          <span className="block truncate text-sm text-muted-foreground">{paymentDates(g)}</span>
        </span>
        <span className="text-right text-sm">
          <span className="block font-bold tabular-nums">{formatEUR(left || g.total)}</span>
          <span className="block text-xs text-muted-foreground">{left ? "à justifier" : "total"}</span>
        </span>
        <GroupStatePill state={g.state} className="hidden sm:inline-flex" />
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
