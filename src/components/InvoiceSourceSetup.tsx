import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, ExternalLink, Globe, Loader2, Save, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { getInvoiceSource, saveInvoiceSource } from '@/lib/invoice-sources.functions';
import { sourceGuidance } from '@/lib/invoice-sources';
import { researchInvoiceSource, type SourceResearch } from '@/lib/invoice-research.functions';
import { checkInvoiceCollection } from '@/lib/invoice-collect.functions';
import type { CollectResult } from '@/lib/invoice-sources';

type CheckData = { results: CollectResult[]; steps: string[] };
const STATUS: Record<CollectResult['status'], string> = { conforme: '✓ Pièce reçue et conforme', recu_pennylane: '✓ Pièce dans Pennylane', non_conforme: '✗ Pièce non conforme', manquant: '• Pièce manquante', email_annonce: '… Envoi annoncé' };

export function InvoiceSourceSetup({ dossierId, supplier }: { dossierId: string; supplier: string }) {
  const load = useServerFn(getInvoiceSource);
  const save = useServerFn(saveInvoiceSource);
  const qc = useQueryClient();
  const queryKey = ['invoice-source', dossierId, supplier];
  const query = useQuery({ queryKey, queryFn: () => load({ data: { dossierId, supplier } }) });
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'email' | 'browser' | 'api' | 'mcp'>('email');
  const [path, setPath] = useState('');
  const [email, setEmail] = useState('');
  const [configured, setConfigured] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState<ReturnType<typeof sourceGuidance> | null>(null);
  const research = useServerFn(researchInvoiceSource);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<SourceResearch | null>(null);
  async function runResearch() {
    try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error(); } catch { toast.error('Renseignez une URL HTTPS valide.'); return; }
    setSearching(true); setFound(null); setGuidance(sourceGuidance(url));
    try { setFound(await research({ data: { dossierId, supplier, sourceUrl: url } })); await qc.invalidateQueries({ queryKey }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Recherche impossible.'); }
    finally { setSearching(false); }
  }
  function applyResearch(r: SourceResearch) {
    setMethod(r.recommended); setConfigured(false);
    setPath([r.billingPath, ...r.options.map(o => `• ${o.title} : ${o.detail}${o.source ? ` (${o.source})` : ''}`)].filter(Boolean).join('\n'));
    toast.success('Recommandation appliquée. Vérifiez puis enregistrez.');
  }
  const runCheck = useServerFn(checkInvoiceCollection);
  const [check, setCheck] = useState<CheckData | null>(null);
  const [checking, setChecking] = useState(false);
  async function verify() {
    setChecking(true);
    try { const r = await runCheck({ data: { dossierId, supplier } }); setCheck(r); await qc.invalidateQueries({ queryKey }); toast.success(r.state === 'active' ? 'Collecte vérifiée : tout est en ordre.' : 'Contrôle terminé : des pièces demandent votre attention.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Contrôle impossible.'); }
    finally { setChecking(false); }
  }
  const methodLabel = { email: 'E-mail vers Pennylane', browser: 'Chemin dans le navigateur', api: 'API', mcp: 'MCP' } as const;
  useEffect(() => {
    if (!query.data) return;
    const s = query.data.source;
    setEmail(s?.receipt_email ?? query.data.collectEmail ?? '');
    if (!s) return;
    setUrl(s.source_url); setPath(s.billing_path); setMethod(s.method as typeof method);
    setConfigured(s.state === 'awaiting_first_invoice'); setAutoSend(s.auto_send_documents);
    setGuidance(sourceGuidance(s.source_url));
    if (s.research) setFound(s.research as unknown as SourceResearch);
    if (s.last_check) setCheck(s.last_check as unknown as CheckData);
  }, [query.data]);
  async function submit() {
    setBusy(true);
    try {
      await save({ data: { dossierId, supplier, sourceUrl: url, method, billingPath: path, receiptEmail: email || null, configured, autoSend } });
      await qc.invalidateQueries({ queryKey });
      toast.success('Configuration enregistrée pour ce fournisseur.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Sauvegarde impossible.'); }
    finally { setBusy(false); }
  }
  if (query.isPending) return <p className="text-muted-foreground">Chargement de la source…</p>;
  if (query.isError) return <p role="alert" className="text-destructive">{query.error.message}</p>;
  return <div className="space-y-5">
    <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Globe className="h-4 w-4" /> Source de factures · {supplier}</div>
    {query.data.source && <p role="status" className="text-sm text-muted-foreground">Configuration sauvegardée · {query.data.source.state === 'awaiting_first_invoice' ? 'Première réception à vérifier dans Pennylane' : 'Connexion automatique à configurer'}</p>}
    <div className="space-y-2"><label htmlFor="invoice-source-url" className="font-semibold">Site du fournisseur</label>
      <Input id="invoice-source-url" type="url" placeholder="https://…" value={url} onChange={e => { setUrl(e.target.value); setGuidance(null); }} />
      <Button variant="outline" disabled={searching || !url} onClick={runResearch}>{searching ? <><Loader2 className="animate-spin" />Claude cherche sur le web…</> : <><Search />Rechercher comment récupérer les factures</>}</Button>
    </div>
    {guidance && <div className="border-l-2 border-primary pl-4 text-sm"><p className="font-semibold">{guidance.label}</p><p className="mt-1 text-muted-foreground">{guidance.note}</p>{guidance.evidence && <a href={guidance.evidence} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary underline">Documentation officielle <ExternalLink className="h-3 w-3" /></a>}</div>}
    {found && <div className="space-y-3 rounded-lg border border-primary/40 bg-secondary/40 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-primary"><Sparkles className="h-4 w-4" />Préconisation : {methodLabel[found.recommended]}</p>
      <p>{found.summary}</p>
      <p className="text-muted-foreground">{found.why}</p>
      {found.billingPath && <p><span className="font-semibold">Chemin : </span>{found.billingPath}</p>}
      {found.options.length > 0 && <ul className="space-y-2">{found.options.map((o, i) => <li key={i} className="border-l-2 border-border pl-3"><span className="font-semibold">{o.title}</span> <span className="text-muted-foreground">· {methodLabel[o.method]}</span><p className="text-muted-foreground">{o.detail}</p>{o.source && <a href={o.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Source <ExternalLink className="h-3 w-3" /></a>}</li>)}</ul>}
      {found.warnings.map((w, i) => <p key={i} className="text-destructive">⚠ {w}</p>)}
      <Button size="sm" onClick={() => applyResearch(found)}>Appliquer cette préconisation</Button>
    </div>}
 <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Méthode à mémoriser</legend>
      {([['email', 'E-mail vers Pennylane'], ['browser', 'Chemin dans le navigateur'], ['api', 'API · connexion à développer'], ['mcp', 'MCP · connexion à développer']] as const).map(([value, label]) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" name="invoice-source-method" checked={method === value} onChange={() => { setMethod(value); setConfigured(false); }} />{label}</label>)}
    </fieldset>
    {method === 'email' ? <div className="space-y-3">
      <label htmlFor="invoice-receipt-email" className="font-semibold">Adresse de réception fournisseur Pennylane</label>
      <div className="flex gap-2"><Input id="invoice-receipt-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /><Button variant="outline" size="icon" aria-label="Copier l’adresse de réception" disabled={!email} onClick={async () => { await navigator.clipboard.writeText(email); toast.success('Adresse copiée'); }}><Copy /></Button></div>
      <p className="text-sm text-muted-foreground">À renseigner dans la facturation du fournisseur, s’il permet l’envoi des factures à cette adresse. Pennylane reçoit les pièces directement ; Claude ne les contrôle pas avant cet envoi.</p>
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={configured} onCheckedChange={v => setConfigured(v === true)} />J’ai configuré cette adresse chez le fournisseur.</label>
    </div> : method === 'browser' ? <div className="space-y-2 text-sm text-muted-foreground">
      <p>Chaque mois : ouvrez le chemin ci-dessous (vous êtes déjà connecté dans votre navigateur), téléchargez le PDF et déposez-le sur le paiement plus haut. CA+ le contrôle ensuite avec Claude.</p>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Ouvrir {supplier} <ExternalLink className="h-3 w-3" /></a>}
    </div> : <p className="text-sm text-muted-foreground">Ce fournisseur doit d’abord ouvrir un accès {method.toUpperCase()} officiel aux factures (voir la préconisation). En attendant, la collecte se fait par e-mail ou par dépôt, et le contrôle ci-dessous fonctionne déjà. Aucun mot de passe ni cookie n’est conservé.</p>}
    <div className="space-y-2"><label htmlFor="invoice-billing-path" className="font-semibold">Chemin de facturation / notes</label><Textarea id="invoice-billing-path" placeholder="Paramètres → Facturation → Factures → Télécharger le PDF" value={path} onChange={e => setPath(e.target.value)} /></div>
    <Button disabled={busy || !url} onClick={submit}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Enregistrer la source</Button>
    {query.data.source && <div className="space-y-3 border-t pt-5">
      <p className="font-semibold">Contrôle de la collecte</p>
      <p className="text-sm text-muted-foreground">Actualise Pennylane, puis Claude Sonnet 5.5 vérifie chaque pièce reçue : facture, fournisseur, montant TTC et date. Aucune écriture comptable n’est modifiée.</p>
      <Button variant="outline" disabled={checking} onClick={verify}>{checking ? <><Loader2 className="animate-spin" />Contrôle en cours…</> : 'Vérifier la collecte maintenant'}</Button>
      {query.data.source.last_check_at && <p className="text-xs text-muted-foreground">Dernier contrôle : {new Date(query.data.source.last_check_at).toLocaleString('fr-FR')}</p>}
      {check && <div className="space-y-2 text-sm">
        {check.steps.map((s, i) => <p key={i} className="text-muted-foreground">{s}</p>)}
        {check.results.length === 0 ? <p>Aucun paiement à justifier pour ce fournisseur.</p> : <ul className="divide-y rounded-md border">{check.results.map(r => <li key={r.transactionId} className="p-3"><div className="flex justify-between gap-3"><span className={r.status === 'conforme' || r.status === 'recu_pennylane' ? 'font-semibold text-primary' : r.status === 'non_conforme' ? 'font-semibold text-destructive' : 'font-semibold'}>{STATUS[r.status]}</span><span className="text-muted-foreground">{new Date(r.date).toLocaleDateString('fr-FR')} · {Math.abs(r.amount).toFixed(2)} €</span></div><p className="text-muted-foreground">{r.reason}</p></li>)}</ul>}
      </div>}
    </div>}
  </div>;
}