"""Prompt v2 (Literal/Loose, units) on NE I.2 (Rackham) and I.3 (Ostwald), three
models, one Batch. Approved by John 2026-11-18 at ~40¢ (cap $1).

  env -u ANTHROPIC_API_KEY uv run --with anthropic python run2.py submit
  env -u ANTHROPIC_API_KEY uv run --with anthropic python run2.py fetch   # writes out2-<chapter>-<model>.json
  ... run2.py submit i2o / fetch i2o                                       # Ostwald's I.2, Opus and Sonnet
"""
import json, sys
from pathlib import Path

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from prompt_v2 import SCHEMA, prompt

MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
# `submit i2o`: Ostwald's I.2 only, Opus and Sonnet (Haiku ran out of tokens on v2). John 2026-11-18, ~15¢.
ONLY = {"i2o": (["claude-opus-5-5", "claude-sonnet-5-5"], "batch2-i2o.json")}
EFFORT = "medium"
CHAPTERS = {"i2": (HERE.parent / "test-i2" / "i2.json", "Nicomachean Ethics I.2"),
            "i3": (HERE / "i3.json", "Nicomachean Ethics I.3"),
            "i2o": (HERE / "i2o.json", "Nicomachean Ethics I.2")}


def submit(client, only=None):
    reqs = []
    for ch, (path, title) in CHAPTERS.items():
        if (only or ch) != ch or (not only and ch in ONLY): continue
        d = json.loads(path.read_text())
        for m in (ONLY[only][0] if only else MODELS):
            reqs.append(Request(custom_id=f"{ch}--{m}", params=MessageCreateParamsNonStreaming(
                model=m, max_tokens=32000,
                output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content": prompt(d, title)}])))
    b = client.messages.batches.create(requests=reqs)
    (HERE / (ONLY[only][1] if only else "batch2.json")).write_text(json.dumps({"id": b.id, "requests": [r["custom_id"] for r in reqs], "effort": EFFORT}))
    print(b.id, b.processing_status, len(reqs), "requests")


def fetch(client, only=None):
    bid = json.loads((HERE / (ONLY[only][1] if only else "batch2.json")).read_text())["id"]
    b = client.messages.batches.retrieve(bid)
    print(bid, b.processing_status, b.request_counts)
    if b.processing_status != "ended":
        return
    for r in client.messages.batches.results(bid):
        ch, m = r.custom_id.split("--")
        out = {"type": r.result.type}
        if r.result.type == "succeeded":
            msg = r.result.message
            out["stop_reason"] = msg.stop_reason
            out["usage"] = msg.usage.model_dump()
            text = "".join(c.text for c in msg.content if c.type == "text")
            try:
                out["units"] = json.loads(text)["units"]
            except Exception as e:
                out["error"] = f"unparsed: {e}"; out["raw"] = text[:2000]
        else:
            out["error"] = str(r.result)
        (HERE / f"out2-{ch}-{m}.json").write_text(json.dumps(out, ensure_ascii=False))
        print(ch, m, out.get("stop_reason"), len(out.get("units") or []), "units", (out.get("usage") or {}).get("output_tokens"))


if __name__ == "__main__":
    c = anthropic.Anthropic()
    {"submit": submit, "fetch": fetch}[sys.argv[1]](c, *sys.argv[2:3])
