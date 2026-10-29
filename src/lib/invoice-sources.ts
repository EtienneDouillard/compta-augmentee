import { z } from 'zod';

export const SourceInput = z.object({
  dossierId: z.string().uuid(), supplier: z.string().trim().min(1).max(200),
  sourceUrl: z.string().url().max(2000).refine(v => { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; }, 'Une URL HTTPS sans identifiants est requise.'),
  method: z.enum(['email', 'browser', 'api', 'mcp']),
  billingPath: z.string().trim().max(2000), receiptEmail: z.string().email().max(254).nullable(),
  configured: z.boolean(), autoSend: z.boolean(),
});

export function sourceState(method: string, configured: boolean) {
  // A saved route is not a working API/MCP connector or a browser executor.
  return method === 'email' && configured ? 'awaiting_first_invoice' as const : 'needs_setup' as const;
}

export function sourceGuidance(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) return {
    label: 'OpenRouter', evidence: 'https://openrouter.ai/docs/cookbook/administration/tax-id',
    note: 'La documentation décrit les factures dans la facturation. Un export de consommation n’est pas une facture. Téléchargement automatique non vérifié.',
  };
  if (host === 'anthropic.com' || host.endsWith('.anthropic.com') || host === 'claude.ai') return {
    label: 'Anthropic', evidence: 'https://docs.anthropic.com/en/api/usage-cost-api',
    note: 'Les API de coûts et de consommation ne prouvent pas un accès aux factures PDF. Récupération automatique des factures non vérifiée.',
  };
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'meta.com' || host.endsWith('.meta.com')) return {
    label: 'Meta', evidence: 'https://developers.facebook.com/docs/graph-api/reference/business/business_invoices/',
    note: 'Une API de factures mensuelles est documentée. Son accès et le téléchargement PDF dépendent du compte et restent à vérifier.',
  };
  return { label: host, evidence: null, note: 'Aucune méthode automatique vérifiée pour cette source. Enregistrez le chemin de facturation, sans identifiants.' };
}