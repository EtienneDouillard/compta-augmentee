// Supplier logos (retour de Simon): the icon each supplier publishes on its own website (favicon), loaded by the
// browser from that site, with the initials as fallback. No paid logo service, nothing stored. Used only to help the
// client recognise the supplier. The site comes from the dossier's invoice source when set, else from this short list.
import { normalizeText } from "@/lib/skip-rules";

const CONNUS: [string, string][] = [
  ["AMAZON", "amazon.fr"],
  ["ORANGE", "orange.fr"],
  ["SFR", "sfr.fr"],
  ["FREE", "free.fr"],
  ["BOUYGUES", "bouyguestelecom.fr"],
  ["EDF", "edf.fr"],
  ["ENGIE", "engie.fr"],
  ["TOTALENERGIES", "totalenergies.fr"],
  ["GOOGLE", "google.com"],
  ["MICROSOFT", "microsoft.com"],
  ["APPLE", "apple.com"],
  ["OVH", "ovhcloud.com"],
  ["SNCF", "sncf-connect.com"],
  ["UBER", "uber.com"],
  ["ADOBE", "adobe.com"],
  ["LINKEDIN", "linkedin.com"],
  ["CANVA", "canva.com"],
  ["NOTION", "notion.so"],
  ["SLACK", "slack.com"],
  ["ZOOM", "zoom.us"],
  ["DROPBOX", "dropbox.com"],
  ["AIRBNB", "airbnb.fr"],
  ["BOOKING", "booking.com"],
  ["LEROY MERLIN", "leroymerlin.fr"],
  ["IKEA", "ikea.com"],
  ["CDISCOUNT", "cdiscount.com"],
  ["FNAC", "fnac.com"],
  ["DARTY", "darty.com"],
  ["LA POSTE", "laposte.fr"],
  ["ANTHROPIC", "anthropic.com"],
  ["OPENAI", "openai.com"],
  ["QONTO", "qonto.com"],
  ["PENNYLANE", "pennylane.com"],
  ["SHOPIFY", "shopify.com"],
  ["STRIPE", "stripe.com"],
  ["PAYPAL", "paypal.com"],
  ["FACEBOOK", "facebook.com"],
  ["META", "meta.com"],
];

// Site of a supplier: its configured invoice source first, else a well-known supplier matched on whole words.
export function siteFournisseur(name: string, sourceUrl?: string | null): string | null {
  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      if (u.protocol === "https:") return u.hostname.toLowerCase();
    } catch {
      // not a URL: fall back to the list
    }
  }
  const n = ` ${normalizeText(name)} `;
  return CONNUS.find(([mot]) => n.includes(` ${mot} `))?.[1] ?? null;
}

export const faviconUrl = (site: string) => `https://${site}/favicon.ico`;
