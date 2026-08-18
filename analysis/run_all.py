"""Run every study in order and leave the JSON results in results/."""

import subprocess
import sys

STUDIES = [
    ("studies.authenticity", "Study 1 -- authenticity map"),
    ("studies.common_books", "Study 2 -- the Ethics common books"),
    ("studies.robustness", "Study 2b -- robustness of Study 2"),
    ("studies.edition_confound", "Study 3 -- editor vs author"),
    ("studies.seams", "Study 4 -- seams inside works"),
]

if __name__ == "__main__":
    for mod, label in STUDIES:
        print(f"\n\n########## {label} ##########\n")
        r = subprocess.run([sys.executable, "-m", mod])
        if r.returncode:
            sys.exit(r.returncode)
