import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Agent, PlanTask } from "@/lib/runtime";

export const MAX_TASKS = 3;

interface Props {
  plan: PlanTask[];
  agents: Agent[];
  onChange: (plan: PlanTask[]) => void;
}

/** Up to three tasks; a task can only wait for earlier ones, so the plan can never loop. */
export function PlanEditor({ plan, agents, onChange }: Props) {
  const update = (index: number, patch: Partial<PlanTask>) =>
    onChange(plan.map((task, i) => (i === index ? { ...task, ...patch } : task)));

  const remove = (index: number) =>
    onChange(
      plan
        .filter((_, i) => i !== index)
        .map((task) => ({
          ...task,
          dependsOn: task.dependsOn.filter((d) => d !== index).map((d) => (d > index ? d - 1 : d)),
        })),
    );

  return (
    <div className="flex flex-col gap-3">
      {plan.map((task, index) => (
        <fieldset key={index} className="flex flex-col gap-3 rounded-xl bg-card p-4">
          <legend className="sr-only">Task {index + 1}</legend>
          <div className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent font-mono text-xs">
              {index + 1}
            </span>
            <label htmlFor={`task-title-${index}`} className="sr-only">
              Task {index + 1} title
            </label>
            <Input
              id={`task-title-${index}`}
              value={task.title}
              placeholder="What this task should achieve"
              onChange={(e) => update(index, { title: e.target.value })}
            />
            <label htmlFor={`task-agent-${index}`} className="sr-only">
              Agent for task {index + 1}
            </label>
            <Select value={task.agentId} onValueChange={(v) => update(index, { agentId: v })}>
              <SelectTrigger id={`task-agent-${index}`} className="w-56 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {plan.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove task ${index + 1}`}
                onClick={() => remove(index)}
              >
                <TrashIcon aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>
          <label htmlFor={`task-instructions-${index}`} className="sr-only">
            Instructions for task {index + 1}
          </label>
          <Textarea
            id={`task-instructions-${index}`}
            value={task.instructions}
            rows={3}
            placeholder="Instructions for the agent"
            onChange={(e) => update(index, { instructions: e.target.value })}
          />
          {index > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">Starts after</span>
              {plan.slice(0, index).map((earlier, dep) => (
                <Label key={dep} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={task.dependsOn.includes(dep)}
                    onCheckedChange={(checked) =>
                      update(index, {
                        dependsOn: checked
                          ? [...task.dependsOn, dep].toSorted((a, b) => a - b)
                          : task.dependsOn.filter((d) => d !== dep),
                      })
                    }
                  />
                  {dep + 1}. {earlier.title || "Untitled"}
                </Label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      {plan.length < MAX_TASKS && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            onChange([
              ...plan,
              {
                title: "",
                instructions: "",
                agentId: "developer",
                dependsOn: plan.length > 0 ? [plan.length - 1] : [],
              },
            ])
          }
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          Add a task
        </Button>
      )}
    </div>
  );
}
