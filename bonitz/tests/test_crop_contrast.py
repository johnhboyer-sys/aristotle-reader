"""The crop John rules from is the ink, unmodified.

⚠ EVERY COLOUR TRICK THIS PAGE HAS TRIED HAS DAMAGED THE CROP. Greyscale
killed the pointer; a fixed palette blotched the paper; an adaptive one lost
the wash; fourteen greys with the tint carried by index fixed all three and
hid two more assumptions — that the paper is neutral (these columns are cream,
r-b = 35, so 94% of every crop was called tinted) and that the ink owns enough
pixels to survive median-cut (the running head at 127-R:1 is 1.19% ink, and
came back at grey 123 where the scan holds 30).

John saw that card on 2026-09-01 — "the actual fuck? ... is that bleed
through???" — and ruled the whole class out: "just give the crop with no
highlight or enhancement."

So the test is not that the encoder degrades gracefully. It is that it does
not touch the image at all.
"""
from __future__ import annotations

import base64
import io

from PIL import Image

from bonitz_pipeline import settle_review
from bonitz_pipeline.book_review import _b64

PAPER = (243, 236, 208)     # measured off work/kraken400/read/cols
INK = (40, 38, 32)


def _crop():
    im = Image.new('RGB', (200, 40), PAPER)
    px = im.load()
    for y in range(18, 22):
        for x in range(20, 60):
            px[x, y] = INK
    return im


def test_the_crop_survives_the_encoder_pixel_for_pixel():
    src = _crop()
    got = Image.open(io.BytesIO(base64.b64decode(_b64(src)))).convert('RGB')
    assert got.size == src.size
    assert list(got.getdata()) == list(src.convert('RGB').getdata()), (
        'the encoder altered the scan — the crop is evidence, not a picture')


def test_none_encodes_to_nothing():
    assert _b64(None) == ''


def test_the_wash_is_off():
    """⚠ A DEFAULT, NOT A DELETION. `_mark_word` and its three predecessors
    are kept, with the reasoning each of them failed for; the tint is off
    because John asked for the bare crop, and this records that it stays off
    until he asks otherwise."""
    assert settle_review.MARK_WORD is False
