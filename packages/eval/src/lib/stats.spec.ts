import { describe, expect, it } from "vitest";
import { cohensD, fisherExact, mean, sd, wilson } from "./stats";

describe("stats", () => {
    it("mean/sd", () => {
        expect(mean([1, 2, 3])).toBe(2);
        expect(sd([2, 2, 2])).toBe(0);
    });

    it("wilson interval brackets the point estimate", () => {
        const { lo, hi } = wilson(18, 30);
        expect(lo).toBeLessThan(0.6);
        expect(hi).toBeGreaterThan(0.6);
        expect(wilson(0, 0)).toEqual({ lo: 0, hi: 1 });
    });

    it("fisher exact: identical arms -> p=1; extreme split -> tiny p", () => {
        expect(fisherExact(10, 5, 10, 5)).toBeCloseTo(1, 6);
        expect(fisherExact(30, 0, 0, 30)).toBeLessThan(1e-10);
        // classic tea-tasting table
        expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.4857, 3);
    });

    it("cohens d is 0 for equal means and signed otherwise", () => {
        expect(cohensD([1, 2, 3], [1, 2, 3])).toBe(0);
        expect(cohensD([5, 6, 7], [1, 2, 3])).toBeGreaterThan(0);
    });
});
