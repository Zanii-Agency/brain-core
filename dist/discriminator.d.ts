export type DiscriminatorAdapters = {
    getActiveTeamFirstNames: () => Promise<string[]>;
    getLastUserInbound: () => Promise<string | null>;
};
export type DiscriminatorResult = {
    ok: true;
} | {
    ok: false;
    expected: string;
    got: string;
};
export declare function discriminatorMismatch(candidateTitle: string, adapters: DiscriminatorAdapters): Promise<DiscriminatorResult>;
//# sourceMappingURL=discriminator.d.ts.map