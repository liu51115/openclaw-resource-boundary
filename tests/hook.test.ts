import { describe, it, expect, beforeEach } from "vitest";
import { extractPaths } from "../src/path-extract.js";
import { matchesAny } from "../src/glob-match.js";
import { checkOneRead, resetReadHistory } from "../src/one-read.js";
import type { AgentBoundaryConfig, ResourceBoundaryConfig } from "../src/types.js";
import path from "node:path";

// Must match DEFAULT_TEMP_PATHS in index.ts
const DEFAULT_TEMP_PATHS = ["/tmp/**", "/private/tmp/**"];

// Simulate the hook logic from index.ts without the OC plugin SDK dependency
function simulateHook(
  config: ResourceBoundaryConfig,
  event: { toolName: string; params: Record<string, unknown> },
  ctx: { agentId?: string },
): { block: true; blockReason: string } | undefined {
  const agentId = ctx.agentId;
  if (!agentId) return undefined;

  const agentConfig = config.agents?.[agentId];
  if (!agentConfig || agentConfig.mode === "allow") return undefined;

  const toolName = event.toolName;
  const toolLower = toolName.toLowerCase();

  if (agentConfig.exemptTools?.some((t) => t.toLowerCase() === toolLower))
    return undefined;

  if (
    agentConfig.blockedTools &&
    !agentConfig.blockedTools.some((t) => t.toLowerCase() === toolLower)
  )
    return undefined;

  const paths = extractPaths(toolName, event.params);

  if (paths.length === 0 && toolLower === "exec") {
    return undefined; // warn + allow
  }

  for (const resolvedPath of paths) {
    if (matchesAny(resolvedPath, [...DEFAULT_TEMP_PATHS, ...(config.alwaysAllowPaths ?? [])])) continue;
    if (matchesAny(resolvedPath, agentConfig.allowedPaths ?? [])) continue;

    if (matchesAny(resolvedPath, agentConfig.oneReadPaths ?? [])) {
      const allowed = checkOneRead(
        agentId,
        resolvedPath,
        agentConfig.oneReadWindow ?? 30,
      );
      if (allowed) continue;

      const parentDir = path.dirname(resolvedPath);
      return {
        block: true,
        blockReason:
          `Second read in ${parentDir} within ${agentConfig.oneReadWindow ?? 30}s window. ` +
          `That's an investigation — delegate instead.\n${agentConfig.blockMessage ?? ""}`,
      };
    }

    return {
      block: true,
      blockReason: `Path outside your scope: ${resolvedPath}\n${agentConfig.blockMessage ?? ""}`,
    };
  }

  return undefined;
}

const testConfig: ResourceBoundaryConfig = {
  defaultMode: "allow",
  alwaysAllowPaths: ["/etc/**", "/usr/**", "/bin/**", "/tmp/**"],
  agents: {
    brunelleschi: {
      mode: "deny-external",
      allowedPaths: ["/Users/me/.openclaw/workspace-brunelleschi/**"],
      oneReadPaths: ["/opt/homebrew/lib/node_modules/openclaw/**"],
      oneReadWindow: 30,
      blockedTools: ["read", "write", "edit", "exec"],
      exemptTools: ["web_search", "web_fetch"],
      blockMessage: "Delegate to Claude Code via sessions_spawn.",
    },
  },
};

