"""Translation aligner: map an unmarked translation onto the Greek spine.

See `build spec` (chapter-scoped, Rackham-reference). Entry point: `align()`
in `aligner.py`; CLI at `python -m aristotle_pipeline.align`.
"""

from .aligner import align  # noqa: F401
