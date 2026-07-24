/**
 * Thomas algorithm (tridiagonal matrix algorithm) for solving A x = d.
 *
 * A is tridiagonal with sub-diagonal `a`, diagonal `b`, super-diagonal `c`:
 *
 *   a[i] x[i-1] + b[i] x[i] + c[i] x[i+1] = d[i]
 *
 * a[0] and c[n-1] are ignored. O(n) work, O(n) memory.
 *
 * Every system produced by the implicit conduction schemes in this project is
 * diagonally dominant with positive diagonal (a and c are non-positive, and
 * b >= |a| + |c| + C/dt), so pivoting is unnecessary and the recurrence is
 * numerically stable.
 */

/** Reusable scratch buffers so the hot loop does not allocate per time step. */
export class Tridiag {
  constructor(n) {
    this.n = n;
    this.a = new Float64Array(n);
    this.b = new Float64Array(n);
    this.c = new Float64Array(n);
    this.d = new Float64Array(n);
    this.cp = new Float64Array(n); // modified super-diagonal
    this.dp = new Float64Array(n); // modified right-hand side
    this.beta = new Float64Array(n); // pivots, retained for factored reuse
  }

  /** Zero the coefficient arrays before assembling a fresh system. */
  reset() {
    this.a.fill(0);
    this.b.fill(0);
    this.c.fill(0);
    this.d.fill(0);
  }

  /**
   * Solve in place. Writes the solution into `out` (may alias this.d).
   * Only the leading `n` entries are used, allowing one buffer to serve
   * systems of different sizes (e.g. the r-sweep and z-sweep of ADI).
   */
  solve(out, n = this.n) {
    const { a, b, c, d, cp, dp } = this;

    let beta = b[0];
    if (beta === 0) throw new Error('Tridiag: zero pivot at row 0');
    cp[0] = c[0] / beta;
    dp[0] = d[0] / beta;

    for (let i = 1; i < n; i++) {
      beta = b[i] - a[i] * cp[i - 1];
      if (beta === 0) throw new Error(`Tridiag: zero pivot at row ${i}`);
      cp[i] = c[i] / beta;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / beta;
    }

    out[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      out[i] = dp[i] - cp[i] * out[i + 1];
    }
    return out;
  }

  /**
   * Factor the matrix once, so many right-hand sides can be solved against it.
   *
   * The radial sweep of the 2-D ADI scheme assembles the SAME tridiagonal
   * matrix for every axial row -- the coefficients depend on the radial index
   * only. Factoring once and reusing it across all Nz rows removes the forward
   * elimination from the inner loop entirely.
   */
  factor(n = this.n) {
    const { a, b, c, cp, beta } = this;
    beta[0] = b[0];
    if (beta[0] === 0) throw new Error('Tridiag.factor: zero pivot at row 0');
    cp[0] = c[0] / beta[0];
    for (let i = 1; i < n; i++) {
      beta[i] = b[i] - a[i] * cp[i - 1];
      if (beta[i] === 0) throw new Error(`Tridiag.factor: zero pivot at row ${i}`);
      cp[i] = c[i] / beta[i];
    }
  }

  /** Solve against the stored factorization. Call factor() first. */
  solveFactored(out, n = this.n) {
    const { a, d, cp, dp, beta } = this;
    dp[0] = d[0] / beta[0];
    for (let i = 1; i < n; i++) {
      dp[i] = (d[i] - a[i] * dp[i - 1]) / beta[i];
    }
    out[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      out[i] = dp[i] - cp[i] * out[i + 1];
    }
    return out;
  }
}
