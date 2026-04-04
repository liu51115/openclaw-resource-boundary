import path from "node:path";

// In-memory tracker, keyed by agentId
const readHistory = new Map<string, { dir: string; timestamp: number }[]>();

export function checkOneRead(
  agentId: string,
  resolvedPath: string,
  windowSeconds: number,
): boolean {
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;

  // Clean expired entries
  const history = (readHistory.get(agentId) ?? []).filter(
    (e) => e.timestamp > cutoff,
  );

  // Group by parent directory — two reads in same directory = investigation
  const parentDir = path.dirname(resolvedPath);
  const alreadyRead = history.some((e) => e.dir === parentDir);

  if (alreadyRead) {
    return false; // BLOCK — second read in same directory
  }

  // Record this read and allow
  history.push({ dir: parentDir, timestamp: now });
  readHistory.set(agentId, history);
  return true; // ALLOW — first read in this directory
}

/** Reset all tracking state (for testing) */
export function resetReadHistory(): void {
  readHistory.clear();
}
