import client from './client'

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => client.post('/api/auth/register', data),
  login: (data) => client.post('/api/auth/login', data),
  me: () => client.get('/api/auth/me'),
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

// ── Seats ─────────────────────────────────────────────────────────────────
export const seatApi = {
  list: () => client.get('/api/seats'),
  // admin
  adminList: () => client.get('/api/admin/seats'),
  create: (data) => client.post('/api/admin/seats', data),
  update: (id, data) => client.put(`/api/admin/seats/${id}`, data),
  delete: (id) => client.delete(`/api/admin/seats/${id}`),
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
