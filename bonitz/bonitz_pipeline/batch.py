"""
Batch process Bonitz pages: render, split, transcribe, validate, and write JSON.

Usage:
    ANTHROPIC_API_KEY=sk-ant-... python -m bonitz_pipeline.batch --pdf /path/to/book.pdf --pages 15-60
    ANTHROPIC_API_KEY=sk-ant-... python -m bonitz_pipeline.batch --pages 15,16,17
    ANTHROPIC_API_KEY=sk-ant-... python -m bonitz_pipeline.batch --pages 15
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

from .split_columns import split_page
from .transcribe import transcribe_image
from .validate_column import validate as validate_column
from .xml_to_json import parse_column_xml


_HERE = Path(__file__).resolve().parent.parent
_REPO = _HERE.parent
_OUTPUT_XML = _HERE / "output"
_OUTPUT_JSON = _REPO / "app" / "src" / "data" / "bonitz"
_TMP = Path("/tmp/bonitz")
_DEFAULT_PDF = _HERE / "book.pdf"
_MANIFEST = _OUTPUT_XML / "batch_manifest.jsonl"
_MODEL = "claude-opus-4-8"
_FENCE_RE = re.compile(r"^\s*```(?:xml)?\s*(.*?)\s*```\s*$", re.DOTALL)


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


def _side_name(side: str) -> str:
    return "left" if side == "L" else "right"


def _strip_code_fence(text: str) -> str:
    match = _FENCE_RE.match(text)
    if match:
        return match.group(1).strip()
    return text.strip()


def _validate_model_xml(xml_text: str, *, page: int, side: str) -> str:
    xml_text = _strip_code_fence(xml_text)
    if not xml_text.startswith("<column"):
        raise ValueError("model output does not start with <column")

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"XML parse error: {exc}") from exc

    if root.tag != "column":
        raise ValueError(f"root tag is {root.tag!r}, expected 'column'")

    expected_page = str(page)
    expected_col = _side_name(side)
    if root.get("page") != expected_page:
        raise ValueError(f"root @page is {root.get('page')!r}, expected {expected_page!r}")
    if root.get("col") != expected_col:
        raise ValueError(f"root @col is {root.get('col')!r}, expected {expected_col!r}")

    return xml_text


def _render_page(page: int, pdf: Path, tiff_path: Path, render_dir: Path) -> None:
    """Render a single PDF page to TIFF at 600 PPI using pdftoppm."""
    render_dir.mkdir(parents=True, exist_ok=True)
    prefix = str(render_dir / "pg")
    result = subprocess.run(
        [
            "pdftoppm",
            "-tiff",
            "-r",
            "600",
            "-f",
            str(page),
            "-l",
            str(page),
            str(pdf),
            prefix,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftoppm failed for page {page}:\n{result.stderr}")

    candidates = sorted(render_dir.glob("pg-*.tif"))
    if not candidates:
        raise RuntimeError(f"pdftoppm produced no TIFF for page {page}")
    candidates[-1].rename(tiff_path)


def _write_json(xml_out: Path, json_out: Path) -> dict:
    data = parse_column_xml(xml_out)
    _OUTPUT_JSON.mkdir(parents=True, exist_ok=True)
    tmp = json_out.with_suffix(json_out.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, json_out)
    return data


def _validate_written_column(
    xml_out: Path, json_out: Path | None, *, page: int | None = None, side: str | None = None
) -> tuple[bool, list[str], list[str]]:
    """Returns (ok, failures, warnings). Only `failures` block; `warnings` are informational."""
    col = _side_name(side) if side is not None else None
    failures, warnings = validate_column(
        xml_out, json_path=json_out, page=str(page) if page is not None else None, col=col
    )
    return not failures, failures, warnings


def _write_manifest_row(row: dict) -> None:
    _MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with _MANIFEST.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _column_manifest(
    page_str: str,
    side: str,
    *,
    status: str,
    error: str | None = None,
    entries: int | None = None,
    source: str | None = None,
    warnings: list[str] | None = None,
) -> None:
    row = {
        "page": page_str,
        "column": side,
        "xml": str((_OUTPUT_XML / f"page-{page_str}-{side}.xml").relative_to(_HERE)),
        "json": str((_OUTPUT_JSON / f"page-{page_str}-{side}.json").relative_to(_REPO)),
        "status": status,
    }
    if source:
        row["source"] = source
    if entries is not None:
        row["entry_count"] = entries
    if error:
        row["error"] = error
    if warnings:
        row["warnings"] = warnings
    _write_manifest_row(row)


def _print_warnings(page_str: str, side: str, warnings: list[str]) -> None:
    for msg in warnings:
        print(f"  [warn]  page {page_str}-{side}: {msg}", file=sys.stderr, flush=True)


def _write_existing_xml_json(page: int, page_str: str, side: str, xml_out: Path, json_out: Path, *, dry_run: bool) -> int:
    print(f"  [json]  page {page_str}-{side} from existing XML", flush=True)
    if dry_run:
        return 1

    data = _write_json(xml_out, json_out)
    ok, failures, warnings = _validate_written_column(xml_out, json_out, page=page, side=side)
    if not ok:
        raise ValueError("; ".join(failures))
    _print_warnings(page_str, side, warnings)
    print(f"  [valid] page {page_str}-{side}", flush=True)
    print(f"  [json]  {len(data['entries'])} entries -> {json_out.name}", flush=True)
    _column_manifest(page_str, side, status="ok", entries=len(data["entries"]), source="existing_xml", warnings=warnings)
    return 1


def process_page(page: int, *, pdf: Path, dry_run: bool = False) -> tuple[int, int]:
    """Process one page. Returns (written, skipped) counts."""
    done = skipped = 0
    page_str = f"{page:03d}"
    page_tmp = _TMP / f"page-{page_str}"
    render_dir = page_tmp / "render"
    cols_dir = page_tmp / "cols"
    tiff_path = render_dir / f"page-{page_str}.tif"
    needs_images = False

    if not dry_run:
        shutil.rmtree(page_tmp, ignore_errors=True)
        render_dir.mkdir(parents=True, exist_ok=True)
        cols_dir.mkdir(parents=True, exist_ok=True)

    for side in ("L", "R"):
        xml_out = _OUTPUT_XML / f"page-{page_str}-{side}.xml"
        json_out = _OUTPUT_JSON / f"page-{page_str}-{side}.json"

        if xml_out.exists() and json_out.exists():
            ok, failures, warnings = (
                _validate_written_column(xml_out, json_out, page=page, side=side) if not dry_run else (True, [], [])
            )
            if not ok:
                error = "; ".join(failures)
                print(f"  [fail] page {page_str}-{side}: {error}", file=sys.stderr, flush=True)
                _column_manifest(page_str, side, status="failed", error=error, source="existing_xml_json")
                continue
            _print_warnings(page_str, side, warnings)
            print(f"  [skip] page {page_str}-{side} already done", flush=True)
            if not dry_run:
                _column_manifest(page_str, side, status="ok", source="existing_xml_json", warnings=warnings)
            skipped += 1
            continue

        if xml_out.exists() and not json_out.exists():
            try:
                done += _write_existing_xml_json(page, page_str, side, xml_out, json_out, dry_run=dry_run)
            except Exception as exc:
                print(f"  [fail] page {page_str}-{side}: {exc}", file=sys.stderr, flush=True)
                _column_manifest(page_str, side, status="failed", error=str(exc), source="existing_xml")
            continue

        needs_images = True

    if not needs_images:
        if not dry_run:
            shutil.rmtree(page_tmp, ignore_errors=True)
        return done, skipped

    print(f"  [render] page {page_str} at 600 PPI ...", flush=True)
    if not dry_run:
        _render_page(page, pdf, tiff_path, render_dir)

    left_tif = cols_dir / f"page-{page_str}-L.tif"
    right_tif = cols_dir / f"page-{page_str}-R.tif"
    if tiff_path.exists():
        print(f"  [split] page {page_str} ...", flush=True)
        if not dry_run:
            split_page(tiff_path, cols_dir)

    col_tifs = {"L": left_tif, "R": right_tif}
    for side in ("L", "R"):
        xml_out = _OUTPUT_XML / f"page-{page_str}-{side}.xml"
        json_out = _OUTPUT_JSON / f"page-{page_str}-{side}.json"

        if xml_out.exists():
            continue

        print(f"  [transcribe] page {page_str}-{side} with {_MODEL} ...", flush=True)
        if dry_run:
            done += 1
            continue

        try:
            col_tif = col_tifs[side]
            if not col_tif.exists():
                raise FileNotFoundError(f"Column TIFF not found: {col_tif}")

            xml_text = _validate_model_xml(transcribe_image(col_tif, model=_MODEL), page=page, side=side)
            _OUTPUT_XML.mkdir(parents=True, exist_ok=True)
            tmp = xml_out.with_suffix(xml_out.suffix + ".tmp")
            tmp.write_text(xml_text, encoding="utf-8")
            ok, failures, _ = _validate_written_column(tmp, None, page=page, side=side)
            if not ok:
                raise ValueError("; ".join(failures))
            os.replace(tmp, xml_out)

            data = _write_json(xml_out, json_out)
            ok, failures, warnings = _validate_written_column(xml_out, json_out, page=page, side=side)
            if not ok:
                raise ValueError("; ".join(failures))
            _print_warnings(page_str, side, warnings)
            print(f"  [valid] page {page_str}-{side}", flush=True)
            print(f"  [json]  {len(data['entries'])} entries -> {json_out.name}", flush=True)
            _column_manifest(page_str, side, status="ok", entries=len(data["entries"]), source="transcribed", warnings=warnings)
            done += 1
        except Exception as exc:
            tmp = xml_out.with_suffix(xml_out.suffix + ".tmp")
            if tmp.exists():
                tmp.unlink()
            print(f"  [fail] page {page_str}-{side}: {exc}", file=sys.stderr, flush=True)
            _column_manifest(page_str, side, status="failed", error=str(exc), source="transcribed")

    if not dry_run:
        shutil.rmtree(page_tmp, ignore_errors=True)

    return done, skipped


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Batch-transcribe Bonitz columns")
    parser.add_argument("--pages", required=True, help="Page range: '15-60', '15,16', or '15'")
    parser.add_argument("--pdf", type=Path, default=_DEFAULT_PDF, help=f"Input Bonitz PDF (default: {_DEFAULT_PDF})")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without calling the API or writing files")
    args = parser.parse_args(argv)

    if not args.pdf.exists():
        print(f"Error: PDF not found: {args.pdf}", file=sys.stderr)
        raise SystemExit(2)

    pages = _parse_pages(args.pages)
    print(f"Batch: {len(pages)} pages ({pages[0]}-{pages[-1]}), up to {len(pages) * 2} columns", flush=True)
    print(f"PDF: {args.pdf}", flush=True)
    if args.dry_run:
        print("DRY RUN - no API calls\n")

    total_done = total_skip = 0
    t0 = time.time()

    for page in pages:
        print(f"\nPage {page:03d}", flush=True)
        try:
            done, skip = process_page(page, pdf=args.pdf, dry_run=args.dry_run)
            total_done += done
            total_skip += skip
        except Exception as exc:
            print(f"  [ERROR] page {page:03d}: {exc}", file=sys.stderr)
            continue

    elapsed = time.time() - t0
    print(f"\nDone. {total_done} columns written, {total_skip} skipped. {elapsed:.0f}s elapsed.")


if __name__ == "__main__":
    main()
