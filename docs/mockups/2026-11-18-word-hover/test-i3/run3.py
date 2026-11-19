"""Prompt v3 (v2 + literal crib) on NE I.2 (Rackham), Opus and Sonnet, one Batch.
Approved by John 2026-11-19 ("Run the test"), quoted at 30-40¢.

  env -u ANTHROPIC_API_KEY uv run --with anthropic python run3.py submit
  env -u ANTHROPIC_API_KEY uv run --with anthropic python run3.py fetch    # writes out3-i2-<model>.json
  python3 -I run3.py codex-prompt                                          # writes codex-prompt3-i2.txt
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from prompt_v3 import SCHEMA, prompt

MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"]
EFFORT = "medium"
D = json.loads((HERE.parent / "test-i2" / "i2.json").read_text())
CRIB = json.loads((HERE / "crib" / "crib-i2.json").read_text())
TEXT = prompt(D, "Nicomachean Ethics I.2", CRIB)


def submit(client):
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    reqs = [Request(custom_id=f"i2--{m}", params=MessageCreateParamsNonStreaming(
        model=m, max_tokens=32000,
        output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": TEXT}])) for m in MODELS]
    b = client.messages.batches.create(requests=reqs)
    (HERE / "batch3.json").write_text(json.dumps({"id": b.id, "models": MODELS, "effort": EFFORT}))
    print(b.id, b.processing_status, len(reqs), "requests")


def fetch(client):
    bid = json.loads((HERE / "batch3.json").read_text())["id"]
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
        (HERE / f"out3-{ch}-{m}.json").write_text(json.dumps(out, ensure_ascii=False))
        print(ch, m, out.get("stop_reason"), len(out.get("units") or []), "units", (out.get("usage") or {}).get("output_tokens"))


if __name__ == "__main__":
    if sys.argv[1] == "codex-prompt":
        (HERE / "codex-prompt3-i2.txt").write_text(TEXT); print(len(TEXT), "chars")
    else:
        import anthropic
        {"submit": submit, "fetch": fetch}[sys.argv[1]](anthropic.Anthropic())
