/** The full command or edit an agent asks to run, shown whole so the player knows what they approve. */
export function ApprovalDetail({ detail, summary }: { detail: string; summary: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-background/60 p-2 font-mono text-xs whitespace-pre-wrap break-all text-muted-foreground">
      {detail || summary}
    </pre>
  );
}
