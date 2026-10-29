import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Copy, Download, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCollectorToken } from '@/lib/collector.functions';
import { buildBookmarklet } from '@/lib/bookmarklet';
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
  const [bm, setBm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(robotUrl);
  const [savingUrl, setSavingUrl] = useState(false);

  async function getToken() {
    if (token) return token;
    setBusy(true);
    try { const { token: t } = await mint({ data: { dossierId } }); setToken(t); return t; }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Impossible.'); return null; }
    finally { setBusy(false); }
  }

  async function makeFavorite() {
    if (url !== robotUrl && onSaveUrl) { try { await onSaveUrl(url); } catch { return; } }
    const t = await getToken();
    if (!t) return;
    setBm(buildBookmarklet(t, url, window.location.origin));
    toast.success('🤖 Glisse-le dans ta barre de favoris');
  }

  async function copyCode() {
    const t = await getToken();
    if (!t) return;
    await navigator.clipboard.writeText(t).catch(() => {});
    toast.success('Code copié');
  }

  async function saveUrl() {
    try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error(); } catch { toast.error('Adresse invalide (https://…).'); return; }
    if (!onSaveUrl) return;
    setSavingUrl(true);
    try { await onSaveUrl(url); toast.success('Adresse enregistrée'); setBm(null); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.'); }
    finally { setSavingUrl(false); }
  }

  return <div className="space-y-3 rounded-lg border border-primary/40 bg-secondary/40 p-4 text-sm">
    <p className="text-base font-bold text-primary">🤖 Robot CA+<Tip text="Le favori collecte la facture depuis ta page Chrome déjà connectée, Claude la vérifie et elle part dans Pennylane. Aucun mot de passe ni cookie ne sort de ton navigateur." /></p>
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden>🔗</span>
      <Input aria-label="Page des factures" type="url" className="min-w-0 flex-1 bg-background" value={url} onChange={e => setUrl(e.target.value)} />
      {onSaveUrl && url !== robotUrl && <Button size="sm" variant="outline" disabled={savingUrl} onClick={saveUrl}>{savingUrl ? <Loader2 className="animate-spin" /> : <Check />}OK</Button>}
      <Tip text="Adresse exacte de la page où se trouvent les factures (ex. Billing → Transaction history). Le favori l'ouvrira pour toi." />
    </div>
    <ol className="space-y-2">
      <li className="flex flex-wrap items-center gap-2"><span>1️⃣</span>
        {bm ? (
          <a href={bm} onClick={e => e.preventDefault()} draggable title="Glisse-moi dans la barre de favoris" className="inline-flex cursor-grab items-center gap-1 rounded bg-primary px-2 py-1 font-semibold text-primary-foreground">🤖 CA+ Robot</a>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={makeFavorite}>{busy ? <Loader2 className="animate-spin" /> : <span aria-hidden>🤖</span>}Créer mon favori</Button>
        )}
        <Tip text="Glisse le bouton vert dans ta barre de favoris (Ctrl+Maj+B si elle est cachée). Un seul glisser-déposer." /></li>
      <li className="flex flex-wrap items-center gap-2"><span>2️⃣</span><span className="font-semibold">Ouvre la page des factures et clique le favori</span>
        <Tip text="1er clic : ouvre la page enregistrée. 2e clic (sur cette page) : télécharge les factures, Claude les vérifie et les envoie. Refais-le chaque mois." /></li>
    </ol>
    {lastRun && <p role="status" className="font-semibold text-primary">🕒 {new Date(lastRun.at).toLocaleString('fr-FR')} · {lastRun.message}</p>}
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-semibold">⚙️ Option : collecte automatique (extension)</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={download}><Download />Extension</Button>
        <Tip text="Dézippe, ouvre chrome://extensions, active le mode développeur puis « Charger l'extension non empaquetée »." />
        <Button size="sm" variant="outline" disabled={busy} onClick={copyCode}><Copy />Code robot</Button>
        {token && <code className="max-w-full truncate rounded bg-background px-2 py-1 text-xs">{token}</code>}
        <Tip text="Colle ce code dans l'extension (icône CA+). Il n'est affiché qu'une fois." />
      </div>
    </details>
  </div>;
}
