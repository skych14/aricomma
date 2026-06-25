import React, { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api/index.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem('ari_user')
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ari_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then((r) => { setUser(r.data); localStorage.setItem('ari_user', JSON.stringify(r.data)) })
      .catch(() => { localStorage.removeItem('ari_token'); localStorage.removeItem('ari_user'); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const r = await authApi.login({ email, password })
    localStorage.setItem('ari_token', r.data.access_token)
    localStorage.setItem('ari_user', JSON.stringify(r.data.user))
    setUser(r.data.user)
    return r.data.user
  }

  const logout = () => {
    localStorage.removeItem('ari_token')
    localStorage.removeItem('ari_user')
    setUser(null)
  }

  const refreshUser = async () => {
    const r = await authApi.me()
    setUser(r.data)
    localStorage.setItem('ari_user', JSON.stringify(r.data))
    return r.data
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
