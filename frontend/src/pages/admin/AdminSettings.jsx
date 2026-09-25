import { useEffect, useState } from 'react'
import { CheckCircle2, CircleOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { Card, PageHeader, Toggle } from '../../components/ui'
import { useToast } from '../../hooks/useToast'

export default function AdminSettings() {
  const { t } = useTranslation()
  const toast = useToast()
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get('/admin/settings/registration', { signal: controller.signal })
      .then(({ data }) => setRegistrationOpen(data.registration_open))
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') setError(err.response?.data?.message || t('admin.loadFailed'))
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [t])

  async function toggleRegistration() {
    const next = !registrationOpen
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch('/admin/settings/registration', { is_open: next })
      setRegistrationOpen(data.registration_open)
      toast.success(data.registration_open ? t('admin.registrationOpened') : t('admin.registrationClosedToast'))
    } catch (err) {
      setError(err.response?.data?.message || t('admin.loadFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('admin.settingsEyebrow')} title={t('admin.settingsTitle')} description={t('admin.settingsDescription')} />
      {error && <p className="rounded-xl bg-incorrect-soft px-4 py-3 text-sm text-incorrect">{error}</p>}
      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {registrationOpen ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> : <CircleOff className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />}
          <div>
            <h2 className="font-semibold text-ink dark:text-gray-100">{t('admin.registrationTitle')}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">{registrationOpen ? t('admin.registrationOpen') : t('admin.registrationClosed')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{registrationOpen ? t('admin.open') : t('admin.closed')}</span>
          <Toggle checked={registrationOpen} onChange={toggleRegistration} label={t('admin.registrationToggle')} disabled={loading || saving} />
        </div>
      </Card>
    </div>
  )
}
