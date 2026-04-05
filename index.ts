import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import path from "node:path";
import { extractPaths } from "./src/path-extract.js";
import { matchesAny } from "./src/glob-match.js";
import { checkOneRead } from "./src/one-read.js";
import type { ResourceBoundaryConfig } from "./src/types.js";

// Default temp directories that should always be allowed for all agents
const DEFAULT_TEMP_PATHS = ["/tmp/**", "/private/tmp/**"];

export default definePluginEntry({
  id: "resource-boundary",
  name: "Resource Boundary",
  description:
    "Enforces per-agent file path boundaries at the tool execution layer",

  register(api) {
    const config = api.pluginConfig as ResourceBoundaryConfig;
    console.log(
      `[resource-boundary] REGISTER called, agents: [${Object.keys(config.agents ?? {}).join(", ")}]`,
    );

    api.on(
      "before_tool_call",
      async (event: any, ctx: any) => {
        const agentId = ctx.agentId;
        if (!agentId) return; // No agent context, skip

        const agentConfig = config.agents?.[agentId];
        if (!agentConfig || agentConfig.mode === "allow") return;

        // Case-insensitive tool name matching
        const toolName = event.toolName;
        const toolLower = toolName.toLowerCase();

        // Skip exempt tools
        if (agentConfig.exemptTools?.some((t) => t.toLowerCase() === toolLower))
          return;

        // Only check blocked tools
        if (
          agentConfig.blockedTools &&
          !agentConfig.blockedTools.some((t) => t.toLowerCase() === toolLower)
        )
          return;

        // Extract paths from tool params
        const paths = extractPaths(toolName, event.params);

        if (paths.length === 0 && toolLower === "exec") {
          console.warn(
            `[resource-boundary] WARN ${agentId} exec no extractable paths: ${String(event.params.command).slice(0, 100)}`,
          );
          return;
        }

        for (const resolvedPath of paths) {
          // 1. Check global always-allow paths (system dirs + default temp)
          if (matchesAny(resolvedPath, [...DEFAULT_TEMP_PATHS, ...(config.alwaysAllowPaths ?? [])])) continue;

          // 2. Check agent's allowed paths (workspace)
          if (matchesAny(resolvedPath, agentConfig.allowedPaths ?? [])) continue;

          // 3. Check one-read paths (external code with limited access)
          if (matchesAny(resolvedPath, agentConfig.oneReadPaths ?? [])) {
            const allowed = checkOneRead(
              agentId,
              resolvedPath,
              agentConfig.oneReadWindow ?? 30,
            );
            if (allowed) {
              console.log(
                `[resource-boundary] ALLOWED ${agentId} ${toolName} ${resolvedPath} (one-read exception)`,
              );
              continue;
            }

            const parentDir = path.dirname(resolvedPath);
            console.warn(
              `[resource-boundary] BLOCKED ${agentId} ${toolName} ${resolvedPath} (second read in ${parentDir})`,
            );
            return {
              block: true,
              blockReason:
                `Second read in ${parentDir} within ${agentConfig.oneReadWindow ?? 30}s window. ` +
                `That's an investigation — delegate instead.\n${agentConfig.blockMessage ?? ""}`,
            };
          }

          // 4. Path not in any scope — block immediately
          console.warn(
            `[resource-boundary] BLOCKED ${agentId} ${toolName} ${resolvedPath} (outside all scopes)`,
          );
          return {
            block: true,
            blockReason: `Path outside your scope: ${resolvedPath}\n${agentConfig.blockMessage ?? ""}`,
          };
        }

        // All paths passed
        return;
      },
      { name: "resource-boundary-gate" },
    );
  },
});
