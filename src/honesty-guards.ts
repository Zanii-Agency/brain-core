// Honesty guard primitives — factory functions that build pure (reply,
// toolRuns) → boolean classifiers from per-Adapter config. The library holds
// the SHAPE; the Adapter brings the regex catalog and tool-category maps.
//
// Why factories: each guard is conceptually universal ("a claim of done
// without a backing tool" applies to every assistant), but the regex
// constants and tool-category maps are 100% tenant policy — Sasa's
// COMPLETION_TOOLS are different from CTH's, and Sasa's incident-tuned
// SHAPE_MONEY does not necessarily apply to Jensen's hospitality invoices.
//
// Per KT #238: don't pretend these are universal until N tenants have
// converged on the SAME guard shape. For now, the library provides
// machinery + a contract; each Adapter wires its own constants.

export interface ToolRun {
  name: string;
  result: any;
}

export interface CompletionShape {
  /** Human-readable name for debugging (e.g. "money", "task", "case"). */
  name: string;
  /** Regex that detects this shape in the reply. */
  regex: RegExp;
  /** Tool names whose ok=true backing satisfies this shape. */
  requiredTools: ReadonlySet<string>;
  /** Tool names whose successful READ (no ok field, no error) also satisfies this shape. */
  readTools?: ReadonlySet<string>;
  /** True when a successful "parsed-task" write also satisfies this shape (workaround for cross-category title text). */
  parseTasksExempt?: boolean;
}

export interface CompletionGuardConfig {
  /** Detects an explicit agent claim of completion ("I logged", "I marked X done"). */
  agentCompletion: RegExp;
  /** Detects a shorthand "it's done" / "that's complete" with implicit agent prefix. */
  doneSimple: RegExp;
  /** Detects future/conditional phrasings that are NOT completion claims. */
  futureClaim: RegExp;
  /** Detects "you complete X" addresser-flipped phrasings that are NOT agent claims. */
  aboutUserComplete: RegExp;
  /** Detects "I did X" agent-self phrasings (used to disambiguate aboutUser overlaps). */
  agentSelfMark: RegExp;
  /** All tool names whose ok=true could back a generic done-claim. */
  completionTools: ReadonlySet<string>;
  /** Per-category shape detectors and their backing tool requirements. */
  shapes: ReadonlyArray<CompletionShape>;
  /** Optional predicate: returns true if a parsed-task write succeeded this turn. */
  parseTasksSucceeded?: (toolRuns: ReadonlyArray<ToolRun>) => boolean;
  /** Tool names whose successful read makes ANY shape exempt (e.g. list_tasks narration). */
  globalReadExemptTools?: ReadonlySet<string>;
}

const ranSuccessfully = (toolRuns: ReadonlyArray<ToolRun>, names: ReadonlySet<string>): boolean =>
  toolRuns.some((t) => {
    if (!names.has(t.name)) return false;
    const r = t.result as any;
    if (r == null) return false;
    if (r.ok === false) return false;
    if (r.error) return false;
    return true;
  });

const okIn = (toolRuns: ReadonlyArray<ToolRun>, names: ReadonlySet<string>): boolean =>
  toolRuns.some((t) => names.has(t.name) && (t.result as any)?.ok === true);

/**
 * Build a (reply, toolRuns) → boolean guard from a per-tenant config.
 * Returns true when the reply asserts a completed action but no
 * category-matched completion-class tool returned ok=true this turn.
 */
export function makeCompletionGuard(config: CompletionGuardConfig) {
  return function claimsCompletionWithoutSuccess(reply: string, toolRuns: ReadonlyArray<ToolRun>): boolean {
    const claimsDone = config.agentCompletion.test(reply) || config.doneSimple.test(reply);
    if (!claimsDone) return false;
    if (config.futureClaim.test(reply)) return false;
    const aboutUser = config.aboutUserComplete.test(reply);
    if (aboutUser && !config.agentSelfMark.test(reply)) return false;

    const parseTasksDidIt = config.parseTasksSucceeded ? config.parseTasksSucceeded(toolRuns) : false;
    const globalReadExempt = config.globalReadExemptTools
      ? ranSuccessfully(toolRuns, config.globalReadExemptTools)
      : false;

    // Per-shape checks: if a shape matches, the backing tool must satisfy it.
    // NOTE: globalReadExempt is intentionally NOT checked per-shape — Sasa's
    // money-shape policy explicitly fires even when list_tasks ran (because a
    // money claim with no record_payment is wrong regardless of what else ran).
    // globalReadExempt only saves the generic catch-all from narration false
    // positives like "I've noted your open tasks: 1. Mark's case" where the
    // case-shape word came from list_tasks narration, not a real action claim.
    for (const shape of config.shapes) {
      if (!shape.regex.test(reply)) continue;
      if (okIn(toolRuns, shape.requiredTools)) continue;
      if (shape.readTools && ranSuccessfully(toolRuns, shape.readTools)) continue;
      if (shape.parseTasksExempt && parseTasksDidIt) continue;
      return true; // matched a shape but nothing backs it
    }

    // Generic catch-all: any completion-class tool's success backs a generic claim.
    if (okIn(toolRuns, config.completionTools)) return false;
    if (globalReadExempt) return false;
    return true;
  };
}

export interface SendGuardConfig {
  /** All "sent / told / notified / they have it" phrasings. */
  sendClaim: RegExp;
  /** Future/honest phrasings that are NOT claims of having sent. */
  futureOrHonest: RegExp;
  /** Tool names whose ok=true legitimately backs a "sent" claim. */
  sendTools: ReadonlySet<string>;
}

/**
 * Build a (reply, toolRuns) → boolean guard for "claimed to have sent a
 * message but no send-class tool succeeded." Mirrors makeCompletionGuard's
 * shape but simpler: there's only one category (send).
 */
export function makeSendGuard(config: SendGuardConfig) {
  return function claimsSendWithoutSend(reply: string, toolRuns: ReadonlyArray<ToolRun>): boolean {
    if (!config.sendClaim.test(reply)) return false;
    if (config.futureOrHonest.test(reply)) return false;
    return !okIn(toolRuns, config.sendTools);
  };
}

export interface StagingGuardConfig {
  /** "Ready to log / I'll stage / I have it staged / waiting for your yes" phrasings. */
  stagingClaim: RegExp;
  /** Tool names whose ok=true backs a "staged" claim (typically: record_payment, draft_email, ...). */
  stagingTools: ReadonlySet<string>;
}

/**
 * Build a (reply, toolRuns) → boolean guard for "claimed to have staged
 * something for later confirmation but never called the staging tool."
 */
export function makeStagingGuard(config: StagingGuardConfig) {
  return function claimsStagingWithoutTool(reply: string, toolRuns: ReadonlyArray<ToolRun>): boolean {
    if (!config.stagingClaim.test(reply)) return false;
    return !okIn(toolRuns, config.stagingTools);
  };
}

export interface SympathyGuardConfig {
  /** Regex that detects a sympathy opener at the START of a reply. */
  sympathyOpener: RegExp;
}

/**
 * Build a history → boolean check: was a sympathy opener already used in this
 * thread? Adapter calls strip if true to prevent "I'm so sorry, Nur" cascading.
 */
export function makeSympathyGuard(config: SympathyGuardConfig) {
  return function alreadySympathized(history: ReadonlyArray<{ role: string; content: string }> = []): boolean {
    return history.some((m) => m.role === "assistant" && config.sympathyOpener.test(String(m.content || "")));
  };
}
