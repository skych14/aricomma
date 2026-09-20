"""인증자료 파일의 내용 검증 / 삭제 유틸."""
import io
import os
from pathlib import Path
from typing import Optional

from PIL import Image

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | {".pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

PDF_MAGIC = b"%PDF-"


def is_valid_upload(content: bytes, ext: str) -> bool:
    """확장자뿐 아니라 실제 내용이 이미지/PDF인지 확인한다.

    확장자만 바꾼 텍스트 파일 등을 걸러내기 위한 것이라
    이미지는 Pillow로 실제 디코딩이 되는지, PDF는 매직 넘버를 본다.
    """
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        try:
            # verify()는 스트림을 소비하므로 검사용으로 새 버퍼를 연다
            with Image.open(io.BytesIO(content)) as img:
                img.verify()
            return True
        except Exception:
            return False
    if ext == ".pdf":
        return content[: len(PDF_MAGIC)] == PDF_MAGIC
    return False


def delete_upload(file_path: Optional[str]) -> bool:
    """업로드 파일을 지운다. 실패해도 예외를 올리지 않고 False를 돌려준다."""
    if not file_path:
        return False
    try:
        path = Path(file_path)
        if path.is_file():
            path.unlink()
            return True
    except OSError:
        return False
    return False


def upload_exists(file_path: Optional[str]) -> bool:
    return bool(file_path) and os.path.isfile(file_path)
