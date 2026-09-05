import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, Download, ClipboardList, X, Check, AlertTriangle, Trash2 } from 'lucide-react'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { useHoldSelect } from '../../hooks/useHoldSelect'
import { stripTags } from '../../lib/sanitize'
import { Card, Button, StatusBadge, Select, PageHeader, FormSubNav, EmptyState, CardSkeleton, RichText, ConfirmModal, sanitizeHtml } from '../../components/ui'
import { isAudioUrl } from '../../lib/media'
import { useTranslation } from 'react-i18next'



// Kartu mobile dengan hold-to-select (haptic). Hook dipanggil di sini — satu
// komponen per kartu, aman Rules of Hooks.
function HoldSelectCard({ selectedCount, selected, onToggle, onTap, className = '', children }) {
  const holdProps = useHoldSelect({ selectedCount, onToggle, onTap })
  return (
    <Card
      {...holdProps}
      className={`cursor-pointer select-none ${selected ? '!border-primary ring-2 ring-primary/30 bg-primary-50/40 dark:bg-primary-900/15' : ''} ${className}`}
    >
      {children}
    </Card>
  )
}



export default function Results() {
  const { formId } = useParams()
  const toast = useToast()
  const { t } = useTranslation()

  const statusOptions = [
    { value: '', label: t('results.filterAll') },
    { value: 'submitted', label: t('results.statusSubmitted') },
    { value: 'auto_submitted', label: t('results.statusAuto') },
    { value: 'cheating', label: t('results.statusCheating') },
    { value: 'locked', label: t('results.statusLocked') },
  ]

  const statusTargets = [
    { value: 'in_progress', label: t('results.statusInProgress') },
    { value: 'submitted', label: t('results.statusSubmitted') },
    { value: 'cheating', label: t('results.statusCheating') },
  ]

  const STATUS_LABELS = {
    in_progress: t('results.statusInProgress'),
    submitted: t('results.statusSubmitted'),
    auto_submitted: t('results.statusAutoSubmitted'),
    cheating: t('results.statusCheating'),
    locked: t('results.statusLocked'),
  }

  const sortOptions = [
    { value: '', label: t('results.sortNewest') },
    { value: 'score_desc', label: t('results.sortHighest') },
    { value: 'score_asc', label: t('results.sortLowest') },
  ]
  const [data, setData] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1, per_page: 20 })
  const [formTitle, setFormTitle] = useState('')
  const [isQuiz, setIsQuiz] = useState(true)
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allSelected = data.length > 0 && data.every((row) => selected.has(row.submission_id))

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(data.map((row) => row.submission_id)))
  }

  const handleDeleteSelected = async () => {
    setDeleting(true)
    try {
      const res = await api.delete(`/forms/${formId}/results`, { data: { submission_ids: [...selected] } })
      toast.success(res.data.message || t('results.deleted', { count: res.data.deleted }))
      setShowDelete(false)
      setSelected(new Set())
      fetchResults()
    } catch (err) {
      toast.error(err.response?.data?.message || t('results.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  // Creator mengatur ulang status hasil (universal): buka kembali, sahkan,
  // atau vonis curang. Konfirmasi hanya untuk cheating (nilai 0).
  const [statusTarget, setStatusTarget] = useState(null) // { id, status }
  const [statusSaving, setStatusSaving] = useState(false)

  const applyStatus = async ({ id, status }) => {
    setStatusSaving(true)
    try {
      const res = await api.patch(`/forms/${formId}/results/${id}/status`, { status })
      toast.success(res.data.message || t('results.statusUpdated'))
      setStatusTarget(null)
      setDetail((prev) => (prev && prev.id === id ? { ...prev, status: res.data.status, score: res.data.score } : prev))
      fetchResults()
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || t('results.deleteFailed'))
    } finally {
      setStatusSaving(false)
    }
  }

  const requestStatus = ({ id, status, current }) => {
    if (status === current) return
    if (status === 'cheating') setStatusTarget({ id, status })
    else applyStatus({ id, status })
  }

  const [bulkStatusTarget, setBulkStatusTarget] = useState(null) // { status }
  const [bulkStatusSaving, setBulkStatusSaving] = useState(false)

  const applyBulkStatus = async ({ status }) => {
    setBulkStatusSaving(true)
    try {
      const res = await api.patch(`/forms/${formId}/results/status`, { 
        submission_ids: [...selected], 
        status 
      })
      toast.success(res.data.message || t('results.statusUpdated'))
      setBulkStatusTarget(null)
      setSelected(new Set())
      fetchResults()
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || t('results.deleteFailed'))
    } finally {
      setBulkStatusSaving(false)
    }
  }

  const requestBulkStatus = (status) => {
    if (!status) return
    if (status === 'cheating') setBulkStatusTarget({ status })
    else applyBulkStatus({ status })
  }

  const StatusSelect = ({ row }) => (
    <Select
      value={row.status}
      onClick={(e)=>e.stopPropagation()}
      onChange={(e) => requestStatus({ id: row.submission_id, status: e.target.value, current: row.status })}
      aria-label={t('results.changeStatusAria', { id: row.submission_id })}
      className="!h-8 !text-xs w-36"
    >
      <option value={row.status} disabled>{STATUS_LABELS[row.status] || row.status}</option>
      {statusTargets.filter((opt) => opt.value !== row.status).map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </Select>
  )

  const fetchResults = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: 20 }
      if (status) params.status = status
      if (sort) params.sort = sort
      const res = await api.get(`/forms/${formId}/results`, { params })
      setData(res.data.data)
      setMeta(res.data.meta)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [formId, status, sort, page])

  useEffect(() => {
    api.get(`/forms/${formId}`).then((res) => {
      setFormTitle(res.data.title)
      setIsQuiz(res.data.type === 'quiz')
    }).catch(() => {})
  }, [formId])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  const handleExport = async () => {
    try {
      const params = {}
      if (status) params.status = status
      if (sort) params.sort = sort
      const res = await api.get(`/forms/${formId}/export/excel`, { responseType: 'blob', params })
      const disposition = res.headers['content-disposition']
      let filename = ''
      if (disposition) {
        const m = disposition.match(/filename="?([^"]+)"?/)
        if (m) filename = m[1]
      }
      if (!filename) {
        const safeTitle = (stripTags(formTitle) || 'form').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')
        const today = new Date().toISOString().slice(0, 10)
        filename = `${safeTitle}_${today}.xlsx`
      }
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('results.exportSuccess'))
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || t('results.exportFailed'))
    }
  }

  const openDetail = async (id) => {
    setDetailLoading(true)
    try {
      const res = await api.get(`/submissions/${id}`)
      setDetail(res.data)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const totalPages = Math.ceil(meta.total / meta.per_page)

  // Semua soal dikelompokkan per section — soal yang tidak dijawab tetap tampil ("-").
  let answerByQ = {}
  let questionGroups = []
  if (detail) {
    for (const a of detail.answers) answerByQ[a.question_id] = a
    const qs = detail.questions || []
    const sectionIds = new Set((detail.sections || []).map((s) => s.id))
    for (const s of detail.sections || []) {
      questionGroups.push({ title: s.title, items: qs.filter((q) => q.section_id === s.id) })
    }
    const rest = qs.filter((q) => q.section_id == null || !sectionIds.has(q.section_id))
    if (rest.length) questionGroups.push({ title: null, items: rest })
  }
  questionGroups = questionGroups.filter((g) => g.items.length > 0)

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('results.eyebrow')}
        title={formTitle ? <RichText html={formTitle} /> : t('results.eyebrow')}
        description={t('results.submissionCount', { total: meta.total })}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExport} title={t('results.exportHint')}>{t('results.exportExcel')}</Button>
          </>
        }
      />

      <FormSubNav formId={formId} className="mt-5" />

      <div className="flex flex-wrap gap-3 mt-6 mb-6">
        <div className="w-full sm:w-48">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        {isQuiz && (
          <div className="w-full sm:w-48">
            <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} aria-label="Sort results">
              {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        )}
      </div>
      {(status || sort) && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 -mt-2">
          {t('results.exportHintActive')}
        </p>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-30 mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-white dark:bg-ink-900 px-4 py-3 shadow-lift">
          <span className="text-sm font-semibold text-ink dark:text-gray-100 shrink-0">{t('results.selectedCount', { count: selected.size })}</span>
          <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="hidden sm:inline-flex">{t('results.cancelSelection')}</Button>

            <Select 
              value="" 
              onChange={(e) => requestBulkStatus(e.target.value)} 
              className="!h-8 !text-xs w-[115px] sm:w-[140px]"
              aria-label="Change status in bulk"
            >
              <option value="" disabled>{t('results.changeStatus')}</option>
              {statusTargets.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setShowDelete(true)}>
              <span className="hidden sm:inline">{t('results.deleteSelected')}</span>
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title={t('results.emptyTitle')}
            description={t('results.emptyDesc')}
          />
        </Card>
      ) : (
        <>
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="hidden md:block">
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-ink-800/50">
                    <th className="px-5 py-3.5 w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all" className="accent-primary w-4 h-4 cursor-pointer" />
                    </th>
                    {isQuiz && <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('results.rank')}</th>}
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('results.respondent')}</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{isQuiz ? t('results.score') : t('results.answers')}</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('results.status')}</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('results.submittedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <motion.tr
                      key={row.submission_id}
                      variants={itemVariants}
                      className={`border-b border-gray-50 last:border-0 transition-colors cursor-pointer ${
                        row.status === 'cheating' ? 'bg-incorrect-soft hover:bg-incorrect-soft' : 'hover:bg-gray-50/70 dark:hover:bg-ink-800/50'
                      }`}
                      onClick={() => openDetail(row.submission_id)}
                    >
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(row.submission_id)} onChange={() => toggleSelect(row.submission_id)} aria-label={`Select #${row.submission_id}`} className="accent-primary w-4 h-4 cursor-pointer" />
                      </td>
                      {isQuiz && <td className="px-5 py-3.5 text-sm font-semibold tabular-nums text-gray-500 dark:text-gray-400">{row.rank ?? '-'}</td>}
                      <td className="px-5 py-3.5 text-sm font-medium text-ink dark:text-gray-100">{row.respondent_name || 'Anonymous'}{row.is_creator && <span className="text-primary text-xs font-semibold ml-1.5">{t('results.youSuffix')}</span>}</td>
                      <td className="px-5 py-3.5 text-sm tabular-nums">
                        {isQuiz ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-flex items-center justify-center min-w-[44px] h-7 px-2 rounded-lg font-semibold ${
                              row.score != null && row.max_score > 0 && row.score / row.max_score >= 0.7
                                ? 'bg-correct-soft text-correct'
                                : row.score != null && row.max_score > 0 && row.score / row.max_score >= 0.4
                                  ? 'bg-warn-soft text-warn'
                                  : 'bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-gray-400'
                            }`}>
                              {row.score ?? '-'}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500">/ {row.max_score ?? '-'}</span>
                          </span>
                        ) : (
                          <span className="text-gray-600 dark:text-gray-400 block max-w-[320px] truncate">{row.answer_summary || '-'}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5"><StatusSelect row={row} />{row.cheat_reason && (
                        <p className="text-[11px] text-incorrect/80 mt-1 max-w-[180px] truncate" title={row.cheat_reason}>{row.cheat_reason}</p>
                      )}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">{row.submitted_at || '-'}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </motion.div>

          <motion.div variants={containerVariants} initial="hidden" animate="show" className="md:hidden space-y-3">
            {data.map((row) => (
              <motion.div key={row.submission_id} variants={itemVariants}>
                <HoldSelectCard
                  selectedCount={selected.size}
                  selected={selected.has(row.submission_id)}
                  onToggle={() => toggleSelect(row.submission_id)}
                  onTap={() => openDetail(row.submission_id)}
                  className={row.status === 'cheating' ? 'bg-incorrect-soft' : ''}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm text-ink dark:text-gray-100 truncate block">{row.respondent_name || 'Anonymous'}{row.is_creator && <span className="text-primary text-xs font-semibold ml-1.5">{t('results.youSuffix')}</span>}</span>
                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">#{row.submission_id}{isQuiz && row.rank != null ? ` · #${row.rank}` : ''}</p>
                        </div>
                        <StatusBadge status={row.status} />
                      </div>
                      {row.cheat_reason && (
                        <p className="text-[11px] text-incorrect/80 mb-2 truncate" title={row.cheat_reason}>{row.cheat_reason}</p>
                      )}
                      <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                    {isQuiz ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-flex items-center justify-center h-6 px-2 rounded-lg text-xs font-semibold ${
                          row.score != null && row.max_score > 0 && row.score / row.max_score >= 0.7
                            ? 'bg-correct-soft text-correct'
                            : row.score != null && row.max_score > 0 && row.score / row.max_score >= 0.4
                              ? 'bg-warn-soft text-warn'
                              : 'bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {row.score ?? '-'}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-xs">/ {row.max_score ?? '-'}</span>
                      </span>
                    ) : (
                      <span className="truncate pr-2">{row.answer_summary || '-'}</span>
                    )}
                     <span className="text-xs shrink-0">{row.submitted_at || '-'}</span>
                       </div>
                     </div>
                   </div>
                 </HoldSelectCard>
               </motion.div>
             ))}
           </motion.div>


          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
              <span className="text-sm text-gray-500 dark:text-gray-400 px-2">
                {t('forms.page', { page, total: totalPages })}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              className="bg-white dark:bg-ink-900 border dark:border-ink-800 rounded-2xl w-full max-w-2xl max-h-[88dvh] flex flex-col shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold text-ink dark:text-gray-100 truncate">
                      {detail.respondent_name || 'Anonymous'}
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate">
                      #{detail.id}{detail.respondent_email ? ` · ${detail.respondent_email}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                    aria-label={t('common.close')}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-gray-400 dark:text-gray-500">{t('results.detailStatus')}</span>
                    <StatusSelect row={{ submission_id: detail.id, status: detail.status }} />
                  </span>
                  {isQuiz && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-gray-400 dark:text-gray-500">{t('results.detailScore')}</span>
                      <span className="font-semibold tabular-nums text-primary">{detail.score ?? '-'} / {detail.max_score ?? '-'}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-gray-400 dark:text-gray-500">{t('results.detailSubmitted')}</span>
                    <span className="font-medium text-ink dark:text-gray-100">{detail.submitted_at || '-'}</span>
                  </span>
                </div>

                {/* Catatan pelanggaran tetap tampil walau status kini bukan cheating —
                    riwayat contek penting untuk konteks nilai yang ada. */}
                {(detail.cheat_reason || detail.tab_exit_count > 0) && (
                  <div className={`mt-3 rounded-xl border px-4 py-3 ${detail.status === 'cheating' ? 'bg-incorrect-soft border-incorrect/30' : 'bg-warn-soft border-warn/30'}`}>
                    <p className={`text-xs font-semibold flex items-center gap-1.5 ${detail.status === 'cheating' ? 'text-incorrect' : 'text-warn'}`}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {detail.status === 'cheating'
                        ? t('results.cheatingDetected')
                        : t('results.violationRecorded')}
                      {' '}{detail.tab_exit_count || 0}x
                    </p>
                    {detail.cheat_reason && (
                      <p className={`text-[11px] mt-1 ${detail.status === 'cheating' ? 'text-incorrect/80' : 'text-warn/80'}`}>
                        {t('results.lastRecorded', { reason: detail.cheat_reason })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {detailLoading ? (
                  <div className="text-sm text-gray-400 text-center py-8">{t('results.loading')}</div>
                ) : questionGroups.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8">{t('results.noQuestions')}</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-1 h-4 rounded-full bg-primary" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {t('results.respondentAnswers', { count: detail.questions?.length ?? 0 })}
                      </span>
                    </div>
                    {questionGroups.map((group) => (
                      <div key={group.title ?? '_default'} className="mb-5 last:mb-0">
                        {group.title && (
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500 mb-2">{group.title}</p>
                        )}
                        <div className="space-y-3">
                          {group.items.map((q) => {
                            const a = answerByQ[q.id]
                            return (
                              <div key={q.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-ink-800/40 px-4 py-4">
                                <div className="flex items-start gap-3">
                                  <span className="w-6 h-6 rounded-full bg-primary-50 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                    {q.order_index + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-ink dark:text-gray-100 leading-snug">
                                      <RichText html={q.question_text} className="rich-text" />
                                    </div>
                                    {q.image && (isAudioUrl(q.image.path) ? (
                                      <audio controls src={q.image.path} preload="metadata" className="w-full max-w-sm mt-3" />
                                    ) : (
                                      <img src={q.image.path} alt="" className="max-h-32 w-auto rounded-lg object-cover mt-3" />
                                    ))}
                                    <div className="mt-3">
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('results.answersLabel')}</span>
                                        <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
                                      </div>
                                      <div className="flex items-center gap-3 bg-white dark:bg-ink-900 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2.5">
                                        <div className="flex-1 min-w-0 text-sm font-medium text-ink dark:text-gray-100">
                                          {!a || (!a.answer_text && !a.answer_file && !(a.selected_options || []).length) ? (
                                            <span className="text-gray-400 dark:text-gray-500">-</span>
                                          ) : a.question_type === 'file_upload' ? (
                                            <a href={a.answer_file} target="_blank" rel="noopener noreferrer" className="text-primary dark:text-primary-300 underline">{t('results.viewAnswerFile')}</a>
                                          ) : ['multiple_choice', 'checkbox', 'dropdown'].includes(a.question_type) ? (
                                            <>
                                              <RichText html={a.selected_options.map((s) => sanitizeHtml(s).replace(/<[^>]*>/g, '') || s).join(' · ')} className="rich-text" />
                                              {a.answer_text && (
                                                <span className="block mt-1 text-xs text-gray-500 dark:text-gray-400">{t('results.otherAnswer', { text: a.answer_text })}</span>
                                              )}
                                            </>
                                          ) : (
                                            <RichText html={a.answer_text} className="rich-text" />
                                          )}
                                        </div>
                                        {a?.is_correct === true && (
                                          <span className="w-6 h-6 rounded-full bg-correct-soft text-correct flex items-center justify-center shrink-0" title="Correct">
                                            <Check className="w-3.5 h-3.5" />
                                          </span>
                                        )}
                                        {a?.is_correct === false && (
                                          <span className="w-6 h-6 rounded-full bg-incorrect-soft text-incorrect flex items-center justify-center shrink-0" title="Wrong">
                                            <X className="w-4 h-4" />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        show={showDelete}
        title={t('results.confirmDeleteTitle')}
        message={t('results.confirmDeleteMessage', { count: selected.size })}
        confirmText={t('results.deleteSelected')}
        loading={deleting}
        onConfirm={handleDeleteSelected}
        onCancel={() => setShowDelete(false)}
      />

      <ConfirmModal
        show={!!statusTarget}
        title={t('results.confirmCheating')}
        message={t('results.confirmCheatingMessage', { id: statusTarget?.id })}
        confirmText={t('results.confirmCheatingAction')}
        loading={statusSaving}
        onConfirm={() => applyStatus(statusTarget)}
        onCancel={() => setStatusTarget(null)}
      />

      <ConfirmModal
        show={!!bulkStatusTarget}
        title={t('results.confirmCheating')}
        message={t('results.confirmCheatingMessage', { id: selected.size })}
        confirmText={t('results.confirmCheatingAction')}
        loading={bulkStatusSaving}
        onConfirm={() => applyBulkStatus(bulkStatusTarget)}
        onCancel={() => setBulkStatusTarget(null)}
      />
    </div>
  )
}
