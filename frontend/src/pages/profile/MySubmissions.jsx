import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ExternalLink, ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll'
import { Card, Button, StatusBadge, PageHeader, EmptyState, CardSkeleton, RichText } from '../../components/ui'
import { usePageTour } from '../../features/tour/TourContext'

const PER_PAGE = 20

export default function MySubmissions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(1)
  const totalRef = useRef(0)
  const pendingRef = useRef(false)

  const loadPage = useCallback(async (pageNum, { reset = false } = {}) => {
    if (pendingRef.current) return
    pendingRef.current = true
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await api.get('/me/submissions', { params: { page: pageNum, per_page: PER_PAGE } })
      const rows = res.data.data || []
      const meta = res.data.meta || {}
      totalRef.current = meta.total ?? rows.length
      pageRef.current = meta.page ?? pageNum
      setTotal(totalRef.current)
      setData((prev) => {
        const merged = reset ? [] : [...prev]
        const seen = new Set(merged.map((s) => s.id))
        for (const row of rows) {
          if (!seen.has(row.id)) {
            merged.push(row)
            seen.add(row.id)
          }
        }
        return merged
      })
    } catch (err) {
      console.error(err)
    } finally {
      pendingRef.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    setData([])
    setTotal(0)
    pageRef.current = 1
    totalRef.current = 0
    loadPage(1, { reset: true })
  }, [loadPage])

  const loadMore = useCallback(() => {
    if (pendingRef.current) return
    if (data.length >= totalRef.current) return
    loadPage(pageRef.current + 1)
  }, [data.length, loadPage])

  const hasMore = !loading && data.length < total
  const sentinelRef = useInfiniteScroll({ loading, loadingMore, hasMore, onLoadMore: loadMore })
  const tourVariant = loading ? 'loading' : data.length ? 'data' : 'empty'
  const tourSteps = loading ? [] : [
    { target: '[data-tour="history-header"]', title: 'Your response history', content: 'Review submissions you have completed across forms and quizzes.', placement: 'bottom' },
    { target: data.length ? '[data-tour="history-list"]' : '[data-tour="history-empty"]', title: data.length ? 'Open any response' : 'No history yet', content: data.length ? 'Open a response to review its status, score, and submitted date.' : 'Your completed forms and quizzes will appear here.', placement: data.length ? 'top' : 'bottom' },
  ]
  usePageTour('my-submissions', { variant: tourVariant, variantKey: tourVariant, steps: tourSteps })

  return (
    <div className="max-w-3xl mx-auto">
      <div data-tour="history-header">
        <PageHeader
          eyebrow={t('mySubs.eyebrow')}
          title={t('mySubs.title')}
          description={t('mySubs.description')}

        />
      </div>

      {loading ? (
        <div className="space-y-4 mt-6">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : data.length === 0 ? (
        <Card data-tour="history-empty" className="mt-6">
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title={t('mySubs.empty')}
            description={t('mySubs.emptyDesc')}
            action={
              <Button onClick={() => navigate('/')} variant="secondary">
                {t('mySubs.backToDashboard')}
              </Button>
            }
          />
        </Card>
      ) : (
         <motion.div
           data-tour="history-list"
           initial="hidden"

          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="space-y-3 mt-6"
        >
          {data.map((sub) => (
            <motion.div
              key={sub.id}
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            >
              <Card
                className="cursor-pointer hover:border-primary/40 hover:shadow-lift transition-all"
                onClick={() => navigate(`/s/${sub.id}/result?type=${encodeURIComponent(sub.type || 'form')}&code=${encodeURIComponent(sub.short_code || '')}&from=history`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-semibold text-ink dark:text-gray-100 truncate"><RichText html={sub.form_title} /></h3>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                    </div>
                    {sub.type !== 'quiz' && sub.reveal_score && sub.score !== null && sub.score !== undefined && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                        {t('mySubs.scoreLabel', { score: sub.score })}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {sub.submitted_at ? t('mySubs.submittedAt', { date: sub.submitted_at }) : t('mySubs.notSubmitted')}
                    </p>
                  </div>
                  <StatusBadge status={sub.status} />
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
      {!loading && data.length > 0 && (
        <>
          <div ref={sentinelRef} aria-hidden="true" className="h-1" />
          {loadingMore && (
            <div className="space-y-4 mt-3">
              {[1, 2].map((i) => <CardSkeleton key={i} />)}
            </div>
          )}
          {!hasMore && total > PER_PAGE && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
              {t('mySubs.allLoaded', { count: total })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
