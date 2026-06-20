import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    accessPolicyArb,
    authorized,
    principalArb,
    roleChild,
} from "./arbitraries";

describe("formal arbitraries", () => {
    it("produces both authorized and unauthorized draws", () => {
        const samples = fc.sample(
            fc.record({ policy: accessPolicyArb, principal: principalArb }),
            300,
        );
        const verdicts = samples.map((s) => authorized(s.policy, s.principal));
        expect(verdicts.some((v) => v === true)).toBe(true);
        expect(verdicts.some((v) => v === false)).toBe(true);
    });

    it("reference predicate honors inherited capabilities", () => {
        // role:child inherits cap:1 from role:a and owns cap:3.
        const principal = {
            id: "principal:test",
            role: roleChild,
            capabilities: [] as string[],
            metadata: {},
        };
        const eff = new Set(
            roleChild.getEffectiveCapabilities().map((c) => c.id),
        );
        expect(eff.has("cap:1")).toBe(true);
        expect(eff.has("cap:3")).toBe(true);
        expect(authorized({ ...stubPolicy(["cap:1"]) }, principal)).toBe(true);
        expect(authorized({ ...stubPolicy(["cap:2"]) }, principal)).toBe(false);
    });
});

function stubPolicy(requiredCapabilities: string[]) {
    return {
        readableByRoles: [] as string[],
        requiredCapabilities,
        fallbackAllowed: false,
        denialMode: "error" as const,
        metadata: {},
    };
}
