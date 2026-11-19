# Golden-search battery

    PLAYWRIGHT_MODULE=<a playwright whose browsers are installed> \
      node docs/search-counting/battery/run.mjs [--site plato] [--base-plato <url>]

Fixed searches on the four live readers, each with an expected answer and its source
(`cases.json`). Run after every search deploy. Exit 1 if any ordinary case fails.

- **Ground truth:** Dittenberger's τί μήν counts (Laws 48, Statesman 20, Phaedrus 11).
- **Ledger values:** counts the deploy ledgers recorded when a change shipped.
- **Snapshots:** counts read live on 18 Nov after #214 and its ports. A corpus change
  can move these legitimately; change the number in the same PR, saying why.
- **known-bug:** expected to fail. "FIXED?" means it passed: confirm, then make it an
  ordinary case.

URL `op`: none is "and", `op=or` is the page's "and/or", `op=xor` is its "or".
