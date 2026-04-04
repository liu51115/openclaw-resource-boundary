import picomatch from "picomatch";

export function matchesAny(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => picomatch(pattern, { dot: true })(filePath));
}
