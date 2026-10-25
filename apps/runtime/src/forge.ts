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
