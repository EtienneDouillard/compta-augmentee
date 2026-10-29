import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Copy, Download, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCollectorToken } from '@/lib/collector.functions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function download() {
  fetch('/ca-plus-robot.zip')
    .then(r => { if (!r.ok) throw new Error(`Téléchargement impossible (${r.status})`); return r.blob(); })
    .then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ca-plus-robot.zip'; a.click(); URL.revokeObjectURL(a.href); })
    .catch(e => toast.error(e.message));
}

const Tip = ({ text }: { text: string }) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <button type="button" aria-label={text} className="ml-1 inline-flex align-middle text-muted-foreground"><Info className="h-3.5 w-3.5" /></button>
    </TooltipTrigger>
    <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
  </Tooltip>
);

export function RobotChrome({ dossierId, robotUrl, lastRun, onSaveUrl }: { dossierId: string; robotUrl: string; lastRun?: { at: string; message?: string } | null; onSaveUrl?: (url: string) => Promise<void> }) {
  const mint = useServerFn(createCollectorToken);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(robotUrl);
  const [savingUrl, setSavingUrl] = useState(false);

  async function saveUrl() {
    try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error(); } catch { toast.error('Adresse invalide (https://…).'); return; }
    if (!onSaveUrl) return;
    setSavingUrl(true);
    try { await onSaveUrl(url); toast.success('Adresse enregistrée'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.'); }
    finally { setSavingUrl(false); }
  }

  async function pair() {
    setBusy(true);
    try { const { token } = await mint({ data: { dossierId } }); setToken(token); await navigator.clipboard.writeText(token).catch(() => {}); toast.success('Code copié'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Impossible.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3 rounded-lg border border-primary/40 bg-secondary/40 p-4 text-sm">
    <p className="text-base font-bold text-primary">🤖 Robot CA+<Tip text="Chaque mois, le robot ouvre cette page dans votre Chrome (déjà connecté), télécharge la facture, Claude la vérifie et elle part dans Pennylane. Vos mots de passe et cookies ne quittent jamais votre navigateur." /></p>
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden>🔗</span>
      <Input aria-label="Page des factures" type="url" className="min-w-0 flex-1 bg-background" value={url} onChange={e => setUrl(e.target.value)} />
      {onSaveUrl && url !== robotUrl && <Button size="sm" variant="outline" disabled={savingUrl} onClick={saveUrl}>{savingUrl ? <Loader2 className="animate-spin" /> : <Check />}OK</Button>}
      <Tip text="Collez ici l'adresse exacte de la page où se trouvent vos factures (ex. Billing → Transaction history). Le robot l'ouvrira chaque mois." />
    </div>
    <ol className="space-y-2">
      <li className="flex flex-wrap items-center gap-2"><span>1️⃣</span><Button size="sm" variant="outline" onClick={download}><Download />Extension</Button>
        <Tip text="Dézippez, ouvrez chrome://extensions, activez « Mode développeur », puis « Charger l'extension non empaquetée » et choisissez le dossier." /></li>
      <li className="flex flex-wrap items-center gap-2"><span>2️⃣</span><Button size="sm" variant="outline" disabled={busy} onClick={pair}>{busy ? <Loader2 className="animate-spin" /> : <Copy />}Code robot</Button>
        {token && <code className="max-w-full truncate rounded bg-background px-2 py-1 text-xs">{token}</code>}
        <Tip text="Collez ce code dans l'extension (icône CA+ en haut de Chrome). Il n'est affiché qu'une fois." /></li>
      <li className="flex flex-wrap items-center gap-2"><span>3️⃣</span><Button size="sm" asChild variant="outline"><a href={robotUrl} target="_blank" rel="noopener noreferrer">🔐 Se connecter</a></Button>
        <Tip text="Connectez-vous une fois sur le site du fournisseur dans Chrome, puis cliquez « Collecter maintenant » dans l'extension." /></li>
    </ol>
    {lastRun && <p role="status" className="font-semibold text-primary">🕒 {new Date(lastRun.at).toLocaleString('fr-FR')} · {lastRun.message}</p>}
  </div>;
}
