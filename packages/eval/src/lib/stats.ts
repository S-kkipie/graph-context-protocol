/**
 * Small, dependency-free statistics for the paper's behavioral tables:
 * Wilson score interval for a proportion, two-sided Fisher exact test for a
 * difference in proportions, Cohen's d for a mean difference, and mean/sd.
 *
 * @module stats
 */

export function mean(xs: readonly number[]): number {
    return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population standard deviation (matches the paper's reporting convention). */
export function sd(xs: readonly number[]): number {
    if (xs.length === 0) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Wilson score interval (default 95%) for k successes in n trials. */
export function wilson(
    k: number,
    n: number,
    z = 1.96,
): { lo: number; hi: number } {
    if (n === 0) return { lo: 0, hi: 1 };
    const p = k / n;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const centre = (p + z2 / (2 * n)) / denom;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
    return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

function logFactorial(n: number): number {
    let s = 0;
    for (let i = 2; i <= n; i++) s += Math.log(i);
    return s;
}

function logChoose(n: number, k: number): number {
    return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/**
 * Two-sided Fisher exact p-value for the 2x2 table
 * [[a, b], [c, d]] (rows = arms, columns = success/failure).
 */
export function fisherExact(
    a: number,
    b: number,
    c: number,
    d: number,
): number {
    const r1 = a + b;
    const r2 = c + d;
    const c1 = a + c;
    const n = r1 + r2;
    const logP = (x: number) =>
        logChoose(r1, x) + logChoose(r2, c1 - x) - logChoose(n, c1);
    const observed = logP(a);
    let p = 0;
    for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
        const lp = logP(x);
        if (lp <= observed + 1e-9) p += Math.exp(lp);
    }
    return Math.min(1, p);
}

/** Cohen's d with pooled population s.d.; 0 when both arms have zero variance. */
export function cohensD(a: readonly number[], b: readonly number[]): number {
    const sa = sd(a);
    const sb = sd(b);
    const pooled = Math.sqrt((sa * sa + sb * sb) / 2);
    return pooled === 0 ? 0 : (mean(a) - mean(b)) / pooled;
}
