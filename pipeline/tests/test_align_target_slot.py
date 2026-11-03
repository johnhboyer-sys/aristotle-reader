"""default_target aligns a work's secondary translation when it has one (the NE
pattern: Bekker-milestoned primary, unmarked secondary). ALIGN_SLOT=primary aligns
the primary instead, for works whose main translation is the unmarked one: EE's
Solomon (not the gated Rackham secondary), Topics' Pickard-Cambridge (not Owen)."""
import pytest

from aristotle_pipeline.align.reference import default_target


def test_unset_follows_the_secondary(monkeypatch):
    monkeypatch.delenv("ALIGN_SLOT", raising=False)
    assert default_target("EE")[0] == "rackham"


def test_primary_slot_takes_the_primary(monkeypatch):
    monkeypatch.setenv("ALIGN_SLOT", "primary")
    vid, prose = default_target("EE")
    assert vid == "solomon"
    assert prose and all(t.strip() for t in prose.values())


def test_a_misspelt_slot_raises(monkeypatch):
    monkeypatch.setenv("ALIGN_SLOT", "primay")
    with pytest.raises(ValueError):
        default_target("EE")


def test_primary_slot_on_a_work_without_a_primary_source_raises(monkeypatch):
    # EN's primary is Perseus Rackham (no sources/ dir): without the guard this
    # silently fell through to NE Ross.
    monkeypatch.setenv("ALIGN_SLOT", "primary")
    with pytest.raises(ValueError):
        default_target("EN")


def test_a_secondary_is_parsed_by_its_chapter_marker(monkeypatch):
    # Owen marks chapters "Part N" (chapter_marker: part); read as the default
    # "number" marker, every chapter came back empty.
    monkeypatch.delenv("ALIGN_SLOT", raising=False)
    vid, prose = default_target("Top")
    assert vid == "owen"
    assert len(prose) > 50 and all(t.strip() for t in prose.values())
