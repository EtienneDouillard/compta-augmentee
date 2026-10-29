import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Copy, Download, ExternalLink, Info, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCollectorToken } from '@/lib/collector.functions';
import { buildBookmarklet } from '@/lib/bookmarklet';
import chromeGuide from '@/assets/chrome-extensions-guide.png.asset.json';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ROBOT_VERSION = '1.7.0';

function download() {
  fetch('/ca-plus-robot.zip')
    .then(r => { if (!r.ok) throw new Error(`Téléchargement impossible (${r.status})`); return r.blob(); })
    .then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ca-plus-robot.zip'; a.click(); URL.revokeObjectURL(a.href); })
    .catch(e => toast.error(e.message));
}

const Tip = ({ text }: { text: string }) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" aria-label={text} className="ml-1 inline-flex align-middle text-muted-foreground"><Info className="h-3.5 w-3.5" /></button>
    </TooltipTrigger>
    <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export function RobotChrome({ dossierId, robotUrl, lastRun, onSaveUrl, onFiles }: { dossierId: string; robotUrl: string; lastRun?: { at: string; message?: string } | null; onSaveUrl?: (url: string) => Promise<void>; onFiles?: ((files: File[]) => void) | undefined }) {
  const [over, setOver] = useState(false);
  const send = (files: File[]) => { if (!files.length) return; if (!onFiles) { toast.error('Dépôt indisponible pour le moment.'); return; } onFiles(files); };
  const mint = useServerFn(createCollectorToken);
  const [token, setToken] = useState<string | null>(null);
  const [bm, setBm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(robotUrl);
  const [savingUrl, setSavingUrl] = useState(false);
  const [robot, setRobot] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const outdated = robot && (!version || version.localeCompare(ROBOT_VERSION, undefined, { numeric: true }) < 0);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  void bm; void buildBookmarklet; void useRef;
  // The Chrome extension announces itself on this page (extension/bridge.js).
  useEffect(() => {
    const v = document.documentElement.dataset['caplusRobot']; if (v) { setRobot(true); setVersion(v === '1' ? null : v); }
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== 'caplus-robot') return;
      if (e.data.type === 'ready') { setRobot(true); setVersion(e.data.version ?? null); }
      if (e.data.type === 'done') { setRunning(false); setLog(e.data.log); toast.success('🤖 Robot terminé'); }
    };
    window.addEventListener('message', on);
    window.postMessage({ source: 'caplus-app', type: 'ping' }, location.origin);
    return () => window.removeEventListener('message', on);
  }, []);

  async function runRobot() {
    if (url !== robotUrl && onSaveUrl) { try { await onSaveUrl(url); } catch { return; } }
    const t = await getToken();
    if (!t) return;
    setRunning(true); setLog(null);
    window.postMessage({ source: 'caplus-app', type: 'run', token: t, url }, location.origin);
  }

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
    {outdated && <div className="flex flex-wrap items-center gap-2 rounded-md bg-yellow-soft p-2 text-yellow-ink"><span>⬆️ Nouvelle version du robot</span><Button size="sm" variant="outline" onClick={download}><Download />Télécharger</Button><Tip text="Remplace l'ancien dossier par le nouveau, puis clique ↻ sur le robot dans chrome://extensions et recharge cette page." /></div>}
    {robot ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" disabled={running || busy} onClick={runRobot}>{running ? <Loader2 className="animate-spin" /> : <span aria-hidden>🤖</span>}{running ? 'Le robot travaille…' : 'Lancer le robot'}</Button>
        <Button size="sm" variant="outline" disabled={running} onClick={async () => { if (url !== robotUrl && onSaveUrl) await onSaveUrl(url); setRunning(true); setLog(null); window.postMessage({ source: 'caplus-app', type: 'teach', url }, location.origin); }}>🎓 Montrer au robot</Button>
        <Tip text="Le robot ouvre la page dans ton Chrome, trouve les factures du mois, Claude les vérifie, elles partent dans Pennylane. Il repasse tout seul chaque mois." />
      </div>
    ) : (
      <InstallSteps url={url} robotUrl={robotUrl} saveUrl={saveUrl} download={download} />
    )}
    {log && <pre role="status" className="whitespace-pre-wrap rounded bg-background p-2 text-xs">{log}</pre>}
    {lastRun && <p role="status" className="font-semibold text-primary">🕒 {new Date(lastRun.at).toLocaleString('fr-FR')} · {lastRun.message}</p>}
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-semibold">✋ À la main</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink />Ouvrir</a></Button>
        <label
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); send([...e.dataTransfer.files]); }}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 font-semibold ${over ? 'border-primary bg-primary/10' : 'border-primary/40 bg-background'}`}>
          <Upload className="h-4 w-4" />Glisse la facture ici
          <input type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { send([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </label>
        <Button size="sm" variant="ghost" disabled={busy} onClick={copyCode}><Copy />Code robot</Button>
        {token && <code className="max-w-full truncate rounded bg-background px-2 py-1 text-xs">{token}</code>}
      </div>
    </details>
  </div>;
}

/** Install guide: each step stays grey until the previous one is done (✅). */
function InstallSteps({ url, robotUrl, saveUrl, download }: { url: string; robotUrl?: string | null; saveUrl: () => Promise<void>; download: () => void }) {
  const [done, setDone] = useState(0);
  const mark = (i: number) => setDone(d => Math.max(d, i + 1));
  const urlOk = !!url && url === robotUrl;
  const steps: { label: React.ReactNode; action: React.ReactNode }[] = [
    { label: <span className="text-xs">🔗 Adresse des factures</span>,
      action: <Button size="sm" variant="outline" onClick={async () => { if (!urlOk) await saveUrl(); mark(0); }}><Check />Valider l'adresse</Button> },
    { label: <span className="text-xs text-muted-foreground">puis double-clic sur le fichier 📦</span>,
      action: <Button size="sm" onClick={() => { download(); mark(1); }}><Download />Télécharger</Button> },
    { label: <span className="text-xs text-muted-foreground">→ nouvel onglet, colle, Entrée</span>,
      action: <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText('chrome://extensions').then(() => toast.success('Colle-le dans la barre d’adresse ⤴️')).catch(() => {}); mark(2); }}><Copy />Copier chrome://extensions</Button> },
    { label: <span className="text-xs">Active <b>Mode développeur</b> ↗️</span>,
      action: <Button size="sm" variant="outline" onClick={() => mark(3)}>Fait</Button> },
    { label: <span className="text-xs"><b>Charger l'extension non empaquetée</b> → dossier <b>ca-plus-robot</b></span>,
      action: <Button size="sm" variant="outline" onClick={() => mark(4)}>Fait</Button> },
    { label: null, action: <Button size="sm" onClick={() => location.reload()}>✅ C'est installé</Button> },
  ];
  return <div className="space-y-2"><ol className="space-y-2">
    {steps.map((s, i) => {
      const ok = i < done, locked = i > done;
      return <li key={i} aria-disabled={locked} className={`flex flex-wrap items-center gap-2 transition-opacity ${locked ? 'pointer-events-none opacity-40' : ''}`}>
        <span className="w-6 text-center">{ok ? '✅' : `${i + 1}️⃣`}</span>
        {ok ? <span className="text-xs text-muted-foreground line-through">{s.action}</span> : s.action}
        {s.label}
      </li>;
    })}
  </ol>
  {done >= 3 && done < 5 && <img src={chromeGuide.url} alt="Page chrome://extensions : Mode développeur en haut à droite, Charger l'extension non empaquetée en haut à gauche" className="w-full rounded-md border" />}
  </div>;
}
