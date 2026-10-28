import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Comptabilité Augmentée" },
      { name: "description", content: "Ventilation de factures, livre de lecture et échange client pour cabinets comptables." },
      { property: "og:title", content: "Comptabilité Augmentée" },
      { property: "og:description", content: "Ventilation de factures, livre de lecture et échange client." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});
