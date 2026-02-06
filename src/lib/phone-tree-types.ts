/** A single node in an ISP phone tree */
export interface PhoneTreeNode {
  /** Unique identifier within the tree */
  id: string;
  /** What the IVR says at this menu level (for AI matching) */
  prompt: string;
  /** How to respond to this menu */
  action: "dtmf" | "speak" | "wait" | "skip";
  /** DTMF keys to press (with pause chars). e.g., "w1", "w2w1" */
  keys?: string;
  /** What to say if action is "speak" */
  spokenResponse?: string;
  /** Expected delay in ms before this menu plays */
  expectedDelayMs?: number;
  /** Sub-menu nodes (what happens after pressing/speaking) */
  children?: PhoneTreeNode[];
  /** Which issue categories this path serves (e.g., ["billing", "general"]) */
  categoryMatchSlugs?: string[];
  /** If true, this node means we've reached the target hold queue */
  isHoldQueue?: boolean;
  /** Notes for admin about this node */
  adminNotes?: string;
}

/** Per-ISP phone tree configuration */
export interface IspPhoneTreeConfig {
  /** Root-level menu nodes */
  nodes: PhoneTreeNode[];
  /** Known hold interruption patterns to ignore */
  holdInterruptionPatterns?: string[];
  /** ISP-specific navigation notes for the AI */
  navigationNotes?: string;
  /** Preferred DTMF pause character timing ("w"=0.5s default, "W"=1s) */
  dtmfPauseChar?: "w" | "W";
}
