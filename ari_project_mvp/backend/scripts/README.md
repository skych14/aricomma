# 운영 스크립트

모두 `backend/` 안에서 실행한다. Fly에서는 `fly ssh console` 로 들어간 뒤
`cd /app` 에서 같은 명령을 쓴다.

| 스크립트 | 하는 일 |
|---|---|
| `set_admin_password.py` | 관리자 비밀번호 변경 (기존 로그인 세션 모두 끊김) |
| `remove_test_users.py` | 시드로 만든 테스트 학생 계정 삭제 |
| `purge_reviewed_files.py` | 검토가 끝난 인증 파일 정리 |

---

## 런칭 절차 (DB 초기화 포함)

런칭 전 한 번만 하는 절차다. **DB를 지우므로 가입·예약 기록이 모두 사라진다.**
런칭 후에는 절대 이 순서를 그대로 쓰지 않는다.

### 1. 배포

```bash
fly deploy
```

배포가 끝나면 `/health` 가 200인지 확인한다.

```bash
curl https://<앱주소>/health
```

### 2. 관리자 비밀번호 시크릿 설정

DB를 지우면 재시작 때 seed가 관리자 계정을 새로 만든다. 이때 쓸 비밀번호를
**초기화 전에** 정해 둔다. 시크릿이 없으면 seed는 관리자를 만들지 않고
`ADMIN_PASSWORD 시크릿을 설정한 뒤 재시작하세요` 경고만 남긴다.

```bash
fly secrets set ADMIN_PASSWORD='<10자 이상, 영문+숫자, 공백 없음>'
```

가입 화면과 같은 규칙을 쓰므로(`utils/password_policy.py`) 규칙에 어긋나면
seed가 그 값을 거부한다. `fly secrets set` 은 앱을 자동으로 재시작한다.

### 3. DB 초기화

```bash
fly ssh console
```

머신 안에서:

```bash
# 되돌릴 수 있게 먼저 백업 (볼륨 안에 날짜를 붙여 남긴다)
cp /data/ari_project.db /data/ari_project.db.bak-$(date +%Y%m%d%H%M)
ls -l /data/

# 기존 DB 삭제 — 앱이 다시 뜰 때 테이블을 새로 만들고 seed가 돈다
rm /data/ari_project.db

# 업로드된 인증 파일도 함께 비울 때만 (계정이 사라지므로 보통 함께 지운다)
rm -rf /data/uploads/*

#시드파일 실행
python seed.py

exit
```

앱을 다시 시작해 테이블 생성과 seed를 돌린다.

```bash
fly apps restart <앱이름>
```

`fly logs` 에 `관리자 생성: ...`, `자리 생성: ...` 이 찍히면 정상이다.
seed는 `SEED_TEST_USERS` 가 true일 때만 테스트 학생을 만든다. 운영에서는 false로 둔다.

### 4. 관리자 비밀번호 변경 (선택)

2번에서 정한 비밀번호를 그대로 쓸 거라면 이 단계는 건너뛴다.
나중에 바꿀 때는 이 스크립트를 쓴다.

```bash
fly ssh console
cd /app
python scripts/set_admin_password.py
```

새 비밀번호는 가입 화면과 같은 규칙을 따른다 (`utils/password_policy.py`):
10~64자, 영문과 숫자를 모두 포함, 공백 없음, ASCII 문자만.

### 5. 마무리 확인

- `ENABLE_DOCS` 가 설정돼 있지 않은지 확인한다 (운영에서 `/docs` 는 404여야 한다).
  이 값이 true면 `ADMIN_PASSWORD` 없이도 개발용 기본 비밀번호로 관리자가 만들어진다.

  ```bash
  fly secrets list           # ENABLE_DOCS 가 없어야 한다
  curl -o /dev/null -w '%{http_code}\n' https://<앱주소>/docs   # 404
  ```

- `SECRET_KEY` 가 기본값이 아닌지 확인한다. 기본값이면 토큰을 위조할 수 있다.

  ```bash
  fly secrets set SECRET_KEY="$(openssl rand -hex 32)"
  ```

  바꾸면 발급된 토큰이 모두 무효가 되므로 **2번보다 먼저** 하는 편이 낫다.

- 새 관리자 비밀번호로 로그인되는지, 학생 계정 가입이 되는지 직접 확인한다.

---

## 사용자가 비밀번호를 잊었을 때

관리자 화면 또는 API로 임시 비밀번호를 발급한다.

```
POST /api/admin/users/{user_id}/temp-password
```

- 임시 비밀번호는 **이 응답에서 한 번만** 나온다. DB에는 해시만 남으므로 다시 볼 수 없다.
- 발급하면 그 사용자의 기존 로그인은 모두 끊기고, 새 비밀번호로 바꾸기 전까지
  다른 기능을 쓸 수 없다.
- 잠겨 있던 계정(로그인 10회 실패)도 함께 풀린다.
- 관리자 계정에는 발급할 수 없다 — 관리자는 `set_admin_password.py` 를 쓴다.
