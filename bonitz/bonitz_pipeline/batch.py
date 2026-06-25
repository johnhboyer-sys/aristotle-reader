"""
Batch process Bonitz pages: render → split → transcribe (Opus 4.8) → JSON.
Skips any column whose XML already exists. Safe to re-run after interruption.

Usage:
    ANTHROPIC_API_KEY=sk-ant-... python -m bonitz_pipeline.batch --pages 15-60
    ANTHROPIC_API_KEY=sk-ant-... python -m bonitz_pipeline.batch --pages 15,16,17
    ANTHROPIC_API_KEY=sk-ant-... python -m bonitz_pipeline.batch --pages 15

Outputs:
    bonitz/output/page-NNN-L.xml   bonitz/output/page-NNN-R.xml
    app/src/data/bonitz/page-NNN-L.json  ...R.json

Temp TIFFs in /tmp/bonitz/ are deleted after each page is processed.
"""

from __future__ import annotations
import argparse
import subprocess
import sys
import time
from pathlib import Path

from .split_columns import split_page
from .transcribe import transcribe_image
from .xml_to_json import parse_column_xml
import json

# ── Path constants ──────────────────────────────────────────────────────────
_HERE        = Path(__file__).resolve().parent.parent          # bonitz/
_REPO        = _HERE.parent                                     # aristotle-reader/
_OUTPUT_XML  = _HERE / "output"
_OUTPUT_JSON = _REPO / "app" / "src" / "data" / "bonitz"
_TMP         = Path("/tmp/bonitz")
_TMP_COLS    = _TMP / "cols"
_PDF         = Path.home() / "Downloads" / "book.pdf"
_MODEL       = "claude-opus-4-8"


def _parse_pages(spec: str) -> list[int]:
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            lo, hi = part.split("-", 1)
            pages.extend(range(int(lo), int(hi) + 1))
        else:
            pages.append(int(part))
    return sorted(set(pages))


def _render_page(page: int, tiff_path: Path) -> None:
    """Render a single PDF page to TIFF at 600 PPI using pdftoppm."""
    tiff_path.parent.mkdir(parents=True, exist_ok=True)
    # pdftoppm writes <prefix>-NNN.tif; we point prefix to a temp stem
    prefix = str(tiff_path.parent / "pg")
    result = subprocess.run(
        ["pdftoppm", "-tiff", "-r", "600", "-f", str(page), "-l", str(page),
         str(_PDF), prefix],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftoppm failed for page {page}:\n{result.stderr}")
    # pdftoppm names the output pg-NNN.tif (zero-padded to number of pages)
    # Find whatever it produced
    candidates = sorted(tiff_path.parent.glob("pg-*.tif"))
    if not candidates:
        raise RuntimeError(f"pdftoppm produced no TIFF for page {page}")
    candidates[-1].rename(tiff_path)


def process_page(page: int, *, dry_run: bool = False) -> tuple[int, int]:
    """
    Process one page (both columns). Returns (done, skipped) counts.
    """
    done = skipped = 0
    page_str = f"{page:03d}"
    tiff_path = _TMP / f"page-{page_str}.tif"
    cols_done: list[tuple[Path, str]] = []  # (col_tif, side)

    for side in ("L", "R"):
        xml_out  = _OUTPUT_XML  / f"page-{page_str}-{side}.xml"
        json_out = _OUTPUT_JSON / f"page-{page_str}-{side}.json"

        if xml_out.exists() and json_out.exists():
            print(f"  [skip] page {page_str}-{side} already done", flush=True)
            skipped += 1
            continue

        # Render page TIFF if we don't have it yet
        if not tiff_path.exists():
            print(f"  [render] page {page_str} at 600 PPI …", flush=True)
            if not dry_run:
                _render_page(page, tiff_path)

        cols_done.append((None, side))  # placeholder; split below

    # If both columns were already done, nothing more to do
    if skipped == 2:
        return done, skipped

    # Split the page into columns (once per page)
    left_tif  = _TMP_COLS / f"page-{page_str}-L.tif"
    right_tif = _TMP_COLS / f"page-{page_str}-R.tif"

    if tiff_path.exists() and not (left_tif.exists() and right_tif.exists()):
        print(f"  [split] page {page_str} …", flush=True)
        if not dry_run:
            _TMP_COLS.mkdir(parents=True, exist_ok=True)
            split_page(tiff_path, _TMP_COLS)

    # Delete full-page TIFF now (columns saved separately)
    if tiff_path.exists() and not dry_run:
        tiff_path.unlink()

    col_tifs = {"L": left_tif, "R": right_tif}

    for side in ("L", "R"):
        xml_out  = _OUTPUT_XML  / f"page-{page_str}-{side}.xml"
        json_out = _OUTPUT_JSON / f"page-{page_str}-{side}.json"

        if xml_out.exists() and json_out.exists():
            continue

        col_tif = col_tifs[side]
        print(f"  [transcribe] page {page_str}-{side} with {_MODEL} …", flush=True)

        if not dry_run:
            if not col_tif.exists():
                raise FileNotFoundError(f"Column TIFF not found: {col_tif}")

            xml_text = transcribe_image(col_tif, model=_MODEL)
            _OUTPUT_XML.mkdir(parents=True, exist_ok=True)
            xml_out.write_text(xml_text, encoding="utf-8")

            # Convert to JSON
            data = parse_column_xml(xml_out)
            _OUTPUT_JSON.mkdir(parents=True, exist_ok=True)
            json_out.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"  [json]  {len(data['entries'])} entries → {json_out.name}", flush=True)

        done += 1

    # Clean up column TIFFs for this page once both sides are done
    xml_l = _OUTPUT_XML / f"page-{page_str}-L.xml"
    xml_r = _OUTPUT_XML / f"page-{page_str}-R.xml"
    if xml_l.exists() and xml_r.exists() and not dry_run:
        for tif in (left_tif, right_tif):
            if tif.exists():
                tif.unlink()

    return done, skipped


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Batch-transcribe Bonitz columns")
    p.add_argument("--pages", required=True,
                   help="Page range: '15-60', '15,16', or '15'")
    p.add_argument("--dry-run", action="store_true",
                   help="Print plan without calling the API or writing files")
    args = p.parse_args(argv)

    pages = _parse_pages(args.pages)
    print(f"Batch: {len(pages)} pages ({pages[0]}–{pages[-1]}), "
          f"up to {len(pages)*2} columns", flush=True)
    if args.dry_run:
        print("DRY RUN — no API calls\n")

    total_done = total_skip = 0
    t0 = time.time()

    for page in pages:
        print(f"\nPage {page:03d}", flush=True)
        try:
            done, skip = process_page(page, dry_run=args.dry_run)
            total_done += done
            total_skip += skip
        except Exception as exc:
            print(f"  [ERROR] page {page:03d}: {exc}", file=sys.stderr)
            # Continue with remaining pages rather than aborting
            continue

    elapsed = time.time() - t0
    print(f"\nDone. {total_done} columns transcribed, "
          f"{total_skip} skipped. {elapsed:.0f}s elapsed.")


if __name__ == "__main__":
    main()
