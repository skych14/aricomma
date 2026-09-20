"""가벼운 스키마 보정 — 마이그레이션 도구 없이 컬럼을 안전하게 추가한다.

정식 마이그레이션 도구(Alembic)를 쓰지 않는 환경이라, 앱 시작 시
"없으면 추가"만 수행한다. 여러 번 실행해도 결과가 같아야 한다(멱등).

SQLite는 ALTER TABLE ADD COLUMN에 NOT NULL(기본값 없이)을 허용하지 않으므로
추가 컬럼은 항상 nullable이다. 기존 행에는 NULL이 들어가므로,
읽는 쪽에서 NULL을 예전 동작으로 처리해야 한다(하위 호환).
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _table_exists(engine: Engine, table: str) -> bool:
    return table in inspect(engine).get_table_names()


def _column_names(engine: Engine, table: str) -> set:
    if engine.dialect.name == "sqlite":
        # SQLite는 PRAGMA table_info로 확인 (row[1] = 컬럼명)
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return {row[1] for row in rows}
    # PostgreSQL 등으로 전환한 경우
    return {col["name"] for col in inspect(engine).get_columns(table)}


def ensure_column(engine: Engine, table: str, column: str, ddl_type: str) -> bool:
    """table에 column이 없으면 추가한다. 추가했으면 True, 이미 있으면 False.

    SQLite 제약상 NOT NULL은 붙일 수 없으므로 ddl_type은 nullable 타입만 준다.
    """
    if not _table_exists(engine, table):
        # create_all이 아직 만들지 않은 테이블 — 이번엔 건너뛴다
        return False
    if column in _column_names(engine, table):
        return False

    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
    print(f"[migrate] {table}.{column} 컬럼 추가 ({ddl_type})")
    return True


# 앱이 시작할 때 확인할 컬럼 목록 (table, column, ddl_type)
PENDING_COLUMNS = [
    # 이용 종료 예정 시각(UTC). 값이 없는 기존 예약은 checked_in_at + max_usage_seconds로 처리한다.
    ("reservations", "usage_ends_at", "DATETIME"),
    # 정지 해제 예정 시각(UTC). NULL이면 기한 없는(관리자 수동) 정지이거나 정지 아님.
    ("users", "suspended_until", "DATETIME"),
]


def run_migrations(engine: Engine) -> int:
    """Base.metadata.create_all 직후에 호출한다. 추가된 컬럼 수를 돌려준다."""
    added = 0
    for table, column, ddl_type in PENDING_COLUMNS:
        if ensure_column(engine, table, column, ddl_type):
            added += 1
    return added
