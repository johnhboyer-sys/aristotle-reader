# Topic search for the Aristotle reader: methods survey

Researched 2026-11-05 by web search and page fetch. "Unverified" marks anything I could not confirm from a page I read. Search snippets are not treated as verification unless noted. No Aristotle-specific retrieval benchmark turned up anywhere; every quality claim below comes from other Greek, Latin or Koine tasks.

## 1. Embedding models

### Ancient-Greek-specific

| Model | Licence | Size | Local / browser | Evidence on Ancient Greek |
|---|---|---|---|---|
| GreBerta, PhilBerta (RoBERTa), GreTa, PhilTa (T5). Riemenschneider and Frank 2023. https://arxiv.org/abs/2305.13698 ; code https://github.com/Heidelberg-NLP/ancient-language-models ; https://huggingface.co/bowphs/PhilBerta | PhilBerta card: Apache-2.0. Others: not checked (unverified) | PhilBerta ~0.1B, RoBERTa-base size, trained on Greek, Latin, English (and a fourth language the card does not name) | HF transformers; a base-size encoder runs on MPS. Browser use needs an ONNX export that I did not find (unverified) | The paper reports PoS/lemma/semantic tasks beating earlier Greek BERTs. These are encoders, not retrieval models: raw mean-pooled vectors are weak for search without sentence training |
| Ancient Greek BERT (Singh, Rao, Gupta 2021) https://huggingface.co/pranaydeeps/Ancient-Greek-BERT | None stated on card | ~0.1B, BERT-base, 768d | transformers | Trained on First1KGreek, Perseus, PROIEL, Gorman. Tuned for PoS/morphology, not retrieval |
| SPhilBERTa https://huggingface.co/bowphs/SPhilBerta ; paper https://arxiv.org/abs/2308.12008 | Apache-2.0 | ~0.1B | sentence-transformers one-liner on the card | Distilled to align Latin, Greek and English; the paper reports high accuracy on translation detection and a Latin-to-Greek allusion case study. In the Latin benchmark Loci Similes it ranked below multilingual-e5 for retrieval (see below) |
| shlm-grc-en (Krahn et al. 2023) https://huggingface.co/kevinkrahn/shlm-grc-en ; paper https://aclanthology.org/2023.alp-1.2/ ; data https://github.com/kevinkrahn/ancient-greek-datasets | MIT | 94.8M | Needs `trust_remote_code` or a fork of sentence-transformers (card says the current release breaks it). No ONNX known (unverified) | The only direct Greek-to-English test I found. Distilled from bge-base-en-v1.5; the paper's English-to-Greek semantic retrieval best was Recall@10 69.87 and mAP@20 53.00 (mpnet teacher). The authors write that performance "was rather poor even for the best models." Translation search reached 90-97% |

### General multilingual (none tested on Ancient Greek by anyone I found)

| Model | Licence | Size / dim | Local | Browser |
|---|---|---|---|---|
| BGE-M3 https://huggingface.co/BAAI/bge-m3 | MIT | 568M (per a community MLX card, unverified at source), 1024d, 8192 tokens, 100+ languages | sentence-transformers; community MLX quantisations 321-612 MB e.g. https://huggingface.co/TyKaoz/bge-m3-6bit (those cards say Apache-2.0, the original says MIT; check) | Too large |
| multilingual-e5-large https://huggingface.co/intfloat/multilingual-e5-large | MIT | 24 layers, 1024d, 512-token cap, ONNX tag. "Low-resource languages may see performance degradation" | sentence-transformers | Large |
| multilingual-e5-small https://huggingface.co/Xenova/multilingual-e5-small | Original card not read (unverified; large sibling is MIT) | 384d (from memory, unverified) | yes | transformers.js (Apache-2.0, https://github.com/huggingface/transformers.js) ONNX int8 file is 118 MB, fp16 235 MB, so first-load download is heavy |
| LaBSE https://huggingface.co/sentence-transformers/LaBSE | Apache-2.0 | 0.5B, 768d, 109 languages | yes | ONNX exists on the hub (unverified) |
| Qwen3-Embedding-0.6B https://huggingface.co/Qwen/Qwen3-Embedding-0.6B | Apache-2.0 | 0.6B, 32 to 1024d, 32K context, 100+ languages | transformers; MLX/GGUF forms unverified | Too large |
| nomic-embed-text-v2-moe https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe | Apache-2.0 | 475M (305M active), 768d, Matryoshka to 256, ~100 languages | yes | Heavy |
| jina-embeddings-v3 https://huggingface.co/jinaai/jina-embeddings-v3 | CC BY-NC 4.0 (from HF metadata via search snippets; page itself not read to confirm) | not read | yes | Non-commercial: avoid if the site ever takes money |

