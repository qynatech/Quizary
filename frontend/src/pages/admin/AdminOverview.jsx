import { useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, FileText, Settings, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { Card, PageHeader } from '../../components/ui'

const statConfig = [
  { key: 'total_users', labelKey: 'admin.statsUsers', icon: Users, color: 'text-blue-600 dark:text-blue-400', iconClass: 'bg-blue-50 dark:bg-blue-900/30' },
  { key: 'total_submissions', labelKey: 'admin.statsSubmissions', icon: ClipboardList, color: 'text-emerald-600 dark:text-emerald-400', iconClass: 'bg-emerald-50 dark:bg-emerald-900/30' },
  { key: 'total_forms', labelKey: 'admin.statsForms', icon: FileText, color: 'text-amber-600 dark:text-amber-400', iconClass: 'bg-amber-50 dark:bg-amber-900/30' },
  { key: 'total_ai_generations', labelKey: 'admin.statsAiGenerations', icon: Sparkles, color: 'text-purple-600 dark:text-purple-400', iconClass: 'bg-purple-50 dark:bg-purple-900/30' },
]

export default function AdminOverview() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get('/admin/stats', { signal: controller.signal })
      .then(({ data }) => setStats(data))
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') setError(err.response?.data?.message || t('admin.statsLoadFailed'))
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [t])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('admin.eyebrow')} title={t('admin.title')} description={t('admin.description')} />
      {error && <p className="rounded-xl bg-incorrect-soft px-4 py-3 text-sm text-incorrect">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statConfig.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.key} className="min-h-[150px]">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${stat.iconClass}`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="mt-5 text-2xl font-bold tracking-tight text-ink dark:text-gray-100">{loading ? '—' : (stats?.[stat.key] ?? 0).toLocaleString()}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(stat.labelKey)}</p>
            </Card>
          )
        })}
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink dark:text-gray-100">{t('admin.quickActions')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.quickActionsDescription')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Link to="/admin/users" className="group">
            <Card className="flex items-center justify-between transition-colors group-hover:border-primary/40 group-hover:bg-primary-50/40 dark:group-hover:bg-primary-900/20">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary dark:bg-primary-900/30 dark:text-primary-300"><Users className="h-5 w-5" /></span>
                <div><h3 className="font-semibold text-ink dark:text-gray-100">{t('admin.navUsers')}</h3><p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('admin.usersDescription')}</p></div>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </Card>
          </Link>
          <Link to="/admin/settings" className="group">
            <Card className="flex items-center justify-between transition-colors group-hover:border-primary/40 group-hover:bg-primary-50/40 dark:group-hover:bg-primary-900/20">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary dark:bg-primary-900/30 dark:text-primary-300"><Settings className="h-5 w-5" /></span>
                <div><h3 className="font-semibold text-ink dark:text-gray-100">{t('admin.navSettings')}</h3><p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('admin.settingsDescription')}</p></div>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
