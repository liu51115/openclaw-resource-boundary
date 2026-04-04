import path from "node:path";
import fs from "node:fs";
import os from "node:os";

function extractPathsFromCommand(cmd: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;

  // Match absolute paths: /foo/bar/baz
  const absPathRegex = /(?:^|\s)(\/[\w.\-\/]+)/g;
  while ((match = absPathRegex.exec(cmd)) !== null) {
    paths.push(match[1]);
  }

  // Match ~ paths: ~/foo/bar
  const tildeRegex = /(?:^|\s)(~\/[\w.\-\/]+)/g;
  while ((match = tildeRegex.exec(cmd)) !== null) {
    paths.push(match[1].replace("~", os.homedir()));
  }

  // Match relative paths with directory separators (heuristic)
  // Skip: flags like --foo, bare words, URLs
  const relPathRegex = /(?:^|\s)((?:\.\.\/?|\.\/)?[\w.\-]+\/[\w.\-\/]+)/g;
  while ((match = relPathRegex.exec(cmd)) !== null) {
    if (!match[1].startsWith("http") && !match[1].startsWith("--")) {
      paths.push(path.resolve(match[1]));
    }
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
