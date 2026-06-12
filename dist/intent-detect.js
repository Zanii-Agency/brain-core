// Pure intent-detection helpers — small regex-based classifiers used by the
// honesty guard layer to decide WHICH guard should fire (or be skipped) on
// a given turn.
//
// Each is a pure function: string in, boolean out. No tenant coupling — the
// phrasings classified are universal to any English chat assistant. Adapters
// that need a different language pack pass their own regex overrides.
const AMBIGUOUS_HEAD = /^(?:the\s+thing|that\s+(?:one|thing)|it|this\s+(?:one|thing)|do\s+(?:that|it|this)|what\s+we\s+(?:said|talked|discussed))\b/i;
const AMBIGUOUS_FULL = /^the\s+thing\s+we\s+(?:talked|spoke|discussed)\s+about\s*\.?\s*$/i;
/**
 * True when the operator's command is a bare demonstrative ("that one", "the
 * thing we talked about") with no concrete intent attached. Used to SKIP the
 * staging guard — there's nothing to stage, the right answer is "which one?".
 */
export function isAmbiguousReference(command, opts = {}) {
    const t = String(command || "").toLowerCase().trim();
    if (!t || t.length > 80)
        return false;
    if (opts.override)
        return opts.override.test(t);
    return AMBIGUOUS_HEAD.test(t) || AMBIGUOUS_FULL.test(t);
}
const CAPABILITY_QUESTION = /\b(what\s+can\s+you|what\s+(?:are\s+)?(?:can|do)\s+you\s+(?:able\s+to\s+)?do|what\s+do\s+you\s+do|are\s+you\s+able\s+to|how\s+do\s+you\s+work|what\s+(?:tools|features|capabilities)\s+(?:do\s+you|are\s+available)|list\s+(?:your\s+)?(?:tools|capabilities|features|abilities)|show\s+me\s+what\s+you\s+can\s+do|can\s+you\s+(?:help\s+with|do|handle)\b)/i;
/**
 * True when the operator is asking what the bot CAN do, not asking it to do
 * anything. Used to SKIP the completion-claim guard — the model's answer
 * naturally uses action verbs ("I track payments, I schedule meetings") that
 * look like completion claims but aren't.
 */
export function isCapabilityQuestion(command, opts = {}) {
    const t = String(command || "").toLowerCase().trim();
    if (!t)
        return false;
    if (opts.override)
        return opts.override.test(t);
    return CAPABILITY_QUESTION.test(t);
}
const HEDGE_MARK = /\b(?:please confirm|confirm if you|would you like me to|do you want me to|should i\b|shall i\b|let me know if you|want me to|i have not (?:done|created|set|yet)|i haven'?t (?:done|created|set)|not done yet|have not done it yet)\b/i;
/**
 * True when a reply hedges (asks the operator to confirm rather than acting).
 * Used by the loop-break guard: TWO consecutive hedges = a substitution loop.
 */
export function isHedge(reply, opts = {}) {
    const r = String(reply || "");
    if (opts.override)
        return opts.override.test(r);
    return HEDGE_MARK.test(r);
}
/**
 * True when THIS reply hedges AND the LAST assistant turn also hedged. Caller
 * passes the history (oldest first); we scan backward for the most recent
 * assistant turn. Guard-rewrite turns (matching `guardRewriteMark`) are NOT
 * counted as model hedges — those are guard fires, not model circling.
 */
export function isHedgeLoop(reply, history = [], guardRewriteMark, opts = {}) {
    if (!isHedge(reply, opts))
        return false;
    for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (!m || m.role !== "assistant")
            continue;
        const body = String(m.content || "");
        if (guardRewriteMark && guardRewriteMark.test(body))
            continue; // skip prior guard rewrites
        return isHedge(body, opts);
    }
    return false;
}
//# sourceMappingURL=intent-detect.js.map