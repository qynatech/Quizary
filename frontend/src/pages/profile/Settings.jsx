import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Sun, Moon, Type, Languages, Settings as SettingsIcon, LogOut, Check, KeyRound, Eye, EyeOff, ExternalLink, Trash2, Info, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, PageHeader, Button, Input } from '../../components/ui'
import { usePrefs } from '../../context/PreferencesContext'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { persistLang } from '../../lib/i18n.js'
import api from '../../api/client'
import { usePageTour } from '../../features/tour/TourContext'
import TourReplayButton from '../../features/tour/TourReplayButton'

function GeminiHelpModal({ show, onClose }) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            className="bg-white dark:bg-ink-900 border dark:border-ink-800 rounded-2xl w-full max-w-lg shadow-lift max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b dark:border-ink-800">
              <h3 className="font-display font-semibold text-ink dark:text-gray-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" /> {t('settings.geminiKeyHelpTitle')}
              </h3>
              <button onClick={onClose} className="w-8 h-8 rounded-xl grid place-items-center hover:bg-gray-100 dark:hover:bg-ink-800 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('settings.geminiKeyHelpDesc')}</p>
              <ol className="space-y-3">
                {[1,2,3,4,5].map((n) => (
                  <li key={n} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0 mt-0.5">{n}</span>
                    <p className="text-sm text-ink dark:text-gray-200 pt-1">{t(`settings.geminiKeyHelpStep${n}`)}</p>
                  </li>
                ))}
              </ol>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{t('settings.geminiKeyHelpWarning')}</p>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-3 justify-end">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-600">
                {t('settings.geminiKeyHelpOpen')} <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-medium bg-gray-100 dark:bg-ink-800 hover:bg-gray-200 dark:hover:bg-ink-700">{t('common.close')}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ChoiceCard({ active, onClick, icon, label, sublabel, flag }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-4 sm:p-5 text-center transition-all duration-150 active:scale-[0.98] ${
        active
          ? 'border-primary bg-primary-50 dark:bg-primary-900/20 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-ink-700/50'
      }`}
    >
      {active && (
        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-primary text-white grid place-items-center shadow-sm">
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
      {flag ? (
        <span className="text-[26px] leading-none" aria-hidden="true">
          {flag}
        </span>
      ) : (
        <span className={`leading-none ${active ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}`}>{icon}</span>
      )}
      <span
        className={`text-xs sm:text-sm font-semibold leading-none ${active ? 'text-primary dark:text-primary-300' : 'text-ink dark:text-gray-100'}`}
      >
        {label}
      </span>
      {sublabel && (
        <span className="text-[11px] leading-none text-gray-400 dark:text-gray-500">{sublabel}</span>
      )}
    </button>
  )
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { theme, fontSize, setPref } = usePrefs()
  const toast = useToast()
  const { logout } = useAuth()
  const navigate = useNavigate()

  const sizeMap = { sm: 0, md: 1, lg: 2 }
  const sizeArr = ['sm', 'md', 'lg']
  const [sliderVal, setSliderVal] = useState(() => sizeMap[fontSize] ?? 1)
  const debounceRef = useRef(null)

  // Gemini BYOK
  const [keyStatus, setKeyStatus] = useState(null)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    setSliderVal(sizeMap[fontSize] ?? 1)
  }, [fontSize])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  useEffect(() => {
    api.get('/me/gemini-key/status').then((r) => setKeyStatus(r.data)).catch(() => setKeyStatus({ connected: false, masked: null }))
  }, [])

  const handleSliderChange = (e) => {
    const v = Number(e.target.value)
    setSliderVal(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPref('fontSize', sizeArr[v] ?? 'md'), 300)
  }

  const handleSliderCommit = () => {
    clearTimeout(debounceRef.current)
    setPref('fontSize', sizeArr[sliderVal] ?? 'md')
  }

  const changeLang = (lng) => {
    i18n.changeLanguage(lng)
    persistLang(lng)
    toast.success(t('settings.languageChanged'))
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const parseErrors = (data) => {
    if (Array.isArray(data?.errors) && data.errors.length) {
      const first = data.errors[0]
      return Object.values(first)[0] || ''
    }
    return ''
  }
  const handleSaveKey = async () => {
    const v = keyInput.trim()
    if (!v) { setKeyError(t('settings.geminiKeyEmpty')); return }
    setSavingKey(true)
    setKeyError('')
    try {
      await api.put('/me/gemini-key', { key: v })
      setKeyInput('')
      setShowKey(false)
      const r = await api.get('/me/gemini-key/status')
      setKeyStatus(r.data)
      toast.success(t('settings.geminiKeySaved'))
    } catch (e) {
      const data = e?.response?.data
      const msg = parseErrors(data) || (data?.message !== 'Invalid fields' ? data?.message : '') || data?.detail || t('settings.geminiKeyInvalid')
      setKeyError(msg)
      toast.error(msg)
    } finally {
      setSavingKey(false)
    }
  }

  const handleDeleteKey = async () => {
    if (!confirm(t('settings.geminiKeyDeleteConfirm'))) return
    try {
      await api.delete('/me/gemini-key')
      setKeyStatus({ connected: false, masked: null })
      setKeyInput('')
      toast.success(t('settings.geminiKeyDeleted'))
    } catch (e) {
      const data = e?.response?.data
      const msg = parseErrors(data) || (data?.message !== 'Invalid fields' ? data?.message : '') || data?.detail || t('settings.geminiKeyInvalid')
      toast.error(msg)
    }
  }

  const tourVariant = keyStatus?.connected ? 'gemini-connected' : 'gemini-unconnected'
  const tourSteps = [
    { target: '[data-tour="settings-header"]', title: 'Personalize Quizary', content: 'These settings apply to your account and stay on this device when appropriate.', placement: 'bottom' },
    { target: '[data-tour="settings-appearance"]', title: 'Comfortable appearance', content: 'Choose light, dark, or system theme, then adjust the text size for your reading comfort.', placement: 'right' },
    { target: '[data-tour="settings-language"]', title: 'Choose your language', content: 'Switch between Indonesian and English without leaving the workspace.', placement: 'right' },
    { target: '[data-tour="settings-gemini"]', title: t('settings.geminiKeyTitle'), content: 'Add your own Gemini key to unlock AI-assisted draft generation. The key stays managed by your account.', placement: 'top' },
    { target: '[data-tour="settings-tour"]', title: 'Replay this page tour', content: 'Use this control when you want to revisit the Settings walkthrough without leaving the page.', placement: 'top' },
  ]
  usePageTour('settings', { variant: tourVariant, variantKey: tourVariant, steps: tourSteps })

  return (
    <div>
      <div data-tour="settings-header">
        <PageHeader
          eyebrow={t('settings.eyebrow')}
          title={t('settings.title')}
          description={t('settings.description')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
         <Card data-tour="settings-appearance" className="p-5">
           <h2 className="font-display font-semibold text-ink dark:text-gray-100 flex items-center gap-2">
             <SettingsIcon className="w-4 h-4 text-primary" />

            {t('settings.appearance')}
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('settings.appearanceDesc')}</p>

          <div className="mt-5">
            <p className="text-sm font-semibold text-ink dark:text-gray-100 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-gray-400" />
              {t('settings.theme')}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3">
              <ChoiceCard
                active={theme === 'light'}
                onClick={() => setPref('theme', 'light')}
                icon={<Sun className="w-4 h-4" />}
                label={t('settings.light')}
              />
              <ChoiceCard
                active={theme === 'dark'}
                onClick={() => setPref('theme', 'dark')}
                icon={<Moon className="w-4 h-4" />}
                label={t('settings.dark')}
              />
              <ChoiceCard
                active={theme === 'system'}
                onClick={() => setPref('theme', 'system')}
                icon={<Monitor className="w-4 h-4" />}
                label={t('settings.system')}
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-ink dark:text-gray-100 flex items-center gap-2">
              <Type className="w-4 h-4 text-gray-400" />
              {t('settings.fontSize')}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <span
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400 grid place-items-center shrink-0"
                aria-hidden="true"
              >
                <span className="font-display font-bold text-[11px] leading-none tracking-tight">Tt</span>
              </span>
              <div className="flex-1 min-w-0">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={sliderVal}
                  onChange={handleSliderChange}
                  onPointerUp={handleSliderCommit}
                  onTouchEnd={handleSliderCommit}
                  onKeyUp={handleSliderCommit}
                  aria-label={t('settings.fontSize')}
                  className="w-full h-2 bg-gray-200 dark:bg-ink-700 rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between mt-1.5 px-0.5">
                  {[
                    { key: 'sm', label: t('settings.small') },
                    { key: 'md', label: t('settings.normal') },
                    { key: 'lg', label: t('settings.large') },
                  ].map((o) => (
                    <span
                      key={o.key}
                      className={`text-[11px] leading-none ${sizeArr[sliderVal] === o.key ? 'text-primary font-semibold' : 'text-gray-400 dark:text-gray-500'}`}
                    >
                      {o.label}
                    </span>
                  ))}
                </div>
              </div>
              <span
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400 grid place-items-center shrink-0"
                aria-hidden="true"
              >
                <span className="font-display font-bold text-[16px] leading-none tracking-tight">Tt</span>
              </span>
            </div>
          </div>
        </Card>

         <Card data-tour="settings-language" className="p-5">
           <h2 className="font-display font-semibold text-ink dark:text-gray-100 flex items-center gap-2">
             <Languages className="w-4 h-4 text-primary" />

            {t('settings.languageRegion')}
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('settings.languageDesc')}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <ChoiceCard
              active={!(i18n.language?.startsWith('en'))}
              onClick={() => changeLang('id')}
              flag="🇮🇩"
              label="Indonesia"
              sublabel="Bahasa Indonesia"
            />
            <ChoiceCard
              active={i18n.language?.startsWith('en')}
              onClick={() => changeLang('en')}
              flag="🇬🇧"
              label="English"
              sublabel="English"
            />
          </div>
        </Card>
      </div>

      <div className="mt-4">
         <Card data-tour="settings-gemini" className="p-5">
           <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-ink dark:text-gray-100 flex items-center gap-2">

             <KeyRound className="w-4 h-4 text-primary" />

              {t('settings.geminiKeyTitle')}
            </h2>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label={t('settings.geminiKeyHelpTitle')}
              className="w-7 h-7 rounded-full bg-gray-100 dark:bg-ink-800 grid place-items-center text-gray-500 hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('settings.geminiKeyDesc')}</p>
          <p className="text-xs mt-2 flex items-center gap-1.5">
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              {t('settings.geminiKeyHelpLink')} <ExternalLink className="w-3 h-3" />
            </a>
          </p>

          {keyStatus && (
            <div className="mt-3">
              {keyStatus.connected ? (
                <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300">
                  <Check className="w-3.5 h-3.5" /> {t('settings.geminiKeyConnected')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
                  <KeyRound className="w-3.5 h-3.5" /> {t('settings.geminiKeyNotConnected')}
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setKeyError('') }}
                placeholder={t('settings.geminiKeyPlaceholder')}
                className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-800 px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-ink-700 text-gray-400">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={handleSaveKey} disabled={savingKey || !keyInput.trim()}>{savingKey ? t('common.loading') : t('common.save')}</Button>
          </div>
          {keyError && <p className="field-error mt-2">{keyError}</p>}
          {keyStatus?.connected && (
            <button type="button" onClick={handleDeleteKey} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-incorrect hover:underline">
              <Trash2 className="w-3.5 h-3.5" /> {t('settings.geminiKeyDelete')}
            </button>
          )}
        </Card>
      </div>

       <div className="mt-4">
         <Card data-tour="settings-tour" className="p-5">
           <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
             <div className="min-w-0">
               <h2 className="font-display font-semibold text-ink dark:text-gray-100">Product tour</h2>
               <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                 Replay the guided tour for Settings whenever you need a refresher.
               </p>
             </div>
             <TourReplayButton page="settings" variant={tourVariant} className="w-full sm:w-auto" />
           </div>
         </Card>
       </div>

       <div className="mt-6 lg:hidden">

         <Card data-tour="settings-logout" className="p-5">
           <Button

            variant="ghost-danger"
            className="w-full"
            icon={<LogOut className="w-4 h-4" />}
            onClick={handleLogout}
          >
            {t('auth.logout')}
          </Button>
        </Card>
      </div>
      <GeminiHelpModal show={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  )
}
