import { useEffect, useState } from "react";
import { openExternal } from "@/lib/external";
import { runtime, type PullRequest } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { sprite } from "./OfficeScreen";
import type { Finished, Studio } from "./useStudio";
import "./game.css";

const MAX_DIFF_LINES = 80;

const prNumber = (url: string): number | null => {
  const n = Number(url.split("/").pop());
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Diff lines as the desk shows them: file headers, then added and removed lines in colour. */
function diffLines(diff: string): { text: string; kind: "file" | "add" | "del" | "ctx" }[] {
  const lines: { text: string; kind: "file" | "add" | "del" | "ctx" }[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      lines.push({ text: line.replace(/^diff --git a\/(\S+) b\/\S+$/, "$1"), kind: "file" });
    } else if (/^(index |--- |\+\+\+ |@@)/.test(line)) {
      continue;
    } else if (line.startsWith("+")) lines.push({ text: line, kind: "add" });
    else if (line.startsWith("-")) lines.push({ text: line, kind: "del" });
    else if (line.trim()) lines.push({ text: line, kind: "ctx" });
  }
  return lines;
}

const LINE_STYLE = {
  file: "text-[#A7B3BE]",
  add: "text-[#7DD3B0]",
  del: "text-[#F2867A]",
  ctx: "text-[#F6F0E5]",
};

