import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import type { TranscriptEntry, TranscriptPart } from "@/lib/runtime";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<TranscriptEntry["role"], string> = {
  user: "You",
  assistant: "Claude",
  system: "System",
  tool: "Tool",
};

const ROLE_COLOR: Record<TranscriptEntry["role"], string> = {
  user: "text-primary",
  assistant: "text-success",
  system: "text-muted-foreground",
  tool: "text-info",
};

export function TranscriptView({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <ol className="flex flex-col gap-5">
      {entries.map((entry) => (
        <li key={entry.id} className={cn("flex gap-3.5", entry.fromSubagent && "opacity-75")}>
          <span
            className={cn(
              "flex h-8 w-14 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-semibold",
              ROLE_COLOR[entry.role],
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
  if (part.kind === "summary") {
    return (
      <details className="rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Earlier messages were summarized by Claude Code
        </summary>
        <p className="mt-2 font-reading leading-relaxed whitespace-pre-wrap break-words">
          {part.text}
        </p>
      </details>
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
        // Indented under the call it answers.
        "ml-5 rounded-lg border-l-2 bg-card px-3 py-1.5 font-mono text-xs break-words text-muted-foreground",
        part.isError ? "border-destructive" : "border-border",
      )}
    >
      {part.isError && <span className="mr-2 text-destructive">error</span>}
      {part.text || "(no output)"}
    </div>
  );
}
