import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runtime, runtimeConfigured, type UsageLine, type UsageSummary } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { MISSION_STATUS } from "../missions/status";
import { relativeTime } from "../projects/time";
import { billingOf } from "./billing";

const format = new Intl.NumberFormat();
const tokens = (n: number) => format.format(n);
const processed = (u: UsageLine) =>
  u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;

export function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([runtime.usage(), runtime.agents()]).then(
        ([s, a]) => {
          setSummary(s);
          setAgentNames(Object.fromEntries(a.agents.map((agent) => [agent.id, agent.name])));
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not read usage."),
      ),
    [],
  );

  useEffect(() => {
    if (runtimeConfigured) void load();
  }, [load]);

  if (!runtimeConfigured || error) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant={error ? "destructive" : "default"}>
          <AlertTitle>
            {error ? "Could not read usage" : "The Noburi runtime is not connected"}
          </AlertTitle>
          <AlertDescription>
            {error ?? "Open the app with pnpm desktop, or pnpm dev for the browser."}
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!summary)
    return <main className="flex-1 p-8 text-sm text-muted-foreground">Reading usage…</main>;

  const { totals } = summary;
  const billing = billingOf(summary.apiKeySources);
  const hasData = totals.runs > 0;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tokens exactly as Claude Code reported them at the end of each mission task
              {summary.sources.length > 0 ? ` (source: ${summary.sources.join(", ")})` : ""}.
              Nothing is estimated from text length.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            <ArrowPathIcon aria-hidden="true" className="size-4" />
            Refresh
          </Button>
        </div>

        {!hasData ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
            No usage reported yet. Numbers appear here once a mission task has finished. Continuing
            a session from Projects is not counted here yet.
          </div>
        ) : (
          <>
            <section
              aria-label="Totals"
              className="grid grid-cols-2 overflow-hidden rounded-xl bg-card sm:grid-cols-5"
            >
              <Stat label="Input" value={tokens(totals.inputTokens)} />
              <Stat label="Output" value={tokens(totals.outputTokens)} />
              <Stat label="Cache read" value={tokens(totals.cacheReadTokens)} />
              <Stat label="Cache write" value={tokens(totals.cacheWriteTokens)} />
              <Stat
                label="Processed"
                value={tokens(processed(totals))}
                hint={`${totals.runs} task runs`}
              />
            </section>

            <section className="rounded-xl bg-card p-5">
              <h2 className="text-sm font-semibold">Cost</h2>
              {billing === "subscription" ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  These runs used a Claude subscription: they count against your plan&apos;s limits
                  and are not billed per token, so no dollar figure is shown.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-mono text-base text-foreground">
                    ${totals.costUsdEstimated.toFixed(4)}
                  </span>{" "}
                  estimated by the Claude Agent SDK at API prices.{" "}
                  {billing === "api"
                    ? "Check your Anthropic console for the actual bill."
                    : "Some runs may have used a subscription, which is not billed per token; treat this as an upper bound."}
                </p>
              )}
            </section>

            <section className="overflow-hidden rounded-xl bg-card">
              <h2 className="px-5 pt-4 pb-2 text-sm font-semibold">By agent and model</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-2 font-medium">
                        Agent
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Model
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Input
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Output
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Cache R · W
                      </th>
                      <th scope="col" className="px-5 py-2 text-right font-medium">
                        Runs
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {summary.byAgentModel.map((u) => (
                      <tr key={`${u.agentId}-${u.model}`} className="border-t">
                        <td className="px-5 py-2.5 font-sans">
                          {agentNames[u.agentId] ?? u.agentId}
                        </td>
                        <td className="px-3 py-2.5">{u.model}</td>
                        <td className="px-3 py-2.5 text-right">{tokens(u.inputTokens)}</td>
                        <td className="px-3 py-2.5 text-right">{tokens(u.outputTokens)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {tokens(u.cacheReadTokens)} · {tokens(u.cacheWriteTokens)}
                        </td>
                        <td className="px-5 py-2.5 text-right">{u.runs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                Models are the aliases Noburi asked for (sonnet, opus, haiku); Claude Code resolves
                them for your plan.
              </p>
            </section>
          </>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">By mission</h2>
          {summary.missions.length === 0 && (
            <p className="text-sm text-muted-foreground">No mission yet.</p>
          )}
          {summary.missions.map((m) => {
            const used = processed(m);
            const ratio = m.budgetTokens ? used / m.budgetTokens : null;
            return (
              <article key={m.missionId} className="flex flex-col gap-2 rounded-xl bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                  <Badge className={cn("border-0", MISSION_STATUS[m.status].className)}>
                    {MISSION_STATUS[m.status].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(Date.parse(m.createdAt))}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {m.runs === 0
                    ? "no usage reported"
                    : `${tokens(used)} tokens processed · in ${tokens(m.inputTokens)} · out ${tokens(m.outputTokens)} · cache ${tokens(m.cacheReadTokens)} / ${tokens(m.cacheWriteTokens)}`}
                </p>
                {m.budgetTokens !== null && ratio !== null && (
                  <div className="flex flex-col gap-1.5">
                    <progress
                      aria-label={`Budget used for ${m.title}`}
                      value={Math.min(used, m.budgetTokens)}
                      max={m.budgetTokens}
                      className={cn(
                        "h-2 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted",
                        ratio >= 1
                          ? "[&::-moz-progress-bar]:bg-destructive [&::-webkit-progress-value]:bg-destructive"
                          : ratio >= 0.8
                            ? "[&::-moz-progress-bar]:bg-warning [&::-webkit-progress-value]:bg-warning"
                            : "[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success",
                      )}
                    />
                    <p
                      className={cn(
                        "text-xs",
                        ratio >= 0.8 ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {Math.round(ratio * 100)} % of a {tokens(m.budgetTokens)}-token budget
                      {ratio >= 1
                        ? " · used up: no new task starts"
                        : ratio >= 0.8
                          ? " · over 80 %: the next task may not start"
                          : ""}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-r border-b p-4 last:border-r-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
