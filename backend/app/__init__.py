from pathlib import Path
import sys

# Ensure backend directory is in sys.path so app package imports work reliably
_backend_dir = str(Path(__file__).resolve().parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
