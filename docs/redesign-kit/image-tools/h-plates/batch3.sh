cd "$(dirname "$0")"
for q in "bijenkorf filetype:bitmap" "bijenkorf embleem filetype:bitmap" "beehive engraving 17th century filetype:bitmap" "Ficoroni larvis scenicis filetype:bitmap"; do echo "=== $q"; python3 -I wm.py search "$q" 10 2>/dev/null; sleep 3; done
