import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import type { TranscriptEntry, TranscriptPart } from "@/lib/runtime";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<TranscriptEntry["role"], string> = {
  user: "You",
  assistant: "Claude",
  system: "System",
};

export function TranscriptView({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <ol className="flex flex-col gap-5">
      {entries.map((entry) => (
        <li key={entry.id} className={cn("flex gap-3.5", entry.fromSubagent && "opacity-75")}>
          <span
            className={cn(
              "flex h-8 w-14 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-semibold",
              entry.role === "user" ? "text-primary" : "text-success",
            )}
          >
            {entry.fromSubagent ? "Agent" : ROLE_LABEL[entry.role]}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            {entry.parts.map((part, i) => (
              <Part key={i} part={part} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Part({ part }: { part: TranscriptPart }) {
  if (part.kind === "text") {
    return (
      <p className="font-reading text-sm leading-relaxed whitespace-pre-wrap break-words">
        {part.text}
      </p>
    );
  }
  if (part.kind === "tool_use") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
        <WrenchScrewdriverIcon aria-hidden="true" className="size-3.5 shrink-0 text-info" />
        <span className="text-info">{part.name}</span>
        <span className="min-w-0 truncate">{part.summary}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-lg border-l-2 bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground",
        part.isError ? "border-destructive" : "border-border",
      )}
    >
      {part.isError && <span className="mr-2 text-destructive">error</span>}
      {part.text || "(no output)"}
    </div>
  );
}