/** Your desk: what the team delivered, read from GitHub. Merging stays on GitHub, with you. */
export function DeskScreen({ studio }: { studio: Studio }) {
  const { repo, delivered, finished, agents } = studio;
  const stopped = finished.filter((f) => f.pullRequest === null);
  const [picked, setPicked] = useState<string | null>(null);
  const selected: Finished | undefined =
    delivered.find((d) => d.mission.id === picked) ?? delivered[0];
  const [pr, setPr] = useState<{ id: string; data: PullRequest | null; error: string | null }>({
    id: "",
    data: null,
    error: null,
  });

  const url = selected?.pullRequest ?? null;
  useEffect(() => {
    const number = url ? prNumber(url) : null;
    if (!url || number === null || !repo) return () => {};
    let current = true;
    runtime.pullRequest(repo, number).then(
      (data) => {
        if (current) setPr({ id: url, data, error: null });
      },
      (e: unknown) => {
        if (current)
          setPr({
            id: url,
            data: null,
            error: e instanceof Error ? e.message : "Could not read it.",
          });
      },
    );
    return () => {
      current = false;
    };
  }, [url, repo]);

  const data = pr.id === url ? pr.data : null;
  const error = pr.id === url ? pr.error : null;
  const developer = agents.find((a) => a.id === "developer");
  const failing = data?.checks.some((c) => c.state === "fail") ?? false;
  const pending = data?.checks.some((c) => c.state === "pending") ?? false;
  const stamp = !data
    ? null
    : data.checks.length === 0
      ? null
      : failing
        ? { text: "CI FAILED", color: "#B5483D" }
        : pending
          ? { text: "CI RUNNING", color: "#3D6FA8" }
          : { text: "CI PASSED", color: "#3F9E7A" };
  const lines = data ? diffLines(data.diff) : [];

  return (
    <main
      className="relative flex min-h-0 min-w-0 flex-1 gap-10 overflow-hidden p-10 font-pixel text-[#F6F0E5]"
      style={{
        background:
          "repeating-linear-gradient(180deg,#7A5A3C 0 32px,#5E4430 32px 36px,#74563A 36px 68px,#5E4430 68px 72px)",
      }}
    >
      <section aria-label="In-tray" className="flex w-72 shrink-0 flex-col gap-4">
        <span className="self-start bg-[#101820] px-2.5 py-0.5 text-sm tracking-[0.14em] text-[#F0BE79]">
          IN-TRAY
        </span>
        {delivered.length === 0 && (
          <p className="bg-[#101820]/85 p-4 text-base">
            Nothing to review yet. Give a card to the developer in the office.
          </p>
        )}
        {delivered.map((d) => (
          <button
            key={d.mission.id}
            type="button"
            onClick={() => setPicked(d.mission.id)}
            className={cn(
              "relative flex flex-col gap-1.5 p-4 pt-5 text-left text-[#101820]",
              d === selected
                ? "bg-[#F0BE79] shadow-[0_0_0_4px_#A9844F,6px_8px_0_4px_rgba(0,0,0,0.3)]"
                : "bg-[#E0B27A] shadow-[0_0_0_4px_#A9844F]",
            )}
          >
            <span className="font-mono text-xs font-bold">PR #{prNumber(d.pullRequest ?? "")}</span>
            <span className="text-lg leading-tight font-bold">
              {d.mission.title.replace(/^#\d+\s*/, "")}
            </span>
          </button>
        ))}
        {stopped.length > 0 && (
          <div className="flex flex-col gap-1 bg-[#A7B3BE] p-4 text-[#101820] shadow-[0_0_0_4px_#6E7B86]">
            <span className="font-mono text-xs font-bold">
              {stopped.length} returned without a pull request
            </span>
            <span className="text-sm">Stopped after a refusal. Give the card again to retry.</span>
          </div>
        )}
      </section>

      {selected && (
        <article
          aria-label="Delivery report"
          className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden bg-[#F6F0E5] p-9 text-[#101820] shadow-[0_0_0_4px_#C9BFAE,10px_12px_0_4px_rgba(0,0,0,0.35)]"
        >
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="font-mono text-xs font-bold tracking-[0.14em] text-[#5E4430]">
                DELIVERY · PR #{data?.number ?? prNumber(selected.pullRequest ?? "")}
                {data ? ` · ${data.state}` : ""}
              </span>
              <h1 className="text-3xl leading-tight font-bold">
                {data?.title ?? selected.mission.title}
              </h1>
            </div>
            {stamp && (
              <span
                className="shrink-0 -rotate-6 px-3 py-2 text-lg font-bold tracking-wide"
                style={{ color: stamp.color, boxShadow: `inset 0 0 0 4px ${stamp.color}` }}
              >
                {stamp.text}
              </span>
            )}
          </div>
          {error && (
            <p className="font-sans text-sm text-[#B5483D]">
              Could not read it from GitHub: {error}
            </p>
          )}
          {!data && !error && <p className="text-base text-[#5E4430]">Reading the pull request…</p>}
          {data && (
            <>
              <p className="line-clamp-3 font-sans text-base leading-relaxed whitespace-pre-wrap">
                {data.body}
              </p>
              <div className="flex flex-wrap gap-2.5 font-mono text-sm">
                <span className="bg-[#E6DCCB] px-2.5 py-1">
                  {data.changedFiles} files ·{" "}
                  <span className="text-[#2F7D5E]">+{data.additions}</span>{" "}
                  <span className="text-[#B5483D]">−{data.deletions}</span>
                </span>
                {data.checks.map((c, i) => (
                  <span
                    key={`${c.name}-${i}`}
                    className="flex items-center gap-1.5 bg-[#E6DCCB] px-2.5 py-1"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2.5",
                        c.state === "pass"
                          ? "bg-[#3F9E7A]"
                          : c.state === "fail"
                            ? "bg-[#B5483D]"
                            : "bg-[#3D6FA8]",
                      )}
                    />
                    {c.name} · {c.state}
                  </span>
                ))}
                <span className="bg-[#E6DCCB] px-2.5 py-1">{data.branch}</span>
              </div>
              <pre className="min-h-0 flex-1 overflow-hidden bg-[#101820] px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre-wrap shadow-[0_0_0_4px_#26323D]">
                {lines.slice(0, MAX_DIFF_LINES).map((l, i) => (
                  <span key={i} className={cn("block", LINE_STYLE[l.kind])}>
                    {l.text}
                  </span>
                ))}
              </pre>
            </>
          )}
          <div className="flex items-end gap-3.5 pt-3 shadow-[0_-2px_0_#C9BFAE]">
            {developer && (
              <img src={sprite(developer.avatar, "done")} alt="" className="office-px size-16" />
            )}
            <div className="flex flex-col">
              <span className="text-sm text-[#5E4430]">Signed</span>
              <span className="text-2xl font-bold">{developer?.name ?? "Developer"}</span>
            </div>
          </div>
        </article>
      )}

      {selected && (
        <section
          aria-label="Your move"
          className="game-win flex w-72 shrink-0 flex-col gap-3.5 self-start p-5"
        >
          <span className="text-xs tracking-[0.14em] text-[#F0BE79]">YOUR MOVE</span>
          <button
            type="button"
            className="game-btn game-btn-honey justify-between"
            onClick={() => selected.pullRequest && void openExternal(selected.pullRequest)}
          >
            Merge on GitHub
          </button>
          <p className="text-sm leading-relaxed text-[#A7B3BE]">
            Noburi never merges. Review the change on GitHub and merge it there when you are happy.
          </p>
        </section>
      )}
    </main>
  );
}
