import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { collectionState, type CollectResult } from './invoice-sources';

type Verdict = { pertinent: boolean; fournisseur: string; montantTtc: number | null; date: string | null; raison: string };

async function verifyWithClaude(apiKey: string, file: Blob, path: string, expected: { supplier: string; amount: number; date: string; label: string }): Promise<Verdict> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const mime = file.type || (path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5', max_tokens: 2000,
      system: 'Tu contrôles des pièces justificatives pour un cabinet comptable français. Tu vérifies que le document est bien une facture (pas un reçu de consommation ni un devis), du bon fournisseur, d’un montant TTC cohérent avec le paiement (écart toléré : change, quelques centimes) et d’une date proche. Réponds avec l’outil verdict.',
      messages: [{ role: 'user', content: [
        { type: mime === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mime, data: btoa(bin) } },
        { type: 'text', text: `Paiement attendu : fournisseur « ${expected.supplier} », montant ${Math.abs(expected.amount).toFixed(2)} €, date ${expected.date}, libellé bancaire « ${expected.label} ». Cette pièce le justifie-t-elle ?` },
      ] }],
      tools: [{ name: 'verdict', description: 'Résultat du contrôle', input_schema: { type: 'object', required: ['pertinent', 'fournisseur', 'raison'], properties: {
        pertinent: { type: 'boolean' }, fournisseur: { type: 'string' }, montantTtc: { type: ['number', 'null'] }, date: { type: ['string', 'null'] }, raison: { type: 'string', description: 'Une phrase en français' } } } }],
      tool_choice: { type: 'tool', name: 'verdict' },
    }),
  });
  if (!res.ok) throw new Error(`Contrôle Claude impossible (${res.status})`);
  const j = await res.json() as { content: { type: string; input?: Verdict }[] };
  const v = j.content.find(c => c.type === 'tool_use')?.input;
  if (!v) throw new Error('Claude n’a pas rendu de verdict.');
  return v;
}

/** Runs the real collection check for one supplier: refreshes Pennylane (cabinet), then Claude checks each new document. */
export const checkInvoiceCollection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ dossierId: z.string().uuid(), supplier: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: source } = await db.from('invoice_sources').select('*').eq('dossier_id', data.dossierId).eq('supplier', data.supplier).maybeSingle();
    if (!source) throw new Error('Enregistrez d’abord la source de ce fournisseur.');
    const steps: string[] = [];
    const { data: isCabinet } = await db.rpc('has_role', { _user_id: context.userId, _role: 'cabinet' });
    if (isCabinet) {
      try { const { syncDossier } = await import('./sync.server'); await syncDossier(data.dossierId); steps.push('Pennylane actualisé : les paiements dont la pièce est arrivée dans Pennylane sont sortis de la liste.'); }
      catch (e) { steps.push(`Actualisation Pennylane impossible : ${e instanceof Error ? e.message : 'erreur'}`); }
    } else steps.push('Actualisation Pennylane réservée au cabinet ; contrôle des pièces déposées uniquement.');

    const { data: txs, error } = await db.from('transactions').select('id, date, amount, label, status, is_open')
      .eq('dossier_id', data.dossierId).eq('supplier', data.supplier).order('date', { ascending: false }).limit(24);
    if (error) throw new Error(error.message);
    const ids = (txs ?? []).map(t => t.id);
    const { data: ups } = ids.length ? await db.from('uploads').select('id, transaction_id, storage_path, created_at').in('transaction_id', ids).order('created_at', { ascending: false }) : { data: [] };
    const previous = new Map(((source.last_check as { results?: CollectResult[] } | null)?.results ?? []).filter(r => r.uploadId).map(r => [r.uploadId!, r]));
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    let claudeCalls = 0;
    const results: CollectResult[] = [];
    for (const t of txs ?? []) {
      const base = { transactionId: t.id, date: t.date, amount: Number(t.amount), label: t.label };
      const up = (ups ?? []).find(u => u.transaction_id === t.id);
      if (!t.is_open && !up) { results.push({ ...base, status: 'recu_pennylane', uploadId: null, reason: 'Pièce rattachée dans Pennylane.' }); continue; }
      if (!up) { results.push({ ...base, status: t.status === 'email' ? 'email_annonce' : 'manquant', uploadId: null, reason: t.status === 'email' ? 'Envoi annoncé par e-mail, pas encore arrivé dans Pennylane.' : 'Aucune pièce reçue.' }); continue; }
      const prev = previous.get(up.id);
      if (prev) { results.push({ ...prev, ...base }); continue; }
      if (!apiKey || claudeCalls >= 6) { results.push({ ...base, status: 'manquant', uploadId: up.id, reason: apiKey ? 'Pièce à contrôler au prochain passage (limite de 6 contrôles par passage).' : 'Clé Claude absente : contrôle impossible.' }); continue; }
      claudeCalls++;
      try {
        const { data: file, error: dl } = await db.storage.from('factures').download(up.storage_path);
        if (dl || !file) throw new Error('Pièce illisible dans le stockage.');
        const v = await verifyWithClaude(apiKey, file, up.storage_path, { supplier: data.supplier, amount: Number(t.amount), date: t.date, label: t.label });
        results.push({ ...base, status: v.pertinent ? 'conforme' : 'non_conforme', uploadId: up.id, reason: `${v.raison}${v.montantTtc != null ? ` (lu : ${v.montantTtc} € TTC${v.date ? `, ${v.date}` : ''})` : ''}` });
      } catch (e) { results.push({ ...base, status: 'manquant', uploadId: up.id, reason: e instanceof Error ? e.message : 'Contrôle impossible.' }); }
    }
    if (claudeCalls) steps.push(`${claudeCalls} pièce(s) contrôlée(s) par Claude Sonnet 5.5.`);
    const state = collectionState(results);
    const now = new Date().toISOString();
    const { error: upErr } = await db.from('invoice_sources').update({ last_check: { results, steps }, last_check_at: now, state }).eq('id', source.id);
    if (upErr) throw new Error(upErr.message);
    return { state, results, steps, checkedAt: now };
  });
