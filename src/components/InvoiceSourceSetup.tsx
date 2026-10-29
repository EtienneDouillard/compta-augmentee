import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, ExternalLink, Globe, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { getInvoiceSource, saveInvoiceSource } from '@/lib/invoice-sources.functions';
import { sourceGuidance } from '@/lib/invoice-sources';

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
  useEffect(() => {
    if (!query.data) return;
    const s = query.data.source;
    setEmail(s?.receipt_email ?? query.data.collectEmail ?? '');
    if (!s) return;
    setUrl(s.source_url); setPath(s.billing_path); setMethod(s.method as typeof method);
    setConfigured(s.state === 'awaiting_first_invoice'); setAutoSend(s.auto_send_documents);
    setGuidance(sourceGuidance(s.source_url));
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
      <Button variant="outline" onClick={() => { try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error(); setGuidance(sourceGuidance(url)); } catch { toast.error('Renseignez une URL HTTPS valide.'); } }}>Consulter les pistes documentées</Button>
    </div>
    {guidance && <div className="border-l-2 border-primary pl-4 text-sm"><p className="font-semibold">{guidance.label}</p><p className="mt-1 text-muted-foreground">{guidance.note}</p>{guidance.evidence && <a href={guidance.evidence} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary underline">Documentation officielle <ExternalLink className="h-3 w-3" /></a>}</div>}
    <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Méthode à mémoriser</legend>
      {([['email', 'E-mail vers Pennylane'], ['browser', 'Chemin dans le navigateur'], ['api', 'API · connexion à développer'], ['mcp', 'MCP · connexion à développer']] as const).map(([value, label]) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" name="invoice-source-method" checked={method === value} onChange={() => { setMethod(value); setConfigured(false); }} />{label}</label>)}
    </fieldset>
    {method === 'email' ? <div className="space-y-3">
      <label htmlFor="invoice-receipt-email" className="font-semibold">Adresse de réception fournisseur Pennylane</label>
      <div className="flex gap-2"><Input id="invoice-receipt-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /><Button variant="outline" size="icon" aria-label="Copier l’adresse de réception" disabled={!email} onClick={async () => { await navigator.clipboard.writeText(email); toast.success('Adresse copiée'); }}><Copy /></Button></div>
      <p className="text-sm text-muted-foreground">À renseigner dans la facturation du fournisseur, s’il permet l’envoi des factures à cette adresse. Pennylane reçoit les pièces directement ; Claude ne les contrôle pas avant cet envoi.</p>
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={configured} onCheckedChange={v => setConfigured(v === true)} />J’ai configuré cette adresse chez le fournisseur.</label>
    </div> : <p className="text-sm text-muted-foreground">Le chemin sera conservé. Aucun robot, accès API ou MCP fournisseur n’est connecté ici. Aucun mot de passe ni cookie ne doit être renseigné.</p>}
    <div className="space-y-2"><label htmlFor="invoice-billing-path" className="font-semibold">Chemin de facturation / notes</label><Textarea id="invoice-billing-path" placeholder="Paramètres → Facturation → Factures → Télécharger le PDF" value={path} onChange={e => setPath(e.target.value)} /></div>
    <label className="flex items-start gap-3 text-sm"><Checkbox checked={autoSend} onCheckedChange={v => setAutoSend(v === true)} />Autoriser l’envoi automatique des pièces après contrôle Claude, lorsque la collecte CA+ sera connectée.</label>
    <p className="text-sm text-muted-foreground">Contrôle CA+ par Claude Sonnet 5.5 : facture, fournisseur, entreprise, période, montant et devise. Contrôle préalable et récupération mensuelle CA+ non actifs à ce stade. Aucune modification d’écriture comptable.</p>
    <Button disabled={busy || !url} onClick={submit}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Enregistrer la source</Button>
  </div>;
}