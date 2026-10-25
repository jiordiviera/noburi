import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, TaskStatus } from "./status.ts";

describe("task transitions", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING", "READY")).toBe(true);
    expect(canTransition("READY", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "WAITING_APPROVAL")).toBe(true);
    expect(canTransition("WAITING_APPROVAL", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "SUCCEEDED")).toBe(true);
  });

  it("never leaves a terminal success or cancellation", () => {
    for (const to of TaskStatus.options) {
      expect(canTransition("SUCCEEDED", to)).toBe(false);
      expect(canTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("cannot start a task twice", () => {
    expect(() => assertTransition("RUNNING", "RUNNING")).toThrow(/Illegal/);
  });

  it("only re-queues failed or interrupted tasks manually", () => {
    expect(canTransition("FAILED", "READY")).toBe(true);
    expect(canTransition("INTERRUPTED", "READY")).toBe(true);
    expect(canTransition("FAILED", "RUNNING")).toBe(false);
  });
});
