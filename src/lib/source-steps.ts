/** One setup step proposed by Claude for a supplier invoice source. */
export type SetupStep = {
  title: string;
  detail: string;
  /** Deepest direct URL to the exact page (billing, invoices, settings), or null. */
  link: string | null;
  /** True when the user must paste the dossier's Pennylane receiving address on this step. */
  pastePennylaneEmail: boolean;
  /** Set by the server after checking the link answers (login walls count as reachable). */
  linkChecked?: boolean;
};

export const MAX_STEPS = 4;

/** Steps whose only purpose is to find the Pennylane address: CA+ already knows it. */
const FETCH_PENNYLANE_ADDRESS = /(r[ée]cup[ée]rer|trouver|copier|obtenir).{0,30}adresse.{0,30}pennylane/i;

/** Keep only https links without credentials, drop redundant steps, cap the count. */
export function cleanSteps(steps: SetupStep[]): SetupStep[] {
  const out: SetupStep[] = [];
  for (const s of steps) {
    if (FETCH_PENNYLANE_ADDRESS.test(s.title)) continue;
    let link: string | null = null;
    if (s.link) {
      try {
        const u = new URL(s.link);
        if (u.protocol === 'https:' && !u.username && !u.password) link = u.toString();
      } catch { /* not a URL */ }
    }
    out.push({ ...s, link });
    if (out.length === MAX_STEPS) break;
  }
  return out;
}

/** A link is usable unless the site says it does not exist. Login walls (401/403) and rate limits still lead to the right page once signed in. */
export function linkUsable(status: number): boolean {
  return status < 400 || status === 401 || status === 403 || status === 429 || status === 405;
}
