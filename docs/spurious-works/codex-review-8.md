- **Should-fix — `pipeline/aristotle_pipeline/lsj_citation_map.py:44`:** Missing a column-limited `037 → Prob` alias. LSJ XML line 55029, **κατάπνιξις**, cites `0086,037:966b:36` as “Arist. Pr. 966b36”; the resolver returns `None`. Other `037` citations name *Resp.*, so restrict the alias to Problemata columns and add a test.

- **Nit — same line:** The comment says **1,404 citations**; the supplied XML contains **1,428** `0086,036:` references.

Codex session ID: 01a1b379-14f0-7f53-b84d-b0fcc22cc529
Resume in Codex: codex resume 01a1b379-14f0-7f53-b84d-b0fcc22cc529
