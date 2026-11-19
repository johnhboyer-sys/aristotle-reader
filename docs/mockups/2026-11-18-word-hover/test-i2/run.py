"""Word-align NE I.2 (Greek) to Rackham with three models via the Batch API.

  uv run --with anthropic python run.py submit   # writes batch.json
  uv run --with anthropic python run.py fetch    # writes out-<model>.json
"""
import json, sys
from pathlib import Path

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

HERE = Path(__file__).parent
MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]
EFFORT = "medium"

INSTRUCTIONS = """You are aligning an ancient Greek text with an English translation, word by word, for a bilingual reader. When a reader points at a Greek word, the English words that translate it will light up, and the reverse.

Every Greek token has an id (column, Bekker line, token number). Every English word has a number. For each Greek token, list the numbers of the English words that render it.

Rules:
- Link a Greek word to every English word that carries its meaning in this translation, including words the translator needed to render it (a Greek verb may become "it has been said"; a genitive may become "of the").
- Articles: link the Greek article to "the" (or "a", "this") when the English renders it; otherwise leave it unlinked.
- Leave a Greek token unlinked (omit it) when the translation does not render it: particles like μέν, δέ, γάρ, τε, οὖν, δή are often untranslated.
- Do not link English words the translator added with no Greek behind them (glosses, expansions, "I say"); leave those English words out of every link.
- An English word may belong to more than one Greek word only when it really renders both.
- Follow the meaning, not the position: translators reorder freely.

Return JSON: {"links": [{"g": "<greek id>", "e": [<english word numbers>]}]}. One entry per linked Greek token; omit unlinked tokens."""

SCHEMA = {
    "type": "object",
    "properties": {
        "links": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "g": {"type": "string"},
                    "e": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["g", "e"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["links"],
    "additionalProperties": False,
}


def prompt(d):
    greek_text = "\n".join(f"{k}: {v}" for k, v in d["lines"].items())
    toks = "\n".join(f"{gid} {form}" for gid, form in d["greek"])
    words = " ".join(f"{i}:{w}" for i, w in enumerate(d["words"]))
    return (f"{INSTRUCTIONS}\n\n<greek_lines>\n{greek_text}\n</greek_lines>\n\n"
            f"Align only these Greek tokens (Nicomachean Ethics I.2):\n<greek_tokens>\n{toks}\n</greek_tokens>\n\n"
            f"<english_text>\n{d['english']}\n</english_text>\n\n"
            f"<english_words>\n{words}\n</english_words>")


def submit(client, d):
    reqs = [Request(custom_id=m, params=MessageCreateParamsNonStreaming(
                model=m, max_tokens=32000,
                output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content": prompt(d)}]))
            for m in MODELS]
    b = client.messages.batches.create(requests=reqs)
    (HERE / "batch.json").write_text(json.dumps({"id": b.id, "models": MODELS, "effort": EFFORT}))
    print(b.id, b.processing_status)


def fetch(client):
    bid = json.loads((HERE / "batch.json").read_text())["id"]
    b = client.messages.batches.retrieve(bid)
    print(bid, b.processing_status, b.request_counts)
    if b.processing_status != "ended":
        return
    for r in client.messages.batches.results(bid):
        out = {"type": r.result.type}
        if r.result.type == "succeeded":
            msg = r.result.message
            out["stop_reason"] = msg.stop_reason
            out["usage"] = msg.usage.model_dump()
            text = next((x.text for x in msg.content if x.type == "text"), "")
            out["links"] = json.loads(text)["links"] if text else None
        else:
            out["error"] = str(r.result)
        (HERE / f"out-{r.custom_id}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
        print(r.custom_id, out["type"], out.get("stop_reason"), out.get("usage"))


if __name__ == "__main__":
    client = anthropic.Anthropic()
    d = json.loads((HERE / "i2.json").read_text())
    {"submit": lambda: submit(client, d), "fetch": lambda: fetch(client)}[sys.argv[1]]()
