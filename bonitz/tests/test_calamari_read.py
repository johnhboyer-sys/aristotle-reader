"""The guards on the calamari read path — every one of them a real failure.

Cutting line images the wrong way has produced a published number twice
(37.8% CER on 2026-08-22, noise on 2026-08-25). What makes those runs
recoverable is not care; it is that each check below refuses.
"""

import subprocess
from pathlib import Path

import pytest

from bonitz_pipeline import calamari_read as cr


ROOT = Path(__file__).resolve().parent.parent


def _arrow(monkeypatch, rows):
    """Stand in for the compiled arrow: `dump_lines` reads rows, not a file."""
    class _Col:
        def to_pylist(self):
            return rows

    class _Table:
        def column(self, name):
            assert name == 'lines'
            return _Col()

    class _Reader:
        def read_all(self):
            return _Table()

    class _Src:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def seek(self, n):
            pass

    import sys
    import types
    pa = types.ModuleType('pyarrow')
    pa.memory_map = lambda *a, **k: _Src()
    pa.ArrowInvalid = type('ArrowInvalid', (Exception,), {})
    ipc = types.ModuleType('pyarrow.ipc')
    ipc.open_file = lambda src: _Reader()
    monkeypatch.setitem(sys.modules, 'pyarrow', pa)
    monkeypatch.setitem(sys.modules, 'pyarrow.ipc', ipc)


PNG = (b'\x89PNG\r\n\x1a\n' + b'\x00' * 8)


def test_dump_refuses_when_the_arrow_lost_a_line(tmp_path, monkeypatch):
    # `ketos compile --skip-empty-lines` is the default: one blank line and
    # every index after it lands on its neighbour.
    _arrow(monkeypatch, [{'im': PNG, 'text': 'alpha'},
                         {'im': PNG, 'text': 'gamma'}])
    with pytest.raises(cr.ReadError) as e:
        cr.dump_lines(tmp_path / 'lines.arrow', tmp_path / 'out',
                      ['alpha', 'beta', 'gamma'])
    assert 'against 3 kept' in str(e.value)


def test_dump_refuses_when_a_row_is_not_its_expected_line(tmp_path, monkeypatch):
    _arrow(monkeypatch, [{'im': PNG, 'text': 'alpha'},
                         {'im': PNG, 'text': 'gamma'}])
    with pytest.raises(cr.ReadError) as e:
        cr.dump_lines(tmp_path / 'lines.arrow', tmp_path / 'out',
                      ['alpha', 'beta'])
    assert 'arrow row 1' in str(e.value)


def test_dump_ignores_whitespace_at_the_line_edge(tmp_path, monkeypatch):
    # ketos keeps the ALTO's <SP>; the ALTO parser joins String contents and
    # does not. That is not a line landing on its neighbour.
    _arrow(monkeypatch, [{'im': PNG, 'text': 'alpha '}])
    paths = cr.dump_lines(tmp_path / 'lines.arrow', tmp_path / 'out', ['alpha'])
    assert [p.name for p in paths] == ['00000.png']


def test_compile_refuses_the_empty_arrow_ketos_writes_over_a_missing_image(
        tmp_path, monkeypatch):
    # ketos WARNS and exits 0. Absence rendered as success.
    def fake_run(cmd, **kw):
        return subprocess.CompletedProcess(
            cmd, 0, stdout='WARNING Could not open file cols/page-107-L.png',
            stderr='')

    monkeypatch.setattr(cr.subprocess, 'run', fake_run)
    with pytest.raises(cr.ReadError) as e:
        cr.compile_arrow([tmp_path / 'a.xml'], tmp_path / 'l.arrow', tmp_path)
    assert 'EMPTY' in str(e.value)


def test_predict_refuses_when_calamari_prints_no_confidence(tmp_path, monkeypatch):
    def fake_run(cmd, **kw):
        return subprocess.CompletedProcess(cmd, 0, stdout='done', stderr='')

    monkeypatch.setattr(cr.subprocess, 'run', fake_run)
    models = tmp_path / 'models'
    (models).mkdir()
    (models / '0.ckpt').write_text('x')
    with pytest.raises(cr.ReadError) as e:
        cr.predict([tmp_path / '00000.png'], models, tmp_path / 'pred',
                   Path('calamari-predict'), tmp_path / 'predict.log')
    assert 'canary' in str(e.value)


