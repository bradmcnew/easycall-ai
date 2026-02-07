import type { IspPhoneTreeConfig, PhoneTreeNode } from "@/lib/phone-tree-types";

/**
 * Format DTMF-based phone tree nodes into readable text for the AI system prompt.
 * Shows IVR prompts and key presses with target path markers.
 */
function formatDtmfTreeForPrompt(
  nodes: PhoneTreeNode[],
  targetSlug: string,
  indent: number = 0
): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  for (const node of nodes) {
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

    if (node.children && node.children.length > 0) {
      lines.push(`${pad}  Sub-menu:`);
      lines.push(formatDtmfTreeForPrompt(node.children, targetSlug, indent + 2));
    }
  }

  return lines.join("\n");
}

/**
 * Extract the target category path from a speech-based phone tree as a flat numbered list.
 * Only includes nodes along the path to the target category — no branching.
 */
function extractSpeechTargetPath(
  nodes: PhoneTreeNode[],
  targetSlug: string,
  categoryLabel: string
): string[] {
  const steps: string[] = [];

  // First step: always say the category label (overrides root node's hardcoded spokenResponse)
  steps.push(`Say "${categoryLabel.toLowerCase()}"`);

  // Find the target branch in children and collect remaining steps
  function walkTargetPath(children: PhoneTreeNode[] | undefined): void {
    if (!children) return;

    // Find the child node that matches the target category
    const targetChild = children.find((n) =>
      n.categoryMatchSlugs?.includes(targetSlug)
    );

    if (!targetChild) {
      // No direct match — try recursing into each child
      for (const child of children) {
        if (child.children) {
          const before = steps.length;
          walkTargetPath(child.children);
          if (steps.length > before) return; // Found it deeper
        }
      }
      return;
    }

    // Add this node's action
    if (targetChild.action === "speak" && targetChild.spokenResponse) {
      steps.push(`Say "${targetChild.spokenResponse}"`);
    } else if (targetChild.action === "dtmf" && targetChild.keys) {
      steps.push(`Press ${targetChild.keys}`);
    } else if (targetChild.action === "wait" || targetChild.isHoldQueue) {
      steps.push(`Wait silently — you are now in the hold queue`);
      return;
    }

    // Continue down the path
    if (targetChild.children) {
      walkTargetPath(targetChild.children);
    }
  }

  // Start from root node's children
  if (nodes.length > 0 && nodes[0].children) {
    walkTargetPath(nodes[0].children);
  }

  return steps;
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
    const targetSteps = extractSpeechTargetPath(phoneTree.nodes, categorySlug, categoryLabel);
    const numberedSteps = targetSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");

    sections.push(`## What To Say (follow these steps exactly)

Each time the system asks you a question, say the NEXT phrase on this list:

${numberedSteps}

IMPORTANT:
- Say ONLY these exact phrases, one at a time, each time the system asks you something.
- Do NOT add extra words or explanations.
- Do NOT repeat a phrase you already said — move to the NEXT step.
- NEVER repeat the system's words back to it.`);
  } else {
    const treeMap = formatDtmfTreeForPrompt(phoneTree.nodes, categorySlug);
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
