import client from './client'

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => client.post('/api/auth/register', data),
  login: (data) => client.post('/api/auth/login', data),
  me: () => client.get('/api/auth/me'),
  // 성공하면 새 토큰이 함께 오고, 다른 기기의 토큰은 모두 끊긴다
  changePassword: (data) => client.post('/api/auth/password', data),
  withdraw: (data) => client.delete('/api/auth/me', { data }),
}

// ── Verifications ─────────────────────────────────────────────────────────
export const verificationApi = {
  submit: (file) => {
    const form = new FormData()
    form.append('file', file)
    return client.post('/api/verifications', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  myStatus: () => client.get('/api/verifications/me'),
  // admin
  adminList: (status) =>
    client.get('/api/admin/verifications', { params: status ? { status } : {} }),
  adminGet: (id) => client.get(`/api/admin/verifications/${id}`),
  adminFetchFile: (id) => client.get(`/api/admin/verifications/${id}/file`, { responseType: 'blob' }),
  adminReview: (id, data) => client.put(`/api/admin/verifications/${id}`, data),
}

// ── Reports & Penalties ───────────────────────────────────────────────────
export const reportApi = {
  create: (data) => client.post('/api/reports', data),
  myList: () => client.get('/api/reports/me'),
  myPenalties: () => client.get('/api/penalties/me'),
  ackPenalty: (id) => client.post(`/api/penalties/${id}/ack`),
  // admin
  adminList: (status) =>
    client.get('/api/admin/reports', { params: status ? { status } : {} }),
  adminCandidates: (id) => client.get(`/api/admin/reports/${id}/candidates`),
  adminReview: (id, data) => client.put(`/api/admin/reports/${id}`, data),
  adminPenalties: (user_id) =>
    client.get('/api/admin/penalties', { params: user_id ? { user_id } : {} }),
  adminRevoke: (id) => client.post(`/api/admin/penalties/${id}/revoke`),
  adminResetCounter: () => client.post('/api/admin/penalties/reset-counter'),
}

// ── Operation mode ────────────────────────────────────────────────────────
export const operationApi = {
  get: () => client.get('/api/settings/operation'),
  setMode: (mode) => client.put('/api/admin/settings/operation', { mode }),
}

// ── Admin Users ───────────────────────────────────────────────────────────
export const adminUserApi = {
  list: (params) => client.get('/api/admin/users', { params }),
  update: (id, data) => client.patch(`/api/admin/users/${id}`, data),
  remove: (id) => client.delete(`/api/admin/users/${id}`),
  // 임시 비밀번호는 이 응답에서 한 번만 온다 — 다시 볼 수 없다
  issueTempPassword: (id) => client.post(`/api/admin/users/${id}/temp-password`),
  loginEvents: (id) => client.get(`/api/admin/users/${id}/login-events`),
}

// ── Seats ─────────────────────────────────────────────────────────────────
export const seatApi = {
  list: () => client.get('/api/seats'),
  // admin
  adminList: () => client.get('/api/admin/seats'),
  update: (id, data) => client.put(`/api/admin/seats/${id}`, data),
  rotateQr: (id) => client.post(`/api/admin/seats/${id}/rotate-qr`),
  rotateQrAll: () => client.post('/api/admin/seats/rotate-qr-all'),
}

// ── Reservations ──────────────────────────────────────────────────────────
export const reservationApi = {
  create: (seat_id) => client.post('/api/reservations', { seat_id }),
  myList: () => client.get('/api/reservations/me'),
  cancel: (id) => client.delete(`/api/reservations/${id}`),
  checkin: (id, qr_token) =>
    client.post(`/api/reservations/${id}/checkin`, { qr_token }),
  checkout: (id) => client.post(`/api/reservations/${id}/checkout`),
  // admin
  adminList: (status) =>
    client.get('/api/admin/reservations', { params: status ? { status } : {} }),
}

// ── Logs ──────────────────────────────────────────────────────────────────
export const logApi = {
  myUsage: () => client.get('/api/usage-logs/me'),
  adminUsage: (params) => client.get('/api/admin/usage-logs', { params }),
  adminAudit: (params) => client.get('/api/admin/audit-logs', { params }),
}