def test_predict_reads_the_confidence_calamari_reports(tmp_path, monkeypatch):
    def fake_run(cmd, **kw):
        return subprocess.CompletedProcess(
            cmd, 0, stdout='Average sentence confidence: 68.85%', stderr='')

    monkeypatch.setattr(cr.subprocess, 'run', fake_run)
    models = tmp_path / 'models'
    models.mkdir()
    (models / '0.ckpt').write_text('x')
    pred = tmp_path / 'pred'
    pred.mkdir()
    (pred / '00000.pred.txt').write_text('σέν , εξν ηεόόγοι', encoding='utf-8')
    texts, confidence = cr.predict(
        [tmp_path / '00000.png'], models, pred,
        Path('calamari-predict'), tmp_path / 'predict.log')
    # The number that caught the hand-cut crops, against 99.63% on the holdout.
    assert confidence == pytest.approx(0.6885)
    assert texts == ['σέν , εξν ηεόόγοι']
    assert confidence < cr.MIN_CONFIDENCE


def test_min_confidence_sits_between_the_two_measured_runs():
    # 99.63% arrow-derived, 68.85% hand-cut. A threshold outside that gap
    # either passes the noise or fails every good read.
    assert 0.6885 < cr.MIN_CONFIDENCE < 0.9963


def test_the_prediction_is_batched_because_the_paths_go_on_the_command_line(
        tmp_path, monkeypatch):
    """`--data.images` takes every path as an argument. 107-117 was 1342 images
    and fit; 118-281 is 19,978, which is 0.74 MB of argv before the environment
    is counted — and the failure comes after the arrow has been built."""
    models = tmp_path / 'm'; models.mkdir()
    (models / '0.ckpt').touch()
    images = [tmp_path / f'{i:05d}.png' for i in range(4500)]
    calls = []

    def fake_run(cmd, capture_output, text):
        n = len(cmd) - cmd.index('--data.images') - 1
        calls.append(n)
        for p in cmd[cmd.index('--data.images') + 1:]:
            out = tmp_path / 'pred' / (Path(p).stem + '.pred.txt')
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text('x', encoding='utf-8')
        class R:
            returncode = 0
            stdout = 'average sentence confidence: 99.00 %'
            stderr = ''
        return R()

    monkeypatch.setattr(cr.subprocess, 'run', fake_run)
    texts, conf = cr.predict(
        images, models, tmp_path / 'pred', tmp_path / 'bin', tmp_path / 'log')
    assert calls == [2000, 2000, 500]
    assert len(texts) == 4500
    assert conf == pytest.approx(0.99)


def test_a_short_last_batch_does_not_count_as_much_as_a_full_one(
        tmp_path, monkeypatch):
    """A plain mean of the batch figures would let 100 lines outvote 2000."""
    models = tmp_path / 'm'; models.mkdir()
    (models / '0.ckpt').touch()
    images = [tmp_path / f'{i:05d}.png' for i in range(2100)]
    seen = iter(['99.00', '50.00'])

    def fake_run(cmd, capture_output, text):
        pct = next(seen)
        for p in cmd[cmd.index('--data.images') + 1:]:
            out = tmp_path / 'pred' / (Path(p).stem + '.pred.txt')
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text('x', encoding='utf-8')
        class R:
            returncode = 0
            stdout = f'average sentence confidence: {pct} %'
            stderr = ''
        return R()

    monkeypatch.setattr(cr.subprocess, 'run', fake_run)
    _, conf = cr.predict(
        images, models, tmp_path / 'pred', tmp_path / 'bin', tmp_path / 'log')
    # 2000 at 99% and 100 at 50% is 96.67%, not the 74.5% a flat mean gives
    assert conf == pytest.approx((2000 * 0.99 + 100 * 0.50) / 2100)


