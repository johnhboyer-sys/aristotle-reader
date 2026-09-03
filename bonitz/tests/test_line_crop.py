"""Cropping a tranche that has line images and no column image.

Pages 107+ were read line by line out of the compiled arrow, so there is no
column PNG to place an ALTO box against — `crop_at_offset` fell straight
through to `how='none'`, and a site with no crop is a site John cannot rule on.
The book review had two of them.
"""

import json

import pytest

from bonitz_pipeline import settle_review as sr


@pytest.fixture
def read_dir(tmp_path, monkeypatch):
    """A read directory shaped like `work/calamari/read107-112`."""
    from PIL import Image
    d = tmp_path / 'read107-112'
    (d / 'images').mkdir(parents=True)
    cols = {'page-107-L': ['alpha one', 'alpha two'],
            'page-107-R': ['beta one', 'Ηζ4. 1102a26 beta two']}
    (d / 'read.json').write_text(json.dumps({'columns': cols}),
                                 encoding='utf-8')
    for i in range(4):
        Image.new('RGB', (400, 40), (255, 255, 255)).save(
            d / 'images' / f'{i:05d}.png')
    monkeypatch.setattr(sr, 'LINE_READS', (d,))
    sr._line_read_index.cache_clear()
    yield d
    sr._line_read_index.cache_clear()


def test_the_index_follows_the_arrows_own_order(read_dir):
    """⚠ NOT A GUESS ABOUT WHICH LINE AN IMAGE SHOWS. The images were cut in
    column order, and `read.json` lists the columns in that order, so the map
    is exact — which is what lets the crop be trusted at all."""
    idx = sr._line_read_index()
    assert idx[('page-107-L', 1)][0].name == '00000.png'
    assert idx[('page-107-L', 2)][0].name == '00001.png'
    assert idx[('page-107-R', 1)][0].name == '00002.png'
    assert idx[('page-107-R', 2)][0].name == '00003.png'
    assert idx[('page-107-R', 2)][1] == 'Ηζ4. 1102a26 beta two'


def test_a_line_image_tranche_yields_a_crop_rather_than_none(read_dir):
    im, score, how = sr.crop_at_offset(107, 'R', 2, 'Ηζ', 0)
    assert im is not None, 'the site would be unrulable'
    assert how == 'line'


def test_the_score_answers_whether_the_target_is_on_the_line(read_dir):
    """⚠ NOT STRING SIMILARITY. A six-character token against a sixty-character
    line scores 0.08 however perfectly the crop is placed, and a review page
    printing that teaches its reader to distrust a good crop."""
    assert sr.crop_at_offset(107, 'R', 2, 'Ηζ', 0)[1] == 1.0
    assert sr.crop_at_offset(107, 'R', 2, 'ξξξξ', 0)[1] < 1.0


def test_the_target_is_matched_in_the_fold(read_dir):
    """`canonical` conflates Latin `H` with Greek `Η`, and the tranche this
    serves is half Latin."""
    assert sr.crop_at_offset(107, 'R', 2, 'Hζ', 0)[1] == 1.0


def test_a_line_the_read_does_not_hold_falls_through(read_dir):
    """Line 3 of a two-line column is not a line. It must not borrow line 2's
    image — being on the wrong line is what the review page forbids."""
    im, _, how = sr.crop_at_offset(107, 'R', 3, 'Ηζ', 0)
    assert how == 'none' and im is None


def test_a_column_no_read_holds_falls_through(read_dir):
    assert sr.crop_at_offset(900, 'L', 1, 'x', 0)[2] == 'none'
