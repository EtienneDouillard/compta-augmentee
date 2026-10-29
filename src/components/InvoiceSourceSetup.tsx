import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Check, CheckCircle2, Copy, ExternalLink, Globe, Loader2, RotateCcw, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getInvoiceSource, saveInvoiceSource } from '@/lib/invoice-sources.functions';
import { receptionProven, type CollectResult } from '@/lib/invoice-sources';
import { guessSupplierSite, researchInvoiceSource, RESEARCH_VERSION, type SourceResearch } from '@/lib/invoice-research.functions';
import type { SetupStep } from '@/lib/source-steps';
import { checkInvoiceCollection } from '@/lib/invoice-collect.functions';
import { setRobotSource } from '@/lib/collector.functions';
import { RobotChrome } from '@/components/RobotChrome';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const InfoTip = ({ text }: { text: string }) => (
  <TooltipProvider delayDuration={0}><Tooltip>
    <TooltipTrigger asChild><button type="button" aria-label={text} className="ml-1 inline-flex align-middle text-muted-foreground"><Info className="h-3.5 w-3.5" /></button></TooltipTrigger>
    <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
  </Tooltip></TooltipProvider>
);

type CheckData = { results: CollectResult[]; steps: string[] };
const STATUS: Record<CollectResult['status'], string> = { conforme: '✓ Facture reçue et conforme', recu_pennylane: '✓ Facture dans Pennylane', non_conforme: '✗ Pièce non conforme', manquant: '• Pas encore reçue', email_annonce: '… Envoi annoncé' };
const METHOD = { email: 'E-mail vers Pennylane', browser: 'Téléchargement depuis le site', api: 'API', mcp: 'MCP' } as const;

/** Steps to show: Claude's checked steps (older research without direct links is redone). */
function stepsOf(r: SourceResearch): SetupStep[] {
  return r.version === RESEARCH_VERSION ? r.steps : [];
}

