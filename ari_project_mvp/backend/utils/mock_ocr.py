import re
from pathlib import Path


def run_mock_ocr(filename: str) -> dict:
    """
    Mock OCR: 실제 OCR 대신 파일명 분석으로 학번/이름을 추출하는 척하는 더미.
    실제 운영에서는 CLOVA OCR / Google Vision API / Tesseract 등으로 교체.
    파일명 예: 홍길동_20210001.jpg → 이름/학번 추출 시도
    """
    stem = Path(filename).stem
    parts = re.split(r"[_\-\s]", stem)

    detected_name = "확인 필요"
    detected_id = "확인 필요"
    confidence = 0.40

    for part in parts:
        if re.match(r"^\d{7,10}$", part):
            detected_id = part
            confidence = max(confidence, 0.70)
        elif re.match(r"^[가-힣]{2,5}$", part):
            detected_name = part
            confidence = max(confidence, 0.70)

    if detected_name != "확인 필요" and detected_id != "확인 필요":
        confidence = 0.88

    return {
        "detected_name": detected_name,
        "detected_student_id": detected_id,
        "confidence": confidence,
        "note": "Mock OCR 결과입니다. 관리자가 원본 파일을 직접 확인 후 승인/거절하세요.",
    }
