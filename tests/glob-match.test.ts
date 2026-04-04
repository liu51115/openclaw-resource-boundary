import { describe, it, expect } from "vitest";
import { matchesAny } from "../src/glob-match.js";

describe("matchesAny", () => {
  it("matches exact path in glob pattern", () => {
    expect(matchesAny("/etc/hostname", ["/etc/**"])).toBe(true);
  });

  it("matches nested path in glob pattern", () => {
    expect(
      matchesAny("/Users/me/.openclaw/workspace/file.ts", [
        "/Users/me/.openclaw/workspace/**",
      ]),
    ).toBe(true);
  });

  it("does not match path outside patterns", () => {
    expect(matchesAny("/some/random/path", ["/etc/**", "/usr/**"])).toBe(false);
  });

  it("matches against multiple patterns", () => {
    expect(matchesAny("/usr/bin/node", ["/etc/**", "/usr/**"])).toBe(true);
  });

  it("returns false for empty patterns array", () => {
    expect(matchesAny("/etc/hostname", [])).toBe(false);
  });

  it("matches /tmp paths", () => {
    expect(matchesAny("/tmp/somefile", ["/tmp/**"])).toBe(true);
  });

  it("does not match partial prefix without glob", () => {
    expect(matchesAny("/etcetera/file", ["/etc/**"])).toBe(false);
  });

  it("matches dotfiles within glob patterns", () => {
    expect(
      matchesAny("/Users/me/.openclaw/workspace/.env", [
        "/Users/me/.openclaw/workspace/**",
      ]),
    ).toBe(true);
  });

  it("matches nested dotfile directories", () => {
    expect(
      matchesAny("/Users/me/.openclaw/workspace/.git/config", [
        "/Users/me/.openclaw/workspace/**",
      ]),
    ).toBe(true);
  });
});
