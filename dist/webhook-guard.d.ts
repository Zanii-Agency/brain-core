export type WebhookGuardAction = {
    action: "process";
} | {
    action: "skip";
    reason: string;
};
export type WebhookGuardAdapters = {
    seenByWamid: (wamid: string) => Promise<boolean>;
    logToChat: (sender: string, text: string) => Promise<void>;
    /** Optional cross-instance lock. Return false to skip (another instance is processing). */
    acquireLock?: (key: string, ttlMs: number) => Promise<boolean>;
};
export declare function shouldProcess(adapterName: string, sender: string, wamid: string | null | undefined, text: string | null | undefined, adapters: WebhookGuardAdapters): Promise<WebhookGuardAction>;
export declare function mediaArrived(sender: string): string | null;
export declare function _resetForTest(): void;
//# sourceMappingURL=webhook-guard.d.ts.map