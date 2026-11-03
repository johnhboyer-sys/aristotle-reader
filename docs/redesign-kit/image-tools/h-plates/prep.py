#!/usr/bin/env python3
"""Prepare the plates for direction H.

Each picture is a print: ink on paper. We take the scan, flatten the paper
tone (stains, yellowing, uneven light), and keep only the ink, as a grey
mask: white where the ink is, black where the paper is. The page then
prints that mask in one ink with CSS (mask-mode: luminance), so one file
serves light and dark, any ink colour.

usage:
  prep.py ID [ID ...]        build the listed plates (or 'all')
  prep.py --proof ID         also write an ink-on-paper proof to scratchpad/proof/
Crops are given as fractions of the source: (left, top, right, bottom).
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.dirname(HERE)
DL = os.path.join(SCR, 'dl')
OUT = os.path.join(SCR, 'kit', 'dirs', 'h', 'img')
PROOF = os.path.join(SCR, 'proof')

# id: source, crops (desk, phone, and an optional 'home' variant), tuning.
#   lo/hi: where ink ends and paper begins, as fractions of the flattened
#   paper level (ratio below lo is full ink, above hi is clean paper).
#   gamma < 1 keeps more of the fine hatching.
SPEC = json.load(open(os.path.join(HERE, 'plates.json')))


def load(path):
    im = Image.open(os.path.join(DL, path))
    im = im.convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255.0
    # Ink is dark in every channel; old paper is yellow, so its blue channel
    # is low. Red and green separate ink from paper best.
    return 0.5 * a[..., 0] + 0.5 * a[..., 1]


def flatten(L, k=24):
    """Divide by an estimate of the bare paper: the local maximum (paper
    shows between the lines), blurred. Works at a small scale for speed."""
    h, w = L.shape
    if k >= 200:
        # Tonal prints (aquatint, mezzotint-like grounds): one paper level
        # for the whole sheet, so the tone of the ground stays.
        return np.clip(L / max(0.05, float(np.percentile(L, 99.5))), 0, 1.5)
    small = Image.fromarray((L * 255).astype(np.uint8)).resize((max(8, w // k), max(8, h // k)), Image.BILINEAR)
    small = small.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
    bg = np.asarray(small.resize((w, h), Image.BICUBIC)).astype(np.float32) / 255.0
    return np.clip(L / np.maximum(bg, 0.05), 0, 1.5)


def ink(R, lo, hi, gamma):
    t = np.clip((hi - R) / max(1e-3, hi - lo), 0, 1)
    return t ** gamma


def despeckle(D, t0, t1, r=9, k=4):
    """Drop isolated dots in open paper: dust, foxing, show-through. Ink
    stays where the local density of ink (at a coarse scale) is above t1,
    fades out between t1 and t0, and goes where it is below t0."""
    h, w = D.shape
    small = Image.fromarray((D * 255).astype(np.uint8)).resize((max(8, w // k), max(8, h // k)), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(r))
    dens = np.asarray(small.resize((w, h), Image.BILINEAR)).astype(np.float32) / 255.0
    return D * np.clip((dens - t0) / max(1e-3, t1 - t0), 0, 1)


def crop(arr, box):
    h, w = arr.shape
    l, t, r, b = box
    return arr[int(t * h):int(b * h), int(l * w):int(r * w)]


def fit(a, size):
    """Resize to cover `size` (w, h) exactly, cropping the excess evenly."""
    W, H = size
    h, w = a.shape
    s = max(W / w, H / h)
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    nw, nh = max(W, round(w * s)), max(H, round(h * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    x0, y0 = (nw - W) // 2, (nh - H) // 2
    return im.crop((x0, y0, x0 + W, y0 + H))


def build(pid, proof=False):
    sp = SPEC[pid]
    L = load(sp['src'])
    R = flatten(L, sp.get('k', 24))
    D = ink(R, sp.get('lo', 0.45), sp.get('hi', 0.82), sp.get('gamma', 0.8))
    if sp.get('keep'):
        # Only the ink inside these boxes stays (a woodcut's own block);
        # the book's type around it goes back to paper.
        h, w = D.shape
        m = np.zeros_like(D)
        for l, t, r, b in sp['keep']:
            m[int(t * h):int(b * h), int(l * w):int(r * w)] = 1
        D = D * m
    if sp.get('speck'):
        D = despeckle(D, *sp['speck'])
    out = {}
    dw, dh = sp.get('deskWH', [1400, 1000])
    pw, ph = sp.get('phoneWH', [720, 628])
    for cut, (W, H) in (('desk', (dw, dh)), ('phone', (pw, ph))):
        box = sp.get(cut)
        if not box:
            continue
        im = fit(crop(D, box), (W, H))
        if sp.get('sharpen', 1):
            im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        # Saved as a print: black ink on white paper.
        im = Image.fromarray(255 - np.asarray(im))
        os.makedirs(os.path.join(OUT, cut), exist_ok=True)
        fn = os.path.join(OUT, cut, f'{pid}.jpg')
        im.save(fn, quality=sp.get('q', 78), optimize=True, progressive=True)
        out[cut] = (fn, os.path.getsize(fn) // 1024, im.size)
        if proof:
            os.makedirs(PROOF, exist_ok=True)
            a = 1 - np.asarray(im).astype(np.float32) / 255.0
            paper = np.array([247, 246, 242], np.float32)
            inkc = np.array([22, 22, 26], np.float32)
            rgb = paper[None, None, :] * (1 - a[..., None]) + inkc[None, None, :] * a[..., None]
            Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(PROOF, f'{pid}-{cut}.jpg'), quality=85)
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    proof = '--proof' in args
    ids = [a for a in args if not a.startswith('--')]
    if ids == ['all']:
        ids = list(SPEC)
    for pid in ids:
        for cut, (fn, kb, size) in build(pid, proof).items():
            print(f'{pid:8} {cut:5} {size[0]}x{size[1]} {kb} KB')
