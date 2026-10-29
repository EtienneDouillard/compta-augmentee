import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/session";
import { LinesTable } from "./LinesTable";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const tx = (over: Partial<Tx>): Tx => ({
  id: Math.random().toString(36), dossier_id: "d", pennylane_id: "p", date: "2026-01-01", amount: -10,
  label: "CB TEST", supplier: "Test", supplier_detected: "Test", status: "a_faire", comment: null,
  review_state: "pending", counterpart_accounts: "401000", direction: "out",
  ...over,
});

// A rename that answers when the test says so, as the database would.
function pendingRename() {
  let answer: (name: string | null) => void = () => {};
  const promise = new Promise<string | null>((r) => (answer = r));
  return { onRename: () => promise, answer: (name: string | null) => act(async () => answer(name)) };
}
const props = { uploads: [], onChanged: () => {}, onDownload: () => {} };
const filterChip = (name: string) => screen.queryByRole("button", { name: `Retirer le filtre sur le tiers ${name}` });
const showOnly = (name: string) => screen.getAllByRole("button", { name: `${name} : afficher seulement ce tiers` })[0]!;
const pencil = (name: string) => screen.getAllByRole("button", { name: `Corriger le tiers ${name}` })[0]!;
const listView = () => fireEvent.click(screen.getByRole("button", { name: "Liste" }));

describe("LinesTable tiers filter", () => {
  it("follows a renamed tiers, without showing the other lines while they reload", async () => {
    const amzn = tx({ supplier: "Amzn", supplier_detected: "AMZN MKTP" });
    const other = tx({ supplier: "Boulanger", supplier_detected: "BOULANGER" });
    const rename = pendingRename();
    const { rerender } = render(<LinesTable txs={[amzn, other]} onRename={rename.onRename} {...props} />);
    listView();

    fireEvent.click(showOnly("Amzn"));
    fireEvent.click(pencil("Amzn"));
    await rename.answer("Amazon");
    expect(filterChip("Amzn")).toBeInTheDocument();
    expect(screen.queryByText("Boulanger")).not.toBeInTheDocument();

    rerender(<LinesTable txs={[{ ...amzn, supplier: "Amazon" }, other]} onRename={rename.onRename} {...props} />);
    expect(filterChip("Amazon")).toBeInTheDocument();
    expect(screen.queryByText("Boulanger")).not.toBeInTheDocument();
  });

  it("stays on the old name when other lines keep it", async () => {
    const moved = tx({ supplier: "Amazon", supplier_detected: "AMZN MKTP", date: "2026-02-01", label: "CB AMZN MKTP" });
    const kept = tx({ supplier: "Amazon", supplier_detected: "AMAZON EU", label: "PRLV AMAZON EU" });
    const rename = pendingRename();
    const { rerender } = render(<LinesTable txs={[moved, kept]} onRename={rename.onRename} {...props} />);
    listView();

    fireEvent.click(showOnly("Amazon"));
    fireEvent.click(pencil("Amazon"));
    await rename.answer("Amazon Marketplace");
    rerender(<LinesTable txs={[{ ...moved, supplier: "Amazon Marketplace" }, kept]} onRename={rename.onRename} {...props} />);

    expect(filterChip("Amazon")).toBeInTheDocument();
    expect(screen.getByText("PRLV AMAZON EU")).toBeInTheDocument();
    expect(screen.queryByText("CB AMZN MKTP")).not.toBeInTheDocument();
  });

  it("changes nothing when the rename is cancelled", async () => {
    const amzn = tx({ supplier: "Amzn", supplier_detected: "AMZN MKTP" });
    const rename = pendingRename();
    render(<LinesTable txs={[amzn, tx({ supplier: "Boulanger" })]} onRename={rename.onRename} {...props} />);
    listView();

    fireEvent.click(showOnly("Amzn"));
    fireEvent.click(pencil("Amzn"));
    await rename.answer(null);
    expect(filterChip("Amzn")).toBeInTheDocument();
  });
});

describe("LinesTable grouped by supplier", () => {
  it("groups alike tiers by default, folded, with what is left to justify", () => {
    render(<LinesTable txs={[
      tx({ supplier: "Leroy Merlin", amount: -100, label: "CB LEROY MERLIN 1" }),
      tx({ supplier: "Leroy Merlin Bricolage", amount: -50, label: "CB LEROY MERLIN 2", review_state: "sent" }),
      tx({ supplier: "Orange", amount: -30, label: "PRLV ORANGE" }),
    ]} onRename={async () => null} {...props} initialTab="all" />);

    const group = screen.getByRole("button", { name: /Leroy Merlin · 2 lignes/ });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Regroupe : Leroy Merlin, Leroy Merlin Bricolage")).toBeInTheDocument();
    expect(screen.getByText("150,00 €")).toBeInTheDocument();
    expect(screen.queryByText("CB LEROY MERLIN 1")).not.toBeInTheDocument();

    fireEvent.click(group);
    expect(screen.getByText("CB LEROY MERLIN 1")).toBeInTheDocument();
    expect(screen.queryByText("PRLV ORANGE")).not.toBeInTheDocument();
  });

  it("selects every line of a supplier with its checkbox", () => {
    render(<LinesTable txs={[tx({ supplier: "Orange" }), tx({ supplier: "Orange" }), tx({ supplier: "Free" })]}
      onRename={async () => null} {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les 2 lignes de Orange" }));
    expect(screen.getByText(/2 lignes sélectionnées/)).toBeInTheDocument();
  });
});
