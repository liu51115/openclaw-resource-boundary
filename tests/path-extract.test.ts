import { describe, it, expect } from "vitest";
import { extractPaths } from "../src/path-extract.js";

describe("extractPaths", () => {
  describe("read/write/edit tools", () => {
    it("extracts path from file_path param", () => {
      const paths = extractPaths("Read", { file_path: "/tmp/test.txt" });
      expect(paths).toEqual(["/tmp/test.txt"]);
    });

    it("extracts path from filePath param", () => {
      const paths = extractPaths("write", { filePath: "/tmp/test.txt" });
      expect(paths).toEqual(["/tmp/test.txt"]);
    });

    it("extracts path from path param", () => {
      const paths = extractPaths("Edit", { path: "/tmp/test.txt" });
      expect(paths).toEqual(["/tmp/test.txt"]);
    });

    it("extracts path from file param", () => {
      const paths = extractPaths("read", { file: "/tmp/test.txt" });
      expect(paths).toEqual(["/tmp/test.txt"]);
    });

    it("is case-insensitive on tool name", () => {
      const paths = extractPaths("READ", { file_path: "/tmp/test.txt" });
      expect(paths).toEqual(["/tmp/test.txt"]);
    });

    it("returns empty for unknown params", () => {
      const paths = extractPaths("read", { unknown: "/tmp/test.txt" });
      expect(paths).toEqual([]);
    });

    it("ignores non-string param values", () => {
      const paths = extractPaths("read", { file_path: 42 });
      expect(paths).toEqual([]);
    });
  });

  describe("exec tool", () => {
    it("extracts absolute paths from command", () => {
      const paths = extractPaths("exec", {
        command: "cat /etc/hostname",
      });
      expect(paths.some((p) => p.includes("/etc/hostname"))).toBe(true);
    });

    it("extracts workdir", () => {
      const paths = extractPaths("exec", {
        command: "ls",
        workdir: "/tmp/mydir",
      });
      expect(paths.some((p) => p.includes("/tmp/mydir"))).toBe(true);
    });

    it("returns empty for commands with no paths", () => {
      const paths = extractPaths("exec", { command: "echo hello" });
      expect(paths).toEqual([]);
    });

    it("extracts tilde paths", () => {
      const paths = extractPaths("exec", {
        command: "cat ~/Documents/file.txt",
      });
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]).not.toContain("~");
    });
  });

  describe("git refs not detected as paths (Bug 1)", () => {
    it("ignores upstream/main", () => {
      const paths = extractPaths("exec", { command: "git log upstream/main" });
      expect(paths).toEqual([]);
    });

    it("ignores origin/main", () => {
      const paths = extractPaths("exec", { command: "git diff origin/main" });
      expect(paths).toEqual([]);
    });

    it("ignores HEAD..origin/main range", () => {
      const paths = extractPaths("exec", { command: "git log HEAD..origin/main" });
      expect(paths).toEqual([]);
    });

    it("ignores HEAD~3", () => {
      const paths = extractPaths("exec", { command: "git show HEAD~3" });
      expect(paths).toEqual([]);
    });

    it("ignores refs/heads/main", () => {
      const paths = extractPaths("exec", { command: "git log refs/heads/main" });
      expect(paths).toEqual([]);
    });

    it("still extracts real paths alongside git refs", () => {
      const paths = extractPaths("exec", { command: "git diff origin/main -- /src/file.ts" });
      expect(paths.some((p) => p.includes("/src/file.ts"))).toBe(true);
      expect(paths.every((p) => !p.includes("origin"))).toBe(true);
    });
  });

  describe("content flags not scanned (Bug 3)", () => {
    it("ignores path in --message value", () => {
      const paths = extractPaths("exec", {
        command: 'openclaw message send --message "file at /etc/passwd"',
      });
      expect(paths.every((p) => !p.includes("/etc/passwd"))).toBe(true);
    });

    it("ignores path in --body value", () => {
      const paths = extractPaths("exec", {
        command: 'gh pr create --body "see /var/log/syslog"',
      });
      expect(paths.every((p) => !p.includes("/var/log/syslog"))).toBe(true);
    });

    it("ignores path in -m value", () => {
      const paths = extractPaths("exec", {
        command: 'git commit -m "fix /tmp/issue"',
      });
      expect(paths.every((p) => !p.includes("/tmp/issue"))).toBe(true);
    });

    it("still extracts real paths in same command", () => {
      const paths = extractPaths("exec", {
        command: 'cat /etc/hostname && openclaw message send --message "mentions /etc/passwd"',
      });
      expect(paths.some((p) => p.includes("/etc/hostname"))).toBe(true);
      expect(paths.every((p) => !p.includes("/etc/passwd"))).toBe(true);
    });
  });

  describe("unknown tools", () => {
    it("returns empty for unknown tool names", () => {
      const paths = extractPaths("web_search", { query: "test" });
      expect(paths).toEqual([]);
    });
  });
});
