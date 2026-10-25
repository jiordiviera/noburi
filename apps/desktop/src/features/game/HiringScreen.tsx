import { useState } from "react";
import { cn } from "@/lib/utils";
import { sprite } from "./OfficeScreen";
import { ENGINE_LABEL, useConnections } from "./useConnections";
import type { Studio } from "./useStudio";
import "./game.css";

/** Character select. Every profile shown is a real one; hiring more desks comes later. */
export function HiringScreen({ studio }: { studio: Studio }) {
  const { agents } = studio;
  const { connections } = useConnections();
  const [picked, setPicked] = useState("developer");
  const agent = agents.find((a) => a.id === picked) ?? agents[0];

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 gap-12 overflow-hidden bg-[#0C131A] p-12 font-pixel text-[#F6F0E5]">
      <section aria-label="Roles" className="flex w-72 shrink-0 flex-col gap-5">
        <span className="self-start bg-[#101820] px-2.5 py-0.5 text-sm tracking-[0.14em] text-[#F0BE79]">
          THE TEAM
        </span>
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-label={a.name}
            aria-pressed={a.id === agent?.id}
            onClick={() => setPicked(a.id)}
            className={cn(
              "flex items-center gap-3.5 p-3 text-left",
              a.id === agent?.id ? "game-win-honey" : "game-win opacity-80",
            )}
          >
            <img src={sprite(a.avatar, "idle")} alt="" className="office-px size-14" />
            <span className="flex flex-col gap-0.5">
              <span className="text-lg font-bold">{a.name}</span>
              <span className="text-sm text-[#A7B3BE]">
                {a.id === "developer" ? "Takes issues from the board" : "Not at a desk yet"}
              </span>
            </span>
          </button>
        ))}
      </section>

      {agent && (
        <section aria-label={agent.name} className="relative flex flex-1 flex-col items-center">
          <span
            aria-hidden="true"
            className="absolute top-6 h-[420px] w-[300px] bg-[#F0BE79]/10"
            style={{ clipPath: "polygon(35% 0, 65% 0, 100% 100%, 0 100%)" }}
          />
          <img
            src={sprite(agent.avatar, "idle")}
            alt=""
            className="office-px relative mt-24 size-56"
          />
          <span className="relative mt-2 h-6 w-64 bg-[#26323D] shadow-[0_0_0_4px_#0C131A]" />
          <h1 className="relative mt-8 text-4xl font-bold">{agent.name}</h1>
          <p className="relative mt-3 max-w-md text-center font-sans text-lg leading-relaxed text-[#A7B3BE]">
            {agent.role}
          </p>
          <p className="relative mt-4 font-mono text-sm text-[#A7B3BE]">model · {agent.model}</p>
        </section>
      )}

      <section
        aria-label="Engines"
        className="game-win flex w-96 shrink-0 flex-col gap-4 self-start p-5"
      >
        <span className="text-xs tracking-[0.14em] text-[#F0BE79]">ENGINE</span>
        {(connections?.engines ?? []).map((e) => (
          <div
            key={e.id}
            className={cn(
              "flex items-center gap-3 p-3",
              e.id === "claude" ? "bg-[#26323D] shadow-[0_0_0_3px_#F0BE79]" : "bg-[#101820]",
            )}
          >
            <span className="flex-1 text-lg font-bold">{ENGINE_LABEL[e.id]}</span>
            <span
              className={cn(
                "font-mono text-xs",
                e.supported && e.installed ? "text-[#7DD3B0]" : "text-[#A7B3BE]",
              )}
            >
              {!e.installed
                ? "not installed"
                : e.supported
                  ? "ready"
                  : "installed · not supported yet"}
            </span>
          </div>
        ))}
        {!connections && <p className="text-sm text-[#A7B3BE]">Looking for engines…</p>}
        <p className="text-sm leading-relaxed text-[#A7B3BE]">
          Every agent runs on Claude Code today. Codex and Gemini CLI agents come once Noburi can
          relay their approvals one command at a time.
        </p>
        <button type="button" className="game-btn game-btn-honey justify-center" disabled>
          Hire · coming soon
        </button>
      </section>
    </main>
  );
}
