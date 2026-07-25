import unittest

from bonitz_pipeline.normalize import (
    _latex_to_plain, canonical, clean_genie, clean_llamaparse, fold,
)


class TestLatex(unittest.TestCase):
    def test_greek_names(self):
        self.assertEqual(_latex_to_plain(r'$\mu\beta$ 8.'), 'μβ 8.')

    def test_superscript(self):
        self.assertEqual(_latex_to_plain('1456 $^b$ 27'), '1456 b 27')

    def test_text_superscript(self):
        self.assertEqual(_latex_to_plain(r'$^\text{b}$18'), 'b18')

    def test_mixed(self):
        self.assertEqual(
            _latex_to_plain(r'$\alpha$ φωνῆεν $\pi o$ 20.'),
            'α φωνῆεν πo 20.')


class TestCleanGenie(unittest.TestCase):
    def test_junk_dropped(self):
        paras = ['---', '189', 'B 2', 'ἀγορανομία — ἀγών',
                 'διασπᾶν τὸ ὀρεκτικόν ψγ 9. 432 $^b$5.']
        self.assertEqual(clean_genie(paras),
                         'διασπᾶν τὸ ὀρεκτικόν ψγ 9. 432 b5.')

    def test_italic_underscores(self):
        self.assertEqual(clean_genie(['κ_αὶ_ καθόλ_ο_υ x1']),
                         'καὶ καθόλου x1')

    def test_unicode_superscripts(self):
        self.assertEqual(clean_genie(['1179 ᵇ18 x']), '1179 b18 x')


class TestCleanLlamaparse(unittest.TestCase):
    def test_markup(self):
        text = '===== PAGE 1 =====\nA\n**ἀασμός**, 1458 <sup>a</sup>12.\nA 2'
        self.assertEqual(clean_llamaparse(text), 'ἀασμός, 1458 a12.')


class TestCanonical(unittest.TestCase):
    def test_whitespace_removed_and_mapped(self):
        stream, offs = canonical('367 b2.\nὁ ἀάζων')
        self.assertEqual(stream, '367b2.ὁἀάζων')
        self.assertEqual(len(offs), len(stream))
        self.assertEqual(offs[0], 0)
        self.assertEqual(offs[3], 4)      # 'b' sits after the space

    def test_citation_spacing_collapses(self):
        a, _ = canonical('1458 a12')
        b, _ = canonical('1458a12')
        self.assertEqual(a, b)


class TestFold(unittest.TestCase):
    def test_raw_ou_vs_expanded(self):
        self.assertEqual(fold('τȣ̃'), fold('τοῦ'))
        self.assertEqual(fold('ἀθρόȣ'), fold('ἀθρόου'))

    def test_kai_ligature(self):
        self.assertEqual(fold('ϗ'), fold('καὶ'))
        self.assertEqual(fold('ϗ'), fold('καί'))

    def test_final_sigma_and_case(self):
        self.assertEqual(fold('Ἄβαντες'), fold('ἄβαντεσ'))

    def test_real_difference_survives(self):
        self.assertNotEqual(fold('τὰς'), fold('τοὺς'))
        self.assertNotEqual(fold('1456b27'), fold('1456b21'))


if __name__ == '__main__':
    unittest.main()


class TestGenieTableRows(unittest.TestCase):
    def test_deinterleave(self):
        paras = ['κεφ α x1 | δεξ α y1',
                 'κεφ α x2 | 5 δεξ α y2',
                 'μετα']
        self.assertEqual(
            clean_genie(paras).splitlines(),
            ['κεφ α x1', 'κεφ α x2', 'δεξ α y1', 'δεξ α y2', 'μετα'])

    def test_chapter_ref_kept(self):
        paras = ['15. 1248b29 | 7 κειμενο']
        self.assertEqual(clean_genie(paras).splitlines(),
                         ['15. 1248b29', '7 κειμενο'])


class TestScaleFolds(unittest.TestCase):
    def test_theta_variant(self):
        a, _ = canonical('ϑάλαττα')
        b, _ = canonical('θάλαττα')
        self.assertEqual(a, b)

    def test_apostrophe_breathing(self):
        a, _ = canonical("'Αγάθων")
        b, _ = canonical('Ἀγάθων')
        self.assertEqual(a, b)

    def test_elision_before_breathed_capital_kept(self):
        a, _ = canonical("ἐπ'Ἀγαμέμνονος")
        self.assertIn("'Ἀ", a)
