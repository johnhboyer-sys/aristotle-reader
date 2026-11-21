# Restore

How to bring the site back with this repository, or with a built bundle, and
no access to its author's machines or accounts. `ARCHITECTURE.md` says what
the site is made of; this file is the steps. The log at the end says which of
them have been run, when, and how long they took.

## Where the copies are

| What | Where | Notes |
|---|---|---|
| Source | GitHub, `johnhboyer-sys/aristotle-reader` (public) | The Greek text, the translations, the pipeline, and the app are all in it |
| A built bundle | The `aristotle-bundle` artifact of the newest CI run on GitHub | Kept seven days; downloading one needs a GitHub login |
| The build's two outside inputs | Diogenes 4.7.2's release on GitHub, `pjheslin/diogenes` | 186 MB; pinned by sha256 in `pipeline/aristotle_pipeline/inputs.py` |

There is no second copy of any of these under another company yet. Git
mirrors, bundles kept as releases, and a copy of the two inputs are phase 3 of
`HANDOFF-PORTABILITY.md`. Until then, GitHub is the one place a stranger can
restore from.

## From a bundle

A bundle is the whole site in one file. This takes minutes.

1. Unpack it and check every file:

   ```
   mkdir site && tar -xzf aristotle-bundle.tar.gz -C site
   (cd site && shasum -a 256 -c SHA256SUMS --quiet)
   ```

   No output and exit 0 means every file is the one the build made. On Linux,
   `sha256sum --quiet -c SHA256SUMS` does the same.

2. Serve the folder at the root of a name, over HTTPS, on any static host.
   The host must do three things: answer a folder's address (`/Cat/book/1/`)
   with that folder's `index.html`; answer a missing page with `404.html` and
   status 404; and send pages, stylesheets, and scripts with their usual
   types. It must not answer every unknown address with the home page.

3. Check the host. The check is a script in this repository
   (`scripts/check-served.mjs`; it needs Node 22 and nothing else), so run it
   from a checkout, with the path to the unpacked folder's list:

   ```
   node scripts/check-served.mjs --origin=https://<the host> --sums=<path to>/site/SHA256SUMS
   ```

   It asks the host for every file the list names and compares the bytes.
   `--every=50` reads a sample, for a host that should not get 17,000 requests.

The bundle's canonical links name `aristotle.johnhboyer.com`. That is right
for a mirror. A copy that is to be the site under another name is built from
source with `SITE_ORIGIN` set.

## From source

Needs git, Node 22, [uv](https://docs.astral.sh/uv/), and the network. About
ten minutes, after the clone. The repository's history is 2 GB; `--depth 1` on
the clone leaves it behind.

```
git clone https://github.com/johnhboyer-sys/aristotle-reader.git
cd aristotle-reader
(cd pipeline && uv sync)
(cd app && npm ci)
export DIOGENES_DATA="$PWD/../diogenes-data"
(cd pipeline && uv run python -m aristotle_pipeline.inputs fetch --dir "$DIOGENES_DATA")
npm run build:public
node scripts/make-bundle.mjs --out=../aristotle-bundle.tar.gz
```

`app/dist/` is then the site, and the last line packs it as a bundle after the
data has passed the leak check and the deploy's other gates. For another name
or a path under one, set `SITE_ORIGIN` and `SITE_BASE` before
`npm run build:public` (`ARCHITECTURE.md`, build parameters).

If the Diogenes release is gone, any copy of `greek-analyses.txt` and
`grc.lsj.xml` with the pinned sums will do: put both in a folder, name it in
`DIOGENES_DATA`, and `(cd pipeline && uv run python -m aristotle_pipeline.inputs check)`
says whether they are the right files. Every install of Diogenes 4.7.2 has them, under
`dependencies/data`.

## With Docker and nothing else

```
docker build -t aristotle-reader .
docker run --rm -p 8080:80 aristotle-reader
```

The first line is the build from source inside a container; the second serves
the result at `http://localhost:8080`. Put a host that speaks HTTPS in front
of it.

## To make it the primary again

The primary is a Cloudflare Worker for the app and an R2 bucket for the data;
`docs/cloudflare.md` has the steps and `npm run deploy:cloudflare` runs them.
Both need the owner's Cloudflare account. A new owner needs their own, and a
name to point at it.

## What a restore does not bring back

- The grammar lookup in the word popup and on lemma pages is another site
  (Grammata). Without it the reader still shows its own headword, gloss, and
  parses; the full dictionary entry says "Lookup failed".
- Translations that are not cleared for the public site are not in the
  repository's public build, and no bundle holds them.
- The desktop app (`desktop/`) is built and released apart from the site.

## Log

| Date | What was run | Result | Time |
|---|---|---|---|
| 2026-11-21 | From source, on GitHub's Linux runner (CI's `site` job, first run) | Built; the data is byte for byte what the live site served on 2026-11-20 (9,770 of 9,770 files) | 9 minutes |
| 2026-11-21 | From source, in a fresh clone on a Mac | Built; the same 9,770 of 9,770 | about 9 minutes |
| 2026-11-21 | From a bundle (the CI run's artifact): steps 1 and 3, the folder served by a test file server on the same Mac | Every file matched its sum; all 17,715 files asked for came back with the listed bytes. The test server has no 404 page, and step 3 said so | under a minute |

Not yet run: a restore by someone else, from a mirror alone; the Docker path
on a laptop (CI builds and tests the image); step 2 on a real host.
