# usage: crop.py A|B leaf "word" [nth]  -> writes img2/crop.png around the nth occurrence of word on that hOCR page
import sys,os,subprocess
sys.path.insert(0,"pipeline/tools")
import build_prob_forster as B
from pathlib import Path
from PIL import Image
P=Path(os.environ['PROB'])
w,leaf,key=sys.argv[1],int(sys.argv[2]),sys.argv[3]
nth=int(sys.argv[4]) if len(sys.argv)>4 else 0
idn={'A':'worksofaristotle07arisuoft','B':'worksofaristotle0007unse_o7n4'}[w]
pages=B.parse_hocr(P/(idn+'_hocr.html'))
pg=pages[leaf]
ws=[x for x in pg['words'] if key in x['t']]
if not ws: print('not found'); sys.exit(1)
x=ws[nth]
jp=P/'img2'/f'{w}{leaf}.jpg'
if not jp.exists():
    subprocess.run(['curl','-s','-L','-o',str(jp),f'https://archive.org/download/{idn}/page/n{leaf}.jpg'],check=True)
im=Image.open(jp)
sx=im.width/pg['W']
box=(int(max(0,(x['x0']-1000)*sx)),int(max(0,(x['y0']-250)*sx)),int(min(im.width,(x['x1']+300)*sx)),int(min(im.height,(x['y1']+330)*sx)))
out=P/'img2'/f'crop_{w}{leaf}.png'
im.crop(box).save(out)
print(out,x)
