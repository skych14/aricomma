import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const client = axios.create({ baseURL: BASE_URL })

// 백엔드가 "임시 비밀번호를 아직 안 바꿨다"고 알려주는 표시 (backend/utils/auth.py)
const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED'
// 토큰 세대가 밀렸을 때(다른 기기에서 비밀번호 변경 등) 백엔드가 주는 문구
const STALE_TOKEN_DETAIL = '다시 로그인해 주세요'

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ari_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function clearSession() {
  localStorage.removeItem('ari_token')
  localStorage.removeItem('ari_user')
}

// 한 화면이 API를 여러 번 부르면 401도 여러 번 온다. 두 번째 이동이 첫 번째가
// 띄운 안내를 지워버리므로, 옮기기 시작했으면 한 번만 옮긴다.
let leaving = false

/** 라우터 밖(인터셉터)에서 화면을 옮겨야 해서 통째로 다시 연다. */
function goToLogin(notice) {
  clearSession()
  if (leaving) return
  leaving = true
  // 안내는 로그인 화면이 한 번 읽고 지운다 (router state는 새로고침을 못 넘는다)
  try {
    if (notice) sessionStorage.setItem('ari_login_notice', notice)
  } catch { /* 안내만 생략 */ }
  window.location.href = '/login'
}

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const { status, data } = err.response || {}
    const isLoginRequest = err.config?.url?.includes('/auth/login')

    // 임시 비밀번호 상태 — 어느 API에서 걸렸든 바꾸는 화면으로 보낸다
    if (status === 403 && data?.code === PASSWORD_CHANGE_REQUIRED) {
      if (!leaving && !window.location.pathname.startsWith('/password')) {
        leaving = true
        window.location.href = '/password?required=1'
      }
      return Promise.reject(err)
    }

    if (status === 401 && !isLoginRequest) {
      goToLogin(
        data?.detail === STALE_TOKEN_DETAIL
          ? '다른 기기에서 비밀번호가 바뀌어 다시 로그인해 주세요'
          : ''
      )
    }
    return Promise.reject(err)
  }
)

export default client
