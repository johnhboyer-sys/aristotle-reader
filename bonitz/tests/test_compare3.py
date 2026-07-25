"""Regression tests for compare3 voting.

The leak these cover: the opus reader and Genie share a blind spot for the
ou-ligature (both write plain upsilon where the print has ȣ), so they form a
wrong 2-1 majority against LlamaParse. Before the fix, such a region was only
flagged when it sat near a Bekker citation, so the same misreading was caught
in one line and silently accepted in the next (page 50-L lines 6 and 50).
"""
import unittest

from bonitz_pipeline.compare3 import Segment, compare


def _region(spine, genie, llama, off):
    """Return the voted region covering spine offset `off`, or None."""
    segs = [Segment(page=50, col='L', start=0, end=len(spine))]
    for r in compare(spine, segs, genie, llama):
        if r['spine_off'] <= off < r['spine_off'] + max(1, len(r['opus'])):
            return r
    return None


class TestLigatureMajority(unittest.TestCase):
    def test_flagged_away_from_citation(self):
        """opus+genie plain upsilon vs llama ligature must flag in prose."""
        spine = 'ἀμετρίαἀκολυθεῖτῇἀνελευθεριότητι'
        genie = 'ἀμετρίαἀκολυθεῖτῇἀνελευθεριότητι'
        llama = 'ἀμετρίαἀκολȣθεῖτῇἀνελευθεριότητι'
        r = _region(spine, genie, llama, spine.index('υθεῖ'))
        self.assertIsNotNone(r, 'no region produced for the ligature disagreement')
        self.assertTrue(r['flag'], f'ligature disagreement not flagged: {r}')

    def test_still_flagged_near_citation(self):
        """The pre-existing near-citation path must keep working."""
        spine = 'Ρα11.1370a15.ἀκολυθεῖτῇἀκολασίᾳ'
        genie = 'Ρα11.1370a15.ἀκολυθεῖτῇἀκολασίᾳ'
        llama = 'Ρα11.1370a15.ἀκολȣθεῖτῇἀκολασίᾳ'
        r = _region(spine, genie, llama, spine.index('υθεῖ'))
        self.assertIsNotNone(r)
        self.assertTrue(r['flag'])

    def test_spine_ligature_genie_expansion_not_flagged(self):
        """Spine has the ligature, Genie expands it — normal, not worth a flag."""
        spine = 'ἀλλότριοιτȣ͂πράγματοςτῆςτέχνης'
        genie = 'ἀλλότριοιτοῦπράγματοςτῆςτέχνης'
        llama = 'ἀλλότριοιτȣ͂πράγματοςτῆςτέχνης'
        r = _region(spine, genie, llama, spine.index('ȣ'))
        self.assertIsNotNone(r)
        self.assertFalse(r['flag'], f'genie expansion should not flag: {r}')

    def test_unrelated_majority_not_over_flagged(self):
        """A non-ligature 2-1 majority in prose stays unflagged (unchanged)."""
        spine = 'τὴνἀορτὴνἔνιαμὲνἀμυδρῶςἔχει'
        genie = 'τὴνἀορτὴνἔνιαμὲνἀμυδρῶςἔχει'
        llama = 'τὴνἀορτὴνἔνιαμὸνἀμυδρῶςἔχει'
        r = _region(spine, genie, llama, spine.index('μὲν') + 1)
        self.assertIsNotNone(r)
        self.assertFalse(r['flag'], f'unrelated majority region should not flag: {r}')


if __name__ == '__main__':
    unittest.main()
