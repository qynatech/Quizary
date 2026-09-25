import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { getAuthenticatedPath } from '../../lib/authRedirect'
import { Button, Input, Card, AppMark, AuroraBg, DotCorner } from '../../components/ui'

const RESEND_SECONDS = 60
const CODE_LEN = 6

const BUBBLES = Array.from({ length: 12 }, (_, i) => i)
const FILLED_BUBBLES = new Set([2, 5, 8])

export default function VerifyOtp() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { verifyOtp, resendOtp } = useAuth()
  const from = searchParams.get('next') || location.state?.next || null
  const reason = searchParams.get('reason') || location.state?.reason

  const email = searchParams.get('email') || location.state?.email || ''
  const [digits, setDigits] = useState(() => Array(CODE_LEN).fill(''))
  const code = digits.join('')
  const complete = digits.every(Boolean)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const boxesRef = useRef([])
  const autoSubmitRef = useRef('')

  // Redirect dari login (403 belum verifikasi) → tampilkan sebagai info, bukan error.
  useEffect(() => {
    if (reason === 'unverified') setNotice(t('auth.otpNotVerified'))
  }, [reason, t])

  useEffect(() => {
    if (countdown <= 0) return
    const id = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [countdown])

  useEffect(() => {
    boxesRef.current[0]?.focus()
  }, [])

  function fail(msg) {
    setError(msg)
    setShakeKey((k) => k + 1)
  }

  const submitCode = useCallback(
    async (fullCode) => {
      if (verifying) return
      if (!/^\d{6}$/.test(fullCode)) {
        fail(t('auth.otpCodeInvalid'))
        return
      }
      if (!email) {
        fail(t('auth.emailRequired'))
        return
      }
      setError('')
      setVerifying(true)
      try {
        const data = await verifyOtp(email, fullCode)
        autoSubmitRef.current = ''
        navigate(getAuthenticatedPath(data.user, from), { replace: true })
      } catch (err) {
        const status = err.response?.status
        const msg = err.response?.data?.message
        if (status === 409) {
          setNotice(t('auth.otpAlreadyVerified'))
        } else if (status === 410) {
          fail(t('auth.otpExpired'))
        } else if (status === 400 && String(msg).includes('attempts')) {
          fail(t('auth.otpTooMany'))
        } else {
          fail(t('auth.otpVerifyError'))
        }
      } finally {
        setVerifying(false)
      }
    },
    [email, from, navigate, t, verifyOtp, verifying]
  )

  // Auto-submit sekali tiap kode lengkap terisi.
  useEffect(() => {
    if (complete && autoSubmitRef.current !== code) {
      autoSubmitRef.current = code
      submitCode(code)
    }
    if (!complete) autoSubmitRef.current = ''
  }, [code, complete, submitCode])

  function setDigit(index, char) {
    const d = (char || '').replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const arr = [...prev]
      arr[index] = d || ''
      return arr
    })
    if (error) setError('')
    if (d && index < CODE_LEN - 1) boxesRef.current[index + 1]?.focus()
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) {
        setDigit(index, '')
        boxesRef.current[index]?.focus()
      } else if (index > 0) {
        setDigit(index - 1, '')
        boxesRef.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      boxesRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < CODE_LEN - 1) {
      boxesRef.current[index + 1]?.focus()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      setDigit(index, '')
    }
  }

  function handlePaste(e) {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LEN)
    if (!pasted) return
    e.preventDefault()
    setDigits(pasted.split('').concat(Array(CODE_LEN).fill('')).slice(0, CODE_LEN))
    if (error) setError('')
    boxesRef.current[Math.min(pasted.length, CODE_LEN - 1)]?.focus()
  }

  async function handleResend() {
    if (countdown > 0 || resending || !email) return
    setError('')
    setNotice('')
    setResending(true)
    try {
      await resendOtp(email)
      setNotice(t('auth.otpResent'))
      setCountdown(RESEND_SECONDS)
      setDigits(Array(CODE_LEN).fill(''))
      boxesRef.current[0]?.focus()
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.message
      if (status === 429 || String(msg).includes('wait')) fail(t('auth.otpWait'))
      else fail(msg || t('auth.somethingWrong'))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-dvh bg-paper dark:bg-ink-950 relative overflow-hidden flex flex-col">
      <div
        className="absolute inset-0 pointer-events-none dark:opacity-20"
        style={{
          backgroundImage: 'radial-gradient(rgb(108 92 231 / 0.14) 1.5px, transparent 1.5px)',
          backgroundSize: '28px 28px',
          opacity: 0.25,
        }}
        aria-hidden="true"
      />
      <AuroraBg base="#6C5CE7" className="opacity-20" />
      <DotCorner position="top-left" color="#6C5CE7" />
      <DotCorner position="bottom-right" color="#6C5CE7" />

      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <AppMark size="sm" />
            <span className="font-display font-bold text-lg text-ink dark:text-gray-100">Quizary</span>
          </div>

          <h1 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-ink dark:text-gray-100">
            {t('auth.otpTitle')}
          </h1>
          <p className="mt-1.5 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('auth.otpSubtitle')} {email || '...'}
          </p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-8"
          >
            <Card className="p-6 md:p-7">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 bg-incorrect-soft border border-incorrect/20 text-incorrect px-4 py-3 rounded-xl text-sm mb-5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </motion.div>
              )}
              {notice && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 bg-primary-50 border border-primary/20 text-primary-700 px-4 py-3 rounded-xl text-sm mb-5"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  {notice}
                </motion.div>
              )}

              <div className="relative mb-6">
                <Input
                  label={t('auth.email')}
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  className="pl-10 disabled:opacity-60"
                />
                <Mail className="pointer-events-none absolute left-3.5 top-12 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 dark:text-gray-500" />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitCode(code)
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <label className="field-label !mb-0">{t('auth.otpCodeLabel')}</label>
                  <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                    {digits.filter(Boolean).length}/{CODE_LEN}
                  </span>
                </div>

                <motion.div
                  key={shakeKey}
                  animate={shakeKey ? { x: [0, -9, 9, -5, 5, 0] } : {}}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="grid grid-cols-6 gap-2 sm:gap-2.5"
                  onPaste={handlePaste}
                  role="group"
                  aria-label={t('auth.otpCodeLabel')}
                >
                  {Array.from({ length: CODE_LEN }, (_, i) => {
                    const filled = Boolean(digits[i])
                    return (
                      <input
                        key={i}
                        ref={(el) => {
                          boxesRef.current[i] = el
                        }}
                        value={digits[i] || ''}
                        onChange={(e) => setDigit(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        onFocus={(e) => e.target.select()}
                        type="text"
                        inputMode="numeric"
                        autoComplete={i === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        aria-label={`Digit ${i + 1}`}
                        disabled={verifying}
                        className={`h-12 sm:h-14 w-full rounded-2xl border text-center font-mono text-xl font-semibold transition-all duration-150 outline-none disabled:opacity-60
                          focus:scale-[1.04] active:scale-[0.98]
                          ${
                            error
                              ? 'border-incorrect/60 bg-incorrect-soft/40 text-ink dark:text-gray-100 focus:border-incorrect focus:ring-2 focus:ring-incorrect/15'
                              : filled
                                ? 'border-primary/50 bg-primary-50/50 dark:bg-primary/10 text-ink dark:text-gray-100 focus:border-primary focus:ring-2 focus:ring-primary/20'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 text-ink dark:text-gray-100 focus:border-primary focus:ring-2 focus:ring-primary/20'
                          }`}
                      />
                    )
                  })}
                </motion.div>

                <Button
                  type="submit"
                  loading={verifying}
                  disabled={!complete || verifying}
                  className="w-full mt-5"
                  size="lg"
                >
                  {t('auth.otpVerify')}
                </Button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('auth.otpNoCode')}</p>
                {countdown > 0 ? (
                  <p className="text-sm font-mono text-gray-400 shrink-0">{t('auth.otpResendIn', { countdown })}</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || !email}
                    className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-600 transition-colors disabled:opacity-50 active:scale-[0.98]"
                  >
                    {resending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {t('auth.otpResend')}
                  </button>
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
