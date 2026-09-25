import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowUp, ArrowRight, Paperclip, Sparkles, Check, X, FileText, Clock, Shuffle, Lock, ListChecks, Trophy, EyeOff, CalendarDays, Info, KeyRound, Sun, Moon } from 'lucide-react'
import api from '../../api/client'
import { useTheme } from '../../hooks/useTheme'
import { useToast } from '../../hooks/useToast'
import { stripTags } from '../../lib/sanitize'
import { Card, RichTextEditor, RichText, Badge, Toggle, Input, AnswerKeyEditor } from '../../components/ui'
import { usePageTour } from '../../features/tour/TourContext'

const humanizeType = (t) => (t || '').replace(/_/g, ' ')

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// Tipe yang tak ikut pool nilai (tiruan distribute_quiz_points backend).
const NO_GRADE_TYPES = ['date', 'time', 'datetime', 'file_upload', 'dropdown']

// Proyeksi pool-100 backend untuk badge poin kartu draft:
// soal scored dibagi rata 100, sisa ke urutan awal. Essay tanpa kunci
// dikecualikan (tak bisa dinilai otomatis).
function projectAutoPoints(sections) {
  const all = (sections || []).flatMap((s) => s.questions || [])
  const scored = all.filter((q) => {
    if (NO_GRADE_TYPES.includes(q.type)) return false
    if ((q.type === 'essay' || q.type === 'short_answer') && !(q.answer_key || '').trim()) return false
    return true
  })
  const base = scored.length ? Math.floor(100 / scored.length) : 0
  const rem = scored.length ? 100 % scored.length : 0
  const map = new Map(scored.map((q, i) => [q, base + (i < rem ? 1 : 0)]))
  return (q) => map.get(q) ?? 0
}

const ACCEPT_EXT = '.docx,.pdf,.ppt,.pptx'
const MAX_FILES = 5
const PROMPT_MAX = 5000
const PROMPT_MIN = 10
const MAX_PREV_PROMPTS = 5
const normPrompt = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

// Kaca penyatu hero + review: shell & kartu review memakai token yang sama.
const glassCircleBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/50 backdrop-blur-xl transition-all hover:bg-white/80 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/20'

function KeyMissingModal({ open, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ scale: 0.92, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 14, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_40px_90px_-30px_rgba(15,23,42,0.5),inset_0_1px_1px_rgba(255,255,255,0.9)] dark:border-ink-700 dark:bg-ink-900 dark:shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.08)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-key-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close') || 'Close'}
              className="absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink dark:text-gray-500 dark:hover:bg-ink-800 dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative px-6 pb-6 pt-8">
              <h3 id="ai-key-modal-title" className="mt-4 text-center font-display text-lg font-bold leading-tight text-ink dark:text-gray-100">
                {t('aiGenerate.keyModalTitle')}
              </h3>
              <p className="mt-2 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {t('aiGenerate.keyMissingDesc')}
              </p>
              <ol className="mt-5 space-y-2.5">
                {[t('aiGenerate.keyStep1'), t('aiGenerate.keyStep2'), t('aiGenerate.keyStep3')].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-snug text-ink dark:text-gray-200">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 grid grid-cols-[1fr_auto] gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 bg-transparent px-5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-ink dark:border-ink-700 dark:text-gray-400 dark:hover:bg-ink-800 dark:hover:text-gray-200"
                >
                  {t('aiGenerate.later')}
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/settings') }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 px-6 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(108,92,231,0.55)] transition-all hover:brightness-110 active:scale-95"
                >
                  <KeyRound className="h-4 w-4" />
                  {t('aiGenerate.openSettings')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SettingChips({ settings }) {
  const { t } = useTranslation()
  if (!settings) return null
  const chips = []
  if (settings.timer_minutes) chips.push({ icon: <Clock className="w-3.5 h-3.5" />, label: t('aiGenerate.timer', { minutes: settings.timer_minutes }) })
  if (settings.shuffle_questions) chips.push({ icon: <Shuffle className="w-3.5 h-3.5" />, label: t('aiGenerate.shuffleQ') })
  if (settings.shuffle_options) chips.push({ icon: <Shuffle className="w-3.5 h-3.5" />, label: t('aiGenerate.shuffleO') })
  if (settings.require_login) chips.push({ icon: <Lock className="w-3.5 h-3.5" />, label: t('aiGenerate.requireLogin') })
  chips.push({ icon: <ListChecks className="w-3.5 h-3.5" />, label: settings.submission_limit === 'once' ? t('aiGenerate.limitOnce') : t('aiGenerate.limitUnlimited') })
  if (settings.show_leaderboard) chips.push({ icon: <Trophy className="w-3.5 h-3.5" />, label: t('aiGenerate.leaderboard') })
  if (settings.is_restricted) chips.push({ icon: <Lock className="w-3.5 h-3.5" />, label: t('aiGenerate.restricted') })
  if (!settings.reveal_score) chips.push({ icon: <EyeOff className="w-3.5 h-3.5" />, label: t('aiGenerate.revealScore') })
  if (!settings.reveal_answers) chips.push({ icon: <EyeOff className="w-3.5 h-3.5" />, label: t('aiGenerate.revealAnswers') })

  if (settings.starts_at || settings.ends_at) chips.push({ icon: <CalendarDays className="w-3.5 h-3.5" />, label: [settings.starts_at?.slice(0, 10), settings.ends_at?.slice(0, 10)].filter(Boolean).join(' → ') })

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium border border-white/60 bg-white/50 text-gray-600 backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-gray-300">
          {c.icon}{c.label}
        </span>
      ))}
    </div>
  )
}

