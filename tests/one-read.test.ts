import { describe, it, expect, beforeEach } from "vitest";
import { checkOneRead, resetReadHistory } from "../src/one-read.js";

describe("checkOneRead", () => {
  beforeEach(() => {
    resetReadHistory();
  });

  it("allows first read in a directory", () => {
    const result = checkOneRead("agent1", "/opt/lib/dist/foo.js", 30);
    expect(result).toBe(true);
  });

  it("blocks second read in same directory", () => {
    checkOneRead("agent1", "/opt/lib/dist/foo.js", 30);
    const result = checkOneRead("agent1", "/opt/lib/dist/bar.js", 30);
    expect(result).toBe(false);
  });

  it("allows reads in different directories", () => {
    const r1 = checkOneRead("agent1", "/opt/lib/dist/foo.js", 30);
    const r2 = checkOneRead("agent1", "/opt/lib/src/bar.ts", 30);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  it("tracks agents independently", () => {
    checkOneRead("agent1", "/opt/lib/dist/foo.js", 30);
    const result = checkOneRead("agent2", "/opt/lib/dist/bar.js", 30);
    expect(result).toBe(true); // Different agent, should be allowed
  });

  it("allows read after window expires", async () => {
    checkOneRead("agent1", "/opt/lib/dist/foo.js", 0.01); // 10ms window
    await new Promise((r) => setTimeout(r, 20));
    const result = checkOneRead("agent1", "/opt/lib/dist/bar.js", 0.01);
    expect(result).toBe(true);
  });

  it("blocks third read in same directory too", () => {
    checkOneRead("agent1", "/opt/lib/dist/a.js", 30);
    checkOneRead("agent1", "/opt/lib/dist/b.js", 30); // blocked
    const result = checkOneRead("agent1", "/opt/lib/dist/c.js", 30);
    expect(result).toBe(false);
  });
});