def test_the_line_images_of_a_second_arrow_do_not_overwrite_the_first(
        tmp_path, monkeypatch):
    """`ketos compile` holds every line it cuts — 482 lines peak at 438 MB, so
    19,978 at once wants 10-18 GB and the process is killed with no traceback.
    Compiling in chunks means several arrows fill one image directory, and
    without `start` the second chunk writes over the first chunk's 00000.png.
    """
    import pyarrow as pa

    def fake_arrow(path, rows):
        # ketos writes one `lines` column of {text, im} structs
        t = pa.table({'lines': pa.array(
            [{'text': r[0], 'im': r[1]} for r in rows],
            type=pa.struct([('text', pa.string()), ('im', pa.binary())]))})
        with pa.OSFile(str(path), 'wb') as sink:
            with pa.ipc.new_file(sink, t.schema) as w:
                w.write_table(t)

    a, b = tmp_path / 'a.arrow', tmp_path / 'b.arrow'
    fake_arrow(a, [('one', b'\x01'), ('two', b'\x02')])
    fake_arrow(b, [('three', b'\x03')])
    imgs = tmp_path / 'images'
    first = cr.dump_lines(a, imgs, ['one', 'two'])
    second = cr.dump_lines(b, imgs, ['three'], start=len(first))
    assert [p.name for p in first] == ['00000.png', '00001.png']
    assert [p.name for p in second] == ['00002.png']
    assert (imgs / '00000.png').read_bytes() == b'\x01'
    assert (imgs / '00002.png').read_bytes() == b'\x03'


ALTO_NS = 'http://www.loc.gov/standards/alto/ns-v4#'


def _alto(path, blocks, png):
    """An ALTO whose TextLines sit in several blocks, in a given order."""
    def line(i, y, text):
        return (f'<TextLine ID="l{i}" HPOS="40" VPOS="{int(y) - 30}" '
                f'WIDTH="1200" HEIGHT="40" BASELINE="40 {y} 1240 {y}">'
                f'<String CONTENT="{text}" HPOS="40" VPOS="{int(y) - 30}" '
                f'WIDTH="1200" HEIGHT="40"/></TextLine>')
    body = ''
    n = 0
    for b, lines in enumerate(blocks):
        inner = ''
        for y, text in lines:
            inner += line(n, y, text); n += 1
        body += f'<TextBlock ID="b{b}" HPOS="40" VPOS="0" WIDTH="1200" HEIGHT="3400">{inner}</TextBlock>'
    path.write_text(
        f'<alto xmlns="{ALTO_NS}"><Description><sourceImageInformation>'
        f'<fileName>{png}</fileName></sourceImageInformation></Description>'
        f'<Layout><Page ID="p" WIDTH="1300" HEIGHT="3400" PHYSICAL_IMG_NR="0">'
        f'<PrintSpace HPOS="0" VPOS="0" WIDTH="1300" HEIGHT="3400">{body}'
        f'</PrintSpace></Page></Layout></alto>', encoding='utf-8')


def test_the_filtered_alto_comes_out_in_baseline_order(tmp_path):
    """kraken does not write its TextLines in reading order.

    page-140-R runs by=2833, 3001, 3057, 3113, 2890 — the fifth line belongs
    third. page-144-R keeps a stray mark at y=514 alone in a TextBlock that
    comes FIRST in the file, ahead of a block starting at y=57. `filter_lines`
    sorts by baseline, so the SPINE is in reading order; an ALTO left in
    document order makes `ketos compile` cut the lines in a different one and
    calamari's text keys against kraken's off by two for the rest of the
    column. Sorting inside each block is not enough — the blocks interleave.
    """
    from PIL import Image
    png = tmp_path / 'page-001-L.png'
    Image.new('L', (1300, 3400), 255).save(png)
    src, out = tmp_path / 'in.xml', tmp_path / 'out.xml'
    # evenly led, full width — the only thing wrong here is the ORDER, so
    # nothing is a phantom and nothing should be dropped
    _alto(src, [[(390.0, 'seventh')],
                [(60.0, 'first'), (115.0, 'second'), (170.0, 'third'),
                 (225.0, 'fourth')],
                [(335.0, 'sixth'), (280.0, 'fifth')]], png)
    texts = cr.write_filtered_alto(src, png, out, None, target=None)
    assert texts == ['first', 'second', 'third', 'fourth', 'fifth',
                     'sixth', 'seventh']

    # and the FILE says the same, because that is what ketos reads
    import xml.etree.ElementTree as ET
    doc = [l['content'] for l in cr._line_dicts(ET.parse(out).getroot())]
    assert doc == texts, 'the XML must carry the order, not just the return value'
