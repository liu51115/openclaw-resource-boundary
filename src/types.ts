export interface AgentBoundaryConfig {
  mode: "allow" | "deny-external";
  allowedPaths?: string[];
  oneReadPaths?: string[];
  oneReadWindow?: number;
  blockedTools?: string[];
  exemptTools?: string[];
  blockMessage?: string;
}

export interface ResourceBoundaryConfig {
  defaultMode: "allow" | "deny-external";
  alwaysAllowPaths?: string[];
  agents?: Record<string, AgentBoundaryConfig>;
}
