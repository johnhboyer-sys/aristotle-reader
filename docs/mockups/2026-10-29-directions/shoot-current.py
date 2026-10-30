"""Crop and shrink shots/*.png (shoot-current.js) to the JPEGs the overview
shows. Needs Pillow."""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
for k in ['home', 'work', 'reader', 'search']:
    im = Image.open(os.path.join(HERE, 'shots', f'{k}.png')).convert('RGB')
    im = im.crop((0, 0, im.width, min(im.height, 900 if k == 'reader' else 1500)))
    im.thumbnail((760, 4000))
    im.save(os.path.join(HERE, 'shots', f'{k}.jpg'), quality=72, optimize=True)
    print(k, im.size)
