import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { ACTION_LABELS, type AssistantActionInput } from "@/lib/assistant-actions";
import { syncDossierNow } from "@/lib/sync.functions";
import { estimateAnalysis, runAnalysis } from "@/lib/analysis.functions";
import { lireFacture } from "@/lib/saisie.functions";
import { ChatPanel, RobotButton, type ChatMsg } from "@/components/HelpChat";
import { executeAssistantAction, getCabinetChatHistory, sendCabinetChatMessage } from "@/lib/cabinet-assistant.functions";

// Cabinet assistant: on a dossier page it knows that dossier's open lines, on the list it knows the portfolio.
export function CabinetChat({ dossierId }: { dossierId: string | null }) {
  const qc = useQueryClient();
  const [proposals, setProposals] = useState<Record<string, AssistantActionInput[]>>({});
  const [results, setResults] = useState<Record<string, { state: "input-available" | "output-available" | "output-error"; text: string }>>({});
  const execute = useServerFn(executeAssistantAction);
  const sync = useServerFn(syncDossierNow);
  const estimate = useServerFn(estimateAnalysis);
  const analyse = useServerFn(runAnalysis);
  const lire = useServerFn(lireFacture);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const hist = useServerFn(getCabinetChatHistory);
  const send = useServerFn(sendCabinetChatMessage);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    hist({ data: { dossierId } }).then((r) => { setMsgs(r.messages); setRemaining(r.remaining); }).catch(() => {});
    setTimeout(() => taRef.current?.focus(), 50);
  }, [open, dossierId]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await send({ data: { message: q, dossierId } });
      const id = crypto.randomUUID();
      setMsgs((m) => [...m, { id, role: "assistant", content: r.reply }]);
      setProposals((p) => ({ ...p, [id]: r.actions }));
      setRemaining((n) => (n == null ? n : Math.max(0, n - 1)));
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: (e as Error).message || "Impossible d'obtenir une réponse." }]);
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }

  async function confirm(action: AssistantActionInput, key: string) {
    if (!dossierId || action.dossierId !== dossierId || busy || results[key]) return;
    setBusy(true);
    setResults((r) => ({ ...r, [key]: { state: "input-available", text: "Action en cours…" } }));
    try {
      let text = "";
      if (action.action === "sync") {
        const r = await sync({ data: { dossierId } }); text = `${r.open} demandes en cours après actualisation.`;
      } else if (action.action === "analyse") {
        const e = await estimate({ data: { dossierId } });
        if (e.high > 0 && !window.confirm(`Coût estimé : jusqu'à ${e.high.toFixed(2)} $. Lancer l'analyse ?`)) {
          setResults((r) => { const next = { ...r }; delete next[key]; return next; }); return;
        }
        const r = await analyse({ data: { dossierId, maxCostUsd: Math.max(e.high, 0.01) } }); text = `${r.suggestions} propositions enregistrées. Validation dans le dossier.`;
      } else if (action.action === "lire") {
        const uploadId = action.ids[0]; if (!uploadId) throw new Error("Pièce manquante.");
        const r = await lire({ data: { uploadId } }); text = `${r.lignes} lignes proposées. Ouvrez la saisie pour les contrôler et les valider.`;
      } else {
        const r = await execute({ data: { dossierId, proposal: action, confirmed: true } }); text = r.message;
      }
      setResults((r) => ({ ...r, [key]: { state: "output-available", text } }));
      await qc.invalidateQueries();
    } catch (e) {
      setResults((r) => ({ ...r, [key]: { state: "output-error", text: (e as Error).message } }));
    } finally { setBusy(false); taRef.current?.focus(); }
  }

  return (
    <>
      <RobotButton onClick={() => setOpen(true)} />
      <ChatPanel
        open={open}
        onOpenChange={setOpen}
        description={dossierId ? "Je vous aide sur ce dossier : résumé, lignes à écarter, relance du client." : "Je vous aide à suivre vos dossiers."}
        emptyHint="Posez votre question ou choisissez une suggestion :"
        suggestions={
          dossierId
            ? ["Résume l'état de ce dossier.", "Quelles lignes semblent ne pas demander de facture ?", "Rédige une relance courte et polie pour le client."]
            : ["Quels dossiers demandent mon attention en premier ?", "Comment fonctionne la synchronisation avec Pennylane ?"]
        }
        onSuggestion={ask}
        msgs={msgs}
        busy={busy}
        input={input}
        onInput={setInput}
        onSubmit={() => ask(input)}
        remaining={remaining}
        taRef={taRef}
        renderExtra={(m) => proposals[m.id]?.map((action, i) => {
          const key = `${m.id}-${i}`; const result = results[key];
          return <div key={key} className="mt-3">
            <Tool defaultOpen={false}>
              <ToolHeader type="tool-proposer_action" title={ACTION_LABELS[action.action]} state={result?.state ?? "approval-requested"} />
              <ToolContent><p>{result?.text ?? `${action.ids.length ? `${action.ids.length} élément(s). ` : ""}Cette action concerne uniquement le dossier ouvert.`}</p></ToolContent>
            </Tool>
            {result ? <p className="text-sm">{result.text}</p> : <Button size="sm" disabled={busy} onClick={() => confirm(action, key)}>Confirmer : {ACTION_LABELS[action.action]}</Button>}
          </div>;
        })}
        privacyNote={
          dossierId
            ? "Vos questions et les données du dossier (nom, adresses de collecte, lignes : dates, montants, tiers, libellés sans IBAN) sont traitées par un service d'intelligence artificielle (Anthropic). Vérifiez toujours ses réponses."
            : "Vos questions et la liste de vos dossiers (noms des clients et compteurs) sont traitées par un service d'intelligence artificielle (Anthropic). Vérifiez toujours ses réponses."
        }
      />
    </>
  );
}
