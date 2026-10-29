import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { cleanSteps, linkUsable, type SetupStep } from './source-steps';

export type SourceResearch = {
  summary: string;
  recommended: 'email' | 'browser' | 'api' | 'mcp';
  why: string;
  billingPath: string;
  options: { method: 'email' | 'browser' | 'api' | 'mcp'; title: string; detail: string; source: string | null }[];
  sources: string[];
  warnings: string[];
  /** Short title of the single recommended option, shown alone to the user. */
  headline: string;
  /** Step-by-step setup of the recommended option; the last step gets one invoice now to test reception. */
  steps: SetupStep[];
  /** One sentence telling the user to sign in when the direct link asks for it. */
  loginNote: string;
  /** 2 = direct links checked; older research is redone. */
  version: number;
};

export const RESEARCH_VERSION = 3;

/** Checks each direct link answers; a dead link is removed rather than shown. */
async function checkLinks(steps: SetupStep[]): Promise<SetupStep[]> {
  return Promise.all(steps.map(async s => {
    if (!s.link) return s;
    try {
      const r = await fetch(s.link, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 CA+ link check' }, signal: AbortSignal.timeout(8000) });
      return linkUsable(r.status) ? { ...s, linkChecked: true } : { ...s, link: null, linkChecked: false };
    } catch { return { ...s, linkChecked: false }; }
  }));
}

const Research = z.object({
  summary: z.string(), recommended: z.enum(['email', 'browser', 'api', 'mcp']), why: z.string(), billingPath: z.string(),
  options: z.array(z.object({ method: z.enum(['email', 'browser', 'api', 'mcp']), title: z.string(), detail: z.string(), source: z.string().nullable().catch(null) })).catch([]),
  sources: z.array(z.string()).catch([]), warnings: z.array(z.string()).catch([]),
  headline: z.string().catch(''),
  steps: z.array(z.object({ title: z.string(), detail: z.string().catch(''), link: z.string().nullable().catch(null), pastePennylaneEmail: z.boolean().catch(false) })).catch([]),
  loginNote: z.string().catch(''),
});

/** Claude Sonnet 5.5 searches the web (official help pages, API docs) for how to fetch this supplier's invoices. */
export const researchInvoiceSource = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ dossierId: z.string().uuid(), supplier: z.string().trim().min(1).max(200), sourceUrl: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data, context }): Promise<SourceResearch> => {
    const { apiKey, model } = await (await import("./claude-config.server")).claudeFor(context.userId);
    if (!apiKey) throw new Error('La clé ANTHROPIC_API_KEY manque.');
    const prompt = `Fournisseur : ${data.supplier} (${data.sourceUrl}).
Mission : trouver comment un cabinet comptable récupère chaque mois, automatiquement si possible, les factures PDF de ce fournisseur, et guider le client en un minimum de clics.
Cherche réellement sur le web (centre d'aide officiel, documentation API, pages facturation) et ouvre les pages avec web_fetch pour confirmer les URL.
Choisis UNE option : la moins chère, la plus simple et la plus rapide qui fonctionne (en général l'e-mail de facturation remplacé par l'adresse Pennylane du dossier si le fournisseur le permet, sinon le téléchargement dans l'interface).
LIENS : chaque étape doit avoir le lien DIRECT le plus profond vers la page exacte où agir (ex. la page « Billing » ou « Invoices » du compte, pas la page d'accueil, pas un article d'aide générique). Utilise les URL de l'application elle-même (souvent https://app.… ou https://….com/account/billing, /settings/billing, /invoices). Si l'URL contient un identifiant de compte inconnu, donne l'URL stable la plus proche qui redirige après connexion. N'invente pas : si tu n'as trouvé aucune URL fiable, mets null.
ÉTAPES : 2 à 4 étapes maximum, chacune = une action sur une page. CA+ connaît déjà l'adresse Pennylane du dossier : n'ajoute JAMAIS d'étape pour la récupérer ; sur l'étape où il faut la coller, mets "pastePennylaneEmail": true. Le détail dit exactement quel bouton cliquer, avec le libellé affiché sur le site. La dernière étape obtient tout de suite une facture pour tester (transférer la dernière facture reçue à l'adresse Pennylane, ou télécharger le dernier PDF et le déposer sur le paiement dans CA+).
STYLE : ultra court, pour un non-informaticien. "title" = 3 à 6 mots en français, verbe d'action (ex. « Ouvrir la facturation », « Coller l'adresse Pennylane »). "detail" = 15 mots maximum, en français, juste le chemin de clics avec les libellés exacts du site entre guillemets séparés par → (ex. « Avatar → « Admin console » → « Billing » »). Pas de phrase d'explication, pas de « si besoin », pas de réserve.
"loginNote" : 10 mots maximum, ou vide ; une phrase si la page demande de se connecter (ex. « Connectez-vous avec un compte admin Miro : la page s'ouvre ensuite directement. »).
Ne propose jamais de stocker mot de passe ou cookie. Ne présente pas comme vérifié ce que tu n'as pas trouvé.
"headline" : 5 mots maximum (ex. « Miro → e-mail Pennylane »).
Termine par UN SEUL bloc JSON (rien après), en français :
{"headline":"…","loginNote":"…","steps":[{"title":"…","detail":"…","link":"url directe ou null","pastePennylaneEmail":false}],"summary":"…","recommended":"email|browser|api|mcp","why":"…","billingPath":"Menu → … → Télécharger","options":[{"method":"email|browser|api|mcp","title":"…","detail":"…","source":"url ou null"}],"sources":["url"],"warnings":["…"]}`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-fetch-2025-09-10', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 6000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 6 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Recherche Claude impossible [${res.status}] : ${(await res.text()).slice(0, 300)}`);
    const json = await res.json() as { content: { type: string; text?: string }[] };
    const text = json.content.filter(c => c.type === 'text').map(c => c.text ?? '').join('');
    const match = text.match(/\{[\s\S]*\}\s*$/) ?? text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude n’a pas renvoyé de recommandation exploitable.');
    let parsed: SourceResearch;
    try { const r = Research.parse(JSON.parse(match[0])); parsed = { ...r, steps: await checkLinks(cleanSteps(r.steps)), version: RESEARCH_VERSION }; }
    catch { throw new Error('Recommandation illisible, relancez la recherche.'); }
    // Persist the research on the supplier's source so it survives reloads and feeds the monthly check.
    const now = new Date().toISOString();
    const { data: existing } = await context.supabase.from('invoice_sources').select('id').eq('dossier_id', data.dossierId).eq('supplier', data.supplier).maybeSingle();
    const res2 = existing
      ? await context.supabase.from('invoice_sources').update({ research: parsed, researched_at: now, source_url: data.sourceUrl }).eq('id', existing.id)
      : await context.supabase.from('invoice_sources').insert({ dossier_id: data.dossierId, supplier: data.supplier, source_url: data.sourceUrl, method: parsed.recommended, billing_path: parsed.billingPath, research: parsed, researched_at: now, state: 'needs_setup', created_by: context.userId });
    if (res2.error) throw new Error(`Recherche faite mais non sauvegardée : ${res2.error.message}`);
    return parsed;
  });