export function InvoiceSourceSetup({ dossierId, supplier, onFiles, guessUrl, labels }: { dossierId: string; supplier: string; onFiles?: ((files: File[]) => void) | undefined; guessUrl?: string | null; labels?: string[] }) {
  const load = useServerFn(getInvoiceSource);
  const save = useServerFn(saveInvoiceSource);
  const research = useServerFn(researchInvoiceSource);
  const guessSite = useServerFn(guessSupplierSite);
  const runCheck = useServerFn(checkInvoiceCollection);
  const setRobot = useServerFn(setRobotSource);
  const qc = useQueryClient();
  const queryKey = ['invoice-source', dossierId, supplier];
  const query = useQuery({ queryKey, queryFn: () => load({ data: { dossierId, supplier } }) });

  const [url, setUrl] = useState('');
  const [guessing, setGuessing] = useState(false);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<SourceResearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [check, setCheck] = useState<CheckData | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    const s = query.data.source;
    setEmail(s?.receipt_email ?? query.data.collectEmail ?? '');
    if (!s) {
      if (guessUrl) { setUrl(u => u || guessUrl); return; }
      // Nothing in the bank label: Claude finds the supplier's site to pre-fill the field.
      setGuessing(true);
      guessSite({ data: { dossierId, supplier, labels: labels ?? [] } }).then(r => { if (r.url) setUrl(u => u || r.url!); }).catch(() => {}).finally(() => setGuessing(false));
      return;
    }
    setUrl(s.source_url);
    const r = s.research as unknown as SourceResearch | null;
    const current = r?.version === RESEARCH_VERSION ? r : null;
    if (current) setFound(current);
    if (s.last_check) setCheck(s.last_check as unknown as CheckData);
    if (current && s.state !== 'needs_setup') setStarted(true);
  }, [query.data]);

  const steps = found ? stepsOf(found) : [];
  const proven = check ? receptionProven(check.results) : false;

  async function runResearch() {
    try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error(); } catch { toast.error('Renseignez une adresse de site valide (https://…).'); return; }
    setSearching(true); setFound(null); setStarted(false); setStep(0);
    try { setFound(await research({ data: { dossierId, supplier, sourceUrl: url } })); await qc.invalidateQueries({ queryKey }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Recherche impossible.'); }
    finally { setSearching(false); }
  }

  async function persist(r: SourceResearch, configured: boolean) {
    await save({ data: { dossierId, supplier, sourceUrl: url, method: r.recommended, billingPath: [r.billingPath, ...stepsOf(r).map((s, i) => `${i + 1}. ${s.title}${s.detail ? ` — ${s.detail}` : ''}${s.link ? ` (${s.link})` : ''}`)].filter(Boolean).join('\n'), receiptEmail: email || null, configured, autoSend: false } });
    await qc.invalidateQueries({ queryKey });
  }

  async function start() {
    if (!found) return;
    if (found.recommended === 'email' && !email) { toast.error('Indiquez d’abord l’adresse de réception Pennylane du dossier.'); return; }
    try { await persist(found, false); setStarted(true); setStep(0); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.'); }
  }

  async function verify() {
    if (!found) return;
    setChecking(true);
    try {
      const r = await runCheck({ data: { dossierId, supplier } });
      setCheck(r);
      if (receptionProven(r.results)) { await persist(found, true); toast.success('Facture bien reçue : la source fonctionne.'); }
      else toast.message('Pas encore de facture reçue. Réessayez dans quelques minutes.');
      await qc.invalidateQueries({ queryKey });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Vérification impossible.'); }
    finally { setChecking(false); }
  }

  const robotUrl = (found ? stepsOf(found).find(s => s.link)?.link : null) ?? query.data?.source?.robot_url ?? url;
  async function startRobot() {
    try { await setRobot({ data: { dossierId, supplier, sourceUrl: url, robotUrl } }); await qc.invalidateQueries({ queryKey }); toast.success('🤖 Robot activé'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.'); }
  }

  if (query.isPending) return <p className="text-muted-foreground">Chargement de la source…</p>;
  const src = query.data?.source;
  if (src?.method === 'browser') return <div className="space-y-3">
    <RobotChrome dossierId={dossierId} supplier={supplier} robotUrl={src.robot_url || src.source_url} lastRun={src.robot_last_run as any} onFiles={onFiles}
      onSaveUrl={async (newUrl) => { await setRobot({ data: { dossierId, supplier, sourceUrl: src.source_url, robotUrl: newUrl } }); await qc.invalidateQueries({ queryKey }); }} />
    <Button variant="ghost" size="sm" onClick={async () => { await save({ data: { dossierId, supplier, sourceUrl: src.source_url, method: 'email', billingPath: '', receiptEmail: email || null, configured: false, autoSend: false } }); await qc.invalidateQueries({ queryKey }); }}><RotateCcw />Changer</Button>
  </div>;
  if (query.isError) return <p role="alert" className="text-destructive">{query.error.message}</p>;
  const last = steps.length; // index of the final "verify" step

  return <div className="space-y-5">
    {!started && <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Globe className="h-4 w-4" /> {supplier}</div>}

    {!started && <div className="space-y-2">
      <label htmlFor="invoice-source-url" className="font-semibold">Site du fournisseur</label>
      <div className="flex flex-wrap gap-2">
        <Input id="invoice-source-url" className="flex-1" type="url" placeholder={guessing ? "🔎 Claude cherche le site…" : "https://…"} value={url} onChange={e => setUrl(e.target.value)} />
        <Button variant="outline" disabled={searching || !url} onClick={runResearch}>{searching ? <><Loader2 className="animate-spin" />Claude cherche…</> : <><Search />Trouver la meilleure solution</>}</Button>
      </div>
    </div>}

    {found && !started && <div className="space-y-3 rounded-lg border border-primary/40 bg-secondary/40 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-primary"><Sparkles className="h-4 w-4" />{found.headline || METHOD[found.recommended]}</p>
      {found.recommended === 'email' && <div className="space-y-1">
        <label htmlFor="invoice-receipt-email" className="font-semibold">Adresse de réception Pennylane du dossier</label>
        <Input id="invoice-receipt-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={start}>OK, partir sur cette option</Button>
        <Button variant="outline" onClick={startRobot}>🤖 Robot CA+</Button>
      </div>
    </div>}

    {found && started && found.recommended !== 'email' && <div className="space-y-2">
      <RobotChrome dossierId={dossierId} supplier={supplier} robotUrl={robotUrl} onFiles={onFiles}
        onSaveUrl={async (newUrl) => { await setRobot({ data: { dossierId, supplier, sourceUrl: url, robotUrl: newUrl } }); await qc.invalidateQueries({ queryKey }); }} />
      <Button variant="ghost" size="sm" onClick={() => { setStarted(false); setStep(0); }}><RotateCcw />Changer</Button>
    </div>}

    {found && started && found.recommended === 'email' && <div className="space-y-3 rounded-lg border p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-primary">{found.headline || METHOD[found.recommended]}</p>
        <Button variant="ghost" size="sm" onClick={() => { setStarted(false); setStep(0); }}><RotateCcw />Changer</Button>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => <li key={i} className={`rounded-md border p-3 ${i === step ? 'border-primary bg-secondary/40' : i < step || proven ? 'opacity-70' : 'opacity-50'}`}>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs">{i < step || proven ? <Check className="h-3 w-3" /> : i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{s.title}{(s.detail || (i === 0 && found.loginNote)) && <InfoTip text={[i === 0 ? found.loginNote : '', s.detail].filter(Boolean).join(' · ')} />}</p>
              {i === step && !proven && <div className="flex flex-wrap gap-2 pt-1">
                {s.link && <Button asChild size="sm"><a href={s.link} target="_blank" rel="noopener noreferrer" title={s.link}><ExternalLink />Ouvrir</a></Button>}
                {s.pastePennylaneEmail && email && <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(email); toast.success('Adresse copiée, collez-la sur la page ouverte'); }}><Copy />Copier {email}</Button>}
                <Button size="sm" variant={s.link ? 'outline' : 'default'} onClick={() => setStep(i + 1)}>C’est fait</Button>
              </div>}
            </div>
          </div>
        </li>)}
        <li className={`rounded-md border p-3 ${step >= last ? 'border-primary bg-secondary/40' : 'opacity-50'}`}>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs">{proven ? <Check className="h-3 w-3" /> : last + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold">✅ Vérifier<InfoTip text="Claude contrôle la facture reçue : fournisseur, montant, date." /></p>
              {(step >= last || proven) && <Button size="sm" disabled={checking} onClick={verify}>{checking ? <><Loader2 className="animate-spin" />Vérification…</> : proven ? 'Revérifier' : 'Vérifier maintenant'}</Button>}
            </div>
          </div>
        </li>
      </ol>
      {proven && <p role="status" className="flex items-center gap-2 font-semibold text-primary"><CheckCircle2 className="h-4 w-4" />Ça marche ✅</p>}
      {check && check.results.length > 0 && <ul className="divide-y rounded-md border">{check.results.slice(0, 6).map(r => <li key={r.transactionId} className="p-3">
        <div className="flex justify-between gap-3"><span className={r.status === 'conforme' || r.status === 'recu_pennylane' ? 'font-semibold text-primary' : r.status === 'non_conforme' ? 'font-semibold text-destructive' : 'font-semibold'}>{STATUS[r.status]}</span><span className="text-muted-foreground">{new Date(r.date).toLocaleDateString('fr-FR')} · {Math.abs(r.amount).toFixed(2)} €</span></div>
        {r.reason && <p className="text-muted-foreground">{r.reason}</p>}
      </li>)}</ul>}
    </div>}

    {found && !started && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Détail de l’analyse de Claude</summary>
      <div className="mt-2 space-y-2">
        <p>{found.summary}</p>
        {found.options.map((o, i) => <p key={i}><span className="font-semibold">{o.title}</span> · {METHOD[o.method]} — {o.detail} {o.source && <a href={o.source} target="_blank" rel="noopener noreferrer" className="underline">source</a>}</p>)}
        {found.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
      </div>
    </details>}
  </div>;
}
