import { useState, useEffect, useMemo, memo } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, Trophy, TrendingUp, TrendingDown, ClipboardList, ChevronDown, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import api from '../../api/client'
import { Card, PageHeader, FormSubNav, FormBackButton, CardSkeleton, RichText } from '../../components/ui'
import { stripTags, resolveRichHtml } from '../../lib/sanitize'
import { useTranslation } from 'react-i18next'
import { usePageTour } from '../../features/tour/TourContext'

function StatCard({ label, value, icon: Icon, tint, delay }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-5 h-full">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{label}</p>
            <p className={`font-display text-3xl font-bold tabular-nums mt-2 ${tint.split(' ')[1]}`}>
              {value}
            </p>
          </div>
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
            <Icon className="w-5 h-5" />
          </span>
        </div>
      </Card>
    </motion.div>
  )
}

function EmptyData() {
  const { t } = useTranslation()
  return <p className="text-gray-400 dark:text-gray-500 text-sm py-8 text-center">{t('analytics.noData')}</p>
}

function Donut({ pct, label, size = 176, inset = 16 }) {
  const { t } = useTranslation()
  const displayLabel = label || t('analytics.completion')
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div className="relative shrink-0 text-primary" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(currentColor ${p * 3.6}deg, rgba(100,116,139,0.15) ${p * 3.6}deg)` }}
      />
      <div
        className="absolute rounded-full bg-white dark:bg-ink-900 border border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center"
        style={{ inset }}
      >
        <span className="font-display text-4xl font-bold tabular-nums text-ink dark:text-gray-100">{p}%</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-1">{displayLabel}</span>
      </div>
    </div>
  )
}

const QuestionRow = memo(function QuestionRow({ q, i, total, open, onToggle }) {
  const { t } = useTranslation()
  const answeredPct = total ? Math.round((q.answered / total) * 100) : 0
  const text = resolveRichHtml(q.question_text) || `Question ${i + 1}`
  const isChoice = (q.option_breakdown || []).length > 0

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-gray-50/70 dark:hover:bg-ink-800/50 transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary dark:text-primary-300 text-sm font-bold flex items-center justify-center shrink-0">
          {i + 1}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-ink dark:text-gray-100 truncate"><RichText html={text} className="rich-text block truncate" /></span>
          <span className="flex items-center gap-2 mt-1.5">
            <span className="flex-1 h-2 bg-gray-100 dark:bg-ink-800 rounded-full overflow-hidden">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${answeredPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="block h-full bg-primary rounded-full"
              />
            </span>
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 shrink-0">
              {answeredPct}% · {q.answered}/{total}
            </span>
          </span>
        </span>
        {q.most_selected ? (
          <span className="hidden md:inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-ink-800 px-2.5 py-1 rounded-full truncate max-w-[220px] shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-correct shrink-0" />
            <span className="truncate"><RichText html={resolveRichHtml(q.most_selected)} className="rich-text block truncate" /></span>
          </span>
        ) : null}
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-6 pb-5 pl-[72px]">
          {isChoice ? (
            <div className="space-y-2.5">
              {q.option_breakdown.map((o) => (
                <div key={o.option_id} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300 flex-1 min-w-0 truncate"><RichText html={resolveRichHtml(o.option_text)} className="rich-text block truncate" /></span>
                  <div className="flex-1 h-2.5 bg-gray-100 dark:bg-ink-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(o.pct, 100)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 w-20 text-right shrink-0">
                    {o.count} · {o.pct}%
                  </span>
                </div>
              ))}
            </div>
          ) : q.sample_answers.length ? (
            <div className="space-y-1.5">
              {q.sample_answers.map((a, j) => (
                <p key={j} className="text-sm text-gray-600 dark:text-gray-300 leading-snug">"{a}"</p>
              ))}
              {q.answered > q.sample_answers.length && (
                <p className="text-xs text-gray-400">{t('analytics.moreResponses', { count: q.answered - q.sample_answers.length })}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('analytics.noResponses')}</p>
          )}
        </div>
      )}
    </div>
  )
})

function formatDuration(seconds, t) {
  if (seconds == null) return '-'
  const s = Math.round(seconds)
  if (s < 60) return t('analytics.durationSec', { count: s })
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? t('analytics.durationMinSec', { m, s: rest }) : t('analytics.durationMin', { count: m })
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? t('analytics.durationHrMin', { h, m: mm }) : t('analytics.durationHr', { count: h })
}

function FormAnalytics({ data }) {
  const { t } = useTranslation()
  const [openIds, setOpenIds] = useState({})
  const total = data.total_participants
  const toggle = (id) => setOpenIds((o) => ({ ...o, [id]: !o[id] }))

  const stats = [
    { label: t('analytics.participants'), value: total, icon: Users, tint: 'bg-primary-50 text-primary' },
    { label: t('analytics.totalAnswers'), value: data.total_answers, icon: ClipboardList, tint: 'bg-correct-soft text-correct' },
    { label: t('analytics.avgDuration'), value: formatDuration(data.avg_duration_seconds, t), icon: Clock, tint: 'bg-warn-soft text-warn' },
  ]

  return (
    <>
      {/* Ringkasan: donut completion + 3 angka kunci dalam satu band */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 h-full flex items-center justify-center">
            <Donut pct={(data.completion_rate || 0) * 100} />
          </Card>
        </motion.div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s, i) => (
            <StatCard key={s.label} {...s} delay={0.06 + i * 0.06} />
          ))}
        </div>
      </div>

      {/* Rincian per soal — ringkas, expand on demand */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-6">
        <Card className="overflow-hidden" padding={false}>
          <div className="flex items-center justify-between gap-4 px-6 py-5">
            <div>
              <h2 className="font-display font-semibold text-ink dark:text-gray-100">{t('analytics.questionBreakdown')}</h2>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                {t('analytics.tapToExpand', { count: data.question_stats.length })}
              </p>
            </div>
          </div>
          {data.question_stats.length === 0 ? (
            <div className="border-t border-gray-100 dark:border-gray-800">
              <EmptyData />
            </div>
          ) : (
            <div>
              {data.question_stats.map((q, i) => (
                <QuestionRow
                  key={q.question_id}
                  q={q}
                  i={i}
                  total={total}
                  open={!!openIds[q.question_id]}
                  onToggle={() => toggle(q.question_id)}
                />
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </>
  )
}

function QuizAnalytics({ data }) {
  const { t } = useTranslation()
  const stats = [
    { label: t('analytics.participants'), value: data.total_participants, icon: Users, tint: 'bg-primary-50 text-primary' },
    { label: t('analytics.averageScore'), value: data.average_score, icon: TrendingUp, tint: 'bg-correct-soft text-correct' },
    { label: t('analytics.highest'), value: data.highest_score, icon: Trophy, tint: 'bg-blue-50 text-blue-700' },
    { label: t('analytics.lowest'), value: data.lowest_score, icon: TrendingDown, tint: 'bg-warn-soft text-warn' },
  ]

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} delay={i * 0.06} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="h-full">
            <h2 className="font-display font-semibold text-ink dark:text-gray-100 mb-5">{t('analytics.correctWrongRate')}</h2>
            <div className="space-y-4">
              <RateRow
                label={t('analytics.correctRate')}
                pct={Math.round(data.correct_rate * 100)}
                count={data.per_question_stats.filter((q) => q.is_scored !== false).reduce((s, q) => s + q.correct_count, 0)}
                barClass="bg-correct"
                textClass="text-correct"
              />
              <RateRow
                label={t('analytics.wrongRate')}
                pct={Math.round(data.wrong_rate * 100)}
                count={data.per_question_stats.filter((q) => q.is_scored !== false).reduce((s, q) => s + q.wrong_count, 0)}
                barClass="bg-incorrect"
                textClass="text-incorrect"
              />
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="h-full flex items-center justify-center">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-correct-soft border border-correct/20 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-correct flex items-center gap-1 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t('analytics.easiest')}</span>
                    </span>
                    {data.easiest_question && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-correct/10 text-correct tabular-nums shrink-0">
                        {data.easiest_question.accuracy}%
                      </span>
                    )}
                  </div>
                  <p className="font-display text-xl font-bold text-correct">
                    {data.easiest_question ? `Question #${data.easiest_question.order_index}` : '-'}
                  </p>
                </div>
                <p className="text-[11px] text-correct/80 mt-1 truncate" title={stripTags(data.easiest_question?.question_text)}>
                  {data.easiest_question ? stripTags(data.easiest_question.question_text) : t('analytics.noQuestionData')}
                </p>
              </div>

              <div className="rounded-xl bg-warn-soft border border-warn/20 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-warn flex items-center gap-1 truncate">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t('analytics.hardest')}</span>
                    </span>
                    {data.hardest_question && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-warn/10 text-warn tabular-nums shrink-0">
                        {data.hardest_question.accuracy}%
                      </span>
                    )}
                  </div>
                  <p className="font-display text-xl font-bold text-warn">
                    {data.hardest_question ? `Question #${data.hardest_question.order_index}` : '-'}
                  </p>
                </div>
                <p className="text-[11px] text-warn/80 mt-1 truncate" title={stripTags(data.hardest_question?.question_text)}>
                  {data.hardest_question ? stripTags(data.hardest_question.question_text) : t('analytics.noQuestionData')}
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-6">
        <Card className="overflow-hidden" padding={false}>
          <div className="p-6 pb-4">
            <h2 className="font-display font-semibold text-ink dark:text-gray-100">{t('analytics.perQuestion')}</h2>
          </div>
          {data.per_question_stats.length === 0 ? (
            <div className="p-6 pt-0">
              <p className="text-gray-400 dark:text-gray-500 text-sm">{t('analytics.noQuestionData')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-t border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-ink-800/50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('analytics.tableQuestion')}</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-correct uppercase tracking-wider">{t('analytics.tableCorrect')}</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-incorrect uppercase tracking-wider">{t('analytics.tableWrong')}</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('analytics.tableAccuracy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_question_stats.map((q, i) => {
                    const scored = q.is_scored !== false
                    const total = q.correct_count + q.wrong_count
                    const accuracy = total ? Math.round((q.correct_count / total) * 100) : 0
                    return (
                      <tr key={q.question_id} className="border-t border-gray-50 hover:bg-gray-50/70 dark:hover:bg-ink-800/50 transition-colors">
                        <td className="px-6 py-3.5 text-sm text-ink dark:text-gray-100 font-medium">
                          <RichText html={resolveRichHtml(q.question_text) || `Question ${i + 1}`} className="rich-text block max-w-[280px] truncate" />
                        </td>
                        <td className="text-center px-4 py-3.5 text-sm text-correct font-semibold tabular-nums">{scored ? q.correct_count : '-'}</td>
                        <td className="text-center px-4 py-3.5 text-sm text-incorrect font-semibold tabular-nums">{scored ? q.wrong_count : '-'}</td>
                        <td className="text-center px-4 py-3.5">
                          {scored ? (
                          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${accuracy >= 70 ? 'text-correct' : accuracy >= 40 ? 'text-warn' : 'text-incorrect'}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {accuracy}%
                          </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>
    </>
  )
}

export default function Analytics() {
  const { formId } = useParams()
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/forms/${formId}/analytics`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [formId])

  const tourVariant = loading || !data ? 'loading' : data.type === 'form' ? 'form' : 'quiz'
  const tourSteps = useMemo(() => !data || loading ? [] : [
    { target: '[data-tour="analytics-header"]', title: 'Understand your responses', content: 'Analytics turns submissions into a quick view of participation, completion, and answer patterns.', placement: 'bottom' },
    { target: '[data-tour="analytics-subnav"]', title: 'Move between insights and results', content: 'Return to results when you need to inspect individual answers instead of aggregate data.', placement: 'bottom' },
    { target: '[data-tour="analytics-content"]', title: data.type === 'form' ? 'Review completion by question' : 'Compare quiz performance', content: data.type === 'form' ? 'Expand each question to see completion and response samples.' : 'Compare accuracy, score ranges, and the easiest or hardest questions.', placement: 'top' },
  ], [data, loading])
  usePageTour('analytics', { variant: tourVariant, variantKey: tourVariant, steps: tourSteps })

  if (loading) {
    return (
      <div>
        <div className="mb-2">
          <div className="h-8 bg-gray-200/60 rounded-xl w-48 animate-pulse" />
          <div className="h-4 bg-gray-200/60 rounded-xl w-32 mt-2 mb-8 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
        </div>
        <div className="card p-6 animate-pulse mb-8 dark:bg-ink-900">
          <div className="h-5 bg-gray-200/60 rounded w-1/3 mb-4" />
          <div className="h-12 bg-gray-200/60 rounded-xl mb-3" />
          <div className="h-12 bg-gray-200/60 rounded-xl" />
        </div>
        <div className="card p-6 animate-pulse dark:bg-ink-900">
          <div className="h-5 bg-gray-200/60 rounded w-1/3 mb-4" />
          <div className="h-48 bg-gray-200/60 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) return <div className="text-center py-12 text-gray-400 dark:text-gray-500">{t('analytics.loadFailed')}</div>

  const isQuiz = data.type !== 'form'
  const description = isQuiz
    ? t('analytics.quizDesc')
    : t('analytics.formDesc')

  return (
    <div>
      <FormBackButton />
      <div data-tour="analytics-header">
        <PageHeader
          eyebrow={t('analytics.insights')}
          title={t('analytics.title')}
          description={description}
        />
      </div>

      <div data-tour="analytics-subnav">
        <FormSubNav formId={formId} className="mt-5" />
      </div>

      <div data-tour="analytics-content">
        {isQuiz ? <QuizAnalytics data={data} /> : <FormAnalytics data={data} />}
      </div>
    </div>
  )
}

function RateRow({ label, pct, count, barClass, textClass }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className={`font-medium ${textClass}`}>{label} · {pct}%</span>
        <span className="text-gray-400 dark:text-gray-500 tabular-nums">{count} answers</span>
      </div>
      <div className="h-3 bg-gray-100 dark:bg-ink-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${barClass}`}
        />
      </div>
    </div>
  )
}
