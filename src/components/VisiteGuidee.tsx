import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VISITE } from "@/lib/aide-client";
import { cn } from "@/lib/utils";

const KEY = "ca-visite-client-v1";

// Remembered in the browser only: a blocked storage just shows the tour again.
function seen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private browsing */
  }
}

// Mini-tour in 3 steps on the client's first visit (retour de Julien), reopened by "Comment ça marche ?".
export function VisiteGuidee({ auto = true }: { auto?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (auto && !seen()) setOpen(true);
  }, [auto]);

  function close(o: boolean) {
    setOpen(o);
    if (!o) {
      markSeen();
      setStep(0);
    }
  }
  const e = VISITE[step]!;
  const last = step === VISITE.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Compass aria-hidden className="h-4 w-4" /> Comment ça marche ?
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Étape {step + 1} sur {VISITE.length}
            </p>
            <DialogTitle className="text-xl text-primary">{e.titre}</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-foreground">
              {e.texte}
            </DialogDescription>
          </DialogHeader>
          <div aria-hidden className="flex justify-center gap-1.5">
            {VISITE.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-8 rounded-full", i <= step ? "bg-primary" : "bg-cream-3")}
              />
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Précédent
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => close(false)}>
                Passer
              </Button>
            )}
            <Button onClick={() => (last ? close(false) : setStep(step + 1))}>
              {last ? (
                "C'est parti !"
              ) : (
                <>
                  Suivant <ArrowRight />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
