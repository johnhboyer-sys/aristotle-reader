#!/usr/bin/env python3
"""Zoom an arbitrary fraction of a Hicks page to check the ink."""
import io, os, sys, zipfile
from PIL import Image
Z = "/Users/johnboyer/Developer/aristotle-reader/sources/da-hicks/scan/hicks-1907_jp2.zip"
OUT = "/Users/johnboyer/Developer/aristotle-reader/sources/da-hicks/work/verify"
z = zipfile.ZipFile(Z)
names = {n.split("_")[-1].split(".")[0]: n for n in z.namelist() if n.endswith(".jp2")}

def ink_bbox(im, thresh=200, pad=60):
    m = im.point(lambda p: 255 if p < thresh else 0); box = m.getbbox()
    if not box: return (0, 0, im.width, im.height)
    l, t, r, b = box
    return (max(0,l-pad), max(0,t-pad), min(im.width,r+pad), min(im.height,b+pad))

idx, label = sys.argv[1], sys.argv[2]
y0, y1, x0, x1, scale = map(float, sys.argv[3:8])
im = Image.open(io.BytesIO(z.read(names[idx]))).convert("L")
crop = im.crop(ink_bbox(im)); cw, ch = crop.size
sub = crop.crop((int(x0*cw), int(y0*ch), int(x1*cw), int(y1*ch)))
sub = sub.resize((int(sub.width*scale), int(sub.height*scale)), Image.LANCZOS)
if sub.width > 1568:
    sub = sub.resize((1568, round(sub.height*1568/sub.width)), Image.LANCZOS)
p = f"{OUT}/{label}.png"; sub.save(p); print(p, sub.size, "block", cw, ch)
