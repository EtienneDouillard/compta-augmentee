// Robot Chrome: shared rules between the CA+ server and tests.

export const TOKEN_PREFIX = "caplus_";

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type OpenTx = { id: string; date: string; amount: number };

/** Payment an invoice found by the robot justifies: the open payment of that supplier closest in date (max 45 days). */
export function matchTransaction(txs: OpenTx[], invoiceDate: string | null): OpenTx | null {
  if (!txs.length) return null;
  if (!invoiceDate || Number.isNaN(Date.parse(invoiceDate))) return [...txs].sort((a, b) => b.date.localeCompare(a.date))[0]!;
  const t = Date.parse(invoiceDate);
  const best = [...txs].sort((a, b) => Math.abs(Date.parse(a.date) - t) - Math.abs(Date.parse(b.date) - t))[0]!;
  return Math.abs(Date.parse(best.date) - t) <= 45 * 86400000 ? best : null;
}