### Evidence of quality
- Loci Similes (Latin intertext benchmark, 172k segments, 545 verified links): multilingual-e5-large was the best retriever, Recall@10 about 0.61, Recall@100 about 0.72, ahead of BGE-M3, Granite and SPhilBERTa. A bi-encoder plus cross-encoder rerank recovered 79% of true links at depth 100. Latin only, no Greek. https://arxiv.org/html/2601.07533v1
- "From transcription to semantic corpus analysis" (arXiv 2607.24542, Latin and Greek, biblical reuse in patristic texts, 2,935 verified parallels): generic multilingual encoders lost to encoders adapted by unsupervised training (TSDAE, contrastive) on 4-8k raw in-domain sentences, which takes seconds on a laptop GPU. https://huggingface.co/papers/2607.24542 (abstract only read).
- D'Angelo, Taddei, Lenci 2025 fine-tune an encoder with contrastive learning on paraphrases generated from Ancient Greek WordNet plus re-inflection, tested on Homeric formulae. https://aclanthology.org/2025.clicit-1.34 (the page would not load in full; details from a search snippet).
- Modern Greek benchmarks (ORPHEAS, https://arxiv.org/pdf/2604.20666) say little about polytonic Attic prose.

**What this means for us.**
1. No model has a published Ancient Greek retrieval score we can trust. Run our own small test: 50 passages with known English parallels, compare e5-large, BGE-M3, shlm-grc-en and SPhilBERTa. This costs an afternoon on the Mac.
2. Our English translations are the stronger side. Embedding the English text with a good English or multilingual model will probably beat embedding the Greek; use the Greek for lemma matching and display.
3. A short unsupervised adaptation of an encoder on our own 1M words is cheap and has support in the literature (arXiv 2607.24542), but only after the baseline test.

## 2. Digital-humanities precedents

- **Tesserae.** Lemma-based intertext. On a Latin benchmark (Pharsalia vs Aeneid) lemma search recovered 55% of commentator-noted parallels; adding synonym expansion raised it to 68%. Greek-Latin cross-language matching uses a dictionary linking about 34,000 Greek words to Latin ones, built by a topic-model pivot; roughly 80% of correspondences were accurate in preliminary results. Figures are from a project blog and a chapter, via search summaries and not read in full. https://tesserae.caset.buffalo.edu/blog/page/3 ; https://edizionicafoscari.unive.it/en/edizioni4/libri/978-88-6969-183-6/the-tesserae-project/ . Lesson: lemma match plus a synonym layer gets over half; evaluation was against scholars' commentary parallels.
- **Diorisis corpus.** 820 lemmatised, morphologically tagged Greek texts, Homer to 5th c. CE. https://www.repository.cam.ac.uk/handle/1810/286766 . Expert sense labels exist for only three words (kosmos, mus, harmonia; Vatri et al. 2019). Sense-change models note the corpus is "small and sparse" (https://arxiv.org/pdf/2311.00541, Perrone et al., GASC).
- **Ancient Greek WordNet.** Open AGWN 0.5: 7,447 synsets, 22,420 lemmas, senses unsupervised with estimated precision about 56%, CC BY-SA 4.0 (https://dspace-clarin-it.ilc.cnr.it/repository/xmlui/handle/20.500.11752/ILC-56). The Harvard CHS WordNet is a separate, ongoing resource (https://greekwordnet.chs.harvard.edu ; fetch failed, unverified). Coverage is thin for philosophical vocabulary (my inference, unverified).
- **Distributional models.** AGREE benchmark of lemma-pair relatedness (Stopponi et al., https://aclanthology.org/2023.alp-1.6/ ; Zenodo https://zenodo.org/record/8027490). I could not read the scores.
- **WSD with LLMs.** A 2026 LaTeCH-CLfL paper uses LLMs for WSD on geographic nouns in Greek and Latin (https://aclanthology.org/2026.latechclfl-1.26). Abstract only; results unread.
- **Topic models.** Koentges 2020 used LDA on First1KGreek to score passages as philosophical (https://journals.ub.uni-heidelberg.de/index.php/dco/article/view/73197). Passage-level genre flag, not concept retrieval.
- **LLM passage work.** Umphrey, Roberts, Roberts 2024 asked an LLM for intertextual links in Koine Greek biblical texts; experts judged the output. It found quotations, allusions and echoes, but struggled with long query passages and invented false dependencies (https://arxiv.org/abs/2409.01882; that it used Claude Opus is unverified). Anacreontea topoi classification with an LLM, 21 annotated fragments (https://sol.sbc.org.br/index.php/semish/article/view/29353; not read beyond snippet).

**What this means for us.** Every success pairs a mechanical candidate generator with expert judgement of a small sample; none lets the model be the final authority. Expect LLM false positives on invented links, and judge with John's own gold set. No precedent exists for LLM concept classification of Aristotle; we are the test.

## 3. Lexical methods

- **Lemma co-occurrence and collocation.** Needs only our existing lemma index. Strength: exact, explainable, free; matches Tesserae's lemma finding. Failure: misses a passage that discusses the idea in different words, which is the stated goal.
- **Lemma word vectors.** Released models exist: lemmatised word2vec on First1K (149,883 sentences, https://github.com/l0d0v1c/ancient-greek-word2vec), fastText vectors (1 GB Greek text, UCSD, via search snippet, link unverified), CLTK wrappers (https://cltkv1.readthedocs.io/en/latest/cltk.embeddings.html). A 2026 Byzantine epigram benchmark found lemmatised CBOW slightly beat transformers on verse similarity (via search snippet; paper not opened). The survey by Iezzi and Scapini says Ancient Greek application remains underexplored (via search). Failure on 1M words: rare technical terms (ἐντελέχεια) get unstable vectors; frequent words blur; Aristotle's idiolect differs from the general corpora these models trained on. Training our own on Aristotle alone is likely too small; train on all Perseus/First1K Greek and test against AGREE.
- **Query expansion from a synonym set.** Tesserae's 55%→68% gain is the best number. Sources: AGWN (noisy, 56% precision), LSJ glosses already linked on the site, and Bonitz's Index Aristotelicus groupings (John's `bonitz-text` repo). Bonitz is the best fit for an Aristotle-specific thesaurus; its OCR reading is in progress.
- **Failure modes in one corpus this small:** sparse counts, homograph lemmas, and chapters that treat a topic through verbs or a pronoun chain.

**What this means for us.** Build the lemma baseline first: it is the reference every other method must beat, and it surfaces the "directly about X" bucket. Hand-curated seed lemmas from Bonitz and LSJ per topic page give the best precision. Use vectors only as a recall booster, and treat them as unproven.

## 4. LLM tagging pipelines

**Patterns.**
1. *Exhaustive classification.* Send every segment with a rubric (the four buckets plus "not relevant"), require a short quote and a one-line reason, and constrain output to JSON. Simple, complete, reproducible, costly.
2. *Retrieve then rerank.* Lemma and embedding candidates (say the top 300) go to the LLM for bucket assignment. Loci Similes shows the shape: bi-encoder to cross-encoder cut reviewer load by 99% at 79% recall of true links (https://arxiv.org/html/2601.07533v1). Cheaper, but recall is capped by stage one.
3. *Two-pass.* Cheap model filters on the English text alone, then a stronger model reads Greek and English for the survivors and assigns the bucket.

**Evaluation.** Hand-label a gold set of 100-200 segments per topic (John or a scholar; labels stay out of every prompt), report recall of the "directly about" bucket first, then bucket accuracy. Gilardi et al. found zero-shot ChatGPT beat crowd-workers by about 25 points on average, with consistency higher at temperature 0.2 than 1 (https://arxiv.org/pdf/2303.15056). That is 2023 GPT-3.5 on tweets: a reason to try, not evidence for Greek philosophy. Hold out a second topic as a check that the rubric does not overfit one topic.

**Reproducibility.** Practitioner guidance: temperature 0 does not guarantee identical output; log the model name and version, prompt, parameters, date and raw output (https://www.promptlayer.com/blog/why-llm-evaluation-results-arent-reproducible-and-what-to-do-about-it/ ; blog, not peer review). Commit prompts, rubric and raw outputs to the repo, keyed by segment id; judge diffs between runs, not the run itself. Subscription CLIs give no pinned snapshot or seed, so record the CLI version and date, and treat reruns as new drafts.

**Token estimate for 2,600 segments, one topic** (my arithmetic; unverified against a tokenizer, measure on 20 real segments first). English ~400 words is about 550 tokens. Polytonic Greek ~400 words is probably 1,500-2,500 tokens (Greek is token-heavy for most tokenizers). Rubric overhead about 600 tokens if repeated per call, near zero if many segments share one call.
- English only: ~1.4M input tokens.
- Greek plus English: ~5.5-8M input tokens (2,600 × ~2,100-3,100).
- Output: ~80-150 tokens per segment, ~0.2-0.4M.
- Two-pass (English filter, then Greek plus English for ~15%): ~2.5-3M total.
- Retrieve then rerank, 300 candidates: ~0.3-0.9M.
The pass cost multiplies by the number of topics, so exhaustive Greek-plus-English for every topic is the expensive path under subscription limits. Batch 5-10 segments per call to amortise the rubric.

**What this means for us.** Start with retrieve-then-rerank on the English text, with Greek shown only for borderline items. Build the gold set before the first run. Keep raw outputs in git so any bucket assignment traces to a prompt and date.

## 5. Hosting

**Static precomputed JSON (recommended for the proof of concept).** One JSON per topic page; zero runtime cost; fits GitHub Pages and the existing Astro build. No search box, which matches the plan.

**Cloudflare** (prices from the pages read):
- Workers AI: free plan includes 10,000 Neurons per day; over the limit calls fail rather than bill. Paid: $0.011 per 1,000 Neurons. bge-m3: $0.012 per million input tokens. https://developers.cloudflare.com/workers-ai/platform/pricing/ . Free for a small search box, but it is a hosted API, so it breaks the "free on a Mac" constraint only if the paid plan is used.
- Vectorize: available on the Workers Free plan; 5 million stored and 30 million queried dimensions per month free; paid adds $0.01 per million queried dimensions and $0.05 per 100 million stored. https://developers.cloudflare.com/vectorize/platform/pricing/ . Free stored dimensions fit about 4,900 vectors at 1024d, 6,500 at 768d, 13,000 at 384d: **too few for 10-30k passages at 1024d on the free plan.** Paid storage is cheap (10M stored dimensions are included).
- D1: free 5M rows read and 100k rows written per day, 5 GB. https://developers.cloudflare.com/d1/platform/pricing/ . Not needed for vector search.
- The Workers Paid plan fee itself was not on the pages I read (unverified; check before relying on it).

**In-browser search.** transformers.js runs ONNX models in the browser by WASM, or WebGPU (experimental) https://github.com/huggingface/transformers.js . It only needs to embed the query. multilingual-e5-small's int8 file is 118 MB (https://huggingface.co/Xenova/multilingual-e5-small/tree/main/onnx), a heavy first visit, cached afterwards. Passage vectors still need to ship as a static file. For the vision-impaired phone reader in CLAUDE.md memory, a 118 MB download is a real cost. Cosine search over 30k vectors in plain JS takes milliseconds to tens of milliseconds (estimate, unverified).

**Index size** (arithmetic, 4 bytes per float, 1 byte per int8 dimension; excludes ids and text):

| Passages | 384d fp32 | 768d fp32 | 1024d fp32 | 1024d int8 | 384d int8 |
|---|---|---|---|---|---|
| 10,000 | 15 MB | 31 MB | 41 MB | 10 MB | 3.8 MB |
| 20,000 | 31 MB | 61 MB | 82 MB | 20 MB | 7.7 MB |
| 30,000 | 46 MB | 92 MB | 123 MB | 31 MB | 11.5 MB |

Matryoshka truncation (Qwen3-Embedding, nomic v2 both support it, per cards above) shrinks dimension at small loss; the loss on Greek is untested.

**What this means for us.** Ship static topic JSON now. For the later search box, the cheapest honest design is a precomputed int8 index of ~20k passages (under 10-20 MB) served as a static file, with the query embedded either in-browser (118 MB model) or by a Worker on the free Workers AI allowance; confirm that the model chosen in section 1 exists in Workers AI before committing. Vectorize's free tier cannot hold the full index at 1024d.

## Not verified
Greek-Aristotle retrieval scores for any model; GreBerta/GreTa/PhilTa licences; ONNX or browser builds of the Ancient Greek models; multilingual-e5-small licence and dimension from its own card; Harvard greekwordnet details (fetch failed); AGREE scores; full text of D'Angelo et al. 2025 and the LLM-WSD 2026 paper; tokenised size of Greek in any given LLM; Workers Paid base fee.
