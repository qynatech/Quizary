import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Timer, ChevronLeft, ChevronRight, Grid3x3, Flag, CheckCheck, AlertTriangle, Info, ZoomIn, ZoomOut, X, Lock, FileUp, RefreshCw, PenLine } from 'lucide-react'
import { Button, Input, Textarea, Card, Select, FallbackPage, QuestionMap, ConfirmSubmitModal, RichText } from '../../components/ui'
import { useAutosave, loadDraft, clearDraft } from '../../hooks/useAutosave'
import { useTheme } from '../../hooks/useTheme'
import { themePalette } from '../../lib/theme'
import { isAudioUrl } from '../../lib/media'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { sessionTokenHeaders } from '../../lib/sessionToken'

const OPT_COLORS = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981']
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const TEXT_LIMITS = { short_answer: 500, essay: 5000 }
const OTHER_TEXT_LIMIT = 500
const getTextLimit = (type) => TEXT_LIMITS[type] || null

// Nilai jawaban pilihan bisa array (option_ids) atau object {ids, text}
// bila opsi "Lainnya" dipakai. Dua helper ini satu-satunya tempat yang
// tahu dua bentuk tersebut — semua predikat memakainya.
const hasValue = (v) => Array.isArray(v)
  ? v.length > 0
  : (v && typeof v === 'object'
    ? ((v.ids || []).length > 0 || !!String(v.text || '').trim())
    : (!!v && String(v).trim().length > 0))
const splitChoice = (v) => Array.isArray(v)
  ? { ids: v, text: null }
  : { ids: (v && v.ids) || [], text: (v && v.text) ?? null }

function parseDate(str) {
  if (!str) return null
  const [d, m, Y, H, M, S] = str.split(/[\s:-]+/).map(Number)
  // API times are WIB (UTC+7). Build the absolute instant from WIB components
  // so the countdown is correct regardless of the viewer's browser timezone.
  return new Date(Date.UTC(Y, m - 1, d, (H || 0) - 7, M || 0, S || 0))
}

function lockedInfoFromSubmission(submission, previous = null) {
  if (submission?.status !== 'locked') return null
  const serverLockedAt = parseDate(submission.locked_at)?.getTime()
  return {
    reason: submission.cheat_reason || '',
    // Preserve the first local timestamp only as a fallback for old API data.
    lockedAt: serverLockedAt || previous?.lockedAt || Date.now(),
  }
}

