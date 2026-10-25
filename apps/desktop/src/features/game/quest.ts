import type { MissionEvent, MissionStatus } from "@/lib/runtime";

/**
 * The quest log of one issue: the steps a developer goes through, each checked off only when a
 * matching tool call really succeeded. Nothing here is guessed from time or progress bars.
 */
export type StepState = "done" | "waiting" | "active" | "todo";

export interface QuestStep {
  id: "take" | "branch" | "change" | "tests" | "commit" | "push" | "pr" | "deliver";
  label: string;
  state: StepState;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

interface Call {
  name: string;
  text: string;
}

/** What a step looks like as a tool call; `text` is the command or the summary. */
const MATCHERS: Record<Exclude<QuestStep["id"], "take" | "deliver">, (call: Call) => boolean> = {
  branch: (c) =>
    c.name === "Bash" &&
    /git (switch -c|checkout -b|branch \S|switch noburi\/|checkout noburi\/)/.test(c.text),
  change: (c) =>
    ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(c.name) ||
    (c.name === "Bash" && /sed -i|cat >>?|tee /.test(c.text)),
  tests: (c) =>
    c.name === "Bash" &&
    /\b(npm|pnpm|yarn|bun) (run )?test\b|\b(vitest|jest|pytest|node --test)\b/.test(c.text),
  commit: (c) => c.name === "Bash" && /git commit\b/.test(c.text),
  push: (c) => c.name === "Bash" && /git push\b/.test(c.text),
  pr: (c) => c.name === "Bash" && /gh pr create\b|glab mr create\b/.test(c.text),
};

const ORDER: readonly QuestStep["id"][] = [
  "take",
  "branch",
  "change",
  "tests",
  "commit",
  "push",
  "pr",
  "deliver",
];

const LABELS: Record<QuestStep["id"], string> = {
  take: "Take the card",
  branch: "Open a branch",
  change: "Make the change",
  tests: "Run the tests",
  commit: "Commit",
  push: "Push the branch",
  pr: "Open the pull request",
  deliver: "Bring it to your desk",
};

export function questSteps(input: {
  events: readonly MissionEvent[];
  status: MissionStatus | null;
  /** The pull request the agent reported, once the mission is over. */
  pullRequest: string | null;
}): QuestStep[] {
  const { events, status } = input;
  const started = new Map<string, Call>();
  const succeeded: Call[] = [];
  for (const e of events) {
    if (e.type === "tool.started") {
      started.set(str(e.payload["toolUseId"]), {
        name: str(e.payload["name"]),
        // Older events carry only the clipped summary; newer ones the whole command.
        text: str(e.payload["detail"]) || str(e.payload["summary"]),
      });
    } else if (e.type === "tool.completed" && e.payload["isError"] !== true) {
      const call = started.get(str(e.payload["toolUseId"]));
      if (call) succeeded.push(call);
    }
  }
  const resolved = new Set(
    events.filter((e) => e.type === "approval.resolved").map((e) => str(e.payload["approvalId"])),
  );
  const pending = events
    .filter((e) => e.type === "approval.requested" && !resolved.has(str(e.payload["approvalId"])))
    .map((e) => ({
      name: str(e.payload["toolName"]),
      text: str(e.payload["detail"]) || str(e.payload["summary"]),
    }));

  const done: Record<QuestStep["id"], boolean> = {
    take: events.some((e) => e.type === "mission.started"),
    branch: succeeded.some(MATCHERS.branch),
    change: succeeded.some(MATCHERS.change),
    tests: succeeded.some(MATCHERS.tests),
    commit: succeeded.some(MATCHERS.commit),
    push: succeeded.some(MATCHERS.push),
    pr: succeeded.some(MATCHERS.pr),
    deliver: status === "COMPLETED" && input.pullRequest !== null,
  };

  const waitingOn = (id: QuestStep["id"]) =>
    id !== "take" && id !== "deliver" && pending.some(MATCHERS[id]);
  // While the player is asked something, that step is the current one; nothing else is "active".
  let activeGiven = ORDER.some((id) => !done[id] && waitingOn(id));
  return ORDER.map((id) => {
    let state: StepState = "todo";
    if (done[id]) state = "done";
    else if (waitingOn(id)) state = "waiting";
    else if (status === "RUNNING" && !activeGiven) {
      state = "active";
      activeGiven = true;
    }
    return { id, label: LABELS[id], state };
  });
}
