/**
 * Wall-clock ceiling for the parser flood tests.
 *
 * These tests exist to catch *quadratic* behaviour on pasted input — the
 * regressions they guard against ran for several seconds at ~100 KB, and one
 * took whole minutes (see the bounded-quantifier notes in CLAUDE.md). That is
 * an orders-of-magnitude signal, so the budget only has to sit far below the
 * regression, not close to the healthy time.
 *
 * It was 500 ms, which broke CI on a run that took 505 ms — a 1% overshoot on
 * a shared runner, not a performance regression. A budget that tight tests the
 * build agent's load rather than the code. 2 seconds still fails loudly if the
 * quadratic scan ever comes back, while tolerating a busy machine.
 */
export const PERF_BUDGET_MS = 2000;
