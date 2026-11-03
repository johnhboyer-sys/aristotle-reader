#!/usr/bin/env python3
"""Whole-image ink masks for prototyping. usage: whole.py name src [lo hi gamma k maxpx]
Writes scratchpad/proto/<name>.jpg (white ink on black) and <name>-proof.jpg (black on paper)."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep import load, flatten, ink
Image.MAX_IMAGE_PIXELS = None
SCR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
name, src = sys.argv[1], sys.argv[2]
lo, hi, gamma, k, mx = (list(map(float, sys.argv[3:8])) + [None] * 5)[:5]
lo = lo or 0.45; hi = hi or 0.82; gamma = gamma or 0.8; k = int(k or 24); mx = int(mx or 2400)
L = load(src)
R = flatten(L, k)
D = ink(R, lo, hi, gamma)
im = Image.fromarray((D * 255).astype(np.uint8))
im.thumbnail((mx, mx), Image.LANCZOS)
os.makedirs(os.path.join(SCR, 'proto'), exist_ok=True)
im.save(os.path.join(SCR, 'proto', f'{name}.jpg'), quality=80)
a = np.asarray(im).astype(np.float32) / 255
rgb = np.array([247, 246, 242])[None, None] * (1 - a[..., None]) + np.array([20, 20, 24])[None, None] * a[..., None]
Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(SCR, 'proto', f'{name}-proof.jpg'), quality=82)
print(name, im.size, os.path.getsize(os.path.join(SCR, 'proto', f'{name}.jpg')) // 1024, 'KB')
