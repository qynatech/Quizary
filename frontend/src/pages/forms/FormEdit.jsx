import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ArrowLeft, Save, Trash2, ImageUp, Link2, ChevronDown, Info, Lock, Settings2, Download, QrCode, X, Palette } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { Button, Input, Select, Toggle, Card, StatusBadge, ConfirmModal, PageHeader, FormSubNav, PageSkeleton, RichTextEditor, RichText, ScoringSettings } from '../../components/ui'
import { stripTags } from '../../lib/sanitize'
import { useTranslation } from 'react-i18next'

function ShareLink({ value }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  // Compact: link bisa diklik (buka halaman publik) + tombol copy dalam satu baris.
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-ink-800/50 px-3.5 h-11">
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        title={t('formEdit.openPublic')}
        className="flex-1 min-w-0 font-mono text-sm text-gray-600 dark:text-gray-300 truncate hover:text-primary dark:hover:text-primary-300 transition-colors"
      >
        {value}
      </a>
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

function CollapsibleCard({ title, icon, defaultOpen = false, open, onToggle, children }) {
  const [internal, setInternal] = useState(defaultOpen)
  const isOpen = open !== undefined ? open : internal
  const toggle = () => (onToggle ? onToggle(!isOpen) : setInternal(!isOpen))
  return (
    <Card padding={false}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-gray-50/70 dark:hover:bg-ink-800/40 transition-colors"
      >
        <span className="text-primary shrink-0">{icon}</span>
        <h2 className="font-display font-semibold text-ink dark:text-gray-100">{title}</h2>
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
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
  const [showDelete, setShowDelete] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [errors, setErrors] = useState({})
  const [scoringMode, setScoringMode] = useState('auto')
  const [scoringSaving, setScoringSaving] = useState(false)
  const [questions, setQuestions] = useState([])
  const titleRef = useRef(null)
  const timerRef = useRef(null)
  const designRef = useRef(null)
  const [basicOpen, setBasicOpen] = useState(true)
  const [behaviorOpen, setBehaviorOpen] = useState(false)
  const [designOpen, setDesignOpen] = useState(false)

  // Buka card + scroll ke input yang error supaya user langsung lihat apa yang kurang.
  const revealError = (setOpen, ref) => {
    setOpen(true)
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  useEffect(() => {
    api.get(`/forms/${id}`)
      .then((res) => {
        setForm(res.data)
        setBase(res.data)
        setScoringMode(res.data.scoring_mode || 'auto')
        const minutes = res.data.timer_seconds ? String(Math.round(res.data.timer_seconds / 60)) : ''
        setTimerMinutes(minutes)
        setInitialTimerMinutes(minutes)
        if (res.data.type === 'quiz') {
          api.get(`/forms/${id}/questions`).then((qRes) => setQuestions(qRes.data.data)).catch(() => { })
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

  function toInputDate(str) {
    if (!str) return ''
    if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
      const [date, time] = str.split(' ')
      const [day, month, year] = date.split('-')
      return `${year}-${month}-${day}T${(time || '').slice(0, 5)}`
    }
    return str
  }

  const timerChanged = timerMinutes !== initialTimerMinutes
  const dirty = form && base
    ? (JSON.stringify(normalize()) !== JSON.stringify(baseSnapshot()) || timerChanged)
    : false

  const buildPayload = () => ({
    ...normalize(),
    timer_seconds: timerMinutes ? Number(timerMinutes) * 60 : null,
  })

  const applyFieldErrors = (err) => {
    const data = err.response?.data
    if (data?.errors) {
      const mapped = {}
      data.errors.forEach((entry) => {
        Object.entries(entry).forEach(([k, v]) => { mapped[k] = v })
      })
      setErrors(mapped)
      if (mapped.title) revealError(setBasicOpen, titleRef)
      if (mapped.timer_seconds) revealError(setBehaviorOpen, timerRef)
      if (mapped.display_style || mapped.theme_color) revealError(setDesignOpen, designRef)
      const unresolved = data.errors.filter((entry) => Object.keys(entry)[0] === '_schema')
      if (unresolved.length || data.message) {
        toast.error(data.message || t('formEdit.invalidFields'))
      }
    } else {
      toast.error(data?.message || data?.detail || t('formEdit.saveFailed'))
    }
  }

  const handleSave = async () => {
    if (!stripTags(form.title)) {
      setErrors({ title: t('formEdit.titleRequired') })
      revealError(setBasicOpen, titleRef)
      return
    }
    // Quiz wajib punya timer (per menit) — dicek juga di backend saat publish.
    if (isQuiz && !timerMinutes) {
      setErrors({ timer_seconds: t('formEdit.timerRequired') })
      revealError(setBehaviorOpen, timerRef)
      return
    }
    setSaving(true)
    try {
      const res = await api.put(`/forms/${id}`, buildPayload())
      setForm(res.data)
      setBase(res.data)
      const minutes = res.data.timer_seconds ? String(Math.round(res.data.timer_seconds / 60)) : ''
      setTimerMinutes(minutes)
      setInitialTimerMinutes(minutes)
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
    const canvas = qrRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-${form.short_code}.png`
    a.click()
  }

  const handleBanner = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('banner', file)
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
    }
  }

  const handleRemoveBanner = async () => {
    try {
      await api.delete(`/forms/${id}/banner`)
      setForm((prev) => ({ ...prev, banner_path: null }))
      setBase((prev) => ({ ...prev, banner_path: null }))
      toast.success('Banner removed')
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to remove banner')
    }
  }

  const handleBatchUpdatePoints = async (points) => {
    try {
      await api.patch(`/forms/${id}/questions/points`, { points })
      const qRes = await api.get(`/forms/${id}/questions`)
      setQuestions(qRes.data.data)
      toast.success(t('formEdit.batchPointsSet', { points }))
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to update points')
      throw err
    }
  }

  const handleScoringModeChange = async (mode) => {
    if (!form || mode === scoringMode || scoringSaving) return
    const previous = scoringMode
    setScoringMode(mode)
    setScoringSaving(true)
    try {
      const res = await api.put(`/forms/${id}`, { scoring_mode: mode })
      setForm((prev) => ({ ...prev, ...res.data }))
      setBase((prev) => ({ ...prev, ...res.data }))
      if (mode === 'auto') {
        api.get(`/forms/${id}/questions`).then((qRes) => setQuestions(qRes.data.data)).catch(() => { })
      }
      toast.success(mode === 'auto' ? t('formEdit.scoringAutoOn') : t('formEdit.scoringManualOn'))
    } catch (err) {
      setScoringMode(previous)
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to change scoring method')
    } finally {
      setScoringSaving(false)
    }
  }

  if (loading) return <PageSkeleton />
  if (!form) return null

  const isRestricted = !!form.is_restricted
  const onceLocked = form.submission_limit === 'once'
  // isQuiz = tipe form (bukan display style) — setelan & validasi khusus quiz
  // tetap berlaku berapa pun display style-nya.
  const isQuiz = form.type === 'quiz'

  return (
    <div>
      <button
        onClick={() => navigate('/forms')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('formEdit.backToForms')}
      </button>

      <PageHeader
        eyebrow={t('formEdit.workspace')}
        title={form.title ? <RichText html={form.title} /> : t('formEdit.formSettings')}
        description={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={form.status} />
            <span className="text-gray-400 dark:text-gray-500"></span>
          </span>
        }
      />

      <FormSubNav formId={id} className="mt-5" />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6 order-2 lg:order-1">
          <CollapsibleCard title={t('formEdit.basicInfo')} icon={<Info className="w-4 h-4" />} open={basicOpen} onToggle={setBasicOpen}>
            <div className="space-y-5">
              <div ref={titleRef}>
                <span className="field-label">{t('formEdit.titleLabel')}</span>
                <RichTextEditor
                  value={form.title || ''}
                  onChange={(html) => setForm((prev) => ({ ...prev, title: html }))}
                  placeholder={t('formEdit.titlePlaceholder')}
                  minHeight={60}
                />
                {errors.title && <p className="field-error mt-1">{errors.title}</p>}
              </div>
              <div>
                <span className="field-label">{t('formEdit.descLabel')}</span>
                <RichTextEditor
                  value={form.description || ''}
                  onChange={(html) => setForm((prev) => ({ ...prev, description: html }))}
                  placeholder={t('formEdit.descPlaceholder')}
                  minHeight={120}
                />
                {errors.description && <p className="field-error">{errors.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Select label={t('formEdit.typeLabel')} name="type" value={form.type} onChange={handleChange} error={errors.type}>
                  <option value="form">{t('formEdit.typeForm')}</option>
                  <option value="quiz">{t('formEdit.typeQuiz')}</option>
                </Select>
                <div>
                  <label className="field-label !mb-1.5">{t('formEdit.publicStatus')}</label>
                  <div className="flex h-11 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, status: 'published' }))}
                      className={`flex-1 text-sm font-semibold transition-colors ${form.status === 'published' ? 'bg-correct text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800'
                        }`}
                    >
                      {t('formEdit.statusPublic')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, status: 'draft' }))}
                      className={`flex-1 text-sm font-semibold transition-colors ${form.status !== 'published' && form.status !== 'closed' ? 'bg-gray-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800'
                        }`}
                    >
                      {t('formEdit.statusDraft')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, status: 'closed' }))}
                      className={`flex-1 text-sm font-semibold transition-colors ${form.status === 'closed' ? 'bg-incorrect text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800'
                        }`}
                    >
                      {t('formEdit.statusClosed')}
                    </button>
                  </div>
                  {errors.status && (
                    <p className="field-error">{errors.status}</p>
                  )}
                </div>
              </div>

              <Select
                label={t('formEdit.submissionLimit')}
                name="submission_limit"
                value={isRestricted ? 'once' : form.submission_limit}
                onChange={(e) => { handleChange(e); toggleSetting('submission_limit', e.target.value) }}
                disabled={isRestricted}
                error={errors.submission_limit}
                helper={isRestricted ? t('formEdit.lockedOnceHint') : undefined}
              >
                <option value="unlimited">{t('formEdit.limitUnlimited')}</option>
                <option value="once">{t('formEdit.limitOnce')}</option>
              </Select>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title={t('formEdit.access')} icon={<Lock className="w-4 h-4" />}>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
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
              <SettingRow
                title={t('formEdit.showInHistory')}
                desc={form.show_in_history === false ? t('formEdit.showInHistoryDescOff') : t('formEdit.showInHistoryDescOn')}
                control={
                  <Toggle
                    label={t('formEdit.showInHistory')}
                    checked={form.show_in_history !== false}
                    onChange={(v) => setForm((prev) => ({ ...prev, show_in_history: v }))}
                  />
                }
              />
            </div>
          </CollapsibleCard>

          <CollapsibleCard title={t('formEdit.design')} icon={<Palette className="w-4 h-4" />} open={designOpen} onToggle={setDesignOpen}>
            <div ref={designRef} className="space-y-5">
              <div>
                <label className="field-label">{t('formEdit.designType')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, display_style: 'card' }))}
                    className={`relative rounded-xl border-2 overflow-hidden transition-all ${(form.display_style || 'card') === 'card'
                      ? 'border-primary ring-2 ring-primary/20'
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
                    onClick={() => setForm((prev) => ({ ...prev, display_style: 'quiz' }))}
                    className={`relative rounded-xl border-2 overflow-hidden transition-all ${form.display_style === 'quiz'
                      ? 'border-primary ring-2 ring-primary/20'
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
                {errors.display_style && <p className="field-error">{errors.display_style}</p>}
              </div>

              <div>
                <label className="field-label">{t('formEdit.themeColor')}</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    name="theme_color"
                    value={form.theme_color || '#6C5CE7'}
                    onChange={handleChange}
                    className={`w-11 h-11 rounded-xl cursor-pointer border border-gray-200 dark:border-gray-700 shrink-0 ${errors.theme_color ? 'border-incorrect' : ''}`}
                    aria-label="Theme color"
                  />
                  <input
                    name="theme_color"
                    value={form.theme_color || ''}
                    onChange={handleChange}
                    className={`input-field font-mono ${errors.theme_color ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    placeholder="#6C5CE7"
                  />
                </div>
                {errors.theme_color && <p className="field-error">{errors.theme_color}</p>}
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title={t('formEdit.behavior')} icon={<Settings2 className="w-4 h-4" />} open={behaviorOpen} onToggle={setBehaviorOpen}>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <SettingRow
                title={t('formEdit.shuffleQuestions')}
                desc={t('formEdit.shuffleQuestionsDesc')}
                control={<Toggle label="Shuffle questions" checked={form.shuffle_questions} onChange={(v) => setForm((prev) => ({ ...prev, shuffle_questions: v }))} />}
              />
              <SettingRow
                title={t('formEdit.shuffleOptions')}
                desc={t('formEdit.shuffleOptionsDesc')}
                control={<Toggle label="Shuffle options" checked={form.shuffle_options} onChange={(v) => setForm((prev) => ({ ...prev, shuffle_options: v }))} />}
              />
              {isQuiz && (
                <>
                  <div className="py-3">
                    <p className="text-sm font-medium text-ink dark:text-gray-100">{t('formEdit.scoringMode')}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('formEdit.scoringAutoDesc')}</p>
                    <div className="mt-3">
                      <ScoringSettings
                        mode={scoringMode}
                        onModeChange={handleScoringModeChange}
                        saving={scoringSaving}
                        questions={questions}
                        onBatchUpdate={handleBatchUpdatePoints}
                      />
                    </div>
                  </div>
                  <SettingRow
                    title={t('formEdit.showLeaderboard')}
                    desc={t('formEdit.showLeaderboardDesc')}
                    control={<Toggle label="Show leaderboard" checked={!!form.show_leaderboard} onChange={(v) => toggleSetting('show_leaderboard', v)} />}
                  />
                  <SettingRow
                    title={t('formEdit.showFinalScore')}
                    desc={t('formEdit.showFinalScoreDesc')}
                    control={<Toggle label={t('formEdit.showFinalScore')} checked={form.reveal_score !== false} onChange={(v) => setForm((prev) => ({ ...prev, reveal_score: v }))} />}
                  />
                  <SettingRow
                    title={t('formEdit.showAnswerReview')}
                    desc={t('formEdit.showAnswerReviewDesc')}
                    control={<Toggle label={t('formEdit.showAnswerReview')} checked={form.reveal_answers !== false} onChange={(v) => setForm((prev) => ({ ...prev, reveal_answers: v }))} />}
                  />
                  <SettingRow
                    title={t('formEdit.restrictMode')}
                    desc={t('formEdit.restrictModeDesc')}
                    control={<Toggle label="Restrict mode" checked={isRestricted} onChange={(v) => toggleSetting('is_restricted', v)} />}
                  />
                </>
              )}
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
              <div className="py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">{t('formEdit.opensAt')}</label>
                    <input
                      type="datetime-local"
                      name="starts_at"
                      value={toInputDate(form.starts_at)}
                      onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))}
                      className={`input-field ${errors.starts_at ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                    {errors.starts_at && <p className="field-error">{errors.starts_at}</p>}
                  </div>
                  <div>
                    <label className="field-label">{t('formEdit.closesAt')}</label>
                    <input
                      type="datetime-local"
                      name="ends_at"
                      value={toInputDate(form.ends_at)}
                      onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))}
                      className={`input-field ${errors.ends_at ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                    {errors.ends_at && <p className="field-error">{errors.ends_at}</p>}
                  </div>
                </div>
              </div>
              <div className="py-4">
                <div>
                  <span className="field-label">{t('formEdit.thankYou')}</span>
                  <RichTextEditor
                    value={form.thank_you_message || ''}
                    onChange={(html) => setForm((prev) => ({ ...prev, thank_you_message: html }))}
                    placeholder={t('formEdit.thankYouPlaceholder')}
                    minHeight={90}
                  />
                  {errors.thank_you_message && <p className="field-error">{errors.thank_you_message}</p>}
                </div>
              </div>
              <div className="pt-3 mt-1 border-t border-gray-100 dark:border-gray-800">
                <Button onClick={() => setShowDelete(true)} variant="ghost-danger" size="sm" icon={<Trash2 className="w-4 h-4" />}>
                  {t('formEdit.delete')}
                </Button>
              </div>
            </div>
          </CollapsibleCard>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 self-start order-1 lg:order-2">
          <CollapsibleCard title={t('formEdit.share')} icon={<Link2 className="w-4 h-4" />} defaultOpen>
            <ShareLink value={`${window.location.origin}/q/${form.short_code}`} />
            <div className="mt-4">
              <Button
                variant="secondary"
                className="w-full"
                icon={<QrCode className="w-4 h-4" />}
                onClick={() => setShowQr(true)}
              >
                {t('formEdit.showQr')}
              </Button>
            </div>
          </CollapsibleCard>
          <CollapsibleCard title={t('formEdit.banner')} icon={<ImageUp className="w-4 h-4" />} defaultOpen>
            {form.banner_path ? (
              <img src={form.banner_path} alt="Banner" className="w-full h-36 object-cover rounded-xl mb-4" />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:text-primary"
              >
                <ImageUp className="w-6 h-6" />
                <span className="text-sm font-medium">{t('formEdit.uploadBanner')}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleBanner} className="hidden" />
            {form.banner_path && (
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => fileRef.current?.click()} icon={<ImageUp className="w-4 h-4" />}>
                  {t('formEdit.changeBanner')}
                </Button>
                <Button type="button" variant="ghost-danger" size="sm" className="flex-1" onClick={handleRemoveBanner} icon={<Trash2 className="w-4 h-4" />}>
                  {t('formEdit.removeBanner')}
                </Button>
              </div>
            )}
          </CollapsibleCard>
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
              <Button size="sm" onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>
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
              className="bg-white dark:bg-ink-900 rounded-2xl p-6 w-full max-w-sm shadow-lift relative"
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
              <div className="flex justify-center p-4 border border-gray-100 dark:border-gray-800 rounded-2xl">
                <QRCodeCanvas
                  ref={qrRef}
                  value={`${window.location.origin}/q/${form.short_code}`}
                  size={220}
                  marginSize={2}
                  level="M"
                  className="rounded-lg"
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