function IgnoredBox({ items }) {
  const { t } = useTranslation()
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-soft/85 backdrop-blur-xl px-4 py-3 flex gap-2.5" role="status">
      <Info className="w-4 h-4 text-warn shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink dark:text-gray-100">{t('aiGenerate.ignoredTitle')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('aiGenerate.ignoredDesc')}</p>
        <p className="text-xs font-medium text-ink dark:text-gray-200 mt-1">{items.join(' · ')}</p>
      </div>
    </div>
  )
}

function CountWarnBox({ items }) {
  const { t } = useTranslation()
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-soft/85 backdrop-blur-xl px-4 py-3 flex gap-2.5" role="status">
      <Info className="w-4 h-4 text-warn shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{t('aiGenerate.countWarnTitle')}</p>
        <p className="text-xs text-ink mt-0.5">{t('aiGenerate.countWarnDesc')}</p>
        {items.map((w, i) => (
          <p key={i} className="text-xs font-medium text-ink mt-1">{w}</p>
        ))}
      </div>
    </div>
  )
}

function SettingRow({ title, desc, control }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink dark:text-gray-100">{title}</p>
        {desc && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

// Judul hero: tiap huruf slide-up berurutan (stagger + variasi sinus, total <1 dtk).
// reduced-motion global (MotionConfig) otomatis menonaktifkannya.
function SlideLetters({ text, startIndex = 0, baseDelay = 0.45, letterClassName = '' }) {
  return (
    <span aria-hidden="true">
      {text.split('').map((ch, i) => {
        const d = baseDelay + (startIndex + i) * 0.028 + Math.sin((startIndex + i) * 1.7) * 0.006;
        return (
          <span key={i} className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
            <span className={`ai-letter ${letterClassName}`} style={{ animationDelay: `${d.toFixed(3)}s` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          </span>
        );
      })}
    </span>
  )
}

// Titik-titik loading ala chat di dalam komposer saat generate/edit.
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
}

// Skeleton question card yang bertambah satu-per-satu (pengganti modal loading).
function SkeletonCards({ count }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-300 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-3 animate-pulse">
          <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-3 w-5/6 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="flex gap-2">
            <div className="h-8 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="h-8 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

// datetime-local butuh "YYYY-MM-DDTHH:MM"; backend kirim ISO detik — potong menit.
const toInputDateTime = (v) => (v ? String(v).slice(0, 16) : '')

export default function AIGenerate() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)
  const composerRef = useRef(null)
  const promptRef = useRef(null)
  const [promptExpanded, setPromptExpanded] = useState(false)

  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formType, setFormType] = useState('auto')
  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState([])
  const [keyStatus, setKeyStatus] = useState(null)
  const [draft, setDraft] = useState(null)
  const [ignored, setIgnored] = useState([])
  const [warnings, setWarnings] = useState([])
  const [modelUsed, setModelUsed] = useState('')
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [genProgress, setGenProgress] = useState({ percent: 0, key: '', done: 0, total: 0 })
  const [keyModalOpen, setKeyModalOpen] = useState(false)
  const [skeletonCount, setSkeletonCount] = useState(0)
  // Riwayat prompt tersembunyi (tak dirender) — konteks anti-halusinasi untuk /ai/edit.
  const [prevPrompts, setPrevPrompts] = useState([])
  const abortRef = useRef(null)
  const tickRef = useRef(null)
  const cancelledRef = useRef(false)

  // Edit lock anti race-condition: komposer dikunci selama busy,
  // instruksi ke-2 diblokir sampai request pertama done/gagal/cancel.
  const busy = generating || editing
  const tourVariant = generating ? 'generating' : step === 2 ? 'review' : 'intro'
  const tourSteps = useMemo(() => {
    if (generating) return [{ target: '[data-tour="ai-composer"]', title: 'AI is building your draft', content: 'You can keep working while the draft is generated. Use Cancel if you need to stop.', placement: 'top' }]
    if (step !== 2) return [
      { target: '[data-tour="ai-composer"]', title: 'Describe what you need', content: 'Write a clear prompt or attach up to five source files for the AI to use.', placement: 'top' },
      { target: '[data-tour="ai-file"]', title: 'Bring your own context', content: 'Attach a document when the questions should follow existing material.', placement: 'top' },
      { target: '[data-tour="ai-generate"]', title: 'Generate your draft', content: 'Review the prompt, then generate a structured form or quiz draft.', placement: 'left' },
    ]
    return [
      { target: '[data-tour="ai-review"]', title: 'Review the generated draft', content: 'Check the title, form type, settings, sections, and questions before accepting.', placement: 'right' },
      { target: '[data-tour="ai-settings"]', title: 'Tune respondent rules', content: 'Review access limits, quiz behavior, scoring visibility, and schedules.', placement: 'right' },
      { target: '[data-tour="ai-generate"]', title: 'Accept or keep editing', content: 'Accept the draft when it looks right, or send a follow-up edit request in the composer.', placement: 'left' },
    ]
  }, [generating, step])
  usePageTour('ai-generate', { variant: tourVariant, variantKey: tourVariant, steps: tourSteps })

  useEffect(() => {
    api.get('/me/gemini-key/status').then((r) => setKeyStatus(r.data)).catch(() => setKeyStatus({ connected: false, masked: null }))
  }, [])

  // Skeleton tumbuh satu-per-satu saat generate pertama (belum ada draf).
  useEffect(() => {
    if (!generating) { setSkeletonCount(0); return }
    setSkeletonCount(1)
    const id = setInterval(() => setSkeletonCount((c) => (c >= 8 ? c : c + 1)), 600)
    return () => clearInterval(id)
  }, [generating])

  useEffect(() => {
    const el = promptRef.current
    if (!el) return
    setPromptExpanded(el.scrollHeight > 24 * 3 + 4)
  }, [prompt, busy])

  const patchSettings = (patch) => setDraft((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d))

  // Ubah 1 soal dalam draf (si/qi = indeks section/question).
  const patchQuestion = (si, qi, patch) => setDraft((d) => {
    if (!d) return d
    return {
      ...d,
      sections: d.sections.map((s, i) => (i !== si ? s : {
        ...s,
        questions: s.questions.map((q, j) => (j !== qi ? q : { ...q, ...patch })),
      })),
    }
  })

  // Hapus 1 soal dari draf lokal (tanpa kuota AI). Section yang kehabisan
  // soal ikut terhapus. Draft tak boleh kosong total (backend /ai/edit
  // wajibkan sections non-empty) — hapus soal terakhir diblokir + toast.
  const removeQuestion = (si, qi) => {
    const total = (draft?.sections || []).reduce((n, s) => n + (s.questions?.length || 0), 0)
    if (total <= 1) {
      toast.error(t('aiGenerate.deleteLastQuestionBlocked'))
      return
    }
    setDraft((d) => {
      if (!d) return d
      const sections = d.sections
        .map((s, i) => (i !== si ? s : { ...s, questions: s.questions.filter((_, j) => j !== qi) }))
        .filter((s) => (s.questions?.length || 0) > 0)
      return { ...d, sections }
    })
  }

  // Mirror rantai backend: restricted ⇒ once ⇒ require_login.
  const toggleDraft = (key, value) => {
    if (key === 'is_restricted' && value) {
      patchSettings({ is_restricted: true, submission_limit: 'once', require_login: true })
    } else if (key === 'submission_limit' && value === 'once') {
      patchSettings({ submission_limit: 'once', require_login: true })
    } else {
      patchSettings({ [key]: value })
    }
  }

  const addFiles = (list) => {
    const incoming = Array.from(list || [])
    if (!incoming.length) return
    const allowed = ACCEPT_EXT.split(',').map((s) => s.trim().toLowerCase())
    const valid = []
    let rejected = 0
    for (const f of incoming) {
      const ext = `.${String(f.name || '').split('.').pop().toLowerCase()}`
      if (allowed.includes(ext)) valid.push(f)
      else rejected += 1
    }
    if (rejected) toast.error(t('aiGenerate.invalidFile', { count: rejected }))
    const room = MAX_FILES - files.length
    if (room <= 0) {
      if (valid.length) toast.error(t('aiGenerate.filesFull'))
      return
    }
    if (valid.length > room) toast.error(t('aiGenerate.filesFull'))
    const take = valid.slice(0, room)
    if (take.length) setFiles((prev) => [...prev, ...take].slice(0, MAX_FILES))
  }

  const pickFiles = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)

  // Cegah browser membuka file bila di-drop di luar komposer.
  useEffect(() => {
    const stop = (e) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const onComposerDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setDragActive(true)
  }
  const onComposerDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }
  const onComposerDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const onComposerDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragActive(false)
    addFiles(e.dataTransfer?.files)
  }

  const stopTick = () => { clearInterval(tickRef.current); tickRef.current = null }
  const startTick = () => {
    stopTick()
    tickRef.current = setInterval(() => {
      setGenProgress((p) => (p.key === 'generating' && p.percent < 90 ? { ...p, percent: p.percent + 1 } : p))
    }, 2000)
  }

  // Batalkan generate/edit: putus koneksi. Generate dibatalkan sebelum
  // done = tanpa kuota; edit dibatalkan sebelum server commit = tanpa kuota.
  // Tanpa error merah — cukup toast info.
  const cancelBusy = () => {
    cancelledRef.current = true
    abortRef.current?.abort()
  }

  const applyDone = (data, usedPrompt) => {
    const d = data.draft || {}
    // Scoring selalu auto dari AI page — paksa di sini agar draft lama/AI bandel tetap auto.
    if (d.settings) d.settings.scoring_mode = 'auto'
    setDraft(d)
    if (typeof d.title === 'string' && d.title) setTitle(d.title)
    if (typeof d.description === 'string') setDescription(d.description)
    if (d.type === 'form' || d.type === 'quiz') setFormType(d.type)
    setIgnored(data.ignored || [])
    setWarnings(data.warnings || [])
    setModelUsed(data.model || '')
    setGenProgress({ percent: 100, key: '', done: 0, total: 0 })
    if (usedPrompt) setPrevPrompts((prev) => [...prev, usedPrompt].slice(-MAX_PREV_PROMPTS))
    setPrompt('')
    setFiles([])
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const getFirstError = (data) => {
    if (Array.isArray(data?.errors) && data.errors.length) return Object.values(data.errors[0])[0] || ''
    return ''
  }
  const failGenerate = (status, serverMsg, serverData, fallbackCode) => {
    const errMsg = getFirstError(serverData) || serverMsg
    let msg
    if (status === 403) msg = errMsg || t('aiGenerate.keyMissing')
    else if (status === 422) msg = errMsg || t('aiGenerate.generateFailed')
    else if (status === 502 && errMsg?.toLowerCase().includes('terpotong')) msg = errMsg
    else if (fallbackCode === 'ECONNABORTED') msg = t('aiGenerate.timeout')
    else msg = errMsg || t('aiGenerate.generateFailed')
    setError(typeof msg === 'string' ? msg : t('aiGenerate.generateFailed'))
    toast.error(errMsg || msg)
  }

  const failEdit = (status, serverMsg, serverData, fallbackCode) => {
    const errMsg = getFirstError(serverData) || serverMsg
    let msg
    if (status === 403) msg = errMsg || t('aiGenerate.keyMissing')
    else if (status === 422) msg = errMsg || t('aiGenerate.editFailed')
    else if (fallbackCode === 'ECONNABORTED') msg = t('aiGenerate.timeout')
    else msg = errMsg || t('aiGenerate.editFailed')
    setError(typeof msg === 'string' ? msg : t('aiGenerate.editFailed'))
    toast.error(errMsg || msg)
  }

  // Generate via SSE stream (fetch + getReader; axios tak bisa stream).
  // Fallback ke endpoint non-stream bila respons bukan event-stream.
  const streamGenerate = async (fd, signal, usedPrompt) => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${api.defaults.baseURL}/ai/generate/stream`, {
      method: 'POST',
      body: fd,
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'ngrok-skip-browser-warning': 'true',
      },
    })
    const ctype = res.headers.get('content-type') || ''
    if (!ctype.includes('text/event-stream')) {
      const res2 = await api.post('/ai/generate', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })
      applyDone(res2.data, usedPrompt)
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const onEvent = (event, data) => {
      if (event === 'progress') {
        if (data.stage === 'reading') {
          const total = data.total || 0
          const done = data.done || 0
          setGenProgress({ percent: total ? 10 + Math.round((30 * done) / total) : 10, key: 'reading', done, total })
        } else if (data.stage === 'generating') {
          setGenProgress({ percent: 50, key: 'generating', done: 0, total: 0 })
          startTick()
        } else if (data.stage === 'sanitizing') {
          stopTick()
          setGenProgress({ percent: 92, key: 'sanitizing', done: 0, total: 0 })
        }
      } else if (event === 'done') {
        stopTick()
        applyDone(data, usedPrompt)
        return true
      } else if (event === 'error') {
        stopTick()
        failGenerate(data.status, data.message, data, null)
        return true
      }
      return false
    }
    for (; ;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      let finished = false
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        let event = null
        const dataLines = []
        for (const line of block.split('\n')) {
          if (line.startsWith(':')) continue
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (!event || !dataLines.length) continue
        let data = null
        try { data = JSON.parse(dataLines.join('\n')) } catch { continue }
        if (onEvent(event, data)) { finished = true; break }
      }
      if (finished) { reader.cancel().catch(() => { }); break }
    }
  }

  const handleGenerate = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (keyStatus && !keyStatus.connected) { setKeyModalOpen(true); return }
    const clean = normPrompt(prompt)
    if (clean.length < PROMPT_MIN) { setError(t('aiGenerate.promptMin', { current: clean.length, max: PROMPT_MAX })); return }
    if (clean.length > PROMPT_MAX) { setError(t('aiGenerate.promptMax', { current: clean.length, max: PROMPT_MAX })); return }
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    cancelledRef.current = false
    setGenerating(true)
    setError('')
    setGenProgress({ percent: 5, key: 'reading', done: 0, total: 0 })
    try {
      const fd = new FormData()
      fd.append('title', '')
      fd.append('description', '')
      fd.append('type', 'auto')
      fd.append('prompt', prompt)
      files.forEach((f) => fd.append('files', f))
      await streamGenerate(fd, abortRef.current.signal, clean)
    } catch (err) {
      if (cancelledRef.current || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        toast.info(t('aiGenerate.generateCancelled'))
      } else {
        const status = err.response?.status
        const data = err.response?.data
        const serverMsg = data?.message !== 'Invalid fields' ? data?.message : '' || data?.detail
        failGenerate(status, serverMsg, data, err.code)
      }
    } finally {
      stopTick()
      setGenerating(false)
    }
  }

  // Edit via prompt: kirim draf JSON + instruksi + riwayat prompt tersembunyi.
  // Makan 1 kuota. Draf lama utuh bila gagal.
  const handleEdit = async (e) => {
    e?.preventDefault()
    if (busy || !draft) return
    if (keyStatus && !keyStatus.connected) { setKeyModalOpen(true); return }
    const instruction = normPrompt(prompt)
    if (instruction.length < PROMPT_MIN) { setError(t('aiGenerate.promptMin', { current: instruction.length, max: PROMPT_MAX })); return }
    if (instruction.length > PROMPT_MAX) { setError(t('aiGenerate.promptMax', { current: instruction.length, max: PROMPT_MAX })); return }
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    cancelledRef.current = false
    setEditing(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('title', title || '')
      fd.append('type', formType)
      fd.append('instruction', instruction)
      fd.append('draft', JSON.stringify(draft))
      fd.append('previous_prompts', JSON.stringify(prevPrompts))
      files.forEach((f) => fd.append('files', f))
      const res = await api.post('/ai/edit', fd, { signal: abortRef.current.signal, timeout: 180000 })
      applyDone(res.data, instruction)
      toast.success(t('aiGenerate.editSuccess'))
    } catch (err) {
      if (cancelledRef.current || err?.name === 'AbortError' || err?.name === 'CanceledError' || err.response?.status === 499) {
        toast.info(t('aiGenerate.editCancelled'))
      } else {
        const status = err.response?.status
        const data = err.response?.data
        const serverMsg = data?.message !== 'Invalid fields' ? data?.message : '' || data?.detail
        failEdit(status, serverMsg, data, err.code)
      }
    } finally {
      setEditing(false)
    }
  }

  // Bersihkan interval + stream bila user pindah halaman saat proses jalan.
  useEffect(() => () => { stopTick(); abortRef.current?.abort() }, [])

  const genStageText =
    genProgress.key === 'reading' ? t('aiGenerate.overlayReading')
      : genProgress.key === 'generating' ? t('aiGenerate.overlayGenerating')
        : genProgress.key === 'sanitizing' ? t('aiGenerate.overlaySanitizing')
          : ''
  const busyStatus = generating ? genStageText : t('aiGenerate.editing')

  const handleAccept = async () => {
    if (busy || accepting || !draft) return
    if (!stripTags(title)) { setError(t('aiGenerate.titleRequired')); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setAccepting(true)
    setError('')
    try {
      const s = draft.settings
      const acceptType = formType === 'quiz' ? 'quiz' : 'form'
      // Defensif pasca hapus manual: buang section kosong, tolak bila 0 soal.
      const cleanSections = (draft.sections || [])
        .map((sec) => ({ ...sec, questions: (sec.questions || []).filter(Boolean) }))
        .filter((sec) => (sec.questions?.length || 0) > 0)
      const totalQ = cleanSections.reduce((n, sec) => n + (sec.questions?.length || 0), 0)
      if (!totalQ) {
        const msg = t('aiGenerate.deleteLastQuestionBlocked')
        setError(msg)
        toast.error(msg)
        setAccepting(false)
        return
      }
      const res = await api.post('/ai/accept', {
        title,
        description: description || null,
        type: acceptType,
        settings: { ...s, scoring_mode: 'auto' },
        // Kunci kosong (cuma spasi) dinull-kan agar lolos min_length backend.
        sections: cleanSections.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => ({
            ...q,
            answer_key: (q.answer_key || '').trim() || null,
          })),
        })),
      })
      toast.success(t('aiGenerate.accepted'))
      navigate(`/forms/${res.data.id}`)
    } catch (err) {
      const data = err.response?.data
      const firstErr = Array.isArray(data?.errors) && data.errors.length ? Object.values(data.errors[0])[0] : ''
      const msg = firstErr || (data?.message !== 'Invalid fields' ? data?.message : '') || data?.detail || t('aiGenerate.acceptFailed')
      setError(msg)
      toast.error(msg)
    } finally {
      setAccepting(false)
    }
  }

  const promptLen = normPrompt(prompt).length
  const promptOver = promptLen > PROMPT_MAX
  const canGenerate = !busy && promptLen >= PROMPT_MIN && !promptOver
  const promptEmpty = promptLen === 0
  const canEdit = !!draft && !busy && !promptEmpty && promptLen >= PROMPT_MIN && !promptOver

  const handleComposerKey = (e) => {
    if (e.key !== 'Enter') return
    // Modifier + Enter selalu menambah baris; Enter polos mengirim.
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault()
      const field = e.currentTarget
      const start = field.selectionStart
      const end = field.selectionEnd
      const next = `${prompt.slice(0, start)}\n${prompt.slice(end)}`
      setPrompt(next)
      requestAnimationFrame(() => {
        field.selectionStart = start + 1
        field.selectionEnd = start + 1
      })
      return
    }
    e.preventDefault()
    if (busy) return
    if (!draft && canGenerate) handleGenerate()
    else if (draft && canEdit) handleEdit()
  }

  const handlePrimaryButton = () => {
    if (busy) return
    if (!draft) { handleGenerate(); return }
    if (promptEmpty) handleAccept()
    else handleEdit()
  }

  const primaryDisabled = !draft ? !canGenerate : promptEmpty ? (busy || accepting || !stripTags(title)) : !canEdit
  const primaryLabel = !draft ? t('aiGenerate.generate') : promptEmpty ? t('aiGenerate.accept') : t('aiGenerate.sendEdit')

  const heroComposer = (
    <div ref={composerRef} data-tour="ai-composer" data-testid="ai-composer" aria-busy={busy}>
      <motion.div
        layout
        transition={{ layout: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
        onDragEnter={onComposerDragEnter}
        onDragLeave={onComposerDragLeave}
        onDragOver={onComposerDragOver}
        onDrop={onComposerDrop}
        className={`relative min-w-0 rounded-3xl border bg-white/20 p-2 backdrop-blur-2xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 ease-out dark:border-white/20 dark:bg-white/10 dark:shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.2)] ${draft ? 'border-primary/25 shadow-[0_24px_70px_-18px_rgba(108,92,231,0.55),0_4px_16px_rgba(15,23,42,0.10),inset_0_1px_1px_rgba(255,255,255,0.9)] ring-1 ring-primary/15' : 'border-white/70 shadow-[0_24px_70px_-20px_rgba(108,92,231,0.45),inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_1px_rgba(255,255,255,0.25)] ring-1 ring-white/50'} ${dragActive ? 'border-primary ring-4 ring-primary/20' : ''}`}
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary bg-primary-50/90 backdrop-blur-sm dark:bg-primary-950/90" aria-hidden>
            <Paperclip className="h-6 w-6 text-primary-600 dark:text-primary-300" />
            <p className="text-sm font-semibold text-primary-700 dark:text-primary-200">{t('aiGenerate.dropFiles')}</p>
          </div>
        )}
        <input ref={fileRef} type="file" multiple accept={ACCEPT_EXT} onChange={pickFiles} className="hidden outline-hidden" />
        {draft && files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-2 pt-1">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 py-1 pl-2.5 pr-1 text-[11px] font-medium text-primary-700 shadow-chip backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-primary-300">
                <FileText className="h-3 w-3" />
                <span className="max-w-[90px] truncate" title={f.name}>{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={t('aiGenerate.removeFile')}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-900/40"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2">
        {busy ? (
          <div className="flex w-full min-w-0 items-center gap-2 rounded-full bg-white/90 py-2 pl-4 pr-2 shadow-[inset_0_2px_8px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-ink-900/85">
            <span className="shrink-0" role="status"><TypingDots /></span>
            <input
              value={prompt.replace(/\s+/g, ' ')}
              readOnly
              placeholder={busyStatus}
              aria-label={t('aiGenerate.promptLabel')}
              tabIndex={-1}
              className="min-w-0 flex-1 truncate bg-transparent px-1 py-2 text-[14px] leading-5 text-ink placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={cancelBusy}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-gray-100 px-5 text-sm font-semibold text-gray-600 hover:bg-gray-200 hover:text-ink dark:bg-ink-800 dark:text-gray-300 dark:hover:bg-ink-700 transition-colors active:scale-95"
            >
              {t('aiGenerate.cancelGenerate')}
            </button>
          </div>
        ) : (
          <>
            <div className={`flex min-w-0 flex-1 items-center gap-1 overflow-hidden bg-white/90 py-2 pl-2 pr-3 shadow-[inset_0_2px_8px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-[border-radius] duration-200 dark:bg-ink-900/85 ${promptExpanded ? 'rounded-3xl' : 'rounded-full'}`}>
              <button
                type="button"
                 onClick={() => fileRef.current?.click()}
                 data-tour="ai-file"
                 disabled={files.length >= MAX_FILES}
                aria-label={t('aiGenerate.filesLabel')}
                title={t('aiGenerate.filesLabel')}
                className="flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink disabled:opacity-40 dark:text-gray-500 dark:hover:bg-ink-800 dark:hover:text-gray-200"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
              <textarea
                id="ai-prompt"
                ref={promptRef}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setError('') }}
                onKeyDown={handleComposerKey}
                placeholder={draft ? t('aiGenerate.editPlaceholder') : t('aiGenerate.promptComposerPlaceholder')}
                rows={1}
                aria-busy={busy}
                className="max-h-[200px] min-h-9 w-full min-w-0 flex-1 break-all resize-none self-center bg-transparent py-1.5 text-[15px] leading-6 text-ink placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500 [field-sizing:content]"
              />
            </div>
            <button
              type="button"
                 data-tour="ai-generate"
                 onClick={handlePrimaryButton}
                 disabled={primaryDisabled}

              aria-label={primaryLabel}
              title={primaryLabel}
              className={`flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink-900 text-white shadow-[0_8px_20px_-6px_rgba(15,23,42,0.5)] transition-all hover:bg-ink-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-ink-900 dark:hover:bg-gray-200 ${!draft || !promptEmpty ? 'h-11 w-11' : 'h-11 px-5 text-sm font-semibold'}`}
            >
              {!draft || !promptEmpty ? <ArrowUp className="h-5 w-5" strokeWidth={2.5} /> : <><Check className="h-4 w-4" />{t('aiGenerate.accept')}</>}
            </button>
          </>
        )}
        </div>
        {draft && (
          <div className="flex items-center justify-between px-5 pb-1 pt-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span>{files.length}/{MAX_FILES} · {t('aiGenerate.filesHint')}</span>
            {promptLen > 0 && <span className={promptOver ? 'font-semibold text-incorrect' : ''}>{promptLen}/{PROMPT_MAX}</span>}
          </div>
        )}
      </motion.div>
      {!draft && files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-6 pt-3">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 py-1.5 pl-3 pr-1.5 text-xs font-medium text-primary-700 shadow-chip backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-primary-300">
              <FileText className="h-3.5 w-3.5" />
              <span className="max-w-[140px] truncate" title={f.name}>{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label={t('aiGenerate.removeFile')}
                className="flex h-6 w-6 items-center justify-center rounded-full text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-900/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {promptOver && <p className="field-error px-6 pt-1">{t('aiGenerate.promptMax', { current: promptLen, max: PROMPT_MAX })}</p>}
    </div>
  )

  const heroVisible = step === 1

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {(
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-300 via-[#DCCFFA] to-[#ECE7F2] dark:from-[#2B1D63] dark:via-[#201647] dark:to-[#12102B]" />
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="ai-spin-slow h-[45vmin] w-[130vmin] rounded-[100%] bg-gradient-to-r from-transparent via-white/50 to-transparent blur-3xl dark:via-primary-500/20" />
          </div>
          <div className="ai-blob absolute left-1/2 top-[-12%] h-[55vmin] w-[95vmin] -translate-x-1/2 rounded-full bg-white/60 blur-3xl dark:bg-primary-600/25" />
          <div className="ai-blob ai-blob-slow absolute bottom-[-25%] left-[-10%] h-[55vmin] w-[65vmin] rounded-full bg-primary-200/80 blur-3xl dark:bg-primary-800/30" />
          <div className="ai-blob ai-blob-delay absolute right-[-15%] top-[30%] h-[45vmin] w-[55vmin] rounded-full bg-[#F3D9F2]/80 blur-3xl dark:bg-primary-700/20" />
        </div>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: heroVisible ? 0.45 : 0, duration: 0.4 }} className="relative space-y-6 pt-5">
        <AnimatePresence mode="wait" initial={false}>
        {heroVisible ? (
          <motion.div key="hero" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.32, ease: 'easeOut' }} className="relative flex min-h-[78vh] flex-col items-center justify-center px-4 py-10">
            <div className="absolute inset-x-4 top-2 z-20 flex items-center justify-between sm:inset-x-8 sm:top-4">
              <button
                onClick={() => navigate('/forms')}
                aria-label={t('aiGenerate.back')}
                title={t('aiGenerate.back')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/50 text-ink backdrop-blur-xl transition-all hover:bg-white/80 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
               <div className="flex items-center gap-2">
                 <button

                  onClick={toggleTheme}
                  aria-label={t('nav.toggleTheme')}
                  title={t('nav.toggleTheme')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/50 text-ink backdrop-blur-xl transition-all hover:bg-white/80 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                {keyStatus?.connected && (
                  <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold border border-white/60 bg-white/50 text-emerald-700 backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-emerald-300">
                    <KeyRound className="w-3.5 h-3.5" /> {t('aiGenerate.keyConnected')}
                  </span>
                )}
              </div>
            </div>
            <h1 aria-label="Quazaly AI" className="relative z-0 select-none px-4 text-center font-display font-extrabold leading-[1.30] tracking-tight text-[clamp(3rem,14vw,9rem)]">
              <SlideLetters text="Quazaly " startIndex={0} baseDelay={draft ? 0.1 : 0.45} letterClassName="text-primary-500/65 dark:text-white/80" />
              <SlideLetters text="AI" startIndex={8} baseDelay={draft ? 0.1 : 0.45} letterClassName="bg-gradient-to-br from-primary-500 to-primary-800 bg-clip-text text-transparent dark:from-primary-200 dark:to-primary-400" />
            </h1>
            <div className="relative z-10 -mt-2 w-full max-w-4xl sm:-mt-6">
              {heroComposer}
              {draft && !busy && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-white/60 bg-white/50 px-6 text-sm font-semibold text-ink backdrop-blur-xl transition-all hover:bg-white/80 active:scale-95 dark:border-white/15 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
                  >
                    {t('aiGenerate.backToReview')} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
              {busy && (
                <div className="mt-6 text-left" aria-busy="true" >
                  <SkeletonCards count={skeletonCount} />
                </div>
              )}
              {error && <p className="field-error mt-3 text-center">{error}</p>}
            </div>
          </motion.div>
        ) : (
             <motion.div key="review" data-tour="ai-review" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.32, ease: 'easeOut' }} className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-6 sm:px-6">

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                aria-label={t('aiGenerate.back')}
                title={t('aiGenerate.back')}
                className={`${glassCircleBtn} text-ink dark:text-gray-100`}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
               <div className="flex items-center gap-2">
                 <button

                  onClick={toggleTheme}
                  aria-label={t('nav.toggleTheme')}
                  title={t('nav.toggleTheme')}
                  className={`${glassCircleBtn} text-ink dark:text-gray-100`}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                {keyStatus?.connected && (
                  <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold border border-white/60 bg-white/50 text-emerald-700 backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-emerald-300">
                    <KeyRound className="w-3.5 h-3.5" /> {t('aiGenerate.keyConnected')}
                  </span>
                )}
              </div>
            </div>

            {step === 2 && (
              <div className="space-y-5">
             <Card data-tour="ai-settings" className="space-y-4">

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display font-semibold text-ink dark:text-gray-100">
                  {t('aiGenerate.stepPolish')}
                </h2>
                <div className="flex items-center gap-2">
                  {modelUsed && (
                    <span className="inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-[11px] font-medium border border-white/60 bg-white/50 text-gray-500 backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-gray-400">
                      <Sparkles className="w-3 h-3" />{modelUsed}
                    </span>
                  )}
                </div>
              </div>
              <SettingChips settings={draft.settings} />
              <IgnoredBox items={ignored} />
              <CountWarnBox items={warnings} />
              <div>
                <span className="field-label">{t('aiGenerate.titleLabel')}</span>
                <RichTextEditor value={title} onChange={setTitle} minHeight={60} />
              </div>
              <div>
                <span className="field-label">{t('aiGenerate.descLabel')}</span>
                <RichTextEditor value={description} onChange={setDescription} minHeight={80} />
              </div>
              <div>
                <span className="field-label">{t('aiGenerate.typeLabel')}</span>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'form', label: t('aiGenerate.typeForm'), desc: t('aiGenerate.typeFormDesc') },
                    { value: 'quiz', label: t('aiGenerate.typeQuiz'), desc: t('aiGenerate.typeQuizDesc') },
                  ].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setFormType(o.value)}
                      aria-pressed={formType === o.value}
                      className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${formType === o.value ? 'border-primary bg-primary-50 shadow-chip' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      <span className={`block text-sm font-semibold ${formType === o.value ? 'text-primary-700' : 'text-ink dark:text-gray-100'}`}>{o.label}</span>
                      <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{o.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

                  <Card className="space-y-1 divide-y divide-gray-100 dark:divide-gray-800">
                    <div className="pb-2">
                      <h3 className="font-display font-semibold text-ink dark:text-gray-100">{t('aiGenerate.settingsTitle')}</h3>
                      <p className="field-hint mt-0.5">{t('aiGenerate.settingsHint')}</p>
                    </div>
                    <SettingRow title={t('aiGenerate.shuffleQ')} control={<Toggle label={t('aiGenerate.shuffleQ')} checked={!!draft.settings.shuffle_questions} onChange={(v) => toggleDraft('shuffle_questions', v)} />} />
                    <SettingRow title={t('aiGenerate.shuffleO')} control={<Toggle label={t('aiGenerate.shuffleO')} checked={!!draft.settings.shuffle_options} onChange={(v) => toggleDraft('shuffle_options', v)} />} />
                    <SettingRow title={t('aiGenerate.requireLogin')} control={<Toggle label={t('aiGenerate.requireLogin')} checked={!!draft.settings.require_login} onChange={(v) => toggleDraft('require_login', v)} />} />
                    <SettingRow
                      title={t('aiGenerate.limitOnce')}
                      control={
                        <Toggle
                          label={t('aiGenerate.limitOnce')}
                          checked={draft.settings.submission_limit === 'once'}
                          onChange={(v) => toggleDraft('submission_limit', v ? 'once' : 'unlimited')}
                        />
                      }
                    />
                    {formType === 'quiz' && (
                      <>
                        <SettingRow title={t('aiGenerate.leaderboard')} control={<Toggle label={t('aiGenerate.leaderboard')} checked={!!draft.settings.show_leaderboard} onChange={(v) => toggleDraft('show_leaderboard', v)} />} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                          <Input label={t('aiGenerate.timerLabel')} type="number" min="1" max="1440" value={draft.settings.timer_minutes || ''} onChange={(e) => toggleDraft('timer_minutes', e.target.value ? Number(e.target.value) : null)} />
                        </div>
                      </>
                    )}
                    <SettingRow title={t('aiGenerate.restricted')} control={<Toggle label={t('aiGenerate.restricted')} checked={!!draft.settings.is_restricted} onChange={(v) => toggleDraft('is_restricted', v)} />} />
                    <SettingRow title={t('aiGenerate.history')} control={<Toggle label={t('aiGenerate.history')} checked={draft.settings.show_in_history !== false} onChange={(v) => toggleDraft('show_in_history', v)} />} />
                    {formType === 'quiz' && (
                      <>
                        <SettingRow title={t('aiGenerate.revealScore')} control={<Toggle label={t('aiGenerate.revealScore')} checked={draft.settings.reveal_score !== false} onChange={(v) => toggleDraft('reveal_score', v)} />} />
                        <SettingRow title={t('aiGenerate.revealAnswers')} control={<Toggle label={t('aiGenerate.revealAnswers')} checked={draft.settings.reveal_answers !== false} onChange={(v) => toggleDraft('reveal_answers', v)} />} />
                      </>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                      <Input label={t('aiGenerate.startsAt')} type="datetime-local" value={toInputDateTime(draft.settings.starts_at)} onChange={(e) => toggleDraft('starts_at', e.target.value || null)} />
                      <Input label={t('aiGenerate.endsAt')} type="datetime-local" value={toInputDateTime(draft.settings.ends_at)} onChange={(e) => toggleDraft('ends_at', e.target.value || null)} helper={t('aiGenerate.scheduleHint')} />
                    </div>
                  </Card>

                  <div className={editing ? 'opacity-60 pointer-events-none select-none' : ''} aria-busy={editing}>
                    {(() => {
                      const autoPoints = projectAutoPoints(draft.sections)
                      return draft.sections.map((sec, si) => (
                      <Card key={si} className="space-y-3">
                        <h3 className="font-display font-semibold text-ink dark:text-gray-100">{si + 1}. {sec.title}</h3>
                        {sec.questions.map((q, qi) => (
                          <div key={qi} data-qi={`${si}-${qi}`} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge scheme="blue">{humanizeType(q.type)}</Badge>
                              {q.is_required && <span className="text-incorrect font-bold">*</span>}
                              {formType === 'quiz' && <span className="text-xs text-gray-400">{t('aiGenerate.points', { points: autoPoints(q) })}</span>}
                              <button
                                type="button"
                                onClick={() => removeQuestion(si, qi)}
                                aria-label={t('aiGenerate.deleteQuestion')}
                                title={t('aiGenerate.deleteQuestion')}
                                className="ml-auto w-7 h-7 rounded-lg text-gray-400 dark:text-gray-500 hover:text-incorrect hover:bg-incorrect-soft transition-colors flex items-center justify-center shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-sm text-ink dark:text-gray-100"><RichText html={q.question_text} className="rich-text block" /></div>
                            {q.options?.length > 0 && (
                              <ul className="space-y-1">
                                {q.options.map((o, oi) => (
                                  <li key={oi} className={`flex items-start gap-2 text-sm px-2.5 py-1.5 rounded-lg ${o.is_correct ? 'bg-correct-soft text-correct font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                                    {q.type === 'dropdown' ? (
                                      <span className="w-6 h-6 rounded-md bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400 flex items-center justify-center text-[10px] font-bold shrink-0">{oi + 1}</span>
                                    ) : q.type === 'checkbox' ? (
                                      <span className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 ${o.is_correct ? 'border-correct bg-correct text-white' : 'border-gray-300 text-transparent dark:border-gray-600'}`}>
                                        {o.is_correct && <Check className="w-3.5 h-3.5" strokeWidth={3.5} />}
                                      </span>
                                    ) : (
                                      <span className={`bubble w-6 h-6 text-xs ${o.is_correct ? 'bubble-correct' : 'bubble-empty'}`}>
                                        {o.is_correct ? <Check className="w-3.5 h-3.5" /> : LETTERS[oi % LETTERS.length]}
                                      </span>
                                    )}
                                    <span className="flex-1 min-w-0 [&>p]:mb-0"><RichText html={o.option_text} className="rich-text" /></span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {(q.type === 'multiple_choice' || q.type === 'checkbox') && (
                              <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
                                <Toggle
                                  label={t('aiGenerate.allowOther')}
                                  checked={!!q.allow_other}
                                  onChange={(v) => patchQuestion(si, qi, { allow_other: v })}
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm text-gray-600 dark:text-gray-400">{t('aiGenerate.allowOther')}</span>
                                  <span className="block text-xs text-gray-400 dark:text-gray-500">{t('aiGenerate.allowOtherHint')}</span>
                                </span>
                              </label>
                            )}
                            {formType === 'quiz' && (q.type === 'essay' || q.type === 'short_answer') && (
                              <div className="pt-1">
                                <AnswerKeyEditor
                                  value={q.answer_key || ''}
                                   onChange={(value) => patchQuestion(si, qi, { answer_key: value, ...(value.trim() ? { is_scored: true } : {}) })}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </Card>
                      ))
                    })()}
                  </div>

                  {error && <p className="field-error">{error}</p>}

            <div className="sticky bottom-[var(--mobile-nav-offset,4.5rem)] md:bottom-4 z-40 mt-2 pb-2">{heroComposer}</div>
              </div>
            )}
          </motion.div>
)}
        </AnimatePresence>

      <KeyMissingModal open={keyModalOpen} onClose={() => setKeyModalOpen(false)} />
      </motion.div>
    </div>
  )
}