/** Official website of a supplier, guessed by Claude from its name and the Pennylane bank labels, then
 *  checked to answer. Used only to pre-fill the "site du fournisseur" field; the client can change it. */
export const guessSupplierSite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ dossierId: z.string().uuid().optional(), supplier: z.string().trim().min(1).max(200), labels: z.array(z.string().max(300)).max(10) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    // Normally already found at sync time (supplier_sites); only missing ones are searched here.
    if (data.dossierId) {
      const { data: row } = await context.supabase.from('supplier_sites').select('url').eq('dossier_id', data.dossierId).eq('supplier', data.supplier).maybeSingle();
      if (row?.url) return { url: row.url };
    }
    const { apiKey, model } = await (await import("./claude-config.server")).claudeFor(context.userId);
    if (!apiKey) return { url: null };
    const url = await (await import('./supplier-site.server')).guessSiteClaude(apiKey, model, data.supplier, data.labels);
    if (url && data.dossierId) {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await supabaseAdmin.from('supplier_sites').upsert({ dossier_id: data.dossierId, supplier: data.supplier, url });
    }
    return { url };
  });
    if (!res.ok) return { url: null };
    const json = await res.json() as { content: { type: string; text?: string }[] };
    const text = json.content.filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim();
    const m = text.match(/https:\/\/[^\s"'<>)]+/);
    if (!m) return { url: null };
    try {
      const u = new URL(m[0]);
      const r = await fetch(u.origin, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 CA+ link check' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
      return { url: r && r.status < 500 ? u.href : u.origin };
    } catch { return { url: null }; }
  });
