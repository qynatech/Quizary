import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Save, Trash2, ImageUp, Link2, Info, Lock, Settings2, Download, QrCode, X, Palette, ExternalLink, Loader2 } from 'lucide-react'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { Button, Input, Select, Toggle, Card, StatusBadge, ConfirmModal, PageHeader, FormSubNav, FormBackButton, PageSkeleton, RichTextEditor, RichText, ScoringSettings } from '../../components/ui'
import { stripTags } from '../../lib/sanitize'
import { resolveMediaUrl } from '../../lib/media'
import { useTranslation } from 'react-i18next'
import { usePageTour } from '../../features/tour/TourContext'

function ShareLink({ value }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  // Link hanya untuk copy — preview lewat tombol terpisah agar tidak
  // membingungkan user baru (dulu teks link bisa diklik buka halaman publik).
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-ink-800/50 px-3.5 h-11">
      <span className="flex-1 min-w-0 font-mono text-sm text-gray-600 dark:text-gray-300 truncate">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy link"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-ink dark:hover:text-gray-100 shrink-0 transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-correct" /> : <Copy className="w-4 h-4" />}
        <span className="hidden sm:inline">{copied ? t('formEdit.copied') : t('formEdit.copy')}</span>
      </button>
    </div>
  )
}

function SectionCard({ title, icon, children, 'data-tour': dataTour }) {
  return (
    <Card data-tour={dataTour} padding={false}>
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="text-primary shrink-0">{icon}</span>
        <h2 className="font-display font-semibold text-ink dark:text-gray-100">{title}</h2>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  )
}

function SettingRow({ title, desc, control }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-ink dark:text-gray-100">{title}</p>
        {desc && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {control}
    </div>
  )
}

