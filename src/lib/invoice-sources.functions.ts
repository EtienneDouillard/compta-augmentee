import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { SourceInput, sourceState, sourceGuidance } from './invoice-sources';

export const getInvoiceSource = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ dossierId: z.string().uuid(), supplier: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: source, error } = await context.supabase.from('invoice_sources').select('*')
      .eq('dossier_id', data.dossierId).eq('supplier', data.supplier).maybeSingle();
    if (error) throw new Error(error.message);
    const { data: dossier, error: dossierError } = await context.supabase.from('dossiers').select('collect_email').eq('id', data.dossierId).single();
    if (dossierError) throw new Error('Dossier inaccessible.');
    return { source, collectEmail: dossier.collect_email };
  });

export const saveInvoiceSource = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => SourceInput.parse(d))
  .handler(async ({ data, context }) => {
    const guidance = sourceGuidance(data.sourceUrl);
    if (data.method === 'email' && !data.receiptEmail) throw new Error('Adresse de réception manquante.');
    const { error } = await context.supabase.from('invoice_sources').upsert({
      dossier_id: data.dossierId, supplier: data.supplier, source_url: data.sourceUrl,
      method: data.method, billing_path: data.billingPath, evidence_url: guidance.evidence,
      receipt_email: data.receiptEmail, state: sourceState(data.method, data.configured),
      auto_send_documents: data.autoSend, updated_at: new Date().toISOString(),
    }, { onConflict: 'dossier_id,supplier' });
    if (error) throw new Error(error.message);
    return { state: sourceState(data.method, data.configured) };
  });