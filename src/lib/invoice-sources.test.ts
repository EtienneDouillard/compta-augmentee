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
import { collectionState } from './invoice-sources';
describe('collectionState', () => {
  const base = { transactionId: 't', date: '2026-01-01', amount: 10, label: 'x', uploadId: null, reason: '' };
  it('passe en attention si une pièce manque', () => expect(collectionState([{ ...base, status: 'conforme' }, { ...base, status: 'manquant' }])).toBe('attention'));
  it('passe en attention si une pièce est non conforme', () => expect(collectionState([{ ...base, status: 'non_conforme' }])).toBe('attention'));
  it('est active quand tout est vérifié', () => expect(collectionState([{ ...base, status: 'conforme' }, { ...base, status: 'recu_pennylane' }])).toBe('active'));
  it('attend la réception si seulement annoncé par e-mail', () => expect(collectionState([{ ...base, status: 'email_annonce' }])).toBe('awaiting_first_invoice'));
});

import { receptionProven } from './invoice-sources';
describe('receptionProven', () => {
  const base = { transactionId: 't', date: '2026-10-01', amount: -10, label: 'x', reason: '' };
  it('faux tant que rien n’est reçu', () => expect(receptionProven([{ ...base, status: 'manquant' }, { ...base, status: 'email_annonce' }] as any)).toBe(false));
  it('vrai dès une pièce conforme ou dans Pennylane', () => {
    expect(receptionProven([{ ...base, status: 'manquant' }, { ...base, status: 'recu_pennylane' }] as any)).toBe(true);
    expect(receptionProven([{ ...base, status: 'non_conforme' }] as any)).toBe(false);
  });
});
