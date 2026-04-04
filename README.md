# resource-boundary

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that enforces per-agent file path boundaries at the tool execution layer.

## The Problem

AI agents with file system access tend to investigate. Ask one to fix a bug and it'll spend 15 turns reading source code, tracing imports, and exploring directories — burning tokens and time on work that should be delegated to a coding agent.

System prompt rules ("don't read files outside your workspace") are suggestions. Agents rationalize around them. This plugin makes the boundary structural: a `before_tool_call` hook that blocks file operations outside configured scopes before they execute.

## How It Works

```
Agent calls read("/opt/homebrew/lib/node_modules/openclaw/dist/some-file.js")
  ↓
Plugin intercepts via before_tool_call hook
  ↓
Path doesn't match allowedPaths or alwaysAllowPaths
  ↓
Tool call blocked — agent gets: "Path outside your scope. Delegate to Claude Code."
  ↓
Agent spawns a coding subagent instead of investigating itself
```

**This is not a security tool.** It's a behavioral constraint. Agents can still spawn subagents that run without restrictions. The goal is forcing delegation, not preventing access.

## Features

- **Per-agent configuration** — each agent gets its own scope; unconfigured agents are unrestricted
- **Glob patterns** via [picomatch](https://github.com/micromatch/picomatch) — `**`, `*`, `?`, braces, negation
- **One-read exception** — configurable "peek" allowance for external paths (one read per directory within a time window, then blocked)
- **Path resolution** — handles symlinks (`/opt/homebrew/bin/python3` → `/opt/homebrew/Cellar/...`), `~` expansion, relative paths
- **Exec command parsing** — best-effort path extraction from shell commands
- **Case-insensitive tool matching** — works regardless of tool name casing
- **Dotfile support** — `.env`, `.git/`, `.openclaw/` all matched correctly
- **Fail-open** — if the plugin errors, the tool call proceeds (gateway stays up)

## Installation

```bash
# From local directory
openclaw plugins install /path/to/resource-boundary

# Restart to load
openclaw gateway restart
```

## Configuration

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "resource-boundary": {
        "enabled": true,
        "config": {
          "defaultMode": "allow",
          "alwaysAllowPaths": [
            "/etc/**",
            "/usr/**",
            "/bin/**",
            "/tmp/**",
            "/var/**",
            "/opt/homebrew/**"
          ],
          "agents": {
            "my-architect-agent": {
              "mode": "deny-external",
              "allowedPaths": [
                "/home/user/.openclaw/**"
              ],
              "oneReadPaths": [
                "/home/user/projects/**",
                "/opt/homebrew/lib/node_modules/**"
              ],
              "oneReadWindow": 30,
              "blockedTools": ["read", "write", "edit", "exec"],
              "exemptTools": ["web_search", "web_fetch", "memory_search"],
              "blockMessage": "Delegate to Claude Code via sessions_spawn(runtime: \"acp\", agentId: \"claude\")."
            }
          }
        }
      }
    }
  }
}
```

### Config Reference

#### Global

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultMode` | `"allow" \| "deny-external"` | `"allow"` | Default for agents not listed in `agents` |
| `alwaysAllowPaths` | `string[]` | `[]` | Glob patterns always permitted (system dirs, package managers) |
| `agents` | `object` | `{}` | Per-agent boundary configuration |

#### Per-Agent

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `"allow" \| "deny-external"` | — | `allow` = no restrictions; `deny-external` = enforce boundaries |
| `allowedPaths` | `string[]` | `[]` | Full access — agent's workspace, config dirs |
| `oneReadPaths` | `string[]` | `[]` | Limited access — one read per directory per window |
| `oneReadWindow` | `number` | `30` | Seconds before the one-read counter resets |
| `blockedTools` | `string[]` | all | Tools to enforce boundaries on |
| `exemptTools` | `string[]` | `[]` | Tools that always pass through |
| `blockMessage` | `string` | `""` | Custom message appended to block reason |

### Evaluation Order

For each file path in a tool call:

1. **`alwaysAllowPaths`** — system directories, package managers → ✅ allow
2. **`allowedPaths`** — agent's workspace → ✅ allow
3. **`oneReadPaths`** — external code, first read per directory → ✅ allow (once)
4. **Everything else** → ❌ block

## One-Read Exception

The one-read exception lets an agent peek at external files without committing to a full investigation. It tracks reads per **parent directory** — so reading two files in the same directory counts as investigation and triggers a block.

```
read("/opt/code/project/src/index.ts")    → ✅ allowed (first in /opt/code/project/src/)
read("/opt/code/project/src/utils.ts")    → ❌ blocked (second in same directory)
read("/opt/code/project/test/test.ts")    → ✅ allowed (first in /opt/code/project/test/)
```

After `oneReadWindow` seconds, the counter resets and the agent can read again.

## Exec Command Handling

For `exec` tool calls, the plugin does best-effort path extraction from the command string:

- **Absolute paths**: `/foo/bar/baz` → extracted and checked
- **Tilde paths**: `~/foo/bar` → expanded and checked
- **Relative paths**: `./src/file.ts` → resolved against cwd and checked
- **No extractable paths**: allowed with a warning logged

The plugin doesn't try to fully parse shell commands. Complex pipes or subshells may not have all paths extracted — this is intentional (fail-open).

## Agent Isolation

Agents not listed in the `agents` config default to `defaultMode` (usually `"allow"`). This means:

- **Subagents** spawned via `sessions_spawn` run under their own `agentId` and aren't restricted
- **Claude Code ACP** sessions run as a different agent — unrestricted
- Only the configured agent is constrained

This is the key design: the architect agent is bounded, but its workers are free.

## Requirements

- OpenClaw 3.28+
- Node.js 20+
- `picomatch` v4+ (bundled)

## Development

```bash
cd resource-boundary
npm install
npm test          # run tests once
npm run test:watch  # watch mode
```

## License

MIT
