cd "$(dirname "$0")/.."
get() { mkdir -p "dl/$1"; timeout 400 python3 -I tools-h/wm.py get "File:$2" "dl/$1/f.jpg" $3 2>&1 | grep -v "^  \["; sleep 2; }
get wm-notus "Notus the south wind; is sultry and very wet - Stuart James & Revett Nicholas - 1762.jpg" 1280
get wm-sciron "Sciron, the north-west wind; the dryest which blows in Athens This wind is extremely cold in winter, but in the summer i - Stuart James & Revett Nicholas - 1762.jpg" 1280
get wm-serpent "Carta Marina detail of northwest emphasizing sea serpent.jpg" 1920
get wm-borelli "Houghton IC6 B6447 680db - De motu animalium, TAB IV.jpg" 960
get wm-typus1920 "Gregor Reisch, Margarita Philosophica, Typus Logice.jpg" 1920
echo done
