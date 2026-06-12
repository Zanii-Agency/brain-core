export interface IntentDetectOpts {
    /** Override the default English regex with a tenant-specific one (e.g. Arabic for CTH). */
    override?: RegExp;
}
/**
 * True when the operator's command is a bare demonstrative ("that one", "the
 * thing we talked about") with no concrete intent attached. Used to SKIP the
 * staging guard — there's nothing to stage, the right answer is "which one?".
 */
export declare function isAmbiguousReference(command: string, opts?: IntentDetectOpts): boolean;
/**
 * True when the operator is asking what the bot CAN do, not asking it to do
 * anything. Used to SKIP the completion-claim guard — the model's answer
 * naturally uses action verbs ("I track payments, I schedule meetings") that
 * look like completion claims but aren't.
 */
export declare function isCapabilityQuestion(command: string, opts?: IntentDetectOpts): boolean;
/**
 * True when a reply hedges (asks the operator to confirm rather than acting).
 * Used by the loop-break guard: TWO consecutive hedges = a substitution loop.
 */
export declare function isHedge(reply: string, opts?: IntentDetectOpts): boolean;
export interface HistoryTurn {
    role: string;
    content: string;
}
/**
 * True when THIS reply hedges AND the LAST assistant turn also hedged. Caller
 * passes the history (oldest first); we scan backward for the most recent
 * assistant turn. Guard-rewrite turns (matching `guardRewriteMark`) are NOT
 * counted as model hedges — those are guard fires, not model circling.
 */
export declare function isHedgeLoop(reply: string, history?: HistoryTurn[], guardRewriteMark?: RegExp, opts?: IntentDetectOpts): boolean;
//# sourceMappingURL=intent-detect.d.ts.map