describe("hook integration", () => {
  beforeEach(() => {
    resetReadHistory();
  });

  it("T1: allows reading own workspace file", () => {
    const result = simulateHook(
      testConfig,
      {
        toolName: "Read",
        params: {
          file_path:
            "/Users/me/.openclaw/workspace-brunelleschi/BRAIN.md",
        },
      },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T2: blocks reading random external file", () => {
    const result = simulateHook(
      testConfig,
      {
        toolName: "read",
        params: { file_path: "/some/random/external/file.txt" },
      },
      { agentId: "brunelleschi" },
    );
    expect(result?.block).toBe(true);
    expect(result?.blockReason).toContain("outside your scope");
  });

  it("T3: allows first one-read in external scope", () => {
    const result = simulateHook(
      testConfig,
      {
        toolName: "Read",
        params: {
          file_path:
            "/opt/homebrew/lib/node_modules/openclaw/dist/foo.js",
        },
      },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T4: blocks second read in same external dir", () => {
    simulateHook(
      testConfig,
      {
        toolName: "Read",
        params: {
          file_path:
            "/opt/homebrew/lib/node_modules/openclaw/dist/foo.js",
        },
      },
      { agentId: "brunelleschi" },
    );

    const result = simulateHook(
      testConfig,
      {
        toolName: "Read",
        params: {
          file_path:
            "/opt/homebrew/lib/node_modules/openclaw/dist/bar.js",
        },
      },
      { agentId: "brunelleschi" },
    );
    expect(result?.block).toBe(true);
    expect(result?.blockReason).toContain("Second read");
  });

  it("T5: allows read in different external dir", () => {
    simulateHook(
      testConfig,
      {
        toolName: "Read",
        params: {
          file_path:
            "/opt/homebrew/lib/node_modules/openclaw/dist/foo.js",
        },
      },
      { agentId: "brunelleschi" },
    );

    const result = simulateHook(
      testConfig,
      {
        toolName: "Read",
        params: {
          file_path:
            "/opt/homebrew/lib/node_modules/openclaw/src/baz.ts",
        },
      },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T6: allows exec in always-allow system path", () => {
    const result = simulateHook(
      testConfig,
      { toolName: "exec", params: { command: "cat /etc/hostname" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T7: allows exempt tools", () => {
    const result = simulateHook(
      testConfig,
      { toolName: "web_search", params: { query: "test" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T8: allows exec with no extractable paths (warn)", () => {
    const result = simulateHook(
      testConfig,
      { toolName: "exec", params: { command: "echo hello" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("skips agents not in config", () => {
    const result = simulateHook(
      testConfig,
      {
        toolName: "read",
        params: { file_path: "/some/random/path" },
      },
      { agentId: "unknown-agent" },
    );
    expect(result).toBeUndefined();
  });

  it("skips when no agentId", () => {
    const result = simulateHook(
      testConfig,
      {
        toolName: "read",
        params: { file_path: "/some/random/path" },
      },
      {},
    );
    expect(result).toBeUndefined();
  });

  it("case-insensitive exempt tool check", () => {
    const result = simulateHook(
      testConfig,
      { toolName: "Web_Search", params: { query: "test" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T9: allows /tmp even when not in alwaysAllowPaths config (Bug 2)", () => {
    const configNoTmp: ResourceBoundaryConfig = {
      defaultMode: "allow",
      alwaysAllowPaths: ["/etc/**", "/usr/**", "/bin/**"], // no /tmp/**
      agents: {
        brunelleschi: {
          mode: "deny-external",
          allowedPaths: ["/Users/me/.openclaw/workspace-brunelleschi/**"],
          blockedTools: ["read", "write", "edit", "exec"],
        },
      },
    };
    const result = simulateHook(
      configNoTmp,
      { toolName: "Read", params: { file_path: "/tmp/scratch/notes.txt" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("T10: allows /private/tmp even when not in config (Bug 2)", () => {
    const configNoTmp: ResourceBoundaryConfig = {
      defaultMode: "allow",
      alwaysAllowPaths: [],
      agents: {
        brunelleschi: {
          mode: "deny-external",
          allowedPaths: [],
          blockedTools: ["read"],
        },
      },
    };
    const result = simulateHook(
      configNoTmp,
      { toolName: "Read", params: { file_path: "/private/tmp/foo.json" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });

  it("allows tools not in blockedTools list", () => {
    const result = simulateHook(
      testConfig,
      { toolName: "memory_search", params: { query: "test" } },
      { agentId: "brunelleschi" },
    );
    expect(result).toBeUndefined();
  });
});
