import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Git ref patterns that look like paths but aren't
const GIT_REF_PREFIXES = ["upstream/", "origin/", "remotes/", "refs/", "HEAD"];
const GIT_RANGE_RE = /\.\.\./; // ref1..ref2 or ref1...ref2

// Flags whose values are content, not file paths
const CONTENT_FLAGS = new Set([
  "--message", "-m", "--text", "--body", "--subject",
  "--description", "--title", "--label", "--name",
]);

function isGitRef(token: string): boolean {
  if (GIT_RANGE_RE.test(token)) return true;
  if (token === "HEAD" || token.startsWith("HEAD~") || token.startsWith("HEAD^")) return true;
  for (const prefix of GIT_REF_PREFIXES) {
    if (token.startsWith(prefix)) return true;
  }
  return false;
}

function extractPathsFromCommand(cmd: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;

  // Split into tokens to handle content-flag skipping
  const tokens = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const skipIndices = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const bare = tokens[i].replace(/^["']|["']$/g, "");
    if (CONTENT_FLAGS.has(bare) && i + 1 < tokens.length) {
      skipIndices.add(i + 1);
    }
  }

  // Rebuild command without content-flag values for path extraction
  const filtered = tokens.filter((_, i) => !skipIndices.has(i)).join(" ");

  // Match absolute paths: /foo/bar/baz
  const absPathRegex = /(?:^|\s)(\/[\w.\-\/]+)/g;
  while ((match = absPathRegex.exec(filtered)) !== null) {
    paths.push(match[1]);
  }

  // Match ~ paths: ~/foo/bar
  const tildeRegex = /(?:^|\s)(~\/[\w.\-\/]+)/g;
  while ((match = tildeRegex.exec(filtered)) !== null) {
    paths.push(match[1].replace("~", os.homedir()));
  }

  // Match relative paths with directory separators (heuristic)
  // Skip: flags like --foo, bare words, URLs, git refs
  const relPathRegex = /(?:^|\s)((?:\.\.\/?|\.\/)?[\w.\-]+\/[\w.\-\/]+)/g;
  while ((match = relPathRegex.exec(filtered)) !== null) {
    const candidate = match[1];
    if (candidate.startsWith("http") || candidate.startsWith("--")) continue;
    if (isGitRef(candidate)) continue;
    paths.push(path.resolve(candidate));
  }

  return paths;
}

export function extractPaths(
  toolName: string,
  params: Record<string, unknown>,
): string[] {
  const paths: string[] = [];
  const lower = toolName.toLowerCase();

  // read, write, edit all accept the same path param variants
  if (["read", "write", "edit"].includes(lower)) {
    for (const key of ["path", "filePath", "file_path", "file"]) {
      if (typeof params[key] === "string") paths.push(params[key] as string);
    }
  }

  if (lower === "exec") {
    // Best-effort: extract paths from command string
    if (typeof params.command === "string") {
      paths.push(...extractPathsFromCommand(params.command));
    }
    // Also check workdir
    if (typeof params.workdir === "string") paths.push(params.workdir as string);
  }

  // Resolve all paths to absolute, handle symlinks
  return paths.map((p) => {
    const resolved = path.resolve(p);
    try {
      return fs.realpathSync(resolved);
    } catch {
      // Broken symlink or non-existent path — use resolved literal
      return resolved;
    }
  });
}

export { extractPathsFromCommand };
