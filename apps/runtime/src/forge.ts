import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

/** Runs a command and returns its stdout; rejects with stderr in the message on failure. */
export type Exec = (command: string, args: string[], options?: { cwd?: string }) => Promise<string>;

const run = promisify(execFile);

export const nodeExec: Exec = async (command, args, options) => {
  try {
    const { stdout } = await run(command, args, {
      cwd: options?.cwd,
      timeout: 120_000,
      maxBuffer: 8 << 20,
    });
    return stdout;
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";
    throw new ForgeError(stderr.trim() || (error instanceof Error ? error.message : String(error)));
  }
};

export class ForgeError extends Error {}

/**
 * "owner/name", as GitHub allows them; anything else never reaches a command line or a path.
 * Owners start with a letter or digit, and a name of "." or ".." would leave the workspaces folder.
 */
export const REPO = /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;

export const Issue = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
});
export type Issue = z.infer<typeof Issue>;

const FIELDS = "number,title,body,url,labels";

/** A check as GitHub reports it: a CheckRun (status/conclusion) or a commit StatusContext (state). */
const RawCheck = z.object({
  name: z.string().optional(),
  context: z.string().optional(),
  status: z.string().optional(),
  conclusion: z.string().nullable().optional(),
  state: z.string().optional(),
});

export type CheckState = "pass" | "fail" | "pending";

export function checkState(check: z.infer<typeof RawCheck>): CheckState {
  const done = check.status === undefined || check.status === "COMPLETED";
  const result = (check.conclusion ?? check.state ?? "").toUpperCase();
  if (!done || result === "PENDING" || result === "EXPECTED" || result === "") return "pending";
  return ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(result) ? "pass" : "fail";
}

const RawPull = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  state: z.string(),
  headRefName: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  changedFiles: z.number().int(),
  statusCheckRollup: z.array(RawCheck).nullable(),
});

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  branch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  checks: { name: string; state: CheckState }[];
  /** The start of the diff, enough to read on the desk; the full one is on GitHub. */
  diff: string;
}

const MAX_DIFF = 12_000;

/**
 * GitHub through the user's own `gh` login: Noburi stores no token. Only reads happen here
 * (issues, and cloning into Noburi's own folder); pushes and pull requests are made by agents,
 * through tool calls the player approves.
 */
export class GitHubForge {
  constructor(
    private readonly exec: Exec,
    private readonly workspacesDir: string,
  ) {}

  async listIssues(repo: string): Promise<Issue[]> {
    checkRepo(repo);
    const out = await this.exec("gh", [
      "issue",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--limit",
      "50",
      "--json",
      FIELDS,
    ]);
    return z.array(Issue).parse(JSON.parse(out));
  }

  async issue(repo: string, number: number): Promise<Issue> {
    checkRepo(repo);
    const out = await this.exec("gh", [
      "issue",
      "view",
      String(number),
      "--repo",
      repo,
      "--json",
      FIELDS,
    ]);
    return Issue.parse(JSON.parse(out));
  }

  async pullRequest(repo: string, number: number): Promise<PullRequest> {
    checkRepo(repo);
    const id = String(number);
    const [view, diff] = await Promise.all([
      this.exec("gh", [
        "pr",
        "view",
        id,
        "--repo",
        repo,
        "--json",
        "number,title,body,url,state,headRefName,additions,deletions,changedFiles,statusCheckRollup",
      ]),
      this.exec("gh", ["pr", "diff", id, "--repo", repo]),
    ]);
    const raw = RawPull.parse(JSON.parse(view));
    return {
      number: raw.number,
      title: raw.title,
      body: raw.body,
      url: raw.url,
      state: raw.state,
      branch: raw.headRefName,
      additions: raw.additions,
      deletions: raw.deletions,
      changedFiles: raw.changedFiles,
      checks: (raw.statusCheckRollup ?? []).map((c) => ({
        name: c.name ?? c.context ?? "check",
        state: checkState(c),
      })),
      diff: diff.length > MAX_DIFF ? `${diff.slice(0, MAX_DIFF)}\n…` : diff,
    };
  }

  /** Where agents work on this repository: a clone in Noburi's data folder, made on first use. */
  async workspace(repo: string): Promise<string> {
    checkRepo(repo);
    const [owner = "", name = ""] = repo.split("/");
    const dir = join(this.workspacesDir, owner, name);
    if (!existsSync(join(dir, ".git"))) {
      mkdirSync(dirname(dir), { recursive: true });
      await this.exec("gh", ["repo", "clone", repo, dir]);
    }
    return dir;
  }
}

function checkRepo(repo: string): void {
  if (!REPO.test(repo)) throw new ForgeError(`not a GitHub repository: ${repo}`);
}

/** The single task a developer agent gets for an issue. The issue text is the player's own. */
export function issueInstructions(repo: string, issue: Issue): string {
  const branch = `noburi/issue-${issue.number}`;
  return [
    `Work on GitHub issue #${issue.number} of ${repo}: "${issue.title}".`,
    "",
    "Issue description:",
    issue.body.trim().slice(0, 4000) || "(no description)",
    "",
    "Steps:",
    `1. Run \`git fetch origin\`, then create the branch \`${branch}\` from the default branch.`,
    "2. Make the change, with a test when it makes sense, and run the project's tests.",
    "3. Only if the tests pass, commit with a clear message.",
    `4. Push the branch and open a pull request with \`gh pr create\`; put "Closes #${issue.number}" in its body.`,
    "5. End your reply with the pull request URL on its own line.",
    "Run each step as its own command, so each can be approved on its own.",
    "Write the commit message and the pull request as the repository's owner would: no AI co-author",
    'trailer and no "Generated with" line.',
    "Do not merge anything.",
  ].join("\n");
}

export function issueRef(repo: string, number: number): string {
  return `${repo}#${number}`;
}

export interface ToolStatus {
  /** Installed and runnable. */
  installed: boolean;
  /** Who it is signed in as, when the tool says so. */
  account: string | null;
}

/** GitHub and GitLab CLIs as the player has them: never a token, only what the CLIs report. */
export async function forgeStatus(exec: Exec): Promise<{ github: ToolStatus; gitlab: ToolStatus }> {
  const runs = async (command: string, args: string[]) =>
    exec(command, args).then(
      (out) => ({ ok: true, out: out.trim() }),
      () => ({ ok: false, out: "" }),
    );
  const [ghVersion, ghUser, glabVersion] = await Promise.all([
    runs("gh", ["--version"]),
    runs("gh", ["api", "user", "--jq", ".login"]),
    runs("glab", ["--version"]),
  ]);
  return {
    github: { installed: ghVersion.ok, account: ghUser.ok && ghUser.out ? ghUser.out : null },
    gitlab: { installed: glabVersion.ok, account: null },
  };
}

/** AI engines found on this machine. Only Claude Code can run agents in Noburi so far. */
export async function engineStatus(
  exec: Exec,
  claudePath: string | null,
): Promise<
  {
    id: "claude" | "codex" | "gemini";
    installed: boolean;
    path: string | null;
    supported: boolean;
  }[]
> {
  const found = async (command: string) =>
    exec(command, ["--version"]).then(
      () => true,
      () => false,
    );
  const [codex, gemini] = await Promise.all([found("codex"), found("gemini")]);
  return [
    { id: "claude", installed: claudePath !== null, path: claudePath, supported: true },
    { id: "codex", installed: codex, path: null, supported: false },
    { id: "gemini", installed: gemini, path: null, supported: false },
  ];
}
