import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ArrowLeft, FolderPlus } from 'lucide-react'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { stripTags } from '../../lib/sanitize'
import { Button, Toggle, Select, Card, PageHeader, RichTextEditor, CategoryManager } from '../../components/ui'

export default function FormCreate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'form',
    require_login: false,
    submission_limit: 'unlimited',
    show_in_history: true,
    category_id: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState([])
  const [showCatMgr, setShowCatMgr] = useState(false)

  const fetchCats = () => api.get('/categories').then((r) => setCategories(r.data)).catch(()=>{})
  useEffect(() => { fetchCats() }, [])

  // Rantai setting ala backend & FormEdit: once ⇒ require_login.
  const onceLocked = form.submission_limit === 'once'

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'submission_limit' && value === 'once') {
        next.require_login = true
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripTags(form.title)) { setError(t('formCreate.titleRequired')); return }
    if (form.title.length > 1000) { setError(t('formCreate.titleMax')); return }
    setLoading(true)
    setError('')
    try {
      const payload = { ...form }
      if (!payload.category_id) delete payload.category_id
      const res = await api.post('/forms', payload)
      toast.success(t('formCreate.created'))
      navigate(`/forms/${res.data.id}`)
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || t('formCreate.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/forms')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('formCreate.back')}
      </button>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
          <PageHeader
            eyebrow={t('formCreate.eyebrow')}
            title={t('formCreate.title')}
            description={t('formCreate.description')}
          />

          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
            <Card className="space-y-5">
              <div>
                <span className="field-label">{t('formCreate.titleLabel')}</span>
                <RichTextEditor
                  value={form.title || ''}
                  onChange={(html) => { setForm((prev) => ({ ...prev, title: html })); setError('') }}
                  placeholder={t('formCreate.titlePlaceholder')}
                  minHeight={60}
                />
                {error && <p className="field-error mt-1">{error}</p>}
              </div>

              <div>
                <span className="field-label">{t('formCreate.descLabel')}</span>
                <RichTextEditor
                  value={form.description || ''}
                  onChange={(html) => setForm((prev) => ({ ...prev, description: html }))}
                  placeholder={t('formCreate.descPlaceholder')}
                  minHeight={120}
                />
              </div>

              <div>
                <span className="field-label">{t('formCreate.typeLabel')}</span>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'form', label: t('formCreate.typeForm'), desc: t('formCreate.typeFormDesc') },
                    { value: 'quiz', label: t('formCreate.typeQuiz'), desc: t('formCreate.typeQuizDesc') },
                  ].map((t_) => (
                    <button
                      key={t_.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, type: t_.value }))}
                      className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                        form.type === t_.value
                          ? 'border-primary bg-primary-50 shadow-chip'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className={`block text-sm font-semibold ${form.type === t_.value ? 'text-primary-700' : 'text-ink dark:text-gray-100'}`}>
                        {t_.label}
                      </span>
                      <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t_.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="field-label">{t('formCreate.categoryLabel')}</span>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={form.category_id || ''}
                      onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value ? Number(e.target.value) : null }))}
                    >
                      <option value="">{t('formCreate.noCategory')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.form_count})</option>
                      ))}
                    </Select>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setShowCatMgr(true)} icon={<FolderPlus className="w-4 h-4" />}>
                    {t('formCreate.createCategory')}
                  </Button>
                </div>
                <p className="field-hint mt-1">{t('formCreate.categoryHint')}</p>
              </div>
            </Card>

            <Card className="divide-y divide-gray-100 dark:divide-gray-800">
              <SettingRow
                title={t('formCreate.requireLogin')}
                desc={onceLocked ? t('formCreate.requireLoginDescLocked') : t('formCreate.requireLoginDesc')}
                control={<Toggle label={t('formCreate.requireLogin')} checked={form.require_login} disabled={onceLocked} onChange={(v) => setForm((prev) => ({ ...prev, require_login: v }))} />}
              />
              <div className="py-4">
                <Select label={t('formCreate.submissionLimit')} name="submission_limit" value={form.submission_limit} onChange={handleChange}>
                  <option value="unlimited">{t('formCreate.limitUnlimited')}</option>
                  <option value="once">{t('formCreate.limitOnce')}</option>
                </Select>
              </div>
            </Card>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={loading} className="flex-1" size="lg">
                {loading ? t('common.loading') : t('formCreate.create')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/forms')} size="lg">
                {t('common.cancel')}
              </Button>
            </div>
          </form>
          <CategoryManager open={showCatMgr} onClose={() => setShowCatMgr(false)} categories={categories} onChanged={(created, deletedId) => { fetchCats(); if (created) setForm((p)=>({ ...p, category_id: created.id })); if (deletedId) setForm((p)=> p.category_id===deletedId ? { ...p, category_id: null } : p) }} />
      </motion.div>
    </div>
  )
}

function SettingRow({ title, desc, control }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-medium text-ink dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
      </div>
      {control}
    </div>
  )
}
