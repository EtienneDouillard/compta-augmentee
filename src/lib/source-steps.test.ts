import { describe, expect, it } from 'vitest';
import { cleanSteps, linkUsable, MAX_STEPS } from './source-steps';

const step = (title: string, link: string | null = null) => ({ title, detail: '', link, pastePennylaneEmail: false });

describe('étapes de configuration', () => {
  it("retire l'étape « récupérer l'adresse Pennylane » que CA+ connaît déjà", () => {
    expect(cleanSteps([step("Récupérer l'adresse Pennylane du dossier"), step('Ouvrir la facturation')]).map(s => s.title)).toEqual(['Ouvrir la facturation']);
  });
  it('limite à 4 étapes', () => {
    expect(cleanSteps(Array.from({ length: 7 }, (_, i) => step(`Étape ${i}`)))).toHaveLength(MAX_STEPS);
  });
  it('refuse un lien non https ou contenant des identifiants', () => {
    expect(cleanSteps([step('a', 'http://miro.com/billing'), step('b', 'https://u:p@miro.com')]).map(s => s.link)).toEqual([null, null]);
  });
  it('garde un lien direct https', () => {
    expect(cleanSteps([step('a', 'https://miro.com/app/settings/billing')])[0]?.link).toBe('https://miro.com/app/settings/billing');
  });
  it('une page derrière connexion reste un bon lien, une page introuvable non', () => {
    expect(linkUsable(403)).toBe(true);
    expect(linkUsable(404)).toBe(false);
  });
});
