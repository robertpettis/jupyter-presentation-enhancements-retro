"""RISE presentation enhancements for classic Notebook 6."""

__version__ = "0.1.2"


def _jupyter_nbextension_paths():
    """Fallback for `jupyter nbextension install --py` workflows."""
    return [
        {
            "section": "notebook",
            "src": "nbextension",
            "dest": "presentation_enhancements_retro",
            "require": "presentation_enhancements_retro/main",
        }
    ]
