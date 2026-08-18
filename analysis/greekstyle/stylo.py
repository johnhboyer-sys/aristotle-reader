"""Stylometric machinery: profiles, Burrows's Delta, PCA, and resampling.

Nothing here is Greek-specific. The one opinionated choice is that samples are
fixed-size CHUNKS rather than whole works: a single vector per work gives no
estimate of within-work variation, so there is no scale against which to judge
whether a between-work distance is large. Chunking supplies that scale, and
every claim below is stated relative to it.
"""

from __future__ import annotations

import numpy as np


def chunk(tokens: list, size: int, min_frac: float = 0.6) -> list[list]:
    """Split a token list into consecutive chunks of `size`.

    A trailing remainder is kept only if it reaches `min_frac` of a full chunk;
    short samples have noisy rate estimates and would inflate the variance we
    are trying to measure.
    """
    out = [tokens[i:i + size] for i in range(0, len(tokens), size)]
    if out and len(out[-1]) < size * min_frac:
        out.pop()
    return out


def profile(norms, vocab: list[str]) -> np.ndarray:
    """Relative frequency of each vocabulary item, per 1 token."""
    n = len(norms)
    if n == 0:
        return np.zeros(len(vocab))
    idx = {w: i for i, w in enumerate(vocab)}
    v = np.zeros(len(vocab))
    for t in norms:
        j = idx.get(t)
        if j is not None:
            v[j] += 1.0
    return v / n


def matrix(samples: list[list[str]], vocab: list[str]) -> np.ndarray:
    return np.vstack([profile(s, vocab) for s in samples])


def zscore(m: np.ndarray, mu=None, sd=None):
    """Standardise columns. Returns (z, mu, sd) so held-out rows can reuse them."""
    if mu is None:
        mu = m.mean(axis=0)
    if sd is None:
        sd = m.std(axis=0, ddof=1)
    sd = np.where(sd < 1e-12, 1e-12, sd)
    return (m - mu) / sd, mu, sd


def delta(z: np.ndarray, other: np.ndarray | None = None) -> np.ndarray:
    """Burrows's Delta: mean absolute difference of z-scores.

    delta(z)          -> full n x n distance matrix
    delta(z, other)   -> n x m distances between two z-scored sets
    """
    b = z if other is None else other
    return np.abs(z[:, None, :] - b[None, :, :]).mean(axis=2)


def pca(z: np.ndarray, k: int = 2):
    """Principal components of an already-standardised matrix.

    Returns (scores, loadings, explained_variance_ratio).
    """
    x = z - z.mean(axis=0)
    u, s, vt = np.linalg.svd(x, full_matrices=False)
    var = s ** 2 / max(len(x) - 1, 1)
    return u[:, :k] * s[:k], vt[:k], var[:k] / var.sum()


def centroid_delta(z_sample: np.ndarray, z_group: np.ndarray) -> np.ndarray:
    """Delta from each sample row to the CENTROID of a group of rows."""
    c = z_group.mean(axis=0)
    return np.abs(z_sample - c).mean(axis=1)


def permutation_test(a: np.ndarray, b: np.ndarray, n: int = 20000, seed: int = 0):
    """Two-sided permutation test on the difference of means.

    Returns (observed_difference, p_value). Used instead of a t-test because
    chunk-level Delta scores are bounded below and visibly skewed.
    """
    rng = np.random.default_rng(seed)
    obs = a.mean() - b.mean()
    pool = np.concatenate([a, b])
    na = len(a)
    hits = 0
    for _ in range(n):
        rng.shuffle(pool)
        if abs(pool[:na].mean() - pool[na:].mean()) >= abs(obs) - 1e-15:
            hits += 1
    return obs, (hits + 1) / (n + 1)


def bootstrap_ci(x: np.ndarray, n: int = 10000, alpha: float = 0.05, seed: int = 0):
    rng = np.random.default_rng(seed)
    means = np.array([rng.choice(x, len(x), replace=True).mean() for _ in range(n)])
    return float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2))


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    """Non-parametric effect size in [-1, 1]: P(a>b) - P(a<b)."""
    gt = (a[:, None] > b[None, :]).sum()
    lt = (a[:, None] < b[None, :]).sum()
    return (gt - lt) / (len(a) * len(b))
