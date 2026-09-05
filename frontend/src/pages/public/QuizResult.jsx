import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Minus, Eye, EyeOff, ArrowRight, ClipboardList, Trophy, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Badge, FallbackPage, DotCorner, AuroraBg, RichText } from '../../components/ui'
import { sanitizeHtml, stripTags } from '../../lib/sanitize'
import { isAudioUrl } from '../../lib/media'
import { useTheme } from '../../hooks/useTheme'
import { themePalette } from '../../lib/theme'
import api from '../../api/client'
import { sessionTokenHeaders } from '../../lib/sessionToken'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatSubmitted(str) {
  if (!str) return '—'
  const [d, m, Y, H, M] = str.split(/[\s:-]+/).map(Number)
  if (!d || !m || !Y) return str
  return `${d} ${MONTHS[m - 1]} ${Y}, ${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`
}

export default function QuizResult() {
  const { t } = useTranslation()
  const { submissionId } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const searchParams = new URLSearchParams(window.location.search)
  const formType = searchParams.get('type') || 'form'
  const displayStyle = searchParams.get('style') || 'card'
  const formTitle = searchParams.get('title') || ''
  const formCode = searchParams.get('code') || ''

  const [data, setData] = useState(null)
  const [publicForm, setPublicForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [countedScore, setCountedScore] = useState(0)
  const [showReview, setShowReview] = useState(false)
  const [leaderboard, setLeaderboard] = useState(null)

  useEffect(() => {
    const sub = api.get(`/submissions/${submissionId}`, { headers: sessionTokenHeaders(submissionId) })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || t('quizResult.loadFailed')))
    const pub = formCode
      ? api.get(`/q/${formCode}`).then((res) => setPublicForm(res.data)).catch(() => setPublicForm(null))
      : Promise.resolve()
    Promise.all([sub, pub]).finally(() => setLoading(false))
  }, [submissionId, formCode, t])

  useEffect(() => {
    if (!data || data.score == null) return
    const target = Math.round(data.score)
    const duration = 1000
    const start = performance.now()

    let frame
    function animate(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setCountedScore(Math.round(progress * target))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [data])

  // Read-only leaderboard (FR-38) — shown post-submit when the creator enabled it.
  useEffect(() => {
    if (formType !== 'quiz' || !formCode || !publicForm?.show_leaderboard) return
    api.get(`/q/${formCode}/leaderboard`, { params: { limit: 10, submission_id: submissionId }, headers: sessionTokenHeaders(submissionId) })
      .then((res) => setLeaderboard(res.data))
      .catch(() => setLeaderboard(null))
  }, [formType, formCode, publicForm?.show_leaderboard, submissionId])

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
        title={t('quizResult.loadFailed')}
        message={error}
        action={<Button variant="secondary" onClick={() => navigate('/')} className="w-full">{t('quizResult.goHome')}</Button>}
      />
    )
  }

  if (!data) return null

  const isQuiz = formType === 'quiz'
  const canRefill = publicForm?.submission_limit === 'unlimited' && formCode
  const palette = themePalette(publicForm?.theme_color, theme === 'dark')
  const totalQ = data.answers?.length || 0
  // Creator mengatur apa yang boleh dilihat responden setelah selesai (hanya quiz).
  // reveal_score → angka nilai final; reveal_answers → ulasan benar/salah per soal.
  const revealScore = formType !== 'quiz' || (publicForm?.reveal_score !== false)
  const revealAnswers = formType !== 'quiz' || (publicForm?.reveal_answers !== false)

  // Pesan terima kasih (atau fallback nama form) — dipakai untuk form & quiz.
  const rawThanks = publicForm?.thank_you_message || ''
  const hasThanks = rawThanks.replace(/<[^>]*>/g, '').trim().length > 0
  const plainFormTitle = stripTags(publicForm?.title || formTitle)
  const thankYou = hasThanks ? rawThanks : t('quizResult.submittedFallback', { title: plainFormTitle })

  if (!isQuiz) {
    return (
      <div
        className="theme-surface min-h-dvh bg-paper relative overflow-hidden flex items-center justify-center px-4 py-10"
        style={{ background: palette.pageBg, '--t': palette.base }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(${palette.soft} 1.5px, transparent 1.5px)`,
            backgroundSize: '28px 28px',
            opacity: 0.25,
          }}
          aria-hidden="true"
        />
        <AuroraBg base={palette.base} className="opacity-20" />

        <DotCorner position="top-left" color={palette.base} />
        <DotCorner position="bottom-right" color={palette.base} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative w-full max-w-md"
        >
          <Card className="p-7 md:p-9 overflow-hidden" style={{ borderColor: palette.border }}>
            <div className="relative w-fit mx-auto mb-7">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: palette.soft }}
                animate={{ scale: [1, 1.55], opacity: [0.7, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              />
              <motion.span
                className="relative flex items-center justify-center w-20 h-20 rounded-full shadow-lift"
                style={{ background: palette.cta, color: palette.onBase }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
              >
                <Check className="w-9 h-9" strokeWidth={3} />
              </motion.span>
            </div>

            <div className="text-center">
              <p className="eyebrow justify-center" style={{ color: palette.base }}>{t('quizResult.submitted')}</p>
              <h1 className="font-display text-2xl md:text-[26px] font-bold text-ink dark:text-gray-100 mt-3 leading-snug">
                <RichText html={thankYou} className="rich-text" />
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                {plainFormTitle ? (
                  <>{t('quizResult.recordedWithTitle', { title: plainFormTitle })}</>
                ) : (
                  t('quizResult.recorded')
                )}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 mt-8">
              <MetaChip label={t('quizResult.questionsCount')} value={String(totalQ)} />
              <MetaChip label={t('quizResult.submittedAt')} value={formatSubmitted(data.submitted_at)} />
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 mt-7 pt-6">
              {canRefill ? (
                <Button
                  onClick={() => navigate(`/q/${formCode}`)}
                  size="lg"
                  className="w-full"
                  style={{ background: palette.cta, color: palette.onBase }}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  {t('quizResult.fillAgain')}
                </Button>
              ) : (
                <p className="text-center text-sm text-gray-400">{t('quizResult.closePage')}</p>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    )
  }

  const correctCount = data.answers?.filter((a) => a.is_correct === true).length || 0
  const wrongCount = data.answers?.filter((a) => a.is_correct === false).length || 0
  const unansweredCount = data.answers?.filter((a) => a.is_correct === null).length || 0
  const percentage = data.max_score > 0 ? Math.round((data.score / data.max_score) * 100) : 0

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } },
  }

  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
  }

  const statusIcon = (isCorrect) => {
    if (isCorrect === true) return <span className="w-7 h-7 rounded-full bg-correct-soft text-correct flex items-center justify-center shrink-0"><Check className="w-4 h-4" strokeWidth={3} /></span>
    if (isCorrect === false) return <span className="w-7 h-7 rounded-full bg-incorrect-soft text-incorrect flex items-center justify-center shrink-0"><X className="w-4 h-4" strokeWidth={3} /></span>
    return <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-ink-800 text-gray-400 dark:text-gray-500 flex items-center justify-center shrink-0"><Minus className="w-4 h-4" strokeWidth={3} /></span>
  }

  return (
    <div
      className="theme-surface min-h-dvh bg-paper relative overflow-hidden"
      style={{ background: palette.pageBg, '--t': palette.base }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${palette.soft} 1.5px, transparent 1.5px)`,
          backgroundSize: '28px 28px',
          opacity: 0.25,
        }}
        aria-hidden="true"
      />
      <AuroraBg base={palette.base} className="opacity-20" />

      <DotCorner position="top-left" color={palette.base} />
      <DotCorner position="bottom-right" color={palette.base} />

      <div className="relative max-w-lg mx-auto p-6 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          {(publicForm?.title || formTitle) && (
            <p className="eyebrow justify-center" style={{ color: palette.base }}><RichText html={publicForm?.title || formTitle} className="rich-text" /></p>
          )}

          <h1 className="font-display text-2xl md:text-[26px] font-bold text-ink dark:text-gray-100 mt-3 leading-snug">
            <RichText html={thankYou} className="rich-text" />
          </h1>

          {data.status === 'cheating' && (
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-incorrect bg-incorrect-soft px-4 py-2.5 rounded-xl mt-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('quizResult.cheatingNotice')}
            </div>
          )}

          {revealScore && (
            <>
              <div className="relative w-36 h-36 mx-auto mt-5 mb-5">
                <svg className="w-full h-full" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="10" className="text-gray-200 dark:text-gray-800" />
                  <motion.circle
                    cx="64" cy="64" r="56"
                    fill="none"
                    stroke="currentColor"
                    className={percentage >= 70 ? 'text-correct' : percentage >= 40 ? 'text-warn' : 'text-incorrect'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${percentage * 3.52} 352`}
                    transform="rotate(-90 64 64)"
                    initial={{ strokeDasharray: '0 352' }}
                    animate={{ strokeDasharray: `${percentage * 3.52} 352` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    {<motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="font-display text-3xl font-bold text-ink dark:text-gray-100 tabular-nums"
                    >
                      {countedScore}
                    </motion.span>}
                    {data.max_score > 0 && (
                      <span className="text-sm text-gray-400">/{Math.round(data.max_score)}</span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {(percentage >= 70
                  ? t('quizResult.greatJob')
                  : percentage >= 40
                    ? t('quizResult.goodEffort')
                    : t('quizResult.keepPracticing'))}
              </p>

              {totalQ > 0 && (
                <div className="grid grid-cols-3 gap-2.5 mt-6 max-w-sm mx-auto">
                  <MetaChip label={t('quizResult.correct')} value={String(correctCount)} />
                  <MetaChip label={t('quizResult.wrong')} value={String(wrongCount)} />
                  <MetaChip label={t('quizResult.skipped')} value={String(unansweredCount)} />
                </div>
              )}
            </>
          )}
        </motion.div>

        {leaderboard && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-warn-soft text-warn">
                  <Trophy className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-display font-semibold text-ink dark:text-gray-100">{t('quizResult.leaderboard')}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('quizResult.participants', { count: leaderboard.total })}</p>
                </div>
              </div>
              <div className="space-y-2">
                {leaderboard.data.map((row) => {
                  const isMe = leaderboard.own && row.rank === leaderboard.own.rank
                  return (
                    <div
                      key={row.rank}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl ${isMe ? 'bg-primary-50 ring-1 ring-primary/30' : 'bg-gray-50 dark:bg-ink-800/50'
                        }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.rank === 1 ? 'bg-warn text-white' : row.rank === 2 ? 'bg-gray-400 text-white' : row.rank === 3 ? 'bg-orange-400 text-white' : 'bg-gray-200 dark:bg-ink-700 text-gray-500 dark:text-gray-400'
                        }`}>
                        {row.rank}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-ink dark:text-gray-100">
                        {row.respondent_name}
                        {isMe && <span className="text-primary text-xs font-semibold ml-1.5">{t('quizResult.youBadge')}</span>}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-ink dark:text-gray-100">{row.score}</span>
                    </div>
                  )
                })}
              </div>
              {leaderboard.own && !leaderboard.data.some((r) => r.rank === leaderboard.own.rank) && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-primary-50">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-300 text-white">
                    {leaderboard.own.rank}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-ink dark:text-gray-100">
                    {leaderboard.own.respondent_name} <span className="text-primary text-xs font-semibold">{t('quizResult.youBadge')}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink dark:text-gray-100">{leaderboard.own.score}</span>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {revealAnswers && totalQ > 0 && (
          <>
            <Button
              variant="secondary"
              onClick={() => setShowReview(!showReview)}
              className="w-full mb-3"
              icon={showReview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            >
              {showReview ? t('quizResult.hideReview') : t('quizResult.viewReview')}
            </Button>

            <AnimatePresence>
              {showReview && (
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {data.answers.map((answer, i) => (
                    <motion.div key={answer.question_id} variants={item}>
                      <Card className="p-5">
                        <div className="flex items-start gap-3">
                          {statusIcon(answer.is_correct)}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('quizResult.questionLabel', { n: i + 1 })}</p>
                            <p className="font-medium text-ink dark:text-gray-100 mb-2 leading-snug"><RichText html={answer.question_text} className="rich-text" /></p>

                            {/* Gambar soal — ditampilkan jika ada */}
                            {answer.question_image && (isAudioUrl(answer.question_image) ? (
                              <audio controls src={answer.question_image} preload="metadata" className="w-full max-w-sm mb-3" />
                            ) : (
                              <img
                                src={answer.question_image}
                                alt=""
                                className="max-h-40 w-auto rounded-xl object-cover mb-3 shadow-card"
                              />
                            ))}

                            <p className="text-xs text-gray-400">{t('quizResult.yourAnswer')}</p>
                            <div className="text-sm font-medium text-ink dark:text-gray-200 mb-3">
                              {(answer.question_type === 'multiple_choice' || answer.question_type === 'checkbox' || answer.question_type === 'dropdown')
                                ? (<>
                                  {answer.selected_options?.length > 0
                                    ? answer.selected_options.map((s) => sanitizeHtml(s).replace(/<[^>]*>/g, '') || s).join(', ')
                                    : (!answer.answer_text && <span className="text-gray-400 italic">{t('quizResult.notAnswered')}</span>)}
                                  {answer.answer_text && (
                                    <span className="block mt-1 text-gray-500 dark:text-gray-400">{t('quizResult.otherAnswer', { text: answer.answer_text })}</span>
                                  )}
                                </>)
                                : answer.question_type === 'file_upload'
                                  ? (answer.answer_file
                                    ? <a href={answer.answer_file} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary dark:text-primary-300 underline">{t('quizResult.viewAnswerFile')}</a>
                                    : <span className="text-gray-400 italic">{t('quizResult.notAnswered')}</span>)
                                  : (answer.answer_text || <span className="text-gray-400 italic">{t('quizResult.notAnswered')}</span>)}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {canRefill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-3"
          >
            <Button
              onClick={() => navigate(`/q/${formCode}`)}
              size="lg"
              className="w-full"
              style={{ background: palette.cta, color: palette.onBase }}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              {t('quizResult.fillAgain')}
            </Button>
          </motion.div>
        )}

        {!canRefill && (
          <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ClipboardList className="w-3.5 h-3.5" />
            {t('quizResult.closePage')}
          </div>
        )}
      </div>
    </div>
  )
}

function MetaChip({ label, value }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 dark:bg-ink-800/50 border border-gray-100 dark:border-gray-800 px-2 py-3.5 text-center min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-ink dark:text-gray-100 mt-1 truncate max-w-full">{value}</span>
    </div>
  )
}
