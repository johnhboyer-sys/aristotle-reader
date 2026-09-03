from pathlib import Path

from bonitz_pipeline import compare3, compare4
from bonitz_pipeline.normalize import canonical, clean_opus


ROOT = Path(__file__).resolve().parent.parent


def _column(page, col):
    cleaned = clean_opus(
        (ROOT / f'raw/opus/page-{page:03d}-{col}.txt').read_text(encoding='utf-8')
    )
    stream, offsets = canonical(cleaned)
    return cleaned, stream, offsets


def test_locations_use_the_canonical_offset_map():
    sources = {}
    columns = []
    streams = {}
    for page, col in ((63, 'L'), (69, 'L'), (72, 'L'), (90, 'L')):
        cleaned, stream, offsets = _column(page, col)
        sources[(page, col)] = (cleaned, offsets)
        streams[(page, col)] = stream
        columns.append((page, col, stream))

    spine, segs = compare3.build_spine(columns)
    starts = {(seg.page, seg.col): seg.start for seg in segs}
    cases = [
        (69, 'L', 'ȣ͂', streams[(69, 'L')].index('χαλκȣ͂') + len('χαλκ')),
        (72, 'L', '.12.(ὑ', streams[(72, 'L')].index('.12.(ὑ')),
        (90, 'L', "'αὐ", streams[(90, 'L')].index("δι'αὐτό") + len('δι')),
        (63, 'L', 'ὴΠ', streams[(63, 'L')].index('μεταβλητικὴΠ')
         + len('μεταβλητικ')),
    ]
    records = [
        {
            'page': page,
            'col': col,
            'spine_off': starts[(page, col)] + local,
            'opus': opus,
        }
        for page, col, opus, local in cases
    ]

    compare4.add_locations(records, segs, sources)

    assert (records[0]['line'], records[0]['word']) == (56, 'χαλκȣ͂')
    assert records[0]['char'] == sources[(69, 'L')][0].splitlines()[55].index('ȣ͂')
    assert records[0]['spans_word'] is False
    assert records[0]['spans_line'] is False

    assert records[1]['line'] == 41
    assert records[1]['line_end'] == 42
    assert records[1]['spans_line'] is True

    assert records[2]['spans_word'] is True
    assert records[2]['word'] == 'αὐτό,'

    assert records[3]['spans_word'] is True
    assert records[3]['word'] == 'μεταβλητικὴ'


def test_unbroken_regions_slice_back_to_the_opus_reading():
    cleaned, stream, offsets = _column(69, 'L')
    spine, segs = compare3.build_spine([(69, 'L', stream)])
    record = {
        'page': 69,
        'col': 'L',
        'spine_off': stream.index('χαλκȣ͂') + len('χαλκ'),
        'opus': 'ȣ͂',
    }

    compare4.add_locations(record_list := [record], segs, {(69, 'L'): (cleaned, offsets)})

    located = record_list[0]
    line = cleaned.splitlines()[located['line'] - 1]
    assert line[located['char']:].startswith(located['source_opus'])
    assert canonical(located['source_opus'])[0] == record['opus']


def test_source_slice_records_canonical_folds_and_width_changes():
    cleaned = "’Α o"
    stream, offsets = canonical(cleaned)
    spine, segs = compare3.build_spine([(63, 'L', stream)])
    records = [
        {'page': 63, 'col': 'L', 'spine_off': stream.index('Ἀ'), 'opus': 'Ἀ'},
        {'page': 63, 'col': 'L', 'spine_off': stream.index('ο'), 'opus': 'ο'},
    ]

    compare4.add_locations(records, segs, {(63, 'L'): (cleaned, offsets)})

    assert records[0]['source_opus'] == '’Α'
    assert records[1]['source_opus'] == 'o'
    assert all(canonical(record['source_opus'])[0] == record['opus']
               for record in records)


def test_empty_opus_at_column_end_has_an_empty_source_slice():
    cleaned = 'τέλος'
    stream, offsets = canonical(cleaned)
    spine, segs = compare3.build_spine([(63, 'L', stream)])
    record = {
        'page': 63,
        'col': 'L',
        'spine_off': len(spine),
        'opus': '',
    }

    compare4.add_locations([record], segs, {(63, 'L'): (cleaned, offsets)})

    assert record['char'] == len(cleaned)
    assert record['source_opus'] == ''
    assert record['spans_word'] is False
    assert record['spans_line'] is False