function OptionTile({ letter, color, selected, checkbox, children, onClick, disabled, image }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={`relative py-4 px-4 rounded-2xl font-medium text-white text-center min-h-[88px] flex flex-col items-center gap-3 transition-all ${
        selected ? 'ring-2 ring-white ring-offset-2 shadow-lift scale-[1.02]' : 'shadow hover:brightness-110 active:brightness-95'
      }`}
      style={{ backgroundColor: color }}
    >
      <div className="flex items-center gap-3 w-full">
        {checkbox ? (
          <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors ${
            selected ? 'bg-white' : 'bg-white/25'
          }`}>
            {selected && <Check className="w-4 h-4 text-[var(--t,#6C5CE7)]" strokeWidth={3.5} />}
          </span>
        ) : (
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/25 font-mono font-bold text-sm shrink-0">
            {letter}
          </span>
        )}
        {children ? (
          <span className="flex-1 leading-snug text-left">{children}</span>
        ) : (
          <span className="flex-1" />
        )}
      </div>

      {image && (
        isAudioUrl(image.path) ? (
          <audio controls src={image.path} preload="metadata" className="w-full max-h-16 rounded-lg" onClick={(e) => e.stopPropagation()} />
        ) : (
          <img src={image.path} alt="" className="max-h-24 w-auto rounded-lg object-contain" />
        )
      )}

      {selected && !checkbox && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </span>
      )}
    </motion.button>
  )
}

// Opsi "Lainnya" (ketik sendiri) — hanya tampil bila creator mengaktifkan
// (question.allow_other). Dua varian mengikuti gaya sekitarnya: tile warna
// (mode quiz) dan baris ber-border (mode card/form).
function OtherTile({ variant = 'quiz', color, checkbox, selected, text, onToggle, onText, inputId, label, placeholder, error }) {
  if (variant === 'card') {
    return (
      <div
        onClick={onToggle}
        className={`flex flex-col gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${selected ? 'border-[var(--t)] bg-[var(--t-soft)]' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-ink-800'} ${error ? '!border-incorrect' : ''}`}
      >
        <div className="flex items-center gap-3 w-full">
          {checkbox ? (
            <span className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-colors ${selected ? '' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-ink-800'}`} style={selected ? { borderColor: 'var(--t)', backgroundColor: 'var(--t)', color: 'var(--t-contrast, #fff)' } : undefined}>
              {selected && <Check className="w-3.5 h-3.5" strokeWidth={3.5} />}
            </span>
          ) : (
            <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'border-[var(--t)]' : 'border-gray-300 dark:border-gray-600 text-gray-400'}`}>
              {selected
                ? <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--t)' }} />
                : <PenLine className="w-3 h-3" />}
            </span>
          )}
          <span className="text-sm font-medium text-ink dark:text-gray-200 flex-1 leading-snug text-left">{label}</span>
        </div>
        <input
          id={inputId}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder={placeholder}
          maxLength={OTHER_TEXT_LIMIT + 50}
          className={`input-field h-10 text-sm ${error && !text.trim() ? 'border-incorrect' : ''}`}
        />
      </div>
    )
  }
  return (
    <motion.div
      onClick={onToggle}
      className={`relative py-4 px-4 rounded-2xl font-medium text-white min-h-[88px] flex flex-col gap-3 transition-all cursor-pointer ${
        selected ? 'ring-2 ring-white ring-offset-2 shadow-lift scale-[1.02]' : 'shadow hover:brightness-110 active:brightness-95'
      } ${error && !text.trim() ? '!ring-2 !ring-incorrect ring-offset-2' : ''}`}
      style={{ backgroundColor: color }}
    >
      <div className="flex items-center gap-3 w-full">
        {checkbox ? (
          <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors ${selected ? 'bg-white' : 'bg-white/25'}`}>
            {selected && <Check className="w-4 h-4 text-[var(--t,#6C5CE7)]" strokeWidth={3.5} />}
          </span>
        ) : (
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/25 shrink-0">
            <PenLine className="w-4 h-4" />
          </span>
        )}
        <span className="flex-1 leading-snug text-left">{label}</span>
        {selected && !checkbox && (
          <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </span>
        )}
      </div>
      <input
        id={inputId}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        maxLength={OTHER_TEXT_LIMIT + 50}
        className="w-full rounded-xl bg-white/95 px-3.5 h-11 text-sm text-ink placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-white/70"
      />
    </motion.div>
  )
}

export default function AnswerQuiz() {
  const { t } = useTranslation()
  const { submissionId } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const searchParams = new URLSearchParams(window.location.search)
  const formType = searchParams.get('type') || 'form'
  const displayStyle = searchParams.get('style') || 'card'
  const formTitle = searchParams.get('title') || 'Form'
  const formCode = searchParams.get('code') || ''

  const [data, setData] = useState(null)
  const [publicForm, setPublicForm] = useState(null)
  // ponytail: live form attrs vs stale URL — design/type/title update after soft refresh
  const effectiveType = publicForm?.type ?? formType
  const effectiveStyle = publicForm?.display_style ?? displayStyle
  const effectiveTitle = publicForm?.title ?? formTitle
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitError, setSubmitError] = useState(null)   // inline error, tidak redirect ke FallbackPage
  const [validationErrors, setValidationErrors] = useState({})  // { [qId]: true } soal required kosong
  const [pwWrong, setPwWrong] = useState({})  // { [qId]: true } keyword password tidak cocok
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [fileAnswers, setFileAnswers] = useState({})   // { [qId]: { url, filename } }
  const [uploading, setUploading] = useState({})       // { [qId]: true } saat upload berjalan
  const [reviewed, setReviewed] = useState({})
  const [showMap, setShowMap] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(null)
  const [direction, setDirection] = useState(1)
  const [cheatWarn, setCheatWarn] = useState(null)
  // Countdown 5 detik sebelum lock: null = tidak dalam grace, 5..0 = detik tersisa
  const [graceCountdown, setGraceCountdown] = useState(null)
  // Submission dilock anti-cheat setelah satu exit fullscreen yang bertahan
  // melewati grace period 5 detik; menunggu keputusan creator.
  const [lockedInfo, setLockedInfo] = useState(null)
  const [showInfo, setShowInfo] = useState(false)
  const [zoomTarget, setZoomTarget] = useState(null)   // { question, options } yang dibuka modal zoom
  const [zoomScale, setZoomScale] = useState(1)
  const [refreshing, setRefreshing] = useState(false)

  const timerRef = useRef(null)
  const questionRefs = useRef({})   // { [qId]: HTMLElement } untuk scroll ke soal bermasalah

  const goToResult = useCallback(() => {
    // Sesi selesai (submit / timeout / cheating) — draft offline tak berguna lagi.
    clearDraft(submissionId)
    // Keluar dari fullscreen saat selesai (semua jalur: submit, timeout, cheating).
    const ex = document.exitFullscreen || document.webkitExitFullscreen
    if (ex) Promise.resolve(ex.call(document)).catch(() => { })
    navigate(`/s/${submissionId}/result?type=${effectiveType}&style=${effectiveStyle}&title=${encodeURIComponent(effectiveTitle)}&code=${formCode}`, { replace: true })
  }, [submissionId, navigate, effectiveType, effectiveStyle, effectiveTitle, formCode])

  const onExpired = useCallback(() => {
    setTimeLeft(0)
    goToResult()
  }, [goToResult])

  const reportTabExit = useCallback(async (reason = '') => {
    // Fullscreen anti-cheat: pelanggaran dilaporkan ke server (server pegang penalti).
    // Exit yang bertahan melewati grace period → submission 'locked': layar
    // dikunci, creator memutuskan
    // lanjut / finalisasi. Tak diputuskan 5 menit → otomatis cheating (sweep).
    try {
      const res = await api.post(`/submissions/${submissionId}/tab-exit`, reason ? { reason } : undefined, { headers: sessionTokenHeaders(submissionId) })
      const d = res.data
      if (d.status === 'locked') {
        setCheatWarn(null)
        setLockedInfo((previous) => lockedInfoFromSubmission({ ...d, cheat_reason: d.cheat_reason || reason }, previous))
      } else if (d.status === 'cheating' || d.warnings_left === 0) {
        goToResult()
      } else {
        setCheatWarn({ left: d.warnings_left, reason, at: Date.now() })
      }
    } catch (err) {
      if (err.response?.status === 410) goToResult()
    }
  }, [submissionId, goToResult])

  const { statuses, save, flushAll, clearTimers } = useAutosave({ submissionId, onExpired })

  // Mirror state answers untuk listener retry (online/focus) tanpa re-register.
  const answersRef = useRef({})
  answersRef.current = answers

  const fetchSubmission = useCallback(async () => {
    try {
      const res = await api.get(`/submissions/${submissionId}`, { headers: sessionTokenHeaders(submissionId) })
      const d = res.data
      if (d.status === 'submitted' || d.status === 'auto_submitted' || d.status === 'cheating') {
        goToResult()
        return
      }
      setLockedInfo((previous) => lockedInfoFromSubmission(d, previous))
      setData(d)
      const ans = {}
      const files = {}
      d.answers.forEach((a) => {
        if (a.question_type === 'short_answer' || a.question_type === 'essay' || a.question_type === 'date' || a.question_type === 'time' || a.question_type === 'datetime') {
          ans[a.question_id] = a.answer_text || ''
        } else if (a.question_type === 'file_upload') {
          if (a.answer_file) files[a.question_id] = { url: a.answer_file, filename: a.answer_file.split('/').pop() }
        } else {
          // Jawaban campuran (opsi + teks "Lainnya") dipulihkan sebagai object
          ans[a.question_id] = a.answer_text
            ? { ids: a.selected_option_ids || [], text: a.answer_text }
            : (a.selected_option_ids || [])
        }
      })
      setAnswers(ans)
      setFileAnswers(files)
      // timeLeft sengaja tidak di-set di sini — interval countdown di bawah
      // satu-satunya owner-nya, dan hanya jalan kalau form memang ber-timer.
    } catch (err) {
      if (err.response?.status === 403) {
        setError(t('answerQuiz.accessDenied'))
      } else {
        setError(err.response?.data?.message || t('answerQuiz.loadFailed'))
      }
    } finally {
      setLoading(false)
    }
  }, [submissionId, goToResult])

  useEffect(() => {
    fetchSubmission()
  }, [fetchSubmission])

  // Pulihkan draft offline (sekali, setelah data pertama dimuat): jawaban yang
  // belum sempat sampai server dikembalikan ke form lalu didorong ulang.
  // Draft menang atas nilai server — browser ini tempat user terakhir mengetik.
  const draftRestoredRef = useRef(false)
  useEffect(() => {
    if (!data || !submissionId || draftRestoredRef.current) return
    draftRestoredRef.current = true
    const entries = Object.entries(loadDraft(submissionId)).filter(([, e]) => {
      const v = e?.value
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== ''
    })
    if (!entries.length) return
    const restored = Object.fromEntries(entries.map(([qid, e]) => [Number(qid), e.value]))
    setAnswers((prev) => ({ ...prev, ...restored }))
    setTimeout(() => flushAll(restored).catch(() => {}), 800)
  }, [data, submissionId, flushAll])

  // Koneksi kembali / tab fokus → dorong semua jawaban sekali lagi;
  // yang sudah tersimpan cuma kena autosave idempoten, yang gagal akhirnya jalan.
  useEffect(() => {
    if (!submissionId) return
    const retry = () => flushAll(answersRef.current).catch(() => {})
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    return () => {
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
    }
  }, [submissionId, flushAll])

  // ponytail: auto-poll 10 detik dihapus — traffic tinggi bikin server lemot.
  // Cek status locked / update soal sekarang hanya via tombol manual
  // "Periksa status terbaru" / refresh (handleRefresh). Hemat request.

  useEffect(() => {
    if (!formCode) return
    api.get(`/q/${formCode}`)
      .then((res) => setPublicForm(res.data))
      .catch(() => { })
  }, [formCode])

  // ponytail: soft refresh — fetch ulang design/setting/question tanpa keluar fullscreen
  // window.location.reload() memicu exit fullscreen + kioskLocked + reportTabExit (cheating).
  // Soft fetch hanya update data/publicForm, jawaban lokal (answers/fileAnswers) tetap dipertahankan.
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const tasks = [api.get(`/submissions/${submissionId}`, { headers: sessionTokenHeaders(submissionId) })]
      if (formCode) tasks.push(api.get(`/q/${formCode}`).catch(() => null))
      const results = await Promise.allSettled(tasks)
      const sub = results[0]
      if (sub?.status === 'fulfilled' && sub.value?.data) {
        const d = sub.value.data
        if (d.status === 'submitted' || d.status === 'auto_submitted' || d.status === 'cheating') {
          goToResult()
          return
        }
        setLockedInfo((previous) => lockedInfoFromSubmission(d, previous))
        setData((prev) => {
          if (!prev) return prev
          return { ...prev, questions: d.questions, sections: d.sections, expired_at: d.expired_at }
        })
        // clamp currentIdx jika soal/section berkurang — pakai display_style terbaru dari publicForm
        const newQuestions = d.questions || []
        const newSections = d.sections || []
        const freshStyle = results[1]?.status === 'fulfilled' && results[1].value?.data?.display_style
          ? results[1].value.data.display_style
          : effectiveStyle
        const isOneByOneNow = freshStyle === 'quiz'
        if (isOneByOneNow) {
          setCurrentIdx((i) => Math.min(i, Math.max(0, newQuestions.length - 1)))
        } else {
          const ordered = []
          const seen = new Set()
          newSections.forEach((s) => {
            newQuestions.filter((q) => q.section_id === s.id && !seen.has(q.id)).forEach((q) => { ordered.push(q); seen.add(q.id) })
          })
          newQuestions.filter((q) => !seen.has(q.id)).forEach((q) => { ordered.push(q); seen.add(q.id) })
          const pages = []
          ordered.forEach((q) => {
            const last = pages[pages.length - 1]
            if (last && last.key === (q.section_id ?? 'none')) last.questions.push(q)
            else pages.push({ key: q.section_id ?? 'none', questions: [q] })
          })
          const maxIdx = Math.max(0, (pages.length || 1) - 1)
          setCurrentIdx((i) => Math.min(i, maxIdx))
        }
      }
      if (formCode && results[1]?.status === 'fulfilled' && results[1].value?.data) {
        setPublicForm(results[1].value.data)
      }
    } catch {
      /* soft refresh gagal — biarkan sesi tetap jalan, user retry manual */
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, submissionId, formCode, goToResult, effectiveStyle])

  const handleAutoSubmit = useCallback(async () => {
    // Auto-submit karena waktu habis: server bisa saja sudah meng-auto-submit
    // sesi lewat sweep/autosave (410/409) — itu sukses, jawaban sudah aman.
    const finish = () => goToResult()
    const submit = async () => api.post(`/submissions/${submissionId}/submit`, undefined, { headers: sessionTokenHeaders(submissionId) })
    try {
      await flushAll(answers)
      await submit()
      finish()
    } catch (err) {
      const status = err.response?.status
      if (status === 409 || status === 410) return finish()
      // Selisih jam klien vs server di detik terakhir: coba lagi sebentar,
      // server akan menganggap sesi kedaluwarsa dan memproses auto-submit.
      for (let i = 0; i < 2 && status !== undefined; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        try {
          await submit()
          return finish()
        } catch (e) {
          if (e.response?.status === 409 || e.response?.status === 410) return finish()
        }
      }
      finish()
    }
  }, [submissionId, goToResult, flushAll, answers])

  useEffect(() => {
    // Countdown jalan untuk SEMUA tipe form (quiz & form) selama ada deadline
    // nyata dari backend (timer creator atau jadwal tutup). Batas internal
    // 24 jam anti-sesi zombie tidak pernah diekspos.
    if (!data || !data.expired_at) return
    const deadline = parseDate(data.expired_at)
    if (!deadline) return

    timerRef.current = setInterval(() => {
      const diff = deadline.getTime() - Date.now()
      if (diff <= 0) {
        clearInterval(timerRef.current)
        setTimeLeft(0)
        handleAutoSubmit()
      } else {
        setTimeLeft(diff)
      }
    }, 1000)

    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, effectiveType, data?.expired_at, handleAutoSubmit])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  useEffect(() => {
    if (effectiveType !== 'quiz' || !publicForm?.is_restricted || !data) return
    // Kiosk mode — PIN halaman ke fullscreen. requestFullscreen butuh user gesture,
    // jadi dipicu otomatis pada interaksi pertama. Saat fullscreen keluar / fokus
    // hilang, kunci penyembunyian muncul (tuple di bawah) sampai responden kembali.
    const requestFs = () => {
      const el = document.documentElement
      const req = el.requestFullscreen || el.webkitRequestFullscreen
      const cur = document.fullscreenElement || document.webkitFullscreenElement
      if (req && !cur) {
        Promise.resolve(req.call(el)).then(() => setFsAvailable(true)).catch(() => { })
      }
    }
    const onFirst = () => {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) requestFs()
    }
    requestFs()
    document.addEventListener('pointerdown', onFirst)
    document.addEventListener('keydown', onFirst)
    return () => {
      document.removeEventListener('pointerdown', onFirst)
      document.removeEventListener('keydown', onFirst)
    }
  }, [effectiveType, publicForm?.is_restricted, data])

  // Keyboard virtual (restricted): lacak tinggi keyboard via visualViewport.
  // Dipakai untuk (1) menyesuaikan tinggi layout supaya input tetap terlihat,
  // (2) menahan deteksi curang palsu — keyboard menyusutkan viewport dan bisa
  // memicu blur, yang tanpa ini tercatat sebagai split-screen / window-blur.
  const [kbInset, setKbInset] = useState(0)
  const kbInsetRef = useRef(0)
  useEffect(() => {
    if (effectiveType !== 'quiz' || !publicForm?.is_restricted || !data) return
    const vv = window.visualViewport
    if (!vv) return
    const onVV = () => {
      const kb = Math.round(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
      const open = kb > 150 // di bawah ambang = bukan keyboard
      kbInsetRef.current = open ? kb : 0
      setKbInset(kbInsetRef.current)
    }
    vv.addEventListener('resize', onVV)
    vv.addEventListener('scroll', onVV)
    onVV()
    return () => {
      vv.removeEventListener('resize', onVV)
      vv.removeEventListener('scroll', onVV)
    }
  }, [effectiveType, publicForm?.is_restricted, data])

  // Kiosk lock: kunci penuh — sembunyikan seluruh konten saat responden keluar
  // dari fullscreen / kehilangan fokus / pindah tab. Mencoba interaksi apa pun di
  // layar kunci langsung mem-buat kembali fullscreen (pin ulang). Anti-cheat tetap
  // dilaporkan ke server (reportTabExit) — server pemegang penalti.
  const [kioskLocked, setKioskLocked] = useState(false)
  const [fsAvailable, setFsAvailable] = useState(false)
  const kioskTimer = useRef(null)
  useEffect(() => {
    if (effectiveType !== 'quiz' || !publicForm?.is_restricted || !data?.id) return
    const inFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement
    const lock = () => {
      clearTimeout(kioskTimer.current)
      kioskTimer.current = setTimeout(() => setKioskLocked(true), 120)
    }
    const unlock = () => {
      clearTimeout(kioskTimer.current)
      setKioskLocked(false)
    }
    // fullscreenchange dipicu BAIK saat keluar maupun saat masuk kembali — maka
    // kita biarkan ia toggel keduanya. Kunci hanya bila TIDAK fullscreen; begitu
    // back ke fullscreen langsung buka kunci (tidak menunggu event focus yang
    // tidak selalu terpicu setelah cover fullscreen).
    const onFsChange = () => {
      if (inFullscreen() && document.visibilityState === 'visible') unlock()
      else if (fsAvailable) lock()
    }
    const onVis = () => { if (document.visibilityState === 'hidden' && fsAvailable) lock() }
    // Keyboard virtual bisa memicu blur di beberapa keyboard (mis. Gboard) —
    // jangan kunci saat itu; app-switch nyata tetap tertangkap visibilitychange.
    const onBlur = () => { if (fsAvailable && !kbInsetRef.current) lock() }
    const onFocus = () => { if (inFullscreen() && document.visibilityState === 'visible') unlock() }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(kioskTimer.current)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [effectiveType, publicForm?.is_restricted, data?.id, fsAvailable])

  // Fullscreen anti-cheat (is_restricted quiz). Satu event keluar hanya
  // memulai grace window 5 detik. Penalti baru dikirim ke server jika user
  // belum kembali fullscreen setelah grace window berakhir. Ini menghindari
  // false-positive dari burst blur + visibilitychange + fullscreenchange.
  // FIX: deps pakai data?.id (bukan data) agar poll 10 detik tidak cancel timer.
  // Tambah graceCountdown visible di KioskLockOverlay — user lihat hitung mundur
  // 5..0 sebelum benar-benar dikunci server.
  useEffect(() => {
    if (effectiveType !== 'quiz' || !publicForm?.is_restricted || !data?.id) return
    let graceTimer = null
    let graceInterval = null
    let graceEndAt = 0
    let graceReason = ''
    const GRACE_MS = 5000

    const clearGrace = () => {
      if (graceTimer) clearTimeout(graceTimer)
      if (graceInterval) clearInterval(graceInterval)
      graceTimer = null
      graceInterval = null
      graceEndAt = 0
      graceReason = ''
      setGraceCountdown(null)
    }

    const startGrace = (reason) => {
      if (graceTimer) return // already counting — debounce burst
      graceReason = reason
      graceEndAt = Date.now() + GRACE_MS
      setGraceCountdown(5)
      graceInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((graceEndAt - Date.now()) / 1000))
        setGraceCountdown(remaining)
      }, 200)
      graceTimer = setTimeout(() => {
        clearInterval(graceInterval)
        graceInterval = null
        graceTimer = null
        const stillOutside = !document.fullscreenElement && !document.webkitFullscreenElement
        const stillHidden = document.visibilityState === 'hidden'
        if (stillOutside || stillHidden) {
          setGraceCountdown(null)
          graceEndAt = 0
          reportTabExit(graceReason)
        } else {
          clearGrace()
        }
      }, GRACE_MS)
    }

    const report = (reason) => {
      startGrace(reason)
    }

    const inFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement

    const onFsChange = () => {
      if (inFullscreen() && document.visibilityState === 'visible') clearGrace()
      else report('left-fullscreen')
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') report('tab-hidden')
      else if (inFullscreen()) clearGrace()
    }
    const onBlur = () => { if (!kbInsetRef.current) report('window-blur') }

    // Split-screen / floating window: only meaningful while fullscreen is ON —
    // in fullscreen the content should cover the whole screen, so any large
    // shrink means the app was split, resized, or another app floated over it.
    // Keyboard virtual juga menyusutkan innerHeight di Android — abaikan saat
    // kbInset aktif (sudah diidentifikasi sebagai keyboard via visualViewport).
    let shrinkTimer = null
    const onResize = () => {
      if (!inFullscreen() || kbInsetRef.current) return
      if (window.screen.height - window.innerHeight > 120) {
        clearTimeout(shrinkTimer)
        shrinkTimer = setTimeout(() => report('split-screen'), 300)
      }
    }

    const beforePrint = () => report('print')
    const onPiP = () => report('picture-in-picture')
    const onContext = (e) => { e.preventDefault(); report('context-menu') }
    const onCopy = () => report('copy')
    const onCut = () => report('copy')
    const onPaste = () => report('copy')
    const onDragStart = (e) => { e.preventDefault() }
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase()
      const blocked =
        e.key === 'F12' ||
        e.key === 'PrintScreen' || e.key === 'PrtScn' ||
        (e.ctrlKey && ['p', 'u', 's', 'a'].includes(k)) ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) ||
        (e.ctrlKey && ['c', 'x', 'v'].includes(k))
      if (blocked) {
        e.preventDefault()
        report('shortcut')
      }
    }

    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeprint', beforePrint)
    document.addEventListener('enterpictureinpicture', onPiP)
    document.addEventListener('contextmenu', onContext)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('beforeprint', beforePrint)
      document.removeEventListener('enterpictureinpicture', onPiP)
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('keydown', onKey)
      clearTimeout(shrinkTimer)
      clearGrace()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType, publicForm?.is_restricted, data?.id, reportTabExit])

  // Auto-dismiss the cheat warning banner after a few seconds.
  useEffect(() => {
    if (!cheatWarn) return
    const tid = setTimeout(() => setCheatWarn(null), 5000)
    return () => clearTimeout(tid)
  }, [cheatWarn])

  // Keyboard navigation (quiz mode): 1-4 pilih opsi, ←/→ ganti soal, Enter next/submit
  useEffect(() => {
    if (effectiveType !== 'quiz' || !data) return
    const qs = data.questions || []
    const cur = qs[currentIdx]
    if (!cur || showConfirm || showMap) return
    const curAnswer = answers[cur.id]
    const hasAns = isAnswered(cur, curAnswer)
    const isReq = cur.is_required !== false
    const canGo = !isReq || hasAns
    const isLast = currentIdx === qs.length - 1

    const handler = (e) => {
      // Fokus di kolom isian (textarea/input/select) → biarkan perilaku normal
      // (Enter = baris baru, angka/panah = kursor).
      const el = e.target
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); if (!isLast) handleNext() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev() }
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (isLast) { if (canGo) openConfirm() } else if (canGo) handleNext()
      }
      else if (/^[1-4]$/.test(e.key) && (cur.type === 'multiple_choice' || cur.type === 'checkbox')) {
        const opt = cur.options[Number(e.key) - 1]
        if (opt) handleSelect(cur.id, opt.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType, data, currentIdx, answers, showConfirm, showMap, reviewed])

  // Nilai pilihan bisa object {ids, text} bila "Lainnya" dipakai —
  // normalkan ke bentuk array sebelum toggle agar cabang lama tetap jalan.
  const choiceIds = (qId, a) => splitChoice((a ?? answers)[qId]).ids

  const handleSelect = (qId, optId) => {
    const question = data.questions.find((q) => q.id === qId)
    if (!question) return

    if (question.type === 'multiple_choice' || question.type === 'dropdown') {
      setAnswers((a) => {
        const { ids, text } = splitChoice(a[qId])
        const toggledOff = optId == null || ids[0] === optId
        const nextIds = toggledOff ? [] : [optId]
        // MC single-answer: pilih opsi baru membuang teks Lainnya;
        // batal-pilih mempertahankannya (tetap terjawab bila teks ada).
        const keepText = text && toggledOff ? text : null
        const next = keepText ? { ids: nextIds, text: keepText } : nextIds
        save(qId, next)
        return { ...a, [qId]: next }
      })
    } else if (question.type === 'checkbox') {
      setAnswers((a) => {
        const { ids, text } = splitChoice(a[qId])
        const nextIds = ids.includes(optId) ? ids.filter((id) => id !== optId) : [...ids, optId]
        const next = text ? { ids: nextIds, text } : nextIds
        save(qId, next)
        return { ...a, [qId]: next }
      })
    }
    // Clear validation error for this question once user picks an answer
    if (validationErrors[qId]) {
      setValidationErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    }
  }

  // Opsi "Lainnya": berperilaku seperti opsi biasa — tap untuk pilih /
  // lepas (checkmark/ring menyala) — plus kolom ketik yang selalu terlihat.
  // Dipilih saja (teks kosong) = terpilih tapi belum terjawab; mengisi teks
  // = terjawab. Toggle off membuang teksnya sekalian.
  const toggleOther = (qId) => {
    const question = data?.questions?.find((x) => x.id === qId)
    const v = answers[qId]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      setAnswers((a) => {
        const next = splitChoice(a[qId]).ids
        save(qId, next)
        return { ...a, [qId]: next }
      })
    } else {
      const ids = Array.isArray(v) ? v : []
      // MC satu jawaban: nyalakan Lainnya = lepas semua opsi biasa
      const nextIds = question?.type === 'multiple_choice' ? [] : ids
      setAnswers((a) => ({ ...a, [qId]: { ids: nextIds, text: '' } }))
      setTimeout(() => document.getElementById(`other-input-${qId}`)?.focus(), 60)
    }
    if (validationErrors[qId]) {
      setValidationErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    }
  }

  const handleOtherText = (qId, value) => {
    const question = data?.questions?.find((x) => x.id === qId)
    if (value.length > OTHER_TEXT_LIMIT) {
      setTextLimitErrors((e) => ({ ...e, [qId]: t('answerQuiz.charLimit', { limit: OTHER_TEXT_LIMIT, current: value.length }) }))
    } else {
      setTextLimitErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    }
    setAnswers((a) => {
      const { ids } = splitChoice(a[qId])
      // MC satu jawaban: mengetik di Lainnya = pilih Lainnya saja
      const nextIds = (question?.type === 'multiple_choice' && value.trim()) ? [] : ids
      const next = { ids: nextIds, text: value }
      if (value.length <= OTHER_TEXT_LIMIT) save(qId, next)
      return { ...a, [qId]: next }
    })
    if (validationErrors[qId] && value.trim()) {
      setValidationErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    }
  }

  const [textLimitErrors, setTextLimitErrors] = useState({})

  const handleTextChange = (qId, value) => {
    const q = data?.questions?.find((x) => x.id === qId)
    const lim = q ? getTextLimit(q.type) : null
    if (lim && value.length > lim) {
      setTextLimitErrors((e) => ({ ...e, [qId]: t('answerQuiz.charLimit', { limit: lim, current: value.length }) }))
    } else {
      setTextLimitErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    }
    setAnswers((a) => ({ ...a, [qId]: value }))
    if (!lim || value.length <= lim) save(qId, value)
    // Clear validation error once user starts typing
    if (validationErrors[qId] && value.trim()) {
      setValidationErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    }
    if (pwWrong[qId]) {
      setPwWrong((e) => { const n = { ...e }; delete n[qId]; return n })
    }
  }

  const handleFileUpload = async (qId, file) => {
    if (!file) return
    setUploading((u) => ({ ...u, [qId]: true }))
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post(`/submissions/${submissionId}/answers/${qId}/file`, fd, { headers: sessionTokenHeaders(submissionId) })
      setFileAnswers((f) => ({ ...f, [qId]: { url: res.data.answer_file, filename: res.data.filename || file.name } }))
      setValidationErrors((e) => { const n = { ...e }; delete n[qId]; return n })
    } catch (err) {
      setSubmitError(err.response?.data?.detail || err.response?.data?.message || t('answerQuiz.submitFailed'))
    } finally {
      setUploading((u) => ({ ...u, [qId]: false }))
    }
  }

  const removeFileAnswer = (qId) => {
    setFileAnswers((f) => { const n = { ...f }; delete n[qId]; return n })
    setAnswers((a) => { const n = { ...a }; delete n[qId]; return n })
  }

  const toggleReview = (qId) => {
    setReviewed((r) => ({ ...r, [qId]: !r[qId] }))
  }

  // Verifikasi password ke server — keyword tidak pernah dikirim ke klien,
  // jadi pencocokan hanya bisa di backend. Gagal request = dianggap salah
  // (fail-closed); ponytail: tambah retry/timeout kalau network sering flake.
  const checkPasswords = async (qs) => {
    if (!qs.length) return []
    const emptyWrong = []
    const toCheck = []
    for (const q of qs) {
      if (q.type !== 'password') continue
      const ans = String(answers[q.id] ?? '')
      if (!ans.length) emptyWrong.push(q.id)
      else toCheck.push(q)
    }
    const checked = toCheck.length
      ? (
          await Promise.all(
            toCheck.map(async (q) => {
              try {
                const res = await api.post(
                  `/submissions/${submissionId}/questions/${q.id}/check-password`,
                  { answer: answers[q.id] },
                  { headers: sessionTokenHeaders(submissionId) },
                )
                return res.data.valid ? null : q.id
              } catch {
                return q.id
              }
            }),
          )
        ).filter(Boolean)
      : []
    return [...emptyWrong, ...checked]
  }

  const handleNext = async () => {
    if (!data) return
    // block kalau ada jawaban melebihi limit
    if (Object.keys(textLimitErrors).length) {
      const firstId = Number(Object.keys(textLimitErrors)[0])
      setValidationErrors((e) => ({ ...e, [firstId]: true }))
      setTimeout(() => questionRefs.current[firstId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
      return
    }
    // CARD/Form: required wajib blok Next Section — cek semua required di halaman ini.
    // Quiz (isOneByOne) memang tidak blok Next Question untuk required, hanya password.
    if (!isOneByOne) {
      const pageQs = formPages[currentIdx]?.questions || []
      const isAns = (q) => {
        if (q.type === 'file_upload') return !!fileAnswers[q.id]?.url
        return hasValue(answers[q.id])
      }
      const missing = pageQs.filter((q) => q.is_required !== false && !isAns(q))
      if (missing.length) {
        const errs = Object.fromEntries(missing.map((q) => [q.id, true]))
        setValidationErrors((e) => ({ ...e, ...errs }))
        const first = missing[0].id
        setTimeout(() => questionRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
        return
      }
    }
    // Gerbang password: blok next apapun jika password salah/kosong —
    // berlaku semua design & semua password (required maupun optional) —
    // sesuai request: walaupun bukan required tetap harus sesuai keyword
    // baru bisa next. Fix sebelumnya hanya required.
    let gateQuestions = []
    if (isOneByOne) {
      if (current?.type === 'password') gateQuestions = [current]
    } else {
      gateQuestions = (formPages[currentIdx]?.questions || []).filter((q) => q.type === 'password')
    }
    const wrongPw = await checkPasswords(gateQuestions)
    if (wrongPw.length) {
      const errs = Object.fromEntries(wrongPw.map((qid) => [qid, true]))
      setPwWrong((w) => ({ ...w, ...errs }))
      setValidationErrors((e) => ({ ...e, ...errs }))
      setTimeout(() => {
        questionRefs.current[wrongPw[0]]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
      return
    }
    // bersihkan error password sebelumnya jika sekarang sudah benar
    if (gateQuestions.length) {
      setPwWrong((prev) => {
        const n = { ...prev }
        gateQuestions.forEach((q) => delete n[q.id])
        return n
      })
      setValidationErrors((prev) => {
        const n = { ...prev }
        gateQuestions.forEach((q) => {
          // hanya hapus jika penyebabnya password, jangan hapus error required lain
          if (prev[q.id] && q.type === 'password') delete n[q.id]
        })
        return n
      })
    }
    const total = formPages.length
    if (currentIdx < total - 1) {
      setDirection(1)
      setCurrentIdx((i) => i + 1)
    }
  }

  const handlePrev = () => {
    if (currentIdx > 0) {
      setDirection(-1)
      setCurrentIdx((i) => i - 1)
    }
  }

  const goToQuestion = async (idx) => {
    // Forward jump wajib lolos gate password & limit seperti Next
    if (idx > currentIdx) {
      if (Object.keys(textLimitErrors).length) {
        const firstId = Number(Object.keys(textLimitErrors)[0])
        setValidationErrors((e) => ({ ...e, [firstId]: true }))
        setTimeout(() => questionRefs.current[firstId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
        return
      }
      // CARD: required blok forward jump (section) — mirip Next
      if (!isOneByOne) {
        const pageQs = formPages[currentIdx]?.questions || []
        const isAns = (q) => {
          if (q.type === 'file_upload') return !!fileAnswers[q.id]?.url
          return hasValue(answers[q.id])
        }
        const missing = pageQs.filter((q) => q.is_required !== false && !isAns(q))
        if (missing.length) {
          const errs = Object.fromEntries(missing.map((q) => [q.id, true]))
          setValidationErrors((e) => ({ ...e, ...errs }))
          const first = missing[0].id
          setTimeout(() => questionRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
          return
        }
      }
      let gate = []
      if (isOneByOne) {
        if (current?.type === 'password') gate = [current]
      } else {
        gate = (formPages[currentIdx]?.questions || []).filter((q) => q.type === 'password')
      }
      if (gate.length) {
        const wrong = await checkPasswords(gate)
        if (wrong.length) {
          const errs = Object.fromEntries(wrong.map((id) => [id, true]))
          setPwWrong((w) => ({ ...w, ...errs }))
          setValidationErrors((e) => ({ ...e, ...errs }))
          setTimeout(() => questionRefs.current[wrong[0]]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
          return
        }
      }
    }
    setDirection(idx > currentIdx ? 1 : -1)
    setCurrentIdx(idx)
  }

  const handleSubmitAll = async () => {
    if (submitting) return
    if (Object.keys(textLimitErrors).length) {
      const firstId = Number(Object.keys(textLimitErrors)[0])
      setValidationErrors((e) => ({ ...e, [firstId]: true }))
      const idx = (data?.questions || []).findIndex((q) => q.id === firstId)
      if (idx >= 0) {
        if (!isOneByOne) {
          const pi = formPages.findIndex((p) => p.questions.some((x) => x.id === firstId))
          if (pi >= 0 && pi !== currentIdx) { setDirection(pi > currentIdx ? 1 : -1); setCurrentIdx(pi) }
        } else {
          goToQuestion(idx)
        }
        setTimeout(() => questionRefs.current[firstId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
      }
      return
    }

    // Frontend validation — cek semua soal required sebelum kirim ke backend
    const isAnsweredCheck = (q, val) => {
      if (q?.type === 'file_upload') return !!fileAnswers[q.id]?.url
      return Array.isArray(val) ? val.length > 0 : !!val && String(val).trim().length > 0
    }
    const errors = {}
    let firstErrorIdx = -1
    const qs = data?.questions || []
    qs.forEach((q, idx) => {
      if (q.is_required !== false && !isAnsweredCheck(q, answers[q.id])) {
        errors[q.id] = true
        if (firstErrorIdx === -1) firstErrorIdx = idx
      }
    })

    // Gerbang password sebelum submit: hanya required yang salah → blok (optional boleh salah/kosong)
    const pwQs = qs.filter((q) => q.type === 'password' && q.is_required !== false)
    const wrongPw = await checkPasswords(pwQs)
    if (wrongPw.length) {
      wrongPw.forEach((qid) => { errors[qid] = true })
      if (firstErrorIdx === -1) {
        firstErrorIdx = qs.findIndex((q) => wrongPw.includes(q.id))
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setSubmitError(null)
      // Scroll ke soal required pertama yang belum dijawab (lompat ke halaman section-nya dulu)
      const firstQ = qs[firstErrorIdx]
      if (firstQ) {
        if (!isOneByOne) {
          const pi = formPages.findIndex((p) => p.questions.some((x) => x.id === firstQ.id))
          if (pi >= 0 && pi !== currentIdx) {
            setDirection(pi > currentIdx ? 1 : -1)
            setCurrentIdx(pi)
          }
        }
        setTimeout(() => {
          if (questionRefs.current[firstQ.id]) {
            questionRefs.current[firstQ.id].scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 120)
      }
      return // Jangan kirim ke backend
    }

    setValidationErrors({})
    setSubmitError(null)
    setSubmitting(true)
    try {
      await flushAll(answers)
      await api.post(`/submissions/${submissionId}/submit`, undefined, { headers: sessionTokenHeaders(submissionId) })
      goToResult()
    } catch (err) {
      if (err.response?.status === 410) {
        goToResult()
      } else {
        const msg = err.response?.data?.message || err.response?.data?.detail || t('answerQuiz.submitFailed')
        setShowConfirm(false)
        // Submit error ditampilkan inline, BUKAN redirect ke FallbackPage
        setSubmitError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const openConfirm = () => {
    setShowConfirm(true)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-paper dark:bg-ink-950">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (error) {
    return (
      <FallbackPage
        title={t('answerQuiz.loadFailed')}
        message={error}
        action={<Button variant="secondary" onClick={() => navigate('/')} className="w-full">{t('common.goHome')}</Button>}
      />
    )
  }

  if (!data) return null

  const isQuizStyle = effectiveStyle === 'quiz'
  const isOneByOne = effectiveStyle === 'quiz'
  const palette = themePalette(publicForm?.theme_color, theme === 'dark')
  const isOwnerPreview = publicForm?.is_owner === true && publicForm?.status !== 'published'
  const sectionsById = Object.fromEntries((data.sections || []).map((s) => [s.id, s.title]))
  const bannerPath = publicForm?.banner_path || null
  const questions = data.questions || []
  const current = questions[currentIdx]
  const totalQ = questions.length

  const formatTime = (ms) => {
    if (ms <= 0) return '00:00'
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const pinToFullscreen = () => {
    const el = document.documentElement
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    const cur = document.fullscreenElement || document.webkitFullscreenElement
    if (req && !cur) Promise.resolve(req.call(el)).catch(() => { })
  }

  // Mode form: satu section = satu halaman. Quiz style: satu soal = satu halaman.
  // KEDUA mode wajib group per section (urutan section selalu berurutan sesuai
  // desain; shuffle hanya mengacak soal DI DALAM section). Array mentah
  // data.questions bisa tidak sinkron dgn section — soal yang ditambahkan
  // setelah sesi mulai selalu nempel di ekor snapshot.
  const formPages = (() => {
    const ordered = []
    const seen = new Set()
    ;(data.sections || []).forEach((s) => {
      questions.filter((q) => q.section_id === s.id && !seen.has(q.id)).forEach((q) => { ordered.push(q); seen.add(q.id) })
    })
    questions.filter((q) => !seen.has(q.id)).forEach((q) => { ordered.push(q); seen.add(q.id) })

    if (isOneByOne) return ordered.map((q) => ({ title: null, questions: [q] }))
    const pages = []
    ;ordered.forEach((q) => {
      const last = pages[pages.length - 1]
      if (last && last.key === (q.section_id ?? 'none')) last.questions.push(q)
      else pages.push({ key: q.section_id ?? 'none', title: (data.sections || []).find((s) => s.id === q.section_id)?.title || null, questions: [q] })
    })
    return pages.length ? pages : [{ title: null, questions }]
  })()
  const formPage = formPages[Math.min(currentIdx, formPages.length - 1)]

  // Helper shared by both quiz and form modes
  const isAnswered = (q, val) => {
    if (q?.type === 'file_upload') return !!fileAnswers[q.id]?.url
    return hasValue(val)
  }

  // Huruf opsi terpilih untuk tipe pilihan (MC/checkbox/dropdown) — sama
  // persis dengan LETTERS di badan soal. Tipe isian/esai/file/dll → null
  // (jawabannya panjang, tidak enak ditampilkan di map).
  const pickLetters = (q, val) => {
    if (!q || !['multiple_choice', 'checkbox', 'dropdown'].includes(q.type)) return null
    const ids = Array.isArray(val) ? val : (val?.ids || [])
    if (!ids.length || !q.options?.length) return null
    const letters = ids
      .map((id) => {
        const oi = q.options.findIndex((o) => o.id === id)
        return oi >= 0 ? LETTERS[oi % LETTERS.length] : null
      })
      .filter(Boolean)
    return letters.length ? letters.join(',') : null
  }

  if (isQuizStyle) {
    const currentAnswer = answers[current?.id]
    const hasAnswer = isAnswered(current, currentAnswer)
    const isRequired = current?.is_required !== false
    const isLast = currentIdx === totalQ - 1
    const progress = totalQ > 0 ? ((currentIdx + 1) / totalQ) * 100 : 0
    const canProceed = !isRequired || hasAnswer
    const answeredMap = {}
    const reviewedMap = {}
    const pickedMap = {}
    questions.forEach((q, i) => {
      answeredMap[i] = isAnswered(q, answers[q.id])
      reviewedMap[i] = !!reviewed[q.id]
      pickedMap[i] = pickLetters(q, answers[q.id])
    })
    const reviewedCount = Object.values(reviewed).filter(Boolean).length
    const missingRequired = questions
      .filter((q) => q.is_required !== false && !isAnswered(q, answers[q.id]))
      .map((q) => (q.question_text || '').replace(/<[^>]*>/g, '').trim())
    const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length

    return (
      <div className="theme-surface h-dvh flex flex-col bg-paper overflow-hidden" style={{ '--t': palette.base, ...(kbInset ? { height: `calc(100dvh - ${kbInset}px)` } : {}) }}>
        {cheatWarn && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] max-w-lg"
          >
            <div className="flex items-start gap-3 bg-incorrect text-white px-4 py-3.5 rounded-2xl shadow-lift">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">{t('answerQuiz.cheatWarningTitle', { reason: cheatWarn.reason || 'leaving page' })}</p>
                <p className="text-white/85 mt-0.5">
                  {t('answerQuiz.cheatWarningDesc', { current: 3 - cheatWarn.left })}
                </p>
              </div>
            </div>
          </motion.div>
        )}
        <header className="px-4 py-3" style={{ background: palette.gradient }}>
          {isOwnerPreview && <PreviewNotice />}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setShowInfo(true)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/80 hover:bg-white/15 hover:text-white transition-colors shrink-0"
                aria-label="Exam info"
                title="View exam info"
              >
                <Info className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-white truncate"><RichText html={effectiveTitle} className="rich-text" /></span>
            </div>
            <div className="flex items-center gap-2">
              {current && (
                <SaveIndicator status={statuses[current.id]} />
              )}
              {timeLeft !== null && (
                <span className={`inline-flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums px-2.5 h-8 rounded-lg transition-colors ${timeLeft < 30000
                  ? 'bg-incorrect text-white animate-pulse'
                  : timeLeft < 60000
                    ? 'bg-white text-incorrect'
                    : 'bg-white/15 text-white'
                  }`}>
                  <Timer className="w-3.5 h-3.5" />
                  {formatTime(timeLeft)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-full h-1.5 bg-white/25 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <button
              onClick={() => setShowMap((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-bold shrink-0 px-2 h-8 rounded-lg transition-colors ${showMap ? 'bg-white text-[var(--t)]' : 'text-white/80 hover:bg-white/15'
                }`}
              aria-label="Show questions"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              {currentIdx + 1}/{totalQ}
            </button>
          </div>
        </header>

        <QuestionMapDrawer
          show={showMap}
          onClose={() => setShowMap(false)}
          total={totalQ}
          current={currentIdx}
          answered={answeredMap}
          reviewed={reviewedMap}
          picked={pickedMap}
          onSelect={(idx) => { setShowMap(false); goToQuestion(idx) }}
        />

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
          <AnimatePresence mode="wait" custom={direction}>            <motion.div
            key={current?.id}
            custom={direction}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -60, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {current && (
              <div className="max-w-3xl mx-auto">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    {current.is_required === false && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-ink-800 px-2 py-0.5 rounded-full">{t('answerQuiz.optional')}</span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleReview(current.id)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 h-8 rounded-lg transition-colors ${reviewed[current.id] ? 'bg-warn text-white shadow-chip' : 'bg-white dark:bg-ink-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:text-warn hover:border-warn'
                      }`}
                    aria-pressed={!!reviewed[current.id]}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {reviewed[current.id] ? t('answerQuiz.marked') : t('answerQuiz.markReview')}
                  </button>
                </div>
                <h2 className="font-display text-xl font-medium text-ink dark:text-gray-100 text-center mb-3 flex items-start justify-center gap-0.5">
                  <span className="[&>p]:mb-0"><RichText html={current.question_text} className="rich-text" /></span>
                  {current.is_required !== false && (
                    <span className="text-incorrect font-bold shrink-0" title="Required">*</span>
                  )}
                </h2>
                {/* {current.section_id && sectionsById[current.section_id] && (
                  <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500 mb-3">
                    {sectionsById[current.section_id]}
                  </p>
                )} */}
                {current.image && (isAudioUrl(current.image.path) ? (
                  <audio controls src={current.image.path} preload="metadata" className="w-full max-w-sm mx-auto mb-4" />
                ) : (
                  <img
                    src={current.image.path}
                    alt=""
                    onClick={() => { setZoomTarget(current); setZoomScale(1) }}
                    className="max-h-52 w-auto mx-auto rounded-2xl object-cover mb-4 shadow-card cursor-zoom-in"
                  />
                ))}
                {/* Perbesar soal tersedia untuk semua tipe soal, dengan/tanpa media */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => { setZoomTarget(current); setZoomScale(1) }}
                    className="inline-flex items-center gap-2 text-xs font-semibold px-4 h-9 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-800 text-gray-600 dark:text-gray-300 hover:text-[var(--t)] hover:border-[var(--t-border)] hover:bg-[var(--t-soft)] transition-colors shadow-chip"
                    aria-label={t('answerQuiz.zoomIn')}
                  >
                    <ZoomIn className="w-4 h-4" />
                    {t('answerQuiz.zoomIn')}
                  </button>
                </div>
                {current.type === 'multiple_choice' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-400 text-center mb-2">{t('answerQuiz.pickOne')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {current.options.map((opt, i) => {
                        const selected = choiceIds(current.id).includes(opt.id)
                        return (
                          <OptionTile
                            key={opt.id}
                            letter={LETTERS[i % LETTERS.length]}
                            color={OPT_COLORS[i % OPT_COLORS.length]}
                            selected={selected}
                            onClick={() => handleSelect(current.id, opt.id)}
                            image={opt.image}
                          >
                            <RichText html={opt.option_text} className="rich-text" />
                          </OptionTile>
                        )
                      })}
                      {current.allow_other && (
                        <OtherTile
                          color={OPT_COLORS[current.options.length % OPT_COLORS.length]}
                          selected={splitChoice(answers[current.id]).text != null}
                          text={splitChoice(answers[current.id]).text || ''}
                          onToggle={() => toggleOther(current.id)}
                          onText={(v) => handleOtherText(current.id, v)}
                          inputId={`other-input-${current.id}`}
                          label={t('answerQuiz.other')}
                          placeholder={t('answerQuiz.otherPlaceholder')}
                          error={!!validationErrors[current.id]}
                        />
                      )}
                    </div>
                  </div>
                )}

                {current.type === 'checkbox' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-400 text-center mb-2">{t('answerQuiz.pickMultiple')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {current.options.map((opt, i) => {
                        const selected = choiceIds(current.id).includes(opt.id)
                        return (
                          <OptionTile
                            key={opt.id}
                            letter={LETTERS[i % LETTERS.length]}
                            color={OPT_COLORS[i % OPT_COLORS.length]}
                            selected={selected}
                            checkbox
                            onClick={() => handleSelect(current.id, opt.id)}
                            image={opt.image}
                          >
                            <RichText html={opt.option_text} className="rich-text" />
                          </OptionTile>
                        )
                      })}
                      {current.allow_other && (
                        <OtherTile
                          checkbox
                          color={OPT_COLORS[current.options.length % OPT_COLORS.length]}
                          selected={splitChoice(answers[current.id]).text != null}
                          text={splitChoice(answers[current.id]).text || ''}
                          onToggle={() => toggleOther(current.id)}
                          onText={(v) => handleOtherText(current.id, v)}
                          inputId={`other-input-${current.id}`}
                          label={t('answerQuiz.other')}
                          placeholder={t('answerQuiz.otherPlaceholder')}
                          error={!!validationErrors[current.id]}
                        />
                      )}
                    </div>
                  </div>
                )}

                {current.type === 'short_answer' && (
                  <div className="mt-4">
                    <Input
                      value={answers[current.id] || ''}
                      onChange={(e) => handleTextChange(current.id, e.target.value)}
                      className={`text-center text-lg h-14 ${(textLimitErrors[current.id] || validationErrors[current.id]) ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                      placeholder={t('answerQuiz.tapToAnswer')}
                      maxLength={TEXT_LIMITS.short_answer + 50}
                    />
                    {textLimitErrors[current.id] && <p className="text-xs font-medium text-incorrect mt-1.5 text-center">{textLimitErrors[current.id]}</p>}
                    {validationErrors[current.id] && !textLimitErrors[current.id] && <p className="text-xs font-medium text-incorrect mt-1.5 text-center">{t('answerQuiz.required')}</p>}
                  </div>
                )}

                {pwWrong[current.id] && (
                  <p className="mt-3 text-sm font-semibold text-red-500 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {t('answerQuiz.wrongPassword')}
                  </p>
                )}

                {current.type === 'essay' && (
                  <div className="mt-4">
                    <Textarea
                      value={answers[current.id] || ''}
                      onChange={(e) => handleTextChange(current.id, e.target.value)}
                      className={`min-h-[180px] text-base leading-relaxed ${(textLimitErrors[current.id] || validationErrors[current.id]) ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                      placeholder={t('answerQuiz.essayPlaceholder')}
                      rows={6}
                      maxLength={TEXT_LIMITS.essay + 100}
                    />
                    {textLimitErrors[current.id] && <p className="text-xs font-medium text-incorrect mt-1.5">{textLimitErrors[current.id]}</p>}
                    {validationErrors[current.id] && !textLimitErrors[current.id] && <p className="text-xs font-medium text-incorrect mt-1.5">{t('answerQuiz.required')}</p>}
                  </div>
                )}
                {current.type === 'password' && (
                  <div className="mt-4">
                    <Input
                      value={answers[current.id] || ''}
                      onChange={(e) => handleTextChange(current.id, e.target.value)}
                      className={`text-center text-lg h-14 font-mono ${validationErrors[current.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                      placeholder={t('answerQuiz.passwordPlaceholder')}
                      error={pwWrong[current.id] ? t('answerQuiz.wrongPassword') : undefined}
                    />
                  </div>
                )}
                {current.type === 'dropdown' && (
                  <div className="mt-4">
                    <Select
                      value={(answers[current.id] || [])[0] ?? ''}
                      onChange={(e) => handleSelect(current.id, e.target.value === '' ? null : Number(e.target.value))}
                      error={!!validationErrors[current.id]}
                      className="text-base h-14"
                    >
                      <option value="">{t('answerQuiz.selectAnswer')}</option>
                      {current.options.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.option_text.replace(/<[^>]*>/g, '').trim()}</option>
                      ))}
                    </Select>
                  </div>
                )}

                {current.type === 'date' && (
                  <div className="mt-4">
                    <input
                      type="date"
                      value={answers[current.id] || ''}
                      onChange={(e) => handleTextChange(current.id, e.target.value)}
                      className={`input-field text-center text-base h-14 ${validationErrors[current.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                  </div>
                )}

                {current.type === 'datetime' && (
                  <div className="mt-4">
                    <input
                      type="datetime-local"
                      value={answers[current.id] || ''}
                      onChange={(e) => handleTextChange(current.id, e.target.value)}
                      className={`input-field text-center text-base h-14 ${validationErrors[current.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                  </div>
                )}

                {current.type === 'time' && (
                  <div className="mt-4">
                    <input
                      type="time"
                      value={answers[current.id] || ''}
                      onChange={(e) => handleTextChange(current.id, e.target.value)}
                      className={`input-field text-center text-base h-14 ${validationErrors[current.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                  </div>
                )}

                {current.type === 'file_upload' && (
                  <div className="mt-4">
                    <FileAnswer
                      value={fileAnswers[current.id]}
                      uploading={!!uploading[current.id]}
                      onFile={(file) => handleFileUpload(current.id, file)}
                      onRemove={() => removeFileAnswer(current.id)}
                      error={validationErrors[current.id]}
                    />
                  </div>
                )}
              </div>
            )}
          </motion.div>
          </AnimatePresence>
        </div>

        <footer className="px-4 py-4 bg-white dark:bg-ink-900 border-t border-gray-200 dark:border-gray-800">
          <div className="max-w-lg mx-auto flex gap-3">
            {currentIdx > 0 && (
              <Button variant="secondary" onClick={handlePrev} className="flex-1" icon={<ChevronLeft className="w-4 h-4" />}>
                {t('answerQuiz.previous')}
              </Button>
            )}
            {isLast ? (
              <Button
                onClick={openConfirm}
                disabled={submitting || !canProceed}
                loading={submitting}
                className="flex-1"
                style={{ background: palette.cta, color: palette.onBase }}
                icon={!submitting && <Check className="w-4 h-4" />}
              >
                {canProceed ? t('answerQuiz.submit') : t('answerQuiz.answerToSubmit')}
              </Button>
            ) : (
              <Button onClick={handleNext} className="flex-1" style={{ background: palette.cta, color: palette.onBase }}>
                {t('answerQuiz.next')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
            {publicForm?.is_restricted && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh"
                title="Refresh"
                className="w-[52px] h-[45px] shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-ink-800 active:scale-[0.98] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </footer>

        <ConfirmSubmitModal
          show={showConfirm}
          title={t('answerQuiz.confirmTitle')}
          answeredCount={answeredCount}
          totalCount={totalQ}
          missing={missingRequired}
          reviewedCount={reviewedCount}
          onConfirm={handleSubmitAll}
          onCancel={() => setShowConfirm(false)}
          loading={submitting}
          confirmText={t('answerQuiz.confirmSubmit')}
        />

        <KioskLockOverlay
          locked={kioskLocked}
          palette={palette}
          onResume={pinToFullscreen}
          countdown={graceCountdown}
        />
        <CheatLockOverlay info={lockedInfo} onRefresh={handleRefresh} refreshing={refreshing} />
        <ExamInfoDrawer show={showInfo} onClose={() => setShowInfo(false)} form={publicForm} data={data} />
        <ZoomModal
          target={zoomTarget}
          scale={zoomScale}
          onClose={() => { setZoomTarget(null); setZoomScale(1) }}
          onZoom={(delta) => setZoomScale((s) => Math.min(4, Math.max(1, s + delta)))}
        />
      </div>
    )
  }

  return (
    <div className="theme-surface min-h-dvh bg-paper" style={{ background: palette.pageBg, '--t': palette.base }}>
      {/* Fitur quiz aktif (timer / restricted) tetap tampil di design form —
          render-nya mengikuti state yang sudah di-gate backend. */}
      {cheatWarn && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] max-w-lg"
        >
          <div className="flex items-start gap-3 bg-incorrect text-white px-4 py-3.5 rounded-2xl shadow-lift">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">{t('answerQuiz.cheatWarningTitle', { reason: cheatWarn.reason || 'leaving page' })}</p>
              <p className="text-white/85 mt-0.5">
                {t('answerQuiz.cheatWarningDesc', { current: 3 - cheatWarn.left })}
              </p>
            </div>
          </div>
        </motion.div>
      )}
      {isOwnerPreview && <PreviewNotice />}
      <div className="max-w-2xl mx-auto p-4 pb-28 overflow-x-hidden">
        {bannerPath && (
          <img src={bannerPath} alt="" className="w-full h-40 object-cover rounded-3xl mb-6 shadow-card" />
        )}
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="font-display text-xl font-bold text-ink dark:text-gray-100"><RichText html={effectiveTitle} className="rich-text" /></h1>
          <div className="flex items-center gap-2 shrink-0">
            {timeLeft !== null && (
              <span className={`inline-flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums px-2.5 h-8 rounded-lg transition-colors ${timeLeft < 30000
                ? 'bg-incorrect text-white animate-pulse'
                : timeLeft < 60000
                  ? 'bg-incorrect-soft text-incorrect'
                  : 'bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-gray-300'
                }`}>
                <Timer className="w-3.5 h-3.5" />
                {formatTime(timeLeft)}
              </span>
            )}
          
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{totalQ} questions</span>
          </div>
        </div>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIdx}
            custom={direction}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-5">
              {formPage.title && (
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-6 rounded-full bg-[var(--t)] shrink-0" />
                  <h2 className="font-display text-lg font-bold text-ink dark:text-gray-100">{formPage.title}</h2>
                  <span className="ml-auto text-xs font-semibold text-gray-400">{currentIdx + 1}/{formPages.length}</span>
                </div>
              )}
              {formPage.questions.map((q) => (
                <Card
                  key={q.id}
                  ref={(el) => { if (el) questionRefs.current[q.id] = el }}
                  data-question-id={q.id}
                  className="p-5"
                  style={{
                    borderColor: validationErrors[q.id] ? '#EF4444' : palette.border,
                    borderWidth: validationErrors[q.id] ? '2px' : undefined,
                  }}
                >
                  <div className="mb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-0.5 flex-1 min-w-0">
                        <p className="font-medium text-ink dark:text-gray-100 leading-snug flex-1 [&>p]:mb-0"><RichText html={q.question_text} className="rich-text" /></p>
                        {q.is_required !== false && (
                          <span className="text-incorrect font-bold leading-snug shrink-0" title="Required">*</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setZoomTarget(q); setZoomScale(1) }}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-8 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-800 text-gray-500 dark:text-gray-400 hover:text-[var(--t)] hover:border-[var(--t-border)] hover:bg-[var(--t-soft)] transition-colors"
                      aria-label={t('answerQuiz.zoomIn')}
                    >
                      <ZoomIn className="w-4 h-4" />
                      {t('answerQuiz.zoomIn')}
                    </button>
                  </div>
                  {(validationErrors[q.id] && !textLimitErrors[q.id]) && (
                    <p className="text-xs font-semibold text-red-500 flex items-center gap-1 mb-3">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {q.type === 'password' && pwWrong[q.id] ? t('answerQuiz.wrongPassword') : t('answerQuiz.required')}
                    </p>
                  )}
                  {q.image && (isAudioUrl(q.image.path) ? (
                    <audio controls src={q.image.path} preload="metadata" className="w-full max-w-sm mx-auto mb-4" />
                  ) : (
                    <img
                      src={q.image.path}
                      alt=""
                      onClick={() => { setZoomTarget(q); setZoomScale(1) }}
                      className="max-h-52 w-auto mx-auto rounded-2xl object-cover mb-4 shadow-card cursor-zoom-in"
                    />
                  ))}

                  {q.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      {q.options.map((opt, i) => {
                        const selected = choiceIds(q.id).includes(opt.id)
                        return (
                          <label
                            key={opt.id}
                            className={`flex flex-col gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected ? 'border-[var(--t)] bg-[var(--t-soft)]' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-ink-800'
                              }`}
                            style={selected ? { borderColor: palette.base, backgroundColor: palette.soft } : undefined}
                          >
                            <div className="flex items-center gap-3 w-full">
                              <span
                                className={`bubble w-6 h-6 text-xs shrink-0 ${selected ? 'bubble-selected' : 'bubble-empty'}`}
                                style={selected ? { borderColor: palette.base, backgroundColor: palette.base, color: palette.onBase } : undefined}
                              >
                                {LETTERS[i % LETTERS.length]}
                              </span>
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={selected}
                                onChange={() => handleSelect(q.id, opt.id)}
                                className="sr-only"
                              />
                              <span className="text-sm text-ink dark:text-gray-200 flex-1 leading-snug"><RichText html={opt.option_text} className="rich-text" /></span>
                            </div>
                            {opt.image && (
                              isAudioUrl(opt.image.path) ? (
                                <audio controls src={opt.image.path} preload="metadata" className="w-full max-w-xs mx-auto rounded-lg" onClick={(e) => e.stopPropagation()} />
                              ) : (
                                <img src={opt.image.path} alt="" className="max-h-60 w-auto rounded-lg object-contain mx-auto" />
                              )
                            )}
                          </label>
                        )
                      })}
                      {q.allow_other && (
                        <OtherTile
                          variant="card"
                          selected={splitChoice(answers[q.id]).text != null}
                          text={splitChoice(answers[q.id]).text || ''}
                          onToggle={() => toggleOther(q.id)}
                          onText={(v) => handleOtherText(q.id, v)}
                          inputId={`other-input-${q.id}`}
                          label={t('answerQuiz.other')}
                          placeholder={t('answerQuiz.otherPlaceholder')}
                          error={!!validationErrors[q.id]}
                        />
                      )}
                    </div>
                  )}

                  {q.type === 'checkbox' && (
                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const selected = choiceIds(q.id).includes(opt.id)
                        return (
                          <label
                            key={opt.id}
                            className={`flex flex-col gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected ? 'border-[var(--t)] bg-[var(--t-soft)]' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-ink-800'
                              }`}
                            style={selected ? { borderColor: palette.base, backgroundColor: palette.soft } : undefined}
                          >
                            <div className="flex items-center gap-3 w-full">
                              <span
                                className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-colors ${selected ? '' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-ink-800'
                                  }`}
                                style={selected ? { borderColor: palette.base, backgroundColor: palette.base, color: palette.onBase } : undefined}
                              >
                                {selected && <Check className="w-3.5 h-3.5" strokeWidth={3.5} />}
                              </span>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => handleSelect(q.id, opt.id)}
                                className="sr-only"
                              />
                              <span className="text-sm text-ink dark:text-gray-200 flex-1 leading-snug"><RichText html={opt.option_text} className="rich-text" /></span>
                            </div>
                            {opt.image && (
                              isAudioUrl(opt.image.path) ? (
                                <audio controls src={opt.image.path} preload="metadata" className="w-full max-w-xs mx-auto rounded-lg" onClick={(e) => e.stopPropagation()} />
                              ) : (
                                <img src={opt.image.path} alt="" className="max-h-60 w-auto rounded-lg object-contain mx-auto" />
                              )
                            )}
                          </label>
                        )
                      })}
                      {q.allow_other && (
                        <OtherTile
                          variant="card"
                          checkbox
                          selected={splitChoice(answers[q.id]).text != null}
                          text={splitChoice(answers[q.id]).text || ''}
                          onToggle={() => toggleOther(q.id)}
                          onText={(v) => handleOtherText(q.id, v)}
                          inputId={`other-input-${q.id}`}
                          label={t('answerQuiz.other')}
                          placeholder={t('answerQuiz.otherPlaceholder')}
                          error={!!validationErrors[q.id]}
                        />
                      )}
                    </div>
                  )}

                  {q.type === 'short_answer' && (
                    <div>
                      <Input
                        value={answers[q.id] || ''}
                        onChange={(e) => handleTextChange(q.id, e.target.value)}
                        placeholder={t('answerQuiz.answerLabel')}
                        className={(textLimitErrors[q.id] || validationErrors[q.id]) ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}
                        maxLength={TEXT_LIMITS.short_answer + 50}
                      />
                      {textLimitErrors[q.id] && <p className="text-xs font-medium text-incorrect mt-1.5">{textLimitErrors[q.id]}</p>}
                    </div>
                  )}

                  {q.type === 'essay' && (
                    <div>
                      <Textarea
                        value={answers[q.id] || ''}
                        onChange={(e) => handleTextChange(q.id, e.target.value)}
                        className={`min-h-[120px] ${(textLimitErrors[q.id] || validationErrors[q.id]) ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                        rows={4}
                        placeholder={t('answerQuiz.essayPlaceholder')}
                        maxLength={TEXT_LIMITS.essay + 100}
                      />
                      {textLimitErrors[q.id] && <p className="text-xs font-medium text-incorrect mt-1.5">{textLimitErrors[q.id]}</p>}
                    </div>
                  )}

                  {q.type === 'password' && (
                    <Input
                      value={answers[q.id] || ''}
                      onChange={(e) => handleTextChange(q.id, e.target.value)}
                      className={`font-mono ${validationErrors[q.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                      placeholder={t('answerQuiz.passwordPlaceholder')}
                    />
                  )}

                  {q.type === 'dropdown' && (
                    <Select
                      value={(answers[q.id] || [])[0] ?? ''}
                      onChange={(e) => handleSelect(q.id, e.target.value === '' ? null : Number(e.target.value))}
                      error={!!validationErrors[q.id]}
                    >
                      <option value="">{t('answerQuiz.selectAnswer')}</option>
                      {q.options.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.option_text.replace(/<[^>]*>/g, '').trim()}</option>
                      ))}
                    </Select>
                  )}

                  {q.type === 'date' && (
                    <input
                      type="date"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleTextChange(q.id, e.target.value)}
                      className={`input-field ${validationErrors[q.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                  )}

                  {q.type === 'datetime' && (
                    <input
                      type="datetime-local"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleTextChange(q.id, e.target.value)}
                      className={`input-field ${validationErrors[q.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                  )}

                  {q.type === 'time' && (
                    <input
                      type="time"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleTextChange(q.id, e.target.value)}
                      className={`input-field ${validationErrors[q.id] ? 'border-incorrect focus:border-incorrect focus:ring-incorrect/10' : ''}`}
                    />
                  )}

                  {q.type === 'file_upload' && (
                    <FileAnswer
                      value={fileAnswers[q.id]}
                      uploading={!!uploading[q.id]}
                      onFile={(file) => handleFileUpload(q.id, file)}
                      onRemove={() => removeFileAnswer(q.id)}
                      error={validationErrors[q.id]}
                    />
                  )}
                </Card>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-ink-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-lg mx-auto">
          {submitError && (
            <p className="text-sm text-red-500 text-center mb-2 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {submitError}
            </p>
          )}
          <div className="flex gap-3">
            {currentIdx > 0 && (
              <Button variant="secondary" size="lg" onClick={handlePrev} className="flex-1" icon={<ChevronLeft className="w-4 h-4" />}>
                {t('answerQuiz.previous')}
              </Button>
            )}
            {currentIdx < formPages.length - 1 ? (
              <Button
                onClick={handleNext}
                className="flex-1"
                size="lg"
                style={{ background: palette.cta, color: palette.onBase }}
              >
                {t('answerQuiz.next')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              // ponytail: tombol tidak pernah di-disable — klik saat ada required
              // kosong otomatis lompat ke soal itu (handleSubmitAll) dengan border error.
              <Button
                onClick={handleSubmitAll}
                disabled={submitting}
                loading={submitting}
                className="flex-1"
                size="lg"
                style={{ background: palette.cta, color: palette.onBase }}
              >
                {t('answerQuiz.submit')}
              </Button>
            )}
            {publicForm?.is_restricted && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh"
                title="Refresh"
                className="w-[52px] h-[52px] shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-ink-800 active:scale-[0.98] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </footer>

      <KioskLockOverlay locked={kioskLocked} palette={palette} onResume={pinToFullscreen} countdown={graceCountdown} />
      <CheatLockOverlay info={lockedInfo} onRefresh={handleRefresh} refreshing={refreshing} />
      <ExamInfoDrawer show={showInfo} onClose={() => setShowInfo(false)} form={publicForm} data={data} />

      <ZoomModal
        target={zoomTarget}
        scale={zoomScale}
        variant={effectiveStyle === 'card' ? 'card' : 'quiz'}
        onClose={() => { setZoomTarget(null); setZoomScale(1) }}
        onZoom={(delta) => setZoomScale((s) => Math.min(4, Math.max(1, s + delta)))}
      />
    </div>
  )
}

function SaveIndicator({ status }) {
  const { t } = useTranslation()
  if (!status) return null
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {t('answerQuiz.saving')}
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/85">
        <CheckCheck className="w-3.5 h-3.5" />
        {t('answerQuiz.saved')}
      </span>
    )
  }
  if (status === 'error') {
    return <span className="inline-flex items-center text-[11px] font-semibold text-white/70">{t('answerQuiz.notSaved')}</span>
  }
  return null
}

function Legend({ dot, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function QuestionMapDrawer({ show, onClose, total, current, answered, reviewed, picked, onSelect }) {
  const { t } = useTranslation()
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: 0, scale: 0.96, opacity: 0, y: 8 }}
            animate={{ x: 0, scale: 1, opacity: 1, y: 0 }}
            exit={{ x: 0, scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 bg-white dark:bg-ink-900 rounded-2xl p-6 w-full max-w-md shadow-lift max-h-[85vh] flex flex-col"
            role="dialog"
            aria-label={t('answerQuiz.questionMap')}
          >
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-ink dark:text-gray-100">{t('answerQuiz.questionMap')}</h3>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 pt-4">
              <QuestionMap total={total} current={current} answered={answered} reviewed={reviewed} picked={picked} onSelect={onSelect} />
              <div className="flex flex-wrap items-center gap-4 mt-4 text-[11px] text-gray-400">
                <Legend dot="bg-correct" label={t('answerQuiz.legendAnswered')} />
                <Legend dot="bg-warn" label={t('answerQuiz.legendMarked')} />
                <Legend dot="bg-white dark:bg-ink-800 border border-gray-300 dark:border-gray-600" label={t('answerQuiz.legendUnanswered')} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FileAnswer({ value, uploading, onFile, onRemove, error }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-800">
          <span className="w-10 h-10 rounded-lg bg-[var(--t-soft)] text-[var(--t)] flex items-center justify-center shrink-0">
            <FileUp className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0 text-sm font-medium text-ink dark:text-gray-100 truncate">{value.filename}</span>
          <a href={value.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--t)] hover:underline shrink-0">{t('answerQuiz.viewFile')}</a>
          <button onClick={onRemove} className="text-xs font-medium text-gray-400 hover:text-incorrect shrink-0">{t('answerQuiz.removeFile')}</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-14 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-[var(--t-border)] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-[var(--t)]"
        >
          {uploading ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <FileUp className="w-4 h-4" />
          )}
          {uploading ? t('answerQuiz.uploading') : t('answerQuiz.uploadFile')}
        </button>
      )}
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      {error && (
        <p className="text-xs font-semibold text-incorrect mt-1.5 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t('answerQuiz.fileRequired')}
        </p>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{t('answerQuiz.fileHint')}</p>
    </div>
  )
}

function CheatLockOverlay({ info, onRefresh, refreshing }) {
  const { t } = useTranslation()
  // Countdown sinkron ke lockedAt lokal — bukan penanda pasti dari server,
  // tapi cukup buat kasih gambaran ke responden berapa lama lagi menunggu
  // sebelum sweep otomatis. Refresh manual tetap sumber kebenaran status asli.
  const [remaining, setRemaining] = useState(300)

  useEffect(() => {
    if (!info?.lockedAt) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - info.lockedAt) / 1000)
      setRemaining(Math.max(0, 300 - elapsed))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [info?.lockedAt])

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const urgent = remaining <= 30
  const expired = remaining <= 0

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-ink"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center flex flex-col items-center text-white max-w-sm w-full"
          >
            <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-incorrect/20 mb-6">
              <AlertTriangle className="w-8 h-8 text-incorrect" />
            </span>
            <p className="font-display text-2xl font-bold">{t('answerQuiz.violatingRules')}</p>
            {info.reason && (
              <p className="text-sm text-white/70 mt-2">{t('answerQuiz.lastViolation', { reason: info.reason })}</p>
            )}
            <p className="text-sm text-white/70 mt-4 leading-relaxed">
              {t('answerQuiz.temporarilyLocked')}
            </p>

            <div className="mt-6 flex inline-flex flex-col items-center gap-1.5 px-6 py-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                {expired ? t('answerQuiz.finalizing') : t('answerQuiz.autoFinalizeIn')}
              </span>
              <span className={`font-mono text-3xl font-bold tabular-nums ${urgent ? 'text-incorrect animate-pulse' : 'text-white'}`}>
                {mm}:{ss}
              </span>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="mt-6 inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl bg-white text-ink hover:bg-white/90 active:scale-[0.98] border border-white/10 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? t('answerQuiz.checkingStatus') : t('answerQuiz.checkStatus')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function KioskLockOverlay({ locked, palette, onResume, countdown }) {
  const { t } = useTranslation()
  // Layar kunci full — menutupi SEMUA konten. Interaksi apa pun (klik/keyboard/
  // sentuh) langsung mem-pin ulang ke fullscreen lewat onResume; konten ujian
  // tidak terlihat sampai responden kembali benar-benar ke dalam ujian.
  // countdown 5..0: warning sebelum server lock. ponytail: countdown dikontrol
  // dari anti-cheat effect (graceCountdown), bukan timer lokal duplikat.
  // visible juga saat countdown aktif meski locked belum (fsAvailable race).
  const visible = locked || (countdown !== null && countdown !== undefined)
  useEffect(() => {
    if (!visible) return
    const tryResume = () => onResume()
    window.addEventListener('pointerdown', tryResume)
    window.addEventListener('keydown', tryResume)
    window.addEventListener('touchstart', tryResume)
    return () => {
      window.removeEventListener('pointerdown', tryResume)
      window.removeEventListener('keydown', tryResume)
      window.removeEventListener('touchstart', tryResume)
    }
  }, [visible, onResume])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onResume}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
          style={{ background: palette.gradient }}
        >
          <div className="text-center text-white max-w-sm w-full">
            <span className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-white/10 mb-6">
              <Lock className="w-7 h-7" />
            </span>
            <h2 className="font-display text-xl font-bold">{t('answerQuiz.examLocked')}</h2>
            {countdown !== null && countdown !== undefined ? (
              <>
                <div className="mt-5 inline-flex flex-col items-center gap-1 px-8 py-5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                    {t('answerQuiz.returnInSeconds', { seconds: countdown }).split(String(countdown))[0].trim() || t('answerQuiz.examLocked')}
                  </span>
                  <span className={`font-mono text-5xl font-bold tabular-nums leading-none ${countdown <= 2 ? 'text-red-300 animate-pulse' : 'text-white'}`}>
                    {countdown}
                  </span>
                  <span className="text-xs font-medium text-white/70 -mt-1">{t('answerQuiz.returnInSeconds', { seconds: countdown }).split(String(countdown))[1]?.trim() || ''}</span>
                </div>
                <p className="text-white/80 text-sm mt-4 max-w-xs mx-auto leading-relaxed">
                  {t('answerQuiz.fullscreenWarning')}
                </p>
              </>
            ) : (
              <p className="text-white/80 text-sm mt-2 max-w-xs mx-auto">
                {t('answerQuiz.lockedHint')}
              </p>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onResume() }}
              className="mt-6 inline-flex items-center gap-2 h-12 px-8 rounded-full bg-white text-sm font-bold text-[var(--t,#6C5CE7)] hover:scale-[1.02] active:scale-95 transition-transform shadow-lift"
            >
              <Lock className="w-4 h-4" />
              Lock again &amp; continue
            </button>
            <p className="text-white/60 text-xs mt-4">
              {countdown !== null ? 'Jika hitungan mencapai 0, ujian dikunci & menunggu pengawas.' : 'Quiz will be auto-submitted with score 0 if you leave too often.'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ExamInfoDrawer({ show, onClose, form, data }) {
  const { t } = useTranslation()
  const respondent = data?.respondent_name || ''
  const respondentEmail = data?.respondent_email || ''
  const banner = form?.banner_path || null
  const chip = (label, value) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-sm font-medium text-ink dark:text-gray-200 text-right">{value || '—'}</span>
    </div>
  )
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-ink-900 shadow-lift flex flex-col"
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h3 className="font-display font-bold text-ink dark:text-gray-100">{t('answerQuiz.examInfo')}</h3>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {banner && (
                <img src={banner} alt="" className="w-full h-28 object-cover rounded-2xl mb-5 shadow-card" />
              )}
              <h4 className="font-display font-semibold text-ink dark:text-gray-100 text-lg leading-snug">
                <RichText html={form?.title} />
              </h4>
              {form?.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 mb-4"><RichText html={form.description} className="rich-text" /></p>}

              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{t('answerQuiz.respondentInfo')}</p>
                {chip('Name', respondent)}
                {chip('Email', respondentEmail)}
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Details</p>
                {chip(t('answerQuiz.detailQuestions'), form?.question_count ?? data?.questions?.length ?? '—')}
                {form?.timer_seconds ? chip(t('answerQuiz.detailTime'), `${Math.ceil(form.timer_seconds / 60)} minutes`) : chip(t('answerQuiz.detailTime'), t('answerQuiz.noLimit'))}
                {form?.submission_limit === 'once' ? chip('Submission', t('answerQuiz.onceOnly')) : chip('Submission', t('answerQuiz.unlimited'))}
              </div>

              {form?.is_restricted && (
                <div className="mt-5 rounded-2xl bg-gray-50 dark:bg-ink-800/50 px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Stay on this tab during the exam. Timer runs automatically and answers are submitted when time runs out.
                  </p>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function ZoomModal({ target, scale, onClose, onZoom, variant = 'quiz' }) {
  const { t } = useTranslation()
  const STEP = 0.5
  const optionColor = (i) => OPT_COLORS[i % OPT_COLORS.length]
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  // Konten diberi lebar tetap = lebar area scroll (supaya tidak re-wrap saat zoom),
  // lalu spacer luar memakai ukuran alami × scale sehingga scroll mengikuti zoom.
  useEffect(() => {
    const scroll = scrollRef.current
    const el = contentRef.current
    if (!scroll || !el) return
    const measure = () => {
      const cs = getComputedStyle(scroll)
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const w = Math.max(scroll.clientWidth - pad, 1)
      const h = el.scrollHeight
      setNatural((p) => (p.w === w && p.h === h ? p : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scroll)
    ro.observe(el)
    return () => ro.disconnect()
  }, [target])
  // Aksesibilitas: tombol + dan - di keyboard juga memicu zoom (kebutuhan khusus),
  // wheel (pinch/seret) ikut diperhitungkan untuk pengguna touchpad & mouse.
  useEffect(() => {
    if (!target) return
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase()
      if (k === '+' || k === '=') { e.preventDefault(); onZoom(STEP) }
      else if (k === '-' || k === '_') { e.preventDefault(); onZoom(-STEP) }
      else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        onZoom(e.deltaY < 0 ? STEP : -STEP)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [target, onClose, onZoom, STEP])
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink/85 backdrop-blur-sm p-3 sm:p-6"
          onClick={onClose}
        >
          <div
            className="w-full max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-ink-900 shadow-lift relative"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('answerQuiz.zoomTitle')}
          >
            {/* Header ramping: hanya judul panel + tombol tutup, teks soal ada di
                area zoom supaya seluruh soal (teks+gambar+opsi) terzoom sebagai satu. */}
            <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{t('answerQuiz.zoomTitle')}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-gray-500 dark:text-gray-300 tabular-nums">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={onClose}
                    className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-auto px-5 sm:px-7 py-5">
              <div style={{ width: natural.w * scale, height: natural.h * scale }}>
                <div
                  ref={contentRef}
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    width: natural.w,
                  }}
                >
                  <div className="flex flex-col items-center gap-5">
                      <h3 className="font-display text-xl sm:text-2xl font-medium text-ink dark:text-gray-100 text-center leading-snug">
                      <RichText html={target.question_text} className="rich-text" />
                    </h3>
                    {target.image && (
                      <img
                        src={target.image.path}
                        alt=""
                        className="w-full max-h-[40dvh] object-contain rounded-2xl shadow-card"
                      />
                    )}

                    {target.options?.length > 0 && (variant === 'card' ? (
                      /* Mirror opsi gaya card/form: baris ber-border + bubble huruf */
                      <div className="w-full max-w-xl mx-auto space-y-2">
                        {target.options.map((opt, i) => (
                          <div
                            key={opt.id}
                            className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-800/50"
                          >
                            <span className="bubble w-6 h-6 text-xs bubble-empty shrink-0">
                              {LETTERS[i % LETTERS.length]}
                            </span>
                            <span className="flex-1 text-sm text-left leading-snug text-ink dark:text-gray-200">
                              <RichText html={opt.option_text} className="rich-text" />
                            </span>
                            {opt.image && (
                              isAudioUrl(opt.image.path) ? (
                                <audio controls src={opt.image.path} preload="metadata" className="max-h-20 w-32 rounded-lg shrink-0" onClick={(e) => e.stopPropagation()} />
                              ) : (
                                <img src={opt.image.path} alt="" className="max-h-20 w-auto rounded-lg object-contain shrink-0" />
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {target.options.map((opt, i) => (
                          <div
                            key={opt.id}
                            className="flex items-center gap-3 p-4 rounded-2xl text-white font-medium shadow min-h-[64px]"
                            style={{ backgroundColor: optionColor(i) }}
                          >
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/25 font-mono text-sm font-bold shrink-0">
                              {LETTERS[i % LETTERS.length]}
                            </span>
                            <span className="flex-1 leading-snug text-left"><RichText html={opt.option_text} className="rich-text" /></span>
                            {opt.image && (
                              isAudioUrl(opt.image.path) ? (
                                <audio controls src={opt.image.path} preload="metadata" className="max-h-20 w-32 rounded-lg shrink-0" onClick={(e) => e.stopPropagation()} />
                              ) : (
                                <img src={opt.image.path} alt="" className="max-h-20 w-auto rounded-lg object-contain shrink-0" />
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Kontrol zoom floating — selalu tersedia, tidak menghalangi isi soal.
              stopPropagation penting: tanpa ini klik tombol zoom justru menutup modal
              (event naik ke overlay yang onClick={onClose}). */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-5 right-5 z-[75] flex items-center gap-2 bg-white dark:bg-ink-800 rounded-2xl shadow-lift border border-gray-200 dark:border-gray-700 p-1.5"
          >
            <button
              onClick={() => onZoom(-STEP)}
              disabled={scale <= 0.75}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-ink-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Zoom out question"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="w-14 text-center text-sm font-mono font-bold text-gray-500 dark:text-gray-300 tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => onZoom(STEP)}
              disabled={scale >= 5}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-ink-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Zoom in question"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PreviewNotice() {
  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-[calc(100%-32px)]">
      <div className="inline-flex items-center gap-2 bg-ink text-white px-3.5 py-2 rounded-full shadow-lift text-xs">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Preview</span>
        </span>
      </div>
    </div>
  )
}
