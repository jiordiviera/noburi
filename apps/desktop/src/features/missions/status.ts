import type { MissionStatus, TaskStatus } from "@/lib/runtime";

/** Text labels and tinted badge classes; status is never conveyed by colour alone. */
export const MISSION_STATUS: Record<MissionStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  RUNNING: { label: "Running", className: "bg-success/15 text-success" },
  COMPLETED: { label: "Completed", className: "bg-success/15 text-success" },
  FAILED: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  CANCELLED: { label: "Stopped", className: "bg-muted text-muted-foreground" },
  INTERRUPTED: { label: "Interrupted", className: "bg-warning/15 text-warning" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-muted text-muted-foreground" },
  READY: { label: "Ready", className: "bg-muted text-muted-foreground" },
  RUNNING: { label: "Working", className: "bg-success/15 text-success" },
  WAITING_APPROVAL: { label: "Needs you", className: "bg-primary text-primary-foreground" },
  SUCCEEDED: { label: "Succeeded", className: "bg-success/15 text-success" },
  FAILED: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  INTERRUPTED: { label: "Interrupted", className: "bg-warning/15 text-warning" },
};