export default function FormEdit() {
  const { formId: id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const fileRef = useRef(null)
  const qrRef = useRef(null)
  const [form, setForm] = useState(null)
  const [base, setBase] = useState(null)
  const [timerMinutes, setTimerMinutes] = useState('')
  const [initialTimerMinutes, setInitialTimerMinutes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerRemoving, setBannerRemoving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [errors, setErrors] = useState({})
  const [questions, setQuestions] = useState([])
  // Bobot manual pending: ikut unsaved changes, dikirim saat Save (tanpa Apply).
  const [manualPoints, setManualPoints] = useState(5)
  const [initialManualPoints, setInitialManualPoints] = useState(5)
  const titleRef = useRef(null)
  const timerRef = useRef(null)
  const designRef = useRef(null)
  const scheduleRef = useRef(null)
  const accessRef = useRef(null)
  const behaviorRef = useRef(null)
  const statusRef = useRef(null)

  // Scroll ke input yang error supaya user langsung lihat apa yang kurang.
  const revealError = (ref) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  // Bobot awal = modus poin soal dinilai (seragam = nilai itu, beda = 5).
  const syncManualPoints = (list) => {
    const pts = (list || []).filter((q) => q.is_scored !== false).map((q) => q.points ?? 0)
    const initial = pts.length && pts.every((p) => p === pts[0]) && pts[0] > 0 ? pts[0] : 5
    setManualPoints(initial)
    setInitialManualPoints(initial)
  }

  useEffect(() => {
    api.get(`/forms/${id}`)
      .then((res) => {
        setForm(res.data)
        setBase(res.data)
        const minutes = res.data.timer_seconds ? String(Math.round(res.data.timer_seconds / 60)) : ''
        setTimerMinutes(minutes)
        setInitialTimerMinutes(minutes)
        if (res.data.type === 'quiz') {
          api.get(`/forms/${id}/questions`).then((qRes) => { setQuestions(qRes.data.data); syncManualPoints(qRes.data.data) }).catch(() => { })
        }
      })
      .catch(() => navigate('/forms'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name === 'type' && value === 'form') {
      // Ganti tipe form → quiz balik: setelan khusus quiz di-reset agar user
      // tidak perlu bolak-balik ke mode quiz untuk menonaktifkannya.
      // Timer TIDAK ikut di-reset — time limit berlaku untuk kedua tipe.
      setForm((prev) => ({ ...prev, type: value, show_leaderboard: false, is_restricted: false }))
    } else {
      setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    }
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  // Enforce the same setting chain as the backend in the UI, so the editor
  // never sends contradictory values: is_restricted ⇒ once ⇒ require_login.
  const toggleSetting = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'is_restricted' && value) {
        next.submission_limit = 'once'
        next.require_login = true
      }
      if (key === 'submission_limit' && value === 'once') {
        next.require_login = true
      }
      return next
    })
    setErrors((prev) => {
      const next = { ...prev, [key]: undefined }
      if (key === 'is_restricted' && value) {
        next.submission_limit = undefined
        next.require_login = undefined
      }
      if (key === 'submission_limit' && value === 'once') {
        next.require_login = undefined
      }
      return next
    })
  }

  const updateSetting = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function toBackendDate(str) {
    if (!str) return null
    let d
    if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
      const [date, time] = str.split(' ')
      const [day, month, year] = date.split('-').map(Number)
      const [h, m] = (time || '0:0').split(':').map(Number)
      d = new Date(year, month - 1, day, h || 0, m || 0)
    } else {
      d = new Date(str)
    }
    if (isNaN(d.getTime())) return null
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  function normalize() {
    return {
      title: form.title,
      description: form.description || null,
      type: form.type,
      display_style: form.display_style || 'card',
      status: form.status,
      require_login: form.require_login,
      submission_limit: form.submission_limit,
      scoring_mode: form.scoring_mode || 'auto',
      theme_color: form.theme_color || null,
      thank_you_message: form.thank_you_message || null,
      shuffle_questions: form.shuffle_questions,
      shuffle_options: form.shuffle_options,
      show_leaderboard: form.show_leaderboard,
      is_restricted: form.is_restricted,
      show_in_history: form.show_in_history !== false,
      reveal_score: form.reveal_score !== false,
      reveal_answers: form.reveal_answers !== false,
      starts_at: toBackendDate(form.starts_at),
      ends_at: toBackendDate(form.ends_at),
    }
  }

  function baseSnapshot() {
    return {
      title: base.title,
      description: base.description || null,
      type: base.type,
      display_style: base.display_style || 'card',
      status: base.status,
      require_login: base.require_login,
      submission_limit: base.submission_limit,
      scoring_mode: base.scoring_mode || 'auto',
      theme_color: base.theme_color || null,
      thank_you_message: base.thank_you_message || null,
      shuffle_questions: base.shuffle_questions,
      shuffle_options: base.shuffle_options,
      show_leaderboard: base.show_leaderboard,
      is_restricted: base.is_restricted,
      show_in_history: base.show_in_history !== false,
      reveal_score: base.reveal_score !== false,
      reveal_answers: base.reveal_answers !== false,
      starts_at: base.starts_at,
      ends_at: base.ends_at,
    }
  }

  // "d-m-Y H:i:s" WIB dari API → instant absolut (tanpa tampil UI).
  function parseServerNow(str) {
    if (!str) return null
    const [d, m, Y, H, M, S] = str.split(/[\s:-]+/).map(Number)
    if (!Y || !m || !d) return null
    return new Date(Date.UTC(Y, m - 1, d, (H || 0) - 7, M || 0, S || 0))
  }

  function toInputDate(str) {    if (!str) return ''
    if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
      const [date, time] = str.split(' ')
      const [day, month, year] = date.split('-')
      return `${year}-${month}-${day}T${(time || '').slice(0, 5)}`
    }
    return str
  }

  // ponytail: stringify tiap render berat — memoize biar tidak lag saat ketik di 100 soal
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => {
    if (!form || !base) return false
    const timerChanged = timerMinutes !== initialTimerMinutes
    const pointsChanged = manualPoints !== initialManualPoints
    return JSON.stringify(normalize()) !== JSON.stringify(baseSnapshot()) || timerChanged || pointsChanged
  }, [form, base, timerMinutes, initialTimerMinutes, manualPoints, initialManualPoints])

  const buildPayload = () => ({
    ...normalize(),
    timer_seconds: timerMinutes ? Number(timerMinutes) * 60 : null,
  })

  const localizeFieldError = (field, msg) => {
    const text = String(msg || '')
    const lower = text.toLowerCase()
    if (field === 'starts_at' || field === 'ends_at') {
      if (lower.includes('before') || lower.includes('starts_at')) return t('formEdit.scheduleInvalid')
      if (lower.includes('format') || lower.includes('datetime') || lower.includes('parse')) return t('formEdit.scheduleInvalidFormat')
    }
    if (field === '_schema' && (lower.includes('starts_at') || lower.includes('ends_at') || lower.includes('before'))) {
      return t('formEdit.scheduleInvalid')
    }
    return text
  }

  const applyFieldErrors = (err) => {
    const data = err.response?.data
    const message = data?.message || data?.detail || ''
    if (form.status === 'published' && /at least 1 question|minimal 1 soal|question before publishing/i.test(message)) {
      setErrors({ status: t('formEdit.publishNeedsQuestion') })
      revealError(statusRef)
      return
    }
    if (data?.errors) {
      const mapped = {}
      data.errors.forEach((entry) => {
        Object.entries(entry).forEach(([k, v]) => {
          if (k === '_schema') {
            mapped._schema = localizeFieldError(k, v)
          } else {
            mapped[k] = localizeFieldError(k, v)
          }
        })
      })
      if (mapped._schema && !mapped.starts_at && !mapped.ends_at) {
        const msg = String(mapped._schema)
        const lower = msg.toLowerCase()
        if (lower.includes('dibuka') || lower.includes('ditutup') || lower.includes('starts_at') || lower.includes('ends_at') || lower.includes('before') || lower.includes('opens') || lower.includes('closes')) {
          mapped.starts_at = msg
          mapped.ends_at = msg
        }
      }
      delete mapped._schema
      setErrors(mapped)
      if (mapped.title || mapped.description || mapped.status) revealError(titleRef)
      else if (mapped.starts_at || mapped.ends_at) revealError(scheduleRef)
      else if (mapped.timer_seconds) revealError(timerRef)
      else if (mapped.submission_limit || mapped.require_login || mapped.show_in_history) revealError(accessRef)
      else if (mapped.display_style || mapped.theme_color) revealError(designRef)
      else if (mapped.type || mapped.scoring_mode || mapped.show_leaderboard || mapped.is_restricted || mapped.shuffle_questions || mapped.shuffle_options || mapped.thank_you_message) revealError(behaviorRef)
      const knownKeys = Object.keys(mapped)
      if (knownKeys.length === 0) {
        toast.error(data.message && data.message !== 'Invalid fields' ? data.message : t('formEdit.invalidFields'))
      }
    } else {
      toast.error(data?.message || data?.detail || t('formEdit.saveFailed'))
    }
  }

  const handleSave = async () => {
    if (!stripTags(form.title)) {
      setErrors({ title: t('formEdit.titleRequired') })
      revealError(titleRef)
      return
    }
    // Quiz wajib punya timer (per menit) — dicek juga di backend saat publish.
    if (isQuiz && !timerMinutes) {
      setErrors({ timer_seconds: t('formEdit.timerRequired') })
      revealError(timerRef)
      return
    }
    if (form.starts_at && form.ends_at) {
      const startTs = new Date(toInputDate(form.starts_at)).getTime()
      const endTs = new Date(toInputDate(form.ends_at)).getTime()
      if (Number.isFinite(startTs) && Number.isFinite(endTs) && startTs >= endTs) {
        setErrors({ starts_at: t('formEdit.scheduleInvalid'), ends_at: t('formEdit.scheduleInvalid') })
        revealError(scheduleRef)
        return
      }
    }
    // ends_at lampau vs jam server = publish langsung tutup. Backend menolak,
    // tapi cegah di klien agar creator sadar sebelum save (jam server dari
    // GET /forms, background saja — tidak ditampilkan).
    if (form.ends_at && form.status === 'published') {
      const endTs = new Date(toInputDate(form.ends_at)).getTime()
      const serverMs = parseServerNow(base?.server_now)?.getTime()
      if (Number.isFinite(endTs) && serverMs && endTs <= serverMs) {
        setErrors({ ends_at: t('formEdit.schedulePast') })
        revealError(scheduleRef)
        return
      }
    }
    setSaving(true)
    try {
      const res = await api.put(`/forms/${id}`, buildPayload())
      setForm(res.data)
      setBase(res.data)
      const minutes = res.data.timer_seconds ? String(Math.round(res.data.timer_seconds / 60)) : ''
      setTimerMinutes(minutes)
      setInitialTimerMinutes(minutes)
      // Mode manual: bobot pending dikirim setelah PUT (mode tersimpan dulu
      // agar backend tidak menolak batch saat masih auto).
      if (res.data.type === 'quiz' && (res.data.scoring_mode || 'auto') === 'manual' && manualPoints !== initialManualPoints) {
        await api.patch(`/forms/${id}/questions/points`, { points: manualPoints })
        setInitialManualPoints(manualPoints)
      }
      if (res.data.type === 'quiz') {
        api.get(`/forms/${id}/questions`).then((qRes) => setQuestions(qRes.data.data)).catch(() => { })
      }
      setErrors({})
      toast.success(t('formEdit.saved'))
    } catch (err) {
      applyFieldErrors(err)
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    setForm(base)
    const minutes = base.timer_seconds ? String(Math.round(base.timer_seconds / 60)) : ''
    setTimerMinutes(minutes)
    setInitialTimerMinutes(minutes)
    setManualPoints(initialManualPoints)
    if (base.type === 'quiz') {
      api.get(`/forms/${id}/questions`).then((qRes) => setQuestions(qRes.data.data)).catch(() => { })
    }
    setErrors({})
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/forms/${id}`)
      navigate('/forms')
    } catch {
      setDeleting(false); setShowDelete(false)
      toast.error(t('formEdit.deleteFailed'))
    }
  }

  const downloadQr = () => {
    // ponytail: canvas hidden kadang belum ter-draw — fallback SVG → PNG
    let canvas = qrRef.current
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      canvas = document.querySelector('[data-qr-canvas]') || document.querySelector('canvas')
    }
    if (canvas && typeof canvas.toDataURL === 'function') {
      try {
        const url = canvas.toDataURL('image/png')
        // cek apakah canvas berisi QR valid (tidak hitam pekat kosong)
        // jika canvas kosong (hasil hitam pekat) fallback ke SVG
        const isEmpty = (() => {
          try {
            const ctx = canvas.getContext('2d')
            const d = ctx.getImageData(0, 0, 1, 1).data
            // jika pixel pertama hitam pekat dan canvas belum terisi, anggap gagal
            return false
          } catch { return false }
        })()
        if (!isEmpty) {
          const a = document.createElement('a')
          a.href = url
          a.download = `qr-${form.short_code}.png`
          a.click()
          return
        }
      } catch {}
    }
    // fallback: SVG → canvas → PNG
    const svg = document.querySelector('[data-qr-svg]')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 440
      c.height = 440
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      const pngUrl = c.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `qr-${form.short_code}.png`
      a.click()
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
  }

  const handleBanner = async (e) => {
    const file = e.target.files[0]
    if (!file || bannerUploading) return
    e.target.value = ''
    const fd = new FormData()
    fd.append('banner', file)
    setBannerUploading(true)
    try {
      const res = await api.post(`/forms/${id}/banner`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const bannerPath = res.data.banner_path
      setForm((prev) => ({ ...prev, banner_path: bannerPath }))
      setBase((prev) => ({ ...prev, banner_path: bannerPath }))
      toast.success(t('formEdit.bannerUploaded'))
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to upload banner')
    } finally {
      setBannerUploading(false)
    }
  }

  const handleRemoveBanner = async () => {
    if (bannerRemoving) return
    setBannerRemoving(true)
    try {
      await api.delete(`/forms/${id}/banner`)
      setForm((prev) => ({ ...prev, banner_path: null }))
      setBase((prev) => ({ ...prev, banner_path: null }))
      toast.success('Banner removed')
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to remove banner')
    } finally {
      setBannerRemoving(false)
    }
  }

  const handleScoringModeChange = (mode) => {
    if (!form || mode === (form.scoring_mode || 'auto')) return
    setForm((prev) => ({ ...prev, scoring_mode: mode }))
    setErrors((prev) => ({ ...prev, scoring_mode: undefined }))
    if (mode === 'auto') {
      api.get(`/forms/${id}/questions`).then((qRes) => setQuestions(qRes.data.data)).catch(() => { })
    }
  }

  const handleManualPointsChange = (value) => {
    if (!Number.isFinite(value)) return
    setManualPoints(Math.max(0, Math.min(999, Math.round(value))))
  }

  const formTourVariant = form ? [
    form.type,
    form.status,
    form.scoring_mode || 'auto',
    form.is_restricted ? 'restricted' : 'open',
    form.display_style || 'card',
    form.timer_seconds ? 'timer' : 'no-timer',
    form.starts_at || form.ends_at ? 'scheduled' : 'always',
    form.banner_path ? 'banner' : 'no-banner',
    form.reveal_score === false ? 'hide-score' : 'show-score',
    form.reveal_answers === false ? 'hide-answers' : 'show-answers',
    form.shuffle_questions || form.shuffle_options ? 'shuffle' : 'ordered',
  ].join('-') : 'loading'
  const formTourSteps = form ? [
    { target: '[data-tour="form-edit-header"]', title: 'Form workspace', content: 'Use these tabs to move between settings, questions, results, and analytics.', placement: 'bottom' },
    { target: '[data-tour="form-edit-basics"]', title: 'Start with the basics', content: 'Write the title, description, and public status before configuring response rules.', placement: 'right' },
     { target: '[data-tour="form-edit-access"]', title: 'Control who can respond', content: form.is_restricted ? 'Restricted mode keeps access and one-response rules linked for safety.' : 'Choose login, response limits, and whether submissions appear in history.', placement: 'right' },
     { target: '[data-tour="form-edit-design"]', title: 'Shape the experience', content: 'Choose a display style and theme color so the form feels consistent with your brand.', placement: 'left' },
     { target: '[data-tour="form-edit-make-quiz"]', title: form.type === 'quiz' ? 'Keep quiz mode enabled' : 'Make this a quiz', content: form.type === 'quiz' ? 'Quiz mode unlocks scoring, leaderboard, score review, and other quiz-only settings.' : 'Turn this into a quiz when respondents need scoring and answer keys.', placement: 'right' },

    ...(form.type === 'quiz' ? [
      { target: '[data-tour="form-edit-quiz"]', title: form.scoring_mode === 'manual' ? 'Tune manual scoring' : 'Choose how the quiz is scored', content: form.scoring_mode === 'manual' ? 'Assign points to questions and control which answers are scored.' : 'Automatic scoring distributes the quiz pool across scored questions.', placement: 'left' },
      { target: '[data-tour="form-edit-behavior"]', title: 'Quiz behavior', content: 'Set leaderboard, score, answer review, restrictions, shuffle, timer, and thank-you behavior.', placement: 'left' },
    ] : []),
    { target: '[data-tour="form-edit-schedule"]', title: 'Schedule the window', content: 'Set optional open and close times. Leave both empty to accept responses whenever the form is published.', placement: 'top' },
     { target: '[data-tour="form-edit-share"]', title: 'Share when ready', content: 'Copy the public link, open a preview, or generate a QR code for your audience.', placement: 'left' },
     { target: '[data-tour="form-edit-banner"]', title: 'Add a banner', content: 'Upload a visual banner to give the public form a branded introduction.', placement: 'left' },
     ...(dirty ? [{ target: '[data-tour="form-edit-save"]', title: 'Save your changes', content: 'Your changes are not live until you save them.', placement: 'top' }] : []),

  ] : []
  usePageTour('form-edit', { variant: formTourVariant, variantKey: formTourVariant, steps: formTourSteps })

  if (loading) return <PageSkeleton />
  if (!form) return null

  const isRestricted = !!form.is_restricted
  const onceLocked = form.submission_limit === 'once'
  // isQuiz = tipe form (bukan display style) — setelan & validasi khusus quiz
  // tetap berlaku berapa pun display style-nya.
  const isQuiz = form.type === 'quiz'

  return (
    <div>
      <FormBackButton />

      <div data-tour="form-edit-header">
        <PageHeader
          eyebrow={t('formEdit.workspace')}
          title={form.title ? <RichText html={form.title} className="rich-text" /> : t('formEdit.formSettings')}
          description={
            <span className="inline-flex items-center gap-2">
              <StatusBadge status={form.status} />
              <span className="text-gray-400 dark:text-gray-500"></span>
            </span>
          }

        />
      </div>

      <FormSubNav formId={id} className="mt-5" hasUnsavedChanges={dirty} />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6 order-2 lg:order-1">
           <SectionCard data-tour="form-edit-basics" title={t('formEdit.basicInfo')} icon={<Info className="w-4 h-4" />}>

            <div className="space-y-5">
              <div ref={titleRef}>
                <span className="field-label">{t('formEdit.titleLabel')}</span>
                <RichTextEditor
                  value={form.title || ''}
                  onChange={(html) => { setForm((prev) => ({ ...prev, title: html })); setErrors((p) => ({ ...p, title: undefined })) }}
                  placeholder={t('formEdit.titlePlaceholder')}
                  minHeight={60}
                  headline
                />
                {errors.title && <p className="field-error mt-1" role="alert">{errors.title}</p>}
              </div>
              <div>
                <span className="field-label">{t('formEdit.descLabel')}</span>
                <RichTextEditor
                  value={form.description || ''}
                  onChange={(html) => { setForm((prev) => ({ ...prev, description: html })); setErrors((p) => ({ ...p, description: undefined })) }}
                  placeholder={t('formEdit.descPlaceholder')}
                  minHeight={120}
                />
                {errors.description && <p className="field-error" role="alert">{errors.description}</p>}
              </div>

              <div>
                <label ref={statusRef} className="field-label !mb-1.5">{t('formEdit.publicStatus')}</label>
                <div className={`flex h-11 rounded-xl border overflow-hidden ${errors.status ? 'border-incorrect' : 'border-gray-200 dark:border-gray-700'}`}>
                  <button
                    type="button"
                    onClick={() => updateSetting('status', 'published')}
                    className={`flex-1 text-sm font-semibold transition-colors ${form.status === 'published' ? 'bg-correct text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800'
                      }`}
                  >
                    {t('formEdit.statusPublic')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('status', 'draft')}
                    className={`flex-1 text-sm font-semibold transition-colors ${form.status !== 'published' && form.status !== 'closed' ? 'bg-gray-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800'
                      }`}
                  >
                    {t('formEdit.statusDraft')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('status', 'closed')}
                    className={`flex-1 text-sm font-semibold transition-colors ${form.status === 'closed' ? 'bg-incorrect text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800'
                      }`}
                  >
                    {t('formEdit.statusClosed')}
                  </button>
                </div>
                {errors.status && (
                  <p className="field-error" role="alert">{errors.status}</p>
                )}
              </div>

            </div>
          </SectionCard>

           <SectionCard data-tour="form-edit-access" title={t('formEdit.access')} icon={<Lock className="w-4 h-4" />}>

            <div ref={accessRef} className="divide-y divide-gray-100 dark:divide-gray-800">
              <SettingRow
                title={t('formEdit.limitOneResponse')}
                control={
                  <Toggle
                    label={t('formEdit.limitOneResponse')}
                    checked={isRestricted ? true : form.submission_limit === 'once'}
                    disabled={isRestricted}
                    onChange={(v) => toggleSetting('submission_limit', v ? 'once' : 'unlimited')}
                  />
                }
              />
              {errors.submission_limit && <p className="field-error px-4 pb-1 -mt-1" role="alert">{errors.submission_limit}</p>}
              <SettingRow
                title={t('formEdit.requireLogin')}
                desc={onceLocked ? t('formEdit.requireLoginDescLocked') : t('formEdit.requireLoginDesc')}
                control={
                  <Toggle
                    label={t('formEdit.requireLogin')}
                    checked={form.require_login}
                    disabled={onceLocked}
                    onChange={(v) => toggleSetting('require_login', v)}
                  />
                }
              />
              {errors.require_login && <p className="field-error px-4 pb-1 -mt-1" role="alert">{errors.require_login}</p>}
              <SettingRow
                title={t('formEdit.showInHistory')}
                desc={form.show_in_history === false ? t('formEdit.showInHistoryDescOff') : t('formEdit.showInHistoryDescOn')}
                control={
                  <Toggle
                    label={t('formEdit.showInHistory')}
                    checked={form.show_in_history !== false}
                    onChange={(v) => updateSetting('show_in_history', v)}
                  />
                }
              />
              {errors.show_in_history && <p className="field-error px-4 pb-1 -mt-1" role="alert">{errors.show_in_history}</p>}
            </div>
          </SectionCard>

           <SectionCard data-tour="form-edit-design" title={t('formEdit.design')} icon={<Palette className="w-4 h-4" />}>

            <div ref={designRef} className="space-y-5">
              <div>
                <label className="field-label">{t('formEdit.designType')}</label>
                <div className={`grid grid-cols-2 gap-3 rounded-xl ${errors.display_style ? 'ring-2 ring-incorrect/40 p-1' : ''}`}>
                  <button
                    type="button"
                    onClick={() => updateSetting('display_style', 'card')}
                    aria-invalid={!!errors.display_style}
                    className={`relative rounded-xl border-2 overflow-hidden transition-all ${(form.display_style || 'card') === 'card'
                      ? 'border-primary ring-2 ring-primary/20'
                      : errors.display_style
                        ? 'border-incorrect hover:border-incorrect'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                  >
                    <img src="/preview-form.png" alt="Card style" className="w-full h-32 object-cover" />
                    <span className="block text-sm font-medium py-2 text-ink dark:text-gray-100">{t('formEdit.designCard')}</span>
                    {(form.display_style || 'card') === 'card' && (
                      <span className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('display_style', 'quiz')}
                    aria-invalid={!!errors.display_style}
                    className={`relative rounded-xl border-2 overflow-hidden transition-all ${form.display_style === 'quiz'
                      ? 'border-primary ring-2 ring-primary/20'
                      : errors.display_style
                        ? 'border-incorrect hover:border-incorrect'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                  >
                    <img src="/preview-quiz.png" alt="Quiz style" className="w-full h-32 object-cover" />
                    <span className="block text-sm font-medium py-2 text-ink dark:text-gray-100">{t('formEdit.designQuiz')}</span>
                    {form.display_style === 'quiz' && (
                      <span className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </button>
                </div>
                {errors.display_style && <p className="field-error" role="alert">{errors.display_style}</p>}
              </div>

              <div>
                <label className="field-label">{t('formEdit.themeColor')}</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    name="theme_color"
                    value={form.theme_color || '#6C5CE7'}
                    onChange={handleChange}
                    aria-invalid={!!errors.theme_color}
                    className={`w-11 h-11 rounded-xl cursor-pointer border shrink-0 ${errors.theme_color ? 'border-incorrect' : 'border-gray-200 dark:border-gray-700'}`}
                    aria-label="Theme color"
                  />
                  <input
                    name="theme_color"
                    value={form.theme_color || ''}
                    onChange={handleChange}
                    aria-invalid={!!errors.theme_color}
                    className={`input-field font-mono ${errors.theme_color ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    placeholder="#6C5CE7"
                  />
                </div>
                {errors.theme_color && <p className="field-error" role="alert">{errors.theme_color}</p>}
              </div>
            </div>
          </SectionCard>

           <SectionCard data-tour="form-edit-behavior" title={t('formEdit.behavior')} icon={<Settings2 className="w-4 h-4" />}>

            <div ref={behaviorRef} className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl overflow-hidden">
               <div data-tour="form-edit-make-quiz">
                 <SettingRow
                   title={t('formEdit.makeQuiz')}
                   control={
                     <Toggle
                       label={t('formEdit.makeQuiz')}
                       checked={isQuiz}
                       onChange={(v) => {
                         const nt = v ? 'quiz' : 'form'
                         if (nt === 'form') setForm((prev) => ({ ...prev, type: nt, show_leaderboard: false, is_restricted: false }))
                         else setForm((prev) => ({ ...prev, type: nt }))
                         setErrors((prev) => ({ ...prev, type: undefined, show_leaderboard: undefined, is_restricted: undefined }))
                       }}
                     />
                   }
                 />
               </div>

              {errors.type && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.type}</p>}
              {isQuiz && (
                 <div data-tour="form-edit-quiz" className="ml-4 pl-4 border-l-2 border-primary/25 dark:border-primary/30 divide-y divide-gray-100 dark:divide-gray-800">

                  <div className="py-3">
                    <p className="text-sm font-medium text-ink dark:text-gray-100">{t('formEdit.scoringMode')}</p>
                    <div className="mt-3">
                      <ScoringSettings
                        mode={form.scoring_mode || 'auto'}
                        onModeChange={handleScoringModeChange}
                        questions={questions}
                        manualPoints={manualPoints}
                        onManualPointsChange={handleManualPointsChange}
                      />
                    </div>
                    {errors.scoring_mode && <p className="field-error mt-1" role="alert">{errors.scoring_mode}</p>}
                  </div>
                  <SettingRow
                    title={t('formEdit.showLeaderboard')}
                    desc={t('formEdit.showLeaderboardDesc')}
                    control={<Toggle label="Show leaderboard" checked={!!form.show_leaderboard} onChange={(v) => toggleSetting('show_leaderboard', v)} />}
                  />
                  {errors.show_leaderboard && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.show_leaderboard}</p>}
                  <SettingRow
                    title={t('formEdit.showFinalScore')}
                    desc={t('formEdit.showFinalScoreDesc')}
                    control={<Toggle label={t('formEdit.showFinalScore')} checked={form.reveal_score !== false} onChange={(v) => updateSetting('reveal_score', v)} />}
                  />
                  {errors.reveal_score && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.reveal_score}</p>}
                  <SettingRow
                    title={t('formEdit.showAnswerReview')}
                    desc={t('formEdit.showAnswerReviewDesc')}
                    control={<Toggle label={t('formEdit.showAnswerReview')} checked={form.reveal_answers !== false} onChange={(v) => updateSetting('reveal_answers', v)} />}
                  />
                  {errors.reveal_answers && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.reveal_answers}</p>}
                  <SettingRow
                    title={t('formEdit.restrictMode')}
                    desc={t('formEdit.restrictModeDesc')}
                    control={<Toggle label="Restrict mode" checked={isRestricted} onChange={(v) => toggleSetting('is_restricted', v)} />}
                  />
                  {errors.is_restricted && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.is_restricted}</p>}
                </div>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <SettingRow
                title={t('formEdit.shuffleQuestions')}
                desc={t('formEdit.shuffleQuestionsDesc')}
                control={<Toggle label="Shuffle questions" checked={form.shuffle_questions} onChange={(v) => updateSetting('shuffle_questions', v)} />}
              />
              {errors.shuffle_questions && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.shuffle_questions}</p>}
              <SettingRow
                title={t('formEdit.shuffleOptions')}
                desc={t('formEdit.shuffleOptionsDesc')}
                control={<Toggle label="Shuffle options" checked={form.shuffle_options} onChange={(v) => updateSetting('shuffle_options', v)} />}
              />
              {errors.shuffle_options && <p className="field-error px-4 pb-2 -mt-1" role="alert">{errors.shuffle_options}</p>}
              <div className="py-4">
                <Input
                  label={t('formEdit.timeLimit') + (isQuiz ? ' *' : '')}
                  type="number"
                  value={timerMinutes}
                  onChange={(e) => { setTimerMinutes(e.target.value); setErrors((p) => ({ ...p, timer_seconds: undefined })) }}
                  placeholder="e.g. 10"
                  min={1}
                  max={1440}
                  helper={isQuiz ? t('formEdit.timeLimitHintQuiz') : t('formEdit.timeLimitHintForm')}
                  error={errors.timer_seconds}
                  ref={timerRef}
                />
              </div>
               <div data-tour="form-edit-schedule" className="py-4" ref={scheduleRef}>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">{t('formEdit.opensAt')}</label>
                    <input
                      type="datetime-local"
                      name="starts_at"
                      value={toInputDate(form.starts_at)}
                      onChange={(e) => { setForm((p) => ({ ...p, starts_at: e.target.value })); setErrors((p) => ({ ...p, starts_at: undefined, ends_at: p.ends_at && e.target.value ? undefined : p.ends_at })) }}
                      aria-invalid={!!errors.starts_at}
                      className={`input-field ${errors.starts_at ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                    {errors.starts_at && <p className="field-error" role="alert">{errors.starts_at}</p>}
                  </div>
                  <div>
                    <label className="field-label">{t('formEdit.closesAt')}</label>
                    <input
                      type="datetime-local"
                      name="ends_at"
                      value={toInputDate(form.ends_at)}
                      onChange={(e) => { setForm((p) => ({ ...p, ends_at: e.target.value })); setErrors((p) => ({ ...p, ends_at: undefined, starts_at: p.starts_at && e.target.value ? undefined : p.starts_at })) }}
                      aria-invalid={!!errors.ends_at}
                      className={`input-field ${errors.ends_at ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                    {errors.ends_at && <p className="field-error" role="alert">{errors.ends_at}</p>}
                  </div>
                </div>
              </div>
              <div className="py-4">
                <div>
                  <span className="field-label">{t('formEdit.thankYou')}</span>
                  <RichTextEditor
                    value={form.thank_you_message || ''}
                    onChange={(html) => { setForm((prev) => ({ ...prev, thank_you_message: html })); setErrors((p) => ({ ...p, thank_you_message: undefined })) }}
                    placeholder={t('formEdit.thankYouPlaceholder')}
                    minHeight={90}
                  />
                  {errors.thank_you_message && <p className="field-error" role="alert">{errors.thank_you_message}</p>}
                </div>
              </div>
              <div className="pt-3 mt-1 border-t border-gray-100 dark:border-gray-800">
                <Button onClick={() => setShowDelete(true)} variant="ghost-danger" size="sm" icon={<Trash2 className="w-4 h-4" />}>
                  {t('formEdit.delete')}
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 self-start order-1 lg:order-2">
           <SectionCard data-tour="form-edit-share" title={t('formEdit.share')} icon={<Link2 className="w-4 h-4" />}>

            <ShareLink value={`${window.location.origin}/q/${form.short_code}`} />
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                icon={<ExternalLink className="w-4 h-4" />}
                onClick={() => window.open(`${window.location.origin}/q/${form.short_code}`, '_blank', 'noopener,noreferrer')}
              >
                {t('formEdit.openPublic')}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                icon={<QrCode className="w-4 h-4" />}
                onClick={() => setShowQr(true)}
              >
                {t('formEdit.showQr')}
              </Button>
            </div>
          </SectionCard>
           <SectionCard data-tour="form-edit-banner" title={t('formEdit.banner')} icon={<ImageUp className="w-4 h-4" />}>

            {form.banner_path ? (
              <div className="relative mb-4">
                <img src={resolveMediaUrl(form.banner_path)} alt="Banner" className="w-full h-36 object-cover rounded-xl" />
                {bannerUploading && (
                  <div className="absolute inset-0 rounded-xl bg-ink/50 flex items-center justify-center gap-2 text-white text-sm font-medium">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('formEdit.uploading')}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={bannerUploading}
                onClick={() => fileRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:text-primary disabled:opacity-60 disabled:cursor-wait disabled:hover:border-gray-200 dark:disabled:hover:border-gray-700"
              >
                {bannerUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageUp className="w-6 h-6" />}
                <span className="text-sm font-medium">{bannerUploading ? t('formEdit.uploading') : t('formEdit.uploadBanner')}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleBanner} className="hidden" disabled={bannerUploading} />
            {form.banner_path && (
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" className="flex-1" disabled={bannerUploading || bannerRemoving} loading={bannerUploading} onClick={() => fileRef.current?.click()} icon={<ImageUp className="w-4 h-4" />}>
                  {bannerUploading ? t('formEdit.uploading') : t('formEdit.changeBanner')}
                </Button>
                <Button type="button" variant="ghost-danger" size="sm" className="flex-1" disabled={bannerUploading || bannerRemoving} loading={bannerRemoving} onClick={handleRemoveBanner} icon={<Trash2 className="w-4 h-4" />}>
                  {bannerRemoving ? t('formEdit.removing') : t('formEdit.removeBanner')}
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-4 inset-x-4 z-50 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center gap-3 bg-white dark:bg-ink-900 border border-gray-200 dark:border-gray-700 shadow-lift rounded-2xl px-4 py-3 w-full max-w-md">
              <p className="text-sm text-gray-500 dark:text-gray-400 flex-1 truncate">{t('formEdit.unsavedChanges')}</p>
              <Button variant="ghost" size="sm" onClick={handleDiscard}>{t('formEdit.discard')}</Button>
                   <Button data-tour="form-edit-save" size="sm" onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>

                {saving ? t('formEdit.saving') : t('formEdit.saveChanges')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        show={showDelete}
        title={t('formEdit.deleteConfirm')}
        message={t('formEdit.deleteMsg')}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleting}
        confirmText={t('formEdit.delete')}
        variant="danger"
      />

      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
            onClick={() => setShowQr(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              className="bg-white dark:bg-ink-900 border dark:border-ink-700 rounded-2xl p-6 w-full max-w-sm shadow-lift relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowQr(false)}
                className="absolute top-3 right-3 p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                aria-label="Close QR code"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-display text-lg font-bold text-ink dark:text-gray-100 mb-1">{t('formEdit.scanToOpen')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t('formEdit.qrHint', { title: stripTags(form.title) })}</p>
              <div className="flex justify-center p-4 border border-gray-100 dark:border-gray-800 rounded-2xl relative">
                {/* SVG untuk display — anti-hitam pekat, canvas glitch tidak terjadi */}
                <QRCodeSVG
                  value={`${window.location.origin}/q/${form.short_code}`}
                  size={220}
                  marginSize={2}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  className="rounded-lg"
                  style={{ height: 220, width: 220 }}
                  data-qr-svg="true"
                />
                {/* Canvas hidden untuk download PNG tetap pakai toDataURL */}
                <QRCodeCanvas
                  ref={qrRef}
                  value={`${window.location.origin}/q/${form.short_code}`}
                  size={220}
                  marginSize={2}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 220, width: 220 }}
                  data-qr-canvas="true"
                />
              </div>
              <Button
                variant="secondary"
                size="lg"
                className="w-full mt-5"
                onClick={downloadQr}
                icon={<Download className="w-4 h-4" />}
              >
                {t('formEdit.downloadQr')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
