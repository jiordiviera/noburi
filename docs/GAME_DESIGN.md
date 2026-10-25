# Noburi — game design

Noburi is a management game where you are the project lead and your staff are real Claude Code agents.
Like a studio tycoon game, except the work done in the game is real: real issues, real branches, real pull
requests.

Built first for its author: no market to win, the goal is that running agents feels like running a team.

## The one rule: what is real, what is staged

| Must be real                                                         | May be staged                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| An agent's state: working, waiting for you, blocked, done            | Idle animations: walking to the coffee machine, stretching, chatting at the window |
| What an agent is doing: the file it reads, the command it runs       | The path an agent walks to get somewhere                                           |
| Hand-offs between agents: one agent's output is the next one's input | Decoration, weather, time of day                                                   |
| Tickets, branches, pull requests, CI results, review comments        | Sound effects and celebrations                                                     |
| Costs, tokens and budgets                                            |                                                                                    |

A staged animation never shows a state that is not true. An agent shown typing is really working; an idle agent
may wander.

## Core loop

1. **Board.** Open GitHub issues are cards on the office board. Labels give the colour (`bug` red,
   `enhancement` blue, `documentation` green).
2. **Assign.** Drag a card onto an agent. The agent walks to the board, takes it, goes back to its desk.
3. **Work.** The agent works on a branch. Bubbles show its real tool calls.
4. **Needs you.** Anything that writes outside the workspace raises a "!" over the agent: push a branch, open a
   pull request, comment. Click it to approve or refuse in a game dialog.
5. **Deliver.** The opened pull request lands in the "To review" tray on your desk.
6. **CI.** A wall screen shows each pull request's checks as lights. A red light puts a "!" over the agent who
   owns it.
7. **Review.** Review comments are sticky notes on the folder; the agent comes back to address them.
8. **Merge.** Merging is always your move, never an agent's and never automatic. The ticket is done.

## GitHub

- Everything goes through the user's own `gh` login. Noburi stores no token.
- Reading (issues, pull requests, checks, comments) never asks.
- Writing (push, open a pull request, comment) always asks, as above. Merge stays with the player.
- GitLab merge requests later, through `glab`, behind the same "forge" interface.

## Progression (after the first version)

- XP per ticket delivered (merged with green CI), levels per agent and for the studio.
- Unlocks: furniture, rooms, new roles (reviewer, tester, designer).
- The token budget is the studio's money; an end-of-day report shows what was delivered and what it cost.

## First version

One office, one developer agent, one connected repository (`jiordiviera/noburi-playground`, private, with
sample issues). The loop: issue on the board → agent takes it → branch → pull request after your approval → CI
lights → you merge → done. A reviewer agent, XP and furniture come once this loop is fun.

## What stays from the current code

The runtime, the mission engine, approvals, the per-mission agent environment and usage tracking stay. The
form-based screens go: the app becomes a single game scene with game menus. The rendering library (PixiJS or
Phaser inside the existing Tauri app) is chosen when the prototype starts.

## Open questions

- How agents talk to each other in the scene beyond hand-offs.
- Whether several repositories mean several offices or floors.
- Save files: the office layout and progression live in the local SQLite database.
