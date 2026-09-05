import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles, RefreshCw, Check, X, FileText, Clock, Shuffle, Lock, ListChecks, Trophy, EyeOff, CalendarDays, LayoutGrid, Info } from 'lucide-react'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { stripTags } from '../../lib/sanitize'
import { Button, Card, PageHeader, RichTextEditor, RichText, Textarea, Badge, Toggle, Select, Input, AiLoadingOverlay } from '../../components/ui'

const humanizeType = (t) => (t || '').replace(/_/g, ' ')

const ACCEPT_EXT = '.docx,.pdf,.pptx'
const MAX_FILES = 5

function QuotaPill({ quota }) {
  const { t } = useTranslation()
  if (!quota) return null
  const empty = quota.remaining <= 0
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold border ${empty ? 'bg-incorrect-soft text-incorrect border-incorrect/20' : 'bg-primary-50 text-primary-700 border-primary/20 dark:bg-primary-900/20 dark:text-primary-300'}`}>
      <Sparkles className="w-3.5 h-3.5" />
      {t('aiGenerate.quotaLeft', { remaining: quota.remaining, limit: quota.limit })}
    </span>
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
  if (settings.display_style === 'quiz') chips.push({ icon: <LayoutGrid className="w-3.5 h-3.5" />, label: t('aiGenerate.displayQuiz') })
  if (settings.scoring_mode === 'manual') chips.push({ icon: <ListChecks className="w-3.5 h-3.5" />, label: t('aiGenerate.scoringManual') })
  if (settings.theme_color) chips.push({ icon: <span className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: settings.theme_color }} />, label: settings.theme_color })
  if (settings.starts_at || settings.ends_at) chips.push({ icon: <CalendarDays className="w-3.5 h-3.5" />, label: [settings.starts_at?.slice(0, 10), settings.ends_at?.slice(0, 10)].filter(Boolean).join(' → ') })
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-gray-300">
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
    <div className="rounded-xl border border-warn/30 bg-warn-soft dark:bg-warn-soft px-4 py-3 flex gap-2.5" role="status">
      <Info className="w-4 h-4 text-warn shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink dark:text-gray-100">{t('aiGenerate.ignoredTitle')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('aiGenerate.ignoredDesc')}</p>
        <p className="text-xs font-medium text-ink dark:text-gray-200 mt-1">{items.join(' · ')}</p>
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

// datetime-local butuh "YYYY-MM-DDTHH:MM"; backend kirim ISO detik — potong menit.
const toInputDateTime = (v) => (v ? String(v).slice(0, 16) : '')

export default function AIGenerate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)

  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formType, setFormType] = useState('form')
  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState([])
  const [quota, setQuota] = useState(null)
  const [draft, setDraft] = useState(null)
  const [ignored, setIgnored] = useState([])
  const [modelUsed, setModelUsed] = useState('')
  const [generating, setGenerating] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/ai/quota').then((r) => setQuota(r.data)).catch(() => {})
  }, [])

  // Kunci scroll + cegah interaksi halaman saat overlay loading tampil.
  useEffect(() => {
    if (!generating && !accepting) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [generating, accepting])

  const questionCount = draft ? draft.sections.reduce((n, s) => n + s.questions.length, 0) : 0

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

  const pickFiles = (e) => {
    const chosen = Array.from(e.target.files || []).slice(0, MAX_FILES - files.length)
    if (chosen.length) setFiles((prev) => [...prev, ...chosen].slice(0, MAX_FILES))
    e.target.value = ''
  }

  const handleGenerate = async (e) => {
    e?.preventDefault()
    if (!stripTags(title)) { setError(t('aiGenerate.titleRequired')); return }
    if (prompt.trim().length < 10) { setError(t('aiGenerate.promptMin')); return }
    setGenerating(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('title', title)
      fd.append('description', description || '')
      fd.append('type', formType)
      fd.append('prompt', prompt)
      files.forEach((f) => fd.append('files', f))
      const res = await api.post('/ai/generate', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      })
      setDraft(res.data.draft)
      setIgnored(res.data.ignored || [])
      setModelUsed(res.data.model || '')
      setQuota((q) => (q ? { ...q, remaining: res.data.remaining, used: q.limit - res.data.remaining } : q))
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const msg = err.response?.data?.message || err.code === 'ECONNABORTED' ? t('aiGenerate.timeout') : t('aiGenerate.generateFailed')
      setError(typeof msg === 'string' ? msg : t('aiGenerate.generateFailed'))
      toast.error(err.response?.data?.message || t('aiGenerate.generateFailed'))
    } finally {
      setGenerating(false)
    }
  }

  const handleAccept = async () => {
    if (!stripTags(title)) { setError(t('aiGenerate.titleRequired')); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setAccepting(true)
    setError('')
    try {
      const s = draft.settings
      const res = await api.post('/ai/accept', {
        title,
        description: description || null,
        type: formType,
        settings: {
          ...s,
          theme_color: s.theme_color || null,
          thank_you_message: s.thank_you_message || null,
          starts_at: s.starts_at || null,
          ends_at: s.ends_at || null,
        },
        // Kunci kosong (cuma spasi) dinull-kan agar lolos min_length backend.
        sections: draft.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => ({
            ...q,
            answer_key: (q.answer_key || '').trim() || null,
          })),
        })),
      })
      toast.success(t('aiGenerate.accepted'))
      navigate(`/forms/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.message || t('aiGenerate.acceptFailed'))
      toast.error(err.response?.data?.message || t('aiGenerate.acceptFailed'))
    } finally {
      setAccepting(false)
    }
  }

  const quotaEmpty = quota && quota.remaining <= 0

  return (
    <div className="max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/forms')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('aiGenerate.back')}
      </button>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
        <PageHeader
          eyebrow={t('aiGenerate.eyebrow')}
          title={t('aiGenerate.title')}
          description={t('aiGenerate.description')}
        />
        <div className="mt-3"><QuotaPill quota={quota} /></div>

        {step === 1 ? (
          <form onSubmit={handleGenerate} className="space-y-5 mt-6">
            <Card className="space-y-5">
              <div>
                <span className="field-label">{t('aiGenerate.titleLabel')}</span>
                <RichTextEditor value={title} onChange={(html) => { setTitle(html); setError('') }} placeholder={t('aiGenerate.titlePlaceholder')} minHeight={60} />
              </div>
              <div>
                <span className="field-label">{t('aiGenerate.descLabel')}</span>
                <RichTextEditor value={description} onChange={setDescription} placeholder={t('aiGenerate.descPlaceholder')} minHeight={100} />
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
                      className={`text-left px-4 py-3.5 rounded-xl border-2 transition-all ${formType === o.value ? 'border-primary bg-primary-50 shadow-chip' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      <span className={`block text-sm font-semibold ${formType === o.value ? 'text-primary-700' : 'text-ink dark:text-gray-100'}`}>{o.label}</span>
                      <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{o.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <Textarea
                label={t('aiGenerate.promptLabel')}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setError('') }}
                placeholder={t('aiGenerate.promptPlaceholder')}
                rows={4}
              />
              <div>
                <span className="field-label">{t('aiGenerate.filesLabel')}</span>
                <input ref={fileRef} type="file" multiple accept={ACCEPT_EXT} onChange={pickFiles} className="hidden" />
                {files.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {files.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-3.5 h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-ink-800/50">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="flex-1 min-w-0 text-sm text-ink dark:text-gray-100 truncate">{f.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-incorrect transition-colors" aria-label={t('aiGenerate.removeFile')}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {files.length < MAX_FILES && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    {t('aiGenerate.filesAdd')}
                  </Button>
                )}
                <p className="field-hint mt-1">{t('aiGenerate.filesHint')}</p>
              </div>
            </Card>

            {error && <p className="field-error">{error}</p>}
            {quotaEmpty && <p className="field-error">{t('aiGenerate.quotaEmpty')}</p>}

            <Button type="submit" loading={generating} disabled={quotaEmpty} className="w-full" size="lg" icon={<Sparkles className="w-4 h-4" />}>
              {generating ? t('aiGenerate.generating') : t('aiGenerate.generate')}
            </Button>
          </form>
        ) : (
          <div className="space-y-5 mt-6">
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display font-semibold text-ink dark:text-gray-100">
                  {t('aiGenerate.previewTitle', { count: questionCount })}
                </h2>
                {modelUsed && (
                  <span className="inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400">
                    <Sparkles className="w-3 h-3" />{modelUsed}
                  </span>
                )}
              </div>
              <SettingChips settings={draft.settings} />
              <IgnoredBox items={ignored} />
              <div>
                <span className="field-label">{t('aiGenerate.titleLabel')}</span>
                <RichTextEditor value={title} onChange={setTitle} minHeight={60} />
              </div>
              <div>
                <span className="field-label">{t('aiGenerate.descLabel')}</span>
                <RichTextEditor value={description} onChange={setDescription} minHeight={80} />
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
                <SettingRow title={t('aiGenerate.leaderboard')} control={<Toggle label={t('aiGenerate.leaderboard')} checked={!!draft.settings.show_leaderboard} onChange={(v) => toggleDraft('show_leaderboard', v)} />} />
              )}
              <SettingRow title={t('aiGenerate.restricted')} control={<Toggle label={t('aiGenerate.restricted')} checked={!!draft.settings.is_restricted} onChange={(v) => toggleDraft('is_restricted', v)} />} />
              <SettingRow title={t('aiGenerate.history')} control={<Toggle label={t('aiGenerate.history')} checked={draft.settings.show_in_history !== false} onChange={(v) => toggleDraft('show_in_history', v)} />} />
              <SettingRow title={t('aiGenerate.revealScore')} control={<Toggle label={t('aiGenerate.revealScore')} checked={draft.settings.reveal_score !== false} onChange={(v) => toggleDraft('reveal_score', v)} />} />
              <SettingRow title={t('aiGenerate.revealAnswers')} control={<Toggle label={t('aiGenerate.revealAnswers')} checked={draft.settings.reveal_answers !== false} onChange={(v) => toggleDraft('reveal_answers', v)} />} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                <Select label={t('aiGenerate.displayStyle')} value={draft.settings.display_style || 'card'} onChange={(e) => toggleDraft('display_style', e.target.value)}>
                  <option value="card">{t('aiGenerate.displayCard')}</option>
                  <option value="quiz">{t('aiGenerate.displayQuiz')}</option>
                </Select>
                {formType === 'quiz' && (
                  <Select label={t('aiGenerate.scoringMode')} value={draft.settings.scoring_mode || 'auto'} onChange={(e) => toggleDraft('scoring_mode', e.target.value)}>
                    <option value="auto">{t('aiGenerate.scoringAuto')}</option>
                    <option value="manual">{t('aiGenerate.scoringManual')}</option>
                  </Select>
                )}
                <Input label={t('aiGenerate.themeColor')} value={draft.settings.theme_color || ''} onChange={(e) => toggleDraft('theme_color', e.target.value)} placeholder="#6C5CE7" helper={t('aiGenerate.themeColorHint')} />
                <div className="flex items-end gap-2">
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(draft.settings.theme_color || '') ? draft.settings.theme_color : '#6C5CE7'} onChange={(e) => toggleDraft('theme_color', e.target.value)} aria-label={t('aiGenerate.themeColor')} className="w-11 h-11 rounded-xl cursor-pointer border border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-ink-900" />
                  <div className="flex-1 min-w-0">
                    <Input label={t('aiGenerate.startsAt')} type="datetime-local" value={toInputDateTime(draft.settings.starts_at)} onChange={(e) => toggleDraft('starts_at', e.target.value || null)} />
                  </div>
                </div>
                <Input label={t('aiGenerate.endsAt')} type="datetime-local" value={toInputDateTime(draft.settings.ends_at)} onChange={(e) => toggleDraft('ends_at', e.target.value || null)} helper={t('aiGenerate.scheduleHint')} />
              </div>
              <div className="pt-3">
                <span className="field-label">{t('aiGenerate.thankYou')}</span>
                <RichTextEditor value={draft.settings.thank_you_message || ''} onChange={(html) => toggleDraft('thank_you_message', html)} minHeight={60} />
              </div>
            </Card>

            {draft.sections.map((sec, si) => (
              <Card key={si} className="space-y-3">
                <h3 className="font-display font-semibold text-ink dark:text-gray-100">{si + 1}. {sec.title}</h3>
                {sec.questions.map((q, qi) => (
                  <div key={qi} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge scheme="blue">{humanizeType(q.type)}</Badge>
                      {q.is_required && <span className="text-incorrect font-bold">*</span>}
                      {q.points > 0 && <span className="text-xs text-gray-400">{t('aiGenerate.points', { points: q.points })}</span>}
                    </div>
                    <div className="text-sm text-ink dark:text-gray-100"><RichText html={q.question_text} /></div>
                    {q.options?.length > 0 && (
                      <ul className="space-y-1">
                        {q.options.map((o, oi) => (
                          <li key={oi} className={`flex items-start gap-2 text-sm px-2.5 py-1.5 rounded-lg ${o.is_correct ? 'bg-correct-soft text-correct font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                            {o.is_correct ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <span className="w-4 h-4 shrink-0 mt-0.5 text-center leading-4 text-gray-300">·</span>}
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
                        <span className="field-label">{t('aiGenerate.answerKey')}</span>
                        <input
                          value={q.answer_key || ''}
                          onChange={(e) => patchQuestion(si, qi, { answer_key: e.target.value })}
                          placeholder={t('aiGenerate.answerKeyPlaceholder')}
                          className="input-field font-mono h-10 text-sm w-full"
                          maxLength={500}
                          spellCheck={false}
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('aiGenerate.answerKeyHint')}</p>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            ))}

            {error && <p className="field-error">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleAccept} loading={accepting} className="w-full flex-1 min-h-[56px] sm:w-auto sm:min-h-[52px]" size="lg" icon={<Check className="w-4 h-4" />}>
                {accepting ? t('aiGenerate.accepting') : t('aiGenerate.accept')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => { setStep(1); setIgnored([]); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                icon={<RefreshCw className="w-4 h-4" />}
                title={t('aiGenerate.regenerateHint')}
              >
                {t('aiGenerate.regenerate')}
              </Button>
            </div>
            <p className="field-hint text-center">{t('aiGenerate.regenerateHint')}</p>
          </div>
        )}
      </motion.div>
      <AiLoadingOverlay open={generating || accepting} mode={generating ? 'generate' : 'accept'} />
    </div>
  )
}
