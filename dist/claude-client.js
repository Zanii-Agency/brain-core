// Anthropic Claude client wrapper.
//
// One model call, hardened against ITPM (input-tokens-per-minute) rate limits.
//
// PROMPT CACHING. The system prompt and the tools schema are byte-identical on
// every call of a turn, yet the agent loops up to N times (tool use), re-sending
// the same prefix each time. That repetition is the single biggest source of
// ITPM pressure. Marking the prefix with cache_control means iterations 2..n
// READ it from cache (counted at a fraction) instead of re-submitting it as
// fresh input. One breakpoint on the LAST tool caches the whole tools array;
// one on the system block caches the system text. Cache lives ~5 min, so
// back-to-back turns share it too. Under the 1024-token minimum the breakpoint
// is ignored gracefully (no error), so this is no-regret.
//
// BACKOFF. 429 (rate limit) and 529 (overloaded) are transient. Respect the
// retry-after header (or back off exponentially) and retry, so a momentary
// spike becomes a short pause, not a visible error.
//
// FAILOVER. Anthropic outage handling is per-Adapter policy. brain-core does
// not enforce a specific fallback (the Nisria owner directive was "no silent
// OpenAI fallback"; Jensen may want to fail to a different Claude model; CTH
// may want to surface the error to a vendor support inbox). The Adapter passes
// an optional `onFailure` hook that fires once all retries are exhausted, with
// the final error message — what the Adapter does with it (alert, fallback,
// graceful degrade) is its call.
//
// GYM MODE. Some Adapters route the same turn to a local OpenAI-compatible
// model (e.g. on a DGX) for evals. brain-core lets the Adapter pass a `gym`
// object: if `gym.active()` is true, brain-core calls `gym.call(args)`
// instead of Anthropic and returns its response untouched.
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
/**
 * One Anthropic round-trip with caching + backoff + gym hook + failure hook.
 * Returns the raw Anthropic JSON response. Throws on terminal failure.
 *
 * The Adapter wraps the throw in its own error/retry/alert policy. brain-core
 * stays unopinionated about what to do when Claude is dead.
 */
export async function runClaude(opts) {
    const maxTokens = opts.maxTokens ?? 1400;
    const maxAttempts = opts.maxAttempts ?? 4;
    // For gym mode: flatten any cache blocks back to plain text.
    const systemText = Array.isArray(opts.system) ? opts.system.map((b) => b.text).join("") : opts.system;
    // GYM SWAP: eval-only local-model path. brain-core does not own the local
    // model; the Adapter wires it in.
    if (opts.gym?.active()) {
        const resp = await opts.gym.call({
            model: opts.model,
            max_tokens: maxTokens,
            system: systemText,
            tools: opts.tools,
            messages: opts.messages,
        });
        return { ...resp, _via: "gym" };
    }
    // Cache-shape the tools and the system block. Last tool gets the
    // breakpoint (caches the whole array). System gets one block with
    // cache_control if the caller passed a plain string.
    const cachedTools = Array.isArray(opts.tools) && opts.tools.length
        ? opts.tools.map((t, i) => (i === opts.tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t))
        : opts.tools;
    const cachedSystem = Array.isArray(opts.system)
        ? opts.system
        : [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }];
    const body = JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        system: cachedSystem,
        tools: cachedTools,
        messages: opts.messages,
    });
    let lastErr = "Claude failed";
    let claudeFailed = false;
    try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": opts.anthropicKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                body,
                cache: "no-store",
            });
            if (r.ok)
                return await r.json();
            const j = await r.json().catch(() => ({}));
            lastErr = j?.error?.message || `Claude failed (${r.status})`;
            // Non-transient: stop retrying.
            if (r.status !== 429 && r.status !== 529) {
                claudeFailed = true;
                break;
            }
            if (attempt === maxAttempts - 1) {
                claudeFailed = true;
                break;
            }
            const retryAfter = Number(r.headers.get("retry-after"));
            const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(retryAfter * 1000, 30000)
                : Math.min(1500 * 2 ** attempt, 12000); // 1.5s, 3s, 6s, 12s
            await sleep(waitMs);
        }
    }
    catch (e) {
        lastErr = e?.message || "Claude network error";
        claudeFailed = true;
    }
    // Adapter-owned failure policy.
    if (claudeFailed && opts.onFailure) {
        try {
            await opts.onFailure(lastErr);
        }
        catch { /* alert is best effort */ }
    }
    throw new Error(lastErr);
}
//# sourceMappingURL=claude-client.js.map