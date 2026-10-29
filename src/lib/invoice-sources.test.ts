import { describe, expect, it } from 'vitest';
import { sourceState, SourceInput } from './invoice-sources';
describe('configuration des sources', () => {
  it('un chemin navigateur enregistré ne constitue pas une automatisation', () => {
    expect(sourceState('browser', true)).toBe('needs_setup');
  });
  it('un e-mail configuré attend une vraie première facture', () => {
    expect(sourceState('email', true)).toBe('awaiting_first_invoice');
  });
  it('refuse les identifiants dans une URL fournisseur', () => {
    expect(SourceInput.safeParse({ dossierId:'00000000-0000-4000-8000-000000000001', supplier:'Meta', sourceUrl:'https://user:password@facebook.com', method:'email', billingPath:'', receiptEmail:null, configured:false, autoSend:false }).success).toBe(false);
  });
});