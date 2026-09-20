"""스크립트에서 backend 패키지를 import할 수 있도록 경로를 잡아준다."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
