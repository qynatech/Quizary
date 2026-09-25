import { useState, useCallback, useEffect } from 'react'
import api from '../api/client'
import { markNewAccount } from '../features/tour/tourStorage'
import { AuthContext } from './AuthContext'

function readStoredUser() {
  try {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  // Validasi token tersimpan saat mount — user basi (token expired/revoked,
  // user dihapus) bikin PublicRoute mental balik ke /q/... sebelum sempat
  // buka /login. Bersihkan dulu agar tombol Login/Register bisa dibuka.
  useEffect(() => {
    let alive = true
    async function validate() {
      const token = localStorage.getItem('token')
      if (!token) {
        if (localStorage.getItem('user')) localStorage.removeItem('user')
        if (alive) {
          setUser(null)
          setReady(true)
        }
        return
      }
      try {
        const res = await api.get('/me')
        if (alive) {
          localStorage.setItem('user', JSON.stringify(res.data))
          setUser(res.data)
        }
      } catch (err) {
        // Hanya 401 = token basi → bersihkan. Network/500 jangan logout paksa.
        if (err.response?.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          if (alive) setUser(null)
        }
      } finally {
        if (alive) setReady(true)
      }
    }
    validate()
    const onCleared = () => setUser(null)
    window.addEventListener('quizary:auth-cleared', onCleared)
    return () => {
      alive = false
      window.removeEventListener('quizary:auth-cleared', onCleared)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    setLoading(true)
    try {
      const res = await api.post('/login', { email, password })
      const data = res.data
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      setUser(data.user)
      return data
    } finally {
      setLoading(false)
    }
  }, [])

  const register = useCallback(async (name, email, password, password_confirmation) => {
    setLoading(true)
    try {
      // Register kini hanya membuat akun + mengirim OTP ke email — TIDAK auto-login.
      const res = await api.post('/register', { name, email, password, password_confirmation })
      const data = res.data
      markNewAccount(data.email)
      return data
    } finally {
      setLoading(false)
    }
  }, [])

  const verifyOtp = useCallback(async (email, code) => {
    setLoading(true)
    try {
      const res = await api.post('/otp/verify', { email, code })
      const data = res.data
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      setUser(data.user)
      return data
    } finally {
      setLoading(false)
    }
  }, [])

  const resendOtp = useCallback(async (email) => {
    const res = await api.post('/otp/resend', { email })
    return res.data
  }, [])

  const forgotPassword = useCallback(async (email) => {
    const res = await api.post('/password/forgot', { email })
    return res.data
  }, [])

  const resetPassword = useCallback(async (email, code, password, password_confirmation) => {
    const res = await api.post('/password/reset', { email, code, password, password_confirmation })
    return res.data
  }, [])

  const verifyResetCode = useCallback(async (email, code) => {
    const res = await api.post('/password/verify', { email, code })
    return res.data
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/logout')
    } catch { }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  const updateUser = useCallback((userData) => {
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, ready, login, register, verifyOtp, resendOtp, forgotPassword, verifyResetCode, resetPassword, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}
