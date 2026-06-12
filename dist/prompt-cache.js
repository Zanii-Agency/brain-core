// Cross-turn prompt cache split.
//
// Anthropic charges full price for system prompt tokens by default, but
// will serve a cache-read (~10x cheaper) when a block with cache_control:
// "ephemeral" is byte-identical to a recent prior call. The win is huge
// for a personal-assistant bot where the persona + laws + brand grounding
// is many KB and identical across every turn for a given (role, who).
//
// This module is the universal cache-split primitive: every Adapter calls
// it with its own system prompt + a per-turn tail (e.g. a wall clock that
// would otherwise bust the cache every minute). It does ZERO bot-specific
// work — the Adapter chooses the marker that divides "stable persona" from
// "dynamic tail."
//
// Sasa first shipped this in arch2 (c8e510f, 2026-06-12). The pattern is
// the same for Jensen, CTH, and every future bot: anything before the
// marker caches; anything after is dynamic.
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
export function splitForCache(system, clockLine, splitMarker, opts = {}) {
    if (opts.disabled)
        return system + clockLine;
    const splitAt = system.indexOf(splitMarker);
    if (splitAt <= 0)
        return system + clockLine;
    return [
        { type: "text", text: system.slice(0, splitAt), cache_control: { type: "ephemeral" } },
        { type: "text", text: system.slice(splitAt) + clockLine },
    ];
}
//# sourceMappingURL=prompt-cache.js.map