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

  describe("unknown tools", () => {
    it("returns empty for unknown tool names", () => {
      const paths = extractPaths("web_search", { query: "test" });
      expect(paths).toEqual([]);
    });
  });
});
