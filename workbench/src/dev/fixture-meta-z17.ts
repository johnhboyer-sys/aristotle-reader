// Dev fixture — Metaphysics Ζ.17 (book 7, Bekker 1041a6–1041b33).
//
// REAL data: the 61 Greek lines below were extracted read-only from the main
// checkout's pipeline output (build/dist/Meta/book-07.json, {address, text}
// pairs only; chapter boundary confirmed against build/dist/Meta/chapters.json:
// Ζ.17 = 1041a6–1041b33, the last chapter of book Ζ). English rows start empty
// — this chapter exists so the row-lock editor has a real spine to type
// against before the corpus data layer lands.
import type { Address, SchemeId } from '../lib/citation/types';

const SCHEME: SchemeId = 'bekker-metaphysics';

export interface FixtureLine {
  address: Address;
  greek: string;
}

export interface FixtureChapter {
  workId: string;
  workTitle: string;
  author: string;
  scheme: SchemeId;
  /** 1-based index into the work's book list (Ζ = 7). */
  book: number;
  bookLabel: string;
  chapter: number;
  /** Display-only range label; formatting via CitationScheme comes later. */
  bekkerRange: string;
  lines: FixtureLine[];
}

export const META_Z17: FixtureChapter = {
  workId: 'meta',
  workTitle: 'Metaphysics',
  author: 'Aristotle',
  scheme: SCHEME,
  book: 7,
  bookLabel: 'Ζ',
  chapter: 17,
  bekkerRange: '1041a6–1041b33',
  lines: [
  { address: { scheme: SCHEME, raw: "1041a6" }, greek: "Τί δὲ χρὴ λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν, πάλιν" },
  { address: { scheme: SCHEME, raw: "1041a7" }, greek: "ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν· ἴσως γὰρ ἐκ τούτων" },
  { address: { scheme: SCHEME, raw: "1041a8" }, greek: "ἔσται δῆλον καὶ περὶ ἐκείνης τῆς οὐσίας ἥτις ἐστὶ κεχωρισμένη" },
  { address: { scheme: SCHEME, raw: "1041a9" }, greek: "τῶν αἰσθητῶν οὐσιῶν. ἐπεὶ οὖν ἡ οὐσία ἀρχὴ καὶ" },
  { address: { scheme: SCHEME, raw: "1041a10" }, greek: "αἰτία τις ἐστίν, ἐντεῦθεν μετιτέον. ζητεῖται δὲ τὸ διὰ τί" },
  { address: { scheme: SCHEME, raw: "1041a11" }, greek: "ἀεὶ οὕτως, διὰ τί ἄλλο ἄλλῳ τινὶ ὑπάρχει. τὸ γὰρ ζητεῖν" },
  { address: { scheme: SCHEME, raw: "1041a12" }, greek: "διὰ τί ὁ μουσικὸς ἄνθρωπος μουσικὸς ἄνθρωπός ἐστιν," },
  { address: { scheme: SCHEME, raw: "1041a13" }, greek: "ἤτοι ἐστὶ τὸ εἰρημένον ζητεῖν, διὰ τί ὁ ἄνθρωπος μουσικός" },
  { address: { scheme: SCHEME, raw: "1041a14" }, greek: "ἐστιν, ἢ ἄλλο. τὸ μὲν οὖν διὰ τί αὐτό ἐστιν αὐτό, οὐδέν ἐστι" },
  { address: { scheme: SCHEME, raw: "1041a15" }, greek: "ζητεῖν (δεῖ γὰρ τὸ ὅτι καὶ τὸ εἶναι ὑπάρχειν δῆλα ὄντα" },
  { address: { scheme: SCHEME, raw: "1041a16" }, greek: "—λέγω δ' οἷον ὅτι ἡ σελήνη ἐκλείπει—, αὐτὸ δὲ ὅτι αὐτό," },
  { address: { scheme: SCHEME, raw: "1041a17" }, greek: "εἷς λόγος καὶ μία αἰτία ἐπὶ πάντων, διὰ τί ὁ ἄνθρωπος" },
  { address: { scheme: SCHEME, raw: "1041a18" }, greek: "ἄνθρωπος ἢ ὁ μουσικὸς μουσικός, πλὴν εἴ τις λέγοι ὅτι ἀδιαίρετον" },
  { address: { scheme: SCHEME, raw: "1041a19" }, greek: "πρὸς αὑτὸ ἕκαστον, τοῦτο δ' ἦν τὸ ἑνὶ εἶναι· ἀλλὰ τοῦτο" },
  { address: { scheme: SCHEME, raw: "1041a20" }, greek: "κοινόν γε κατὰ πάντων καὶ σύντομον)· ζητήσειε δ' ἄν τις" },
  { address: { scheme: SCHEME, raw: "1041a21" }, greek: "διὰ τί ἅνθρωπός ἐστι ζῷον τοιονδί. τοῦτο μὲν τοίνυν" },
  { address: { scheme: SCHEME, raw: "1041a22" }, greek: "δῆλον, ὅτι οὐ ζητεῖ διὰ τί ὅς ἐστιν ἄνθρωπος ἄνθρωπός ἐστιν·" },
  { address: { scheme: SCHEME, raw: "1041a23" }, greek: "τὶ ἄρα κατά τινος ζητεῖ διὰ τί ὑπάρχει (ὅτι δ' ὑπάρχει," },
  { address: { scheme: SCHEME, raw: "1041a24" }, greek: "δεῖ δῆλον εἶναι· εἰ γὰρ μὴ οὕτως, οὐδὲν ζητεῖ), οἷον διὰ τί" },
  { address: { scheme: SCHEME, raw: "1041a25" }, greek: "βροντᾷ; διὰ τί ψόφος γίγνεται ἐν τοῖς νέφεσιν; ἄλλο γὰρ" },
  { address: { scheme: SCHEME, raw: "1041a26" }, greek: "οὕτω κατ' ἄλλου ἐστὶ τὸ ζητούμενον. καὶ διὰ τί ταδί, οἷον" },
  { address: { scheme: SCHEME, raw: "1041a27" }, greek: "πλίνθοι καὶ λίθοι, οἰκία ἐστίν; φανερὸν τοίνυν ὅτι ζητεῖ τὸ" },
  { address: { scheme: SCHEME, raw: "1041a28" }, greek: "αἴτιον· τοῦτο δ' ἐστὶ τὸ τί ἦν εἶναι, ὡς εἰπεῖν λογικῶς, ὃ" },
  { address: { scheme: SCHEME, raw: "1041a29" }, greek: "ἐπ' ἐνίων μέν ἐστι τίνος ἕνεκα, οἷον ἴσως ἐπ' οἰκίας ἢ κλίνης," },
  { address: { scheme: SCHEME, raw: "1041a30" }, greek: "ἐπ' ἐνίων δὲ τί ἐκίνησε πρῶτον· αἴτιον γὰρ καὶ τοῦτο." },
  { address: { scheme: SCHEME, raw: "1041a31" }, greek: "ἀλλὰ τὸ μὲν τοιοῦτον αἴτιον ἐπὶ τοῦ γίγνεσθαι ζητεῖται καὶ" },
  { address: { scheme: SCHEME, raw: "1041a32" }, greek: "φθείρεσθαι, θάτερον δὲ καὶ ἐπὶ τοῦ εἶναι. λανθάνει δὲ μάλιστα" },
  { address: { scheme: SCHEME, raw: "1041a33" }, greek: "τὸ ζητούμενον ἐν τοῖς μὴ κατ' ἀλλήλων λεγομένοις," },
  { address: { scheme: SCHEME, raw: "1041b1" }, greek: "οἷον ἄνθρωπος τί ἐστι ζητεῖται διὰ τὸ ἁπλῶς λέγεσθαι" },
  { address: { scheme: SCHEME, raw: "1041b2" }, greek: "ἀλλὰ μὴ διορίζειν ὅτι τάδε τόδε. ἀλλὰ δεῖ διαρθρώσαντας" },
  { address: { scheme: SCHEME, raw: "1041b3" }, greek: "ζητεῖν· εἰ δὲ μή, κοινὸν τοῦ μηθὲν ζητεῖν καὶ τοῦ" },
  { address: { scheme: SCHEME, raw: "1041b4" }, greek: "ζητεῖν τι γίγνεται. ἐπεὶ δὲ δεῖ ἔχειν τε καὶ ὑπάρχειν τὸ" },
  { address: { scheme: SCHEME, raw: "1041b5" }, greek: "εἶναι, δῆλον δὴ ὅτι τὴν ὕλην ζητεῖ διὰ τί <τί> ἐστιν· οἷον" },
  { address: { scheme: SCHEME, raw: "1041b6" }, greek: "οἰκία ταδὶ διὰ τί; ὅτι ὑπάρχει ὃ ἦν οἰκίᾳ εἶναι. καὶ ἄνθρωπος" },
  { address: { scheme: SCHEME, raw: "1041b7" }, greek: "τοδί, ἢ τὸ σῶμα τοῦτο τοδὶ ἔχον. ὥστε τὸ αἴτιον" },
  { address: { scheme: SCHEME, raw: "1041b8" }, greek: "ζητεῖται τῆς ὕλης (τοῦτο δ' ἐστὶ τὸ εἶδος) ᾧ τί ἐστιν· τοῦτο" },
  { address: { scheme: SCHEME, raw: "1041b9" }, greek: "δ' ἡ οὐσία. φανερὸν τοίνυν ὅτι ἐπὶ τῶν ἁπλῶν οὐκ ἔστι ζήτησις" },
  { address: { scheme: SCHEME, raw: "1041b10" }, greek: "οὐδὲ δίδαξις, ἀλλ' ἕτερος τρόπος τῆς ζητήσεως τῶν τοιούτων." },
  { address: { scheme: SCHEME, raw: "1041b11" }, greek: "—ἐπεὶ δὲ τὸ ἔκ τινος σύνθετον οὕτως ὥστε ἓν εἶναι τὸ πᾶν," },
  { address: { scheme: SCHEME, raw: "1041b12" }, greek: "[ἂν] μὴ ὡς σωρὸς ἀλλ' ὡς ἡ συλλαβή—ἡ δὲ συλλαβὴ" },
  { address: { scheme: SCHEME, raw: "1041b13" }, greek: "οὐκ ἔστι τὰ στοιχεῖα, οὐδὲ τῷ βα ταὐτὸ τὸ β καὶ α, οὐδ'" },
  { address: { scheme: SCHEME, raw: "1041b14" }, greek: "ἡ σὰρξ πῦρ καὶ γῆ (διαλυθέντων γὰρ τὰ μὲν οὐκέτι ἔστιν," },
  { address: { scheme: SCHEME, raw: "1041b15" }, greek: "οἷον ἡ σὰρξ καὶ ἡ συλλαβή, τὰ δὲ στοιχεῖα ἔστι, καὶ τὸ" },
  { address: { scheme: SCHEME, raw: "1041b16" }, greek: "πῦρ καὶ ἡ γῆ)· ἔστιν ἄρα τι ἡ συλλαβή, οὐ μόνον τὰ στοιχεῖα" },
  { address: { scheme: SCHEME, raw: "1041b17" }, greek: "τὸ φωνῆεν καὶ ἄφωνον ἀλλὰ καὶ ἕτερόν τι, καὶ ἡ" },
  { address: { scheme: SCHEME, raw: "1041b18" }, greek: "σὰρξ οὐ μόνον πῦρ καὶ γῆ ἢ τὸ θερμὸν καὶ ψυχρὸν" },
  { address: { scheme: SCHEME, raw: "1041b19" }, greek: "ἀλλὰ καὶ ἕτερόν τι—εἰ τοίνυν ἀνάγκη κἀκεῖνο ἢ στοιχεῖον" },
  { address: { scheme: SCHEME, raw: "1041b20" }, greek: "ἢ ἐκ στοιχείων εἶναι, εἰ μὲν στοιχεῖον, πάλιν ὁ αὐτὸς ἔσται" },
  { address: { scheme: SCHEME, raw: "1041b21" }, greek: "λόγος (ἐκ τούτου γὰρ καὶ πυρὸς καὶ γῆς ἔσται ἡ σὰρξ καὶ" },
  { address: { scheme: SCHEME, raw: "1041b22" }, greek: "ἔτι ἄλλου, ὥστ' εἰς ἄπειρον βαδιεῖται)· εἰ δὲ ἐκ στοιχείου," },
  { address: { scheme: SCHEME, raw: "1041b23" }, greek: "δῆλον ὅτι οὐχ ἑνὸς ἀλλὰ πλειόνων, ἢ ἐκεῖνο αὐτὸ ἔσται," },
  { address: { scheme: SCHEME, raw: "1041b24" }, greek: "ὥστε πάλιν ἐπὶ τούτου τὸν αὐτὸν ἐροῦμεν λόγον καὶ ἐπὶ τῆς" },
  { address: { scheme: SCHEME, raw: "1041b25" }, greek: "σαρκὸς ἢ συλλαβῆς. δόξειε δ' ἂν εἶναι τὶ τοῦτο καὶ οὐ" },
  { address: { scheme: SCHEME, raw: "1041b26" }, greek: "στοιχεῖον, καὶ αἴτιόν γε τοῦ εἶναι τοδὶ μὲν σάρκα τοδὶ δὲ" },
  { address: { scheme: SCHEME, raw: "1041b27" }, greek: "συλλαβήν· ὁμοίως δὲ καὶ ἐπὶ τῶν ἄλλων. οὐσία δὲ ἑκάστου" },
  { address: { scheme: SCHEME, raw: "1041b28" }, greek: "μὲν τοῦτο (τοῦτο γὰρ αἴτιον πρῶτον τοῦ εἶναι)—ἐπεὶ δ' ἔνια" },
  { address: { scheme: SCHEME, raw: "1041b29" }, greek: "οὐκ οὐσίαι τῶν πραγμάτων, ἀλλ' ὅσαι οὐσίαι, κατὰ φύσιν" },
  { address: { scheme: SCHEME, raw: "1041b30" }, greek: "καὶ φύσει συνεστήκασι, φανείη ἂν [καὶ] αὕτη ἡ φύσις οὐσία," },
  { address: { scheme: SCHEME, raw: "1041b31" }, greek: "ἥ ἐστιν οὐ στοιχεῖον ἀλλ' ἀρχή—· στοιχεῖον δ' ἐστὶν εἰς ὃ" },
  { address: { scheme: SCHEME, raw: "1041b32" }, greek: "διαιρεῖται ἐνυπάρχον ὡς ὕλην, οἷον τῆς συλλαβῆς τὸ α" },
  { address: { scheme: SCHEME, raw: "1041b33" }, greek: "καὶ τὸ β." },
  ],
};
