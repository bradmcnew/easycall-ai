import type { IspPhoneTreeConfig, PhoneTreeNode } from "@/lib/phone-tree-types";

/**
 * Recursively format phone tree nodes into readable text for the AI system prompt.
 * Marks target paths and hold queues for the specified category.
 *
 * For DTMF trees: shows IVR prompts and key presses.
 * For speech trees: only shows what to SAY (omits IVR text to prevent AI from speaking it).
 */
function formatTreeForPrompt(
  nodes: PhoneTreeNode[],
  targetSlug: string,
  indent: number = 0,
  isSpeechBased: boolean = false
): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  for (const node of nodes) {
    if (isSpeechBased) {
      // Speech-based: only show actions, never show IVR prompt text
      if (node.action === "speak" && node.spokenResponse) {
        const isTarget = node.categoryMatchSlugs?.includes(targetSlug);
        lines.push(`${pad}- Say "${node.spokenResponse}"${isTarget ? " ← TARGET" : ""}`);
      } else if (node.action === "dtmf" && node.keys) {
        lines.push(`${pad}- Press ${node.keys}`);
      } else if (node.action === "wait" || node.isHoldQueue) {
        lines.push(`${pad}- Wait silently (hold queue reached)`);
      }
    } else {
      // DTMF-based: show IVR prompts so AI can match menus
      lines.push(`${pad}- HEAR: "${node.prompt}"`);

      if (node.action === "dtmf" && node.keys) {
        lines.push(`${pad}  DO: Press ${node.keys}`);
      } else if (node.action === "speak" && node.spokenResponse) {
        lines.push(`${pad}  DO: Say "${node.spokenResponse}"`);
      } else if (node.action === "wait") {
        lines.push(`${pad}  DO: Wait silently (do not press anything or speak)`);
      } else if (node.action === "skip") {
        lines.push(`${pad}  DO: Ignore this prompt`);
      }

      if (node.categoryMatchSlugs?.includes(targetSlug)) {
        lines.push(`${pad}  >>> TARGET PATH`);
      }

      if (node.isHoldQueue) {
        lines.push(`${pad}  >>> HOLD QUEUE - YOU ARE HERE, WAIT SILENTLY`);
      }
    }

    // Recurse into children
    if (node.children && node.children.length > 0) {
      if (!isSpeechBased) {
        lines.push(`${pad}  Sub-menu:`);
      }
      lines.push(formatTreeForPrompt(node.children, targetSlug, indent + (isSpeechBased ? 1 : 2), isSpeechBased));
    }
  }

  return lines.join("\n");
}

/**
 * Build an ISP-specific navigation system prompt from phone tree data.
 *
 * The prompt instructs the AI assistant to navigate the ISP's phone tree
 * to reach the target department queue, then wait for a live human agent.
 */
export function buildNavigationPrompt(
  ispName: string,
  categoryLabel: string,
  categorySlug: string,
  phoneTree: IspPhoneTreeConfig
): string {
  // Detect if the tree uses speech-based navigation
  const hasSpeechNodes = phoneTree.nodes.some(
    (n) => n.action === "speak" || n.children?.some((c) => c.action === "speak")
  );

  const treeMap = formatTreeForPrompt(phoneTree.nodes, categorySlug, 0, hasSpeechNodes);

  const holdPatterns = phoneTree.holdInterruptionPatterns?.length
    ? phoneTree.holdInterruptionPatterns
        .map((p) => `  - "${p}"`)
        .join("\n")
    : '  - "Your call is important to us"\n  - "Please continue to hold"';

  const sections: string[] = [];

  // 1. Mission statement
  sections.push(
    `You are an AI assistant calling ${ispName} customer support. Navigate the phone tree to reach the ${categoryLabel} department queue, then wait on hold for a live human agent.`
  );

  // 2. What to say / Phone tree map
  if (hasSpeechNodes) {
    sections.push(`## What To Say (in order)

When the system asks you a question, follow these steps in order:
${treeMap}

IMPORTANT: Do NOT say anything other than what is listed above. Wait for the system to ask you a question first, then say ONLY the phrase listed. Never repeat the system's questions back.`);
  } else {
    sections.push(`## Phone Tree Map

${treeMap}`);
  }

  // 3. Navigation rules (adapted for speech vs DTMF IVRs)
  if (hasSpeechNodes) {
    sections.push(`## Navigation Rules

1. WAIT for the system to finish speaking before you respond.
2. When the system asks what you need, say ONLY the phrase from "What To Say" above. Do not add extra words.
3. If the system asks for more details, say the next phrase from the list.
4. If the system asks a yes/no confirmation ("Is that correct?"), say "yes".
5. If the system does not understand, rephrase with a single word (e.g., "billing").
6. If you get stuck after 2 attempts, say "representative" or press 0.
7. If asked for an account number, say "I don't have my account number available."
8. Do NOT provide any personal information.
9. NEVER repeat back what the system says to you. Only say YOUR responses.`);
  } else {
    sections.push(`## Navigation Rules

1. LISTEN to each menu prompt fully before pressing any keys.
2. When you recognize a menu from the tree map, use the DTMF tool with the specified keys.
3. PREFER pressing keys (DTMF) over speaking -- it is more reliable.
4. Insert pauses: use "w" (0.5s) between digits (e.g., "w1w2").
5. If the menu does not match the tree map, LISTEN carefully and navigate dynamically -- choose the option most likely to reach ${categoryLabel}.
6. If unsure, press 0 to try reaching an operator.
7. If you hear "press star to repeat", press * and listen again.
8. If asked for an account number, say "I don't have my account number available."
9. Do NOT provide any personal information.`);
  }

  // 4. Stuck recovery
  sections.push(`## Stuck Recovery

If you get stuck or a menu is unfamiliar:
- Tier 1: Press * to repeat the current menu, listen again.
- Tier 2: Press 0 to try reaching a general operator.
- Tier 3: Call navigation_status with status "stuck", then continue trying.`);

  // 5. Hold behavior
  sections.push(`## Hold Behavior

Once in the hold queue, WAIT SILENTLY.
- Do NOT speak during hold music or "please continue to hold" messages.
- Automated interruptions are noise -- ignore them completely.
- Known hold interruption patterns to IGNORE:
${holdPatterns}`);

  // 6. Human detection
  sections.push(`## Human Detection

When a LIVE HUMAN AGENT answers (not a recording), call the human_detected tool.
- Listen for: personal introduction ("Hi, my name is..."), direct questions to the caller, conversational tone.
- Do NOT mistake hold interruptions for a human.
- Do NOT proactively say "Hello?" -- wait for them to speak first.
- Be CONSERVATIVE -- a missed detection just means waiting a bit longer; a false positive wastes the user's time.`);

  // 7. Status reporting
  sections.push(`## Status Reporting

Call navigation_status when entering a new menu level or reaching the hold queue.
- "navigating" -- actively in a menu
- "reached_queue" -- found the target department queue
- "on_hold" -- waiting for an agent in the queue
- "stuck" -- unable to navigate the current menu`);

  // ISP-specific navigation notes
  if (phoneTree.navigationNotes) {
    sections.push(`## ISP-Specific Notes

${phoneTree.navigationNotes}`);
  }

  return sections.join("\n\n");
}
