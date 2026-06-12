export interface CacheBlock {
    type: "text";
    text: string;
    cache_control?: {
        type: "ephemeral";
    };
}
export interface SplitOptions {
    /** Disable the split (single-string output). Used when SASA_PROMPT_SPLIT=0 or equivalent rollback flag. */
    disabled?: boolean;
}
/**
 * Split a system prompt at `splitMarker` into a cached prefix + a dynamic
 * tail (the tail receives `clockLine` appended).
 *
 * Returns:
 *   - a single string if `disabled`, or if `splitMarker` is not found in `system`
 *   - a 2-block array otherwise: [cached prefix, dynamic tail + clockLine]
 *
 * The function is pure; the caller passes the result directly to the
 * Anthropic `system` parameter.
 */
export declare function splitForCache(system: string, clockLine: string, splitMarker: string, opts?: SplitOptions): string | CacheBlock[];
//# sourceMappingURL=prompt-cache.d.ts.map