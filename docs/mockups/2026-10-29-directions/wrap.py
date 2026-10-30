import os
HERE = os.path.dirname(os.path.abspath(__file__))
body = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
open(os.path.join(HERE, 'test.html'), 'w', encoding='utf-8').write(head + body + '</body></html>')
