import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type SourceResearch = {
  summary: string;
  recommended: 'email' | 'browser' | 'api' | 'mcp';
  why: string;
  billingPath: string;
  options: { method: 'email' | 'browser' | 'api' | 'mcp'; title: string; detail: string; source: string | null }[];
  sources: string[];
  warnings: string[];
};

const Research = z.object({
  summary: z.string(), recommended: z.enum(['email', 'browser', 'api', 'mcp']), why: z.string(), billingPath: z.string(),
  options: z.array(z.object({ method: z.enum(['email', 'browser', 'api', 'mcp']), title: z.string(), detail: z.string(), source: z.string().nullable().catch(null) })).catch([]),
  sources: z.array(z.string()).catch([]), warnings: z.array(z.string()).catch([]),
});

/** Claude Sonnet 5.5 searches the web (official help pages, API docs) for how to fetch this supplier's invoices. */
export const researchInvoiceSource = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ supplier: z.string().trim().min(1).max(200), sourceUrl: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<SourceResearch> => {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error('La clé ANTHROPIC_API_KEY manque.');
    const prompt = `Fournisseur : ${data.supplier} (${data.sourceUrl}).
Mission : trouver comment un cabinet comptable peut récupérer chaque mois, automatiquement si possible, les factures PDF de ce fournisseur.
Cherche réellement sur le web (centre d'aide officiel, documentation API, pages facturation). Vérifie : chemin exact dans l'interface, envoi des factures par e-mail et possibilité de changer l'adresse de facturation (pour la rediriger vers l'adresse Pennylane), API ou MCP officiel donnant accès aux factures, intermédiaire de paiement (Stripe, Paddle…).
Ne propose jamais de stocker mot de passe ou cookie. Ne présente pas comme vérifié ce que tu n'as pas trouvé.
Termine par UN SEUL bloc JSON (rien après), en français :
{"summary":"…","recommended":"email|browser|api|mcp","why":"…","billingPath":"Menu → … → Télécharger","options":[{"method":"email|browser|api|mcp","title":"…","detail":"…","source":"url ou null"}],"sources":["url"],"warnings":["…"]}`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-fetch-2025-09-10', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5', max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Recherche Claude impossible [${res.status}] : ${(await res.text()).slice(0, 300)}`);
    const json = await res.json() as { content: { type: string; text?: string }[] };
    const text = json.content.filter(c => c.type === 'text').map(c => c.text ?? '').join('');
    const match = text.match(/\{[\s\S]*\}\s*$/) ?? text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude n’a pas renvoyé de recommandation exploitable.');
    try { return Research.parse(JSON.parse(match[0])); }
    catch { throw new Error('Recommandation illisible, relancez la recherche.'); }
  });
