import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { useRegistrationStatus } from '../../hooks/useRegistrationStatus'
import { Button, Input, Card } from '../../components/ui'
import { AuthShell } from '../../components/auth/AuthShell'

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useAuth()
  const { registrationOpen, loading: registrationLoading } = useRegistrationStatus()
  const from = location.state?.from || new URLSearchParams(location.search).get('next') || '/'

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const errors = {}
    if (!form.name) errors.name = t('auth.nameRequired')
    else if (form.name.length < 3)
      errors.name = t('auth.nameMin')
    if (!form.email) errors.email = t('auth.emailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errors.email = t('auth.emailInvalid')
    if (!form.password) errors.password = t('auth.passwordRequired')
    else if (form.password.length < 8)
      errors.password = t('auth.passwordMin')
    else if (!/^[!-~]+$/.test(form.password))
      errors.password = t('auth.passwordInvalid')
    if (!form.password_confirmation)
      errors.password_confirmation = t('auth.confirmRequired')
    else if (form.password !== form.password_confirmation)
      errors.password_confirmation = t('auth.confirmMismatch')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setLoading(true)
    try {
      await register(
        form.name,
        form.email,
        form.password,
        form.password_confirmation
      )
      // Registrasi sukses → akun dibuat + OTP terkirim. Lanjut ke halaman
      // verifikasi kode; sukses verify = auto-login.
      const qs = new URLSearchParams({ email: form.email, next: from })
      navigate(`/otp?${qs.toString()}`, { replace: true })
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.message
      if (status === 422) {
        const errors = {}
        let schemaMsg = ''
        const details = err.response?.data?.errors || []
        details.forEach((e) => {
          const field = Object.keys(e)[0]
          if (!field) return
          if (field === '_schema') schemaMsg = e[field]
          else errors[field] = e[field]
        })
        if (schemaMsg) setError(schemaMsg)
        else if (Object.keys(errors).length) setFieldErrors(errors)
        else setError(msg || t('auth.validationFailed'))
      } else if (status === 409) {
        setError(t('auth.emailExists') !== 'auth.emailExists' ? t('auth.emailExists') : 'Email is already registered')
      } else {
        setError(msg || t('auth.somethingWrong'))
      }
    } finally {
      setLoading(false)
    }
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: '' }))
  }

  if (registrationLoading) return null
  if (!registrationOpen) {
    return (
      <AuthShell
        eyebrow={t('auth.getStarted')}
        title={t('auth.registrationClosedTitle')}
        subtitle={t('auth.registrationClosedDescription')}
        footer={<Link to="/login" className="font-semibold text-primary hover:text-primary-600 transition-colors">{t('auth.signInLink')}</Link>}
      >
        <Card className="p-6 md:p-7 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('auth.registrationClosed')}</p>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow={t('auth.getStarted')}
      title={t('auth.createTitle')}
      subtitle={t('auth.tagline')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to={from !== '/' ? `/login?next=${encodeURIComponent(from)}` : '/login'} state={from !== '/' ? { from } : undefined} className="font-semibold text-primary hover:text-primary-600 transition-colors">
            {t('auth.signInLink')}
          </Link>
        </>
      }
    >
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Card className="p-6 md:p-7">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-incorrect-soft border border-incorrect/20 text-incorrect px-4 py-3 rounded-xl text-sm mb-5"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label={t('auth.name')}
                type="text"
                placeholder={t('auth.name')}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                error={fieldErrors.name}
                className="pl-10"
              />
              <User className="pointer-events-none absolute left-3.5 top-12 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 dark:text-gray-500" />
            </div>

            <div className="relative">
              <Input
                label={t('auth.email')}
                type="email"
                placeholder={t('auth.emailPlaceholder') !== 'auth.emailPlaceholder' ? t('auth.emailPlaceholder') : 'email@example.com'}
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                error={fieldErrors.email}
                className="pl-10"
              />
              <Mail className="pointer-events-none absolute left-3.5 top-12 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 dark:text-gray-500" />
            </div>

            <div className="relative">
              <Input
                label={t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordHint')}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                error={fieldErrors.password}
                className="pl-10 pr-10"
              />
              <Lock className="pointer-events-none absolute left-3.5 top-12 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 dark:text-gray-500" />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3.5 top-12 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>

            <div className="relative">
              <Input
                label={t('auth.confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                placeholder={t('auth.confirmPassword')}
                value={form.password_confirmation}
                onChange={(e) => update('password_confirmation', e.target.value)}
                error={fieldErrors.password_confirmation}
                className="pl-10 pr-10"
              />
              <Lock className="pointer-events-none absolute left-3.5 top-12 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 dark:text-gray-500" />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                className="absolute right-3.5 top-12 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                aria-label={showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showConfirm ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {t('auth.getStarted')}
            </Button>
          </form>
        </Card>
      </motion.div>
    </AuthShell>
  )
}
