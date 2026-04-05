import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Git ref patterns that look like paths but aren't
const GIT_REF_PREFIXES = [
  "upstream/", "origin/", "remotes/", "refs/", "HEAD",
  "feature/", "bugfix/", "hotfix/", "release/",
];
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

// Interpreters whose -c/-e argument is code, not a file path
const INTERPRETER_CODE_FLAGS: Record<string, Set<string>> = {
  python3: new Set(["-c"]),
  python: new Set(["-c"]),
  python2: new Set(["-c"]),
  node: new Set(["-e", "--eval"]),
  ruby: new Set(["-e"]),
  perl: new Set(["-e"]),
  bash: new Set(["-c"]),
  sh: new Set(["-c"]),
  zsh: new Set(["-c"]),
};

/**
 * Strip interpreter code arguments from command before path extraction.
 * E.g. `python3 -c "import json; open('/foo')"` → `python3 -c ""`
 * This prevents false positives from paths inside code strings.
 */
function stripInterpreterCode(cmd: string): string {
  // Match the interpreter binary (possibly with full path) + code flag + quoted argument
  // Handles multiline quoted strings and both single/double quotes
  return cmd.replace(
    /(?:^|\s)(?:[\w.\-\/]*\/)?(\w+)\s+(-[ce]|--eval)\s+("(?:[^"\\]|\\.|\n)*"|'(?:[^'\\]|\\.|\n)*')/g,
    (fullMatch, binary, flag, _quotedCode) => {
      const binLower = binary.toLowerCase();
      const flags = INTERPRETER_CODE_FLAGS[binLower];
      if (flags && flags.has(flag)) {
        // Replace the code content with empty quotes, preserving the structure
        const quoteChar = _quotedCode[0];
        return fullMatch.replace(_quotedCode, `${quoteChar}${quoteChar}`);
      }
      return fullMatch;
    },
  );
}

function extractPathsFromCommand(cmd: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;

  // Strip interpreter code arguments first to avoid false positives
  const stripped = stripInterpreterCode(cmd);

  // Split into tokens to handle content-flag skipping
  const tokens = stripped.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
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
