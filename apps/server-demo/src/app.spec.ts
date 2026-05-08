import { describe, expect, it } from "vitest";
import { run } from "./app";

describe("run", () => {
    it("returns a complete report string", async () => {
        const report = await run();
        expect(typeof report).toBe("string");
        expect(report.length).toBeGreaterThan(0);
        expect(report).toContain("Server Demo Report");
        expect(report).toContain("server:demo");
    });
});
