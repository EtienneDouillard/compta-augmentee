import type { ReactNode } from "react";
import { CircleArrowRight, CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// "?" tip opened by a click or a tap (a hover tooltip never shows on a phone).
export function InfoTip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Aide : ${label}`}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pale hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          className,
        )}
      >
        <CircleHelp aria-hidden className="h-[18px] w-[18px]" />
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] rounded-xl text-sm leading-relaxed">
        <p className="mb-1 font-bold text-primary">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

// One-line explanation under a title, in plain words.
export function SousTitre({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 max-w-2xl text-muted-foreground", className)}>{children}</p>;
}

// "Et ensuite ?" box: what happens once the client has answered.
export function EtApres({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl bg-mint-pale p-4 text-sm text-primary">
      <CircleArrowRight aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        <strong>Et ensuite ?</strong> {children}
      </p>
    </div>
  );
}
