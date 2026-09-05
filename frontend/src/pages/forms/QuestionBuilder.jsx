import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, GripVertical, Upload, ArrowLeft, Check, HelpCircle, Trash2, Image as ImageIcon, X, Layers, Download, TextQuote, Unlink, ChevronDown, ChevronUp, Pencil, Copy } from 'lucide-react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, closestCenter, useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { useTranslation } from 'react-i18next'
import { useHoldSelect } from '../../hooks/useHoldSelect'
import { isAudioUrl } from '../../lib/media'
import { Button, Input, Select, Toggle, Card, Badge, ConfirmModal, PageHeader, FormSubNav, EmptyState, CardSkeleton, RichTextEditor, RichText } from '../../components/ui'
import SectionManager from '../../components/ui/SectionManager'

const TYPE_LABELS = {
  multiple_choice: 'Multiple Choice',
  checkbox: 'Checkbox',
  dropdown: 'Dropdown',
  short_answer: 'Short Answer',
  essay: 'Essay',
  password: 'Password',
  date: 'Date',
  time: 'Time',
  datetime: 'Datetime',
  file_upload: 'File Upload',
}

const TYPE_OPTIONS = ['multiple_choice', 'checkbox', 'dropdown', 'short_answer', 'essay', 'password', 'date', 'time', 'datetime', 'file_upload']
const OPTION_TYPES = ['multiple_choice', 'checkbox', 'dropdown']
const CORRECT_OPTION_TYPES = ['multiple_choice', 'checkbox']
const NO_GRADE_TYPES = ['essay', 'short_answer', 'date', 'time', 'datetime', 'file_upload', 'dropdown']

const TYPE_HINTS = {
  dropdown: 'Respondent selects one answer from a dropdown list (no correct answer).',
  date: 'Respondent selects a date (YYYY-MM-DD).',
  time: 'Respondent selects a time (HH:MM).',
  datetime: 'Respondent selects date and time (YYYY-MM-DD HH:MM).',
  file_upload: 'Respondent uploads a file (pdf, doc, xls, ppt, txt, csv, image, zip).',
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function QuestionForm({ initial, onSave, onCancel, loading, isQuiz, errors, questionId, sections, sectionsAllowed, scoringMode, poolCount = 0 }) {
  const toast = useToast()
  const { t } = useTranslation()
  const typeLabels = {
    multiple_choice: t('questionBuilder.typeMultipleChoice'),
    checkbox: t('questionBuilder.typeCheckbox'),
    dropdown: t('questionBuilder.typeDropdown'),
    short_answer: t('questionBuilder.typeShortAnswer'),
    essay: t('questionBuilder.typeEssay'),
    password: t('questionBuilder.typePassword'),
    date: t('questionBuilder.typeDate'),
    time: t('questionBuilder.typeTime'),
    datetime: t('questionBuilder.typeDatetime'),
    file_upload: t('questionBuilder.typeFileUpload'),
  }
  const typeHints = {
    dropdown: t('questionBuilder.hintDropdown'),
    date: t('questionBuilder.hintDate'),
    time: t('questionBuilder.hintTime'),
    datetime: t('questionBuilder.hintDatetime'),
    file_upload: t('questionBuilder.hintFileUpload'),
  }
  // Satu-satunya section = default tujuan soal baru; select section tak perlu tampil.
  const singleSectionId = sectionsAllowed && sections?.length === 1 ? sections[0].id : null
  const [form, setForm] = useState({
    question_text: '',
    type: 'essay',
    points: 1,
    is_scored: true,
    is_required: true,
    options: [],
    password_keyword: '',
    answer_key: '',
    allow_other: false,
    ...(initial || {}),
    section_id: initial?.section_id || singleSectionId,
  })
  const isEditing = !!initial
  const ferr = (name) => errors?.[name]
  const optionsErr = Object.keys(errors || {}).some((k) => k.startsWith('options'))
  const optionsMsg = Object.values(errors || {}).find((v, i) => Object.keys(errors)[i]?.startsWith('options'))

  const optionFileRefs = useRef([])
  const [imgLoading, setImgLoading] = useState(null)

  const MAX_Q_MEDIA = 10 * 1024 * 1024
  const fmtMB = (b) => (b / (1024 * 1024)).toFixed(1)

  const uploadOptionImage = async (opt, i) => {
    const file = optionFileRefs.current[i]?.files?.[0]
    if (!file) return
    if (file.size > MAX_Q_MEDIA) {
      toast.error(t('questionBuilder.fileTooLarge', { size: fmtMB(file.size) }))
      if (optionFileRefs.current[i]) optionFileRefs.current[i].value = ''
      return
    }
    // ponytail: new question/option has no ID — queue file, upload after create
    if (!opt.id || !questionId) {
      const preview = URL.createObjectURL(file)
      setForm((prev) => ({
        ...prev,
        options: prev.options.map((o, idx) => (idx !== i ? o : { ...o, image: { path: preview }, _pendingFile: file })),
      }))
      if (optionFileRefs.current[i]) optionFileRefs.current[i].value = ''
      toast.success(t('questionBuilder.optionMediaQueued'))
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    setImgLoading(`opt-${i}`)
    try {
      const res = await api.post(`/questions/${questionId}/option/${opt.id}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Option image uploaded')
      setForm((prev) => ({
        ...prev,
        options: prev.options.map((o, idx) => (idx !== i ? o : { ...o, image: { path: res.data.image.path } })),
      }))
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to upload')
    } finally {
      setImgLoading(null)
      if (optionFileRefs.current[i]) optionFileRefs.current[i].value = ''
    }
  }

  const questionFileRef = useRef(null)
  const [qImgLoading, setQImgLoading] = useState(false)

  const handleQuestionFileChange = async () => {
    const file = questionFileRef.current?.files?.[0]
    if (!file) return
    if (file.size > MAX_Q_MEDIA) {
      toast.error(t('questionBuilder.fileTooLarge', { size: fmtMB(file.size) }))
      if (questionFileRef.current) questionFileRef.current.value = ''
      return
    }
    // ponytail: new question has no ID yet — queue file, upload after create
    if (!questionId) {
      const preview = URL.createObjectURL(file)
      setForm((prev) => ({ ...prev, image: { path: preview }, _pendingFile: file }))
      if (questionFileRef.current) questionFileRef.current.value = ''
      toast.success(t('questionBuilder.optionMediaQueued'))
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    setQImgLoading(true)
    try {
      const res = await api.post(`/questions/${questionId}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Media uploaded')
      setForm((prev) => ({ ...prev, image: { path: res.data.image.path } }))
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to upload')
    } finally {
      setQImgLoading(false)
      if (questionFileRef.current) questionFileRef.current.value = ''
    }
  }

  const uploadQuestionImage = handleQuestionFileChange

  const handleRemoveQuestionImage = async () => {
    if (!form.image) return
    // pending (belum disimpan) → hapus lokal saja
    if (form._pendingFile) {
      setForm((prev) => ({ ...prev, image: null, _pendingFile: null }))
      return
    }
    if (!questionId) {
      setForm((prev) => ({ ...prev, image: null }))
      return
    }
    try {
      await api.delete(`/questions/${questionId}/image`)
      setForm((prev) => ({ ...prev, image: null }))
      toast.success('Gambar soal dihapus')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghapus gambar')
    }
  }

  const handleRemoveOptionImage = async (i) => {
    const opt = form.options[i]
    if (!opt?.image) return
    if (opt._pendingFile) {
      setForm((prev) => ({
        ...prev,
        options: prev.options.map((o, idx) => idx === i ? { ...o, image: null, _pendingFile: null } : o),
      }))
      return
    }
    if (!opt.id || !questionId) {
      setForm((prev) => ({
        ...prev,
        options: prev.options.map((o, idx) => idx === i ? { ...o, image: null } : o),
      }))
      return
    }
    try {
      await api.delete(`/questions/${questionId}/option/${opt.id}/image`)
      setForm((prev) => ({
        ...prev,
        options: prev.options.map((o, idx) => idx === i ? { ...o, image: null } : o),
      }))
      toast.success('Gambar opsi dihapus')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghapus gambar')
    }
  }

  const handleTypeChange = (type) => {
    setForm((prev) => ({
      ...prev,
      type,
      points: NO_GRADE_TYPES.includes(type) ? 0 : prev.points,
      options: OPTION_TYPES.includes(type)
        ? (prev.options.length ? prev.options : [{ option_text: '', is_correct: false }])
        : [],
    }))
  }

  const addOption = () => {
    setForm((prev) => ({ ...prev, options: [...prev.options, { option_text: '', is_correct: false }] }))
  }

  const removeOption = (i) => {
    setForm((prev) => ({ ...prev, options: prev.options.filter((_, idx) => idx !== i) }))
  }

  const setOption = (i, field, value) => {
    setForm((prev) => {
      if (field === 'is_correct' && prev.type === 'multiple_choice') {
        return { ...prev, options: prev.options.map((o, idx) => ({ ...o, is_correct: idx === i && value })) }
      }
      const opts = prev.options.map((o, idx) => (idx !== i ? o : { ...o, [field]: value }))
      return { ...prev, options: opts }
    })
  }

  const textOnly = (html) => (html || '').replace(/<[^>]*>/g, '').trim()
  const isPassword = form.type === 'password'
  const canSave = !!textOnly(form.question_text) && (!isPassword || !!form.password_keyword?.trim())
  const needsOptions = OPTION_TYPES.includes(form.type)
  // Essay/short_answer bisa dinilai bila punya answer_key (khusus quiz) —
  // tanpa kunci, perlakuannya sama seperti tipe non-graded lainnya.
  const isKeywordType = form.type === 'essay' || form.type === 'short_answer'
  const hasAnswerKey = !!(form.answer_key || '').trim()
  const noGrade = NO_GRADE_TYPES.includes(form.type) && !(isKeywordType && hasAnswerKey)
  const hasCorrect = form.options.some((o) => o.is_correct)
  // Proyeksi eksak jatah soal baru di pool auto-100: backend menaruh soal baru
  // paling akhir lalu membagi rata (sisa ke urutan awal) — tiru rumusnya persis
  // agar preview tambah-soal sama dengan hasil tersimpan (bukan default 1/0).
  const projectedAutoPoints = (() => {
    const total = (poolCount || 0) + 1
    const base = Math.floor(100 / total)
    return base + (((total - 1) < (100 % total)) ? 1 : 0)
  })()

  return (
    <div className="space-y-5">
      <Select label={t('questionBuilder.questionType')} value={form.type} onChange={(e) => handleTypeChange(e.target.value)} error={ferr('type')}>
        {TYPE_OPTIONS.map((optType) => <option key={optType} value={optType}>{typeLabels[optType]}</option>)}
      </Select>
      {typeHints[form.type] && (
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-3">{typeHints[form.type]}</p>
      )}

      {isPassword && (
        <div>
          <label className="field-label">{t('questionBuilder.passwordKey')}</label>
          <input
            value={form.password_keyword || ''}
            onChange={(e) => setForm((p) => ({ ...p, password_keyword: e.target.value }))}
            placeholder={t('questionBuilder.passwordPlaceholder')}
            className={`input-field font-mono ${ferr('password_keyword') ? 'border-incorrect focus:border-incorrect' : ''}`}
            maxLength={255}
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('questionBuilder.passwordHint')}</p>
          {ferr('password_keyword') && <p className="field-error">{ferr('password_keyword')}</p>}
        </div>
      )}

      {isQuiz && isKeywordType && (
        <div>
          <label className="field-label">{t('questionBuilder.answerKey')}</label>
          <input
            value={form.answer_key || ''}
            onChange={(e) => {
              const v = e.target.value
              setForm((p) => (v.trim()
                ? { ...p, answer_key: v }
                : { ...p, answer_key: v, is_scored: false, points: 0 }))
            }}
            placeholder={t('questionBuilder.answerKeyPlaceholder')}
            className={`input-field font-mono ${ferr('answer_key') ? 'border-incorrect focus:border-incorrect' : ''}`}
            maxLength={500}
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('questionBuilder.answerKeyHint')}</p>
          {ferr('answer_key') && <p className="field-error">{ferr('answer_key')}</p>}
        </div>
      )}

      {sectionsAllowed && sections?.length > 1 && (
        <div>
          <label className="field-label">{t('questionBuilder.sectionLabel')}</label>
          <Select
            value={form.section_id || ''}
            onChange={(e) => setForm((p) => ({ ...p, section_id: e.target.value ? parseInt(e.target.value) : null }))}
          >
            <option value="">{t('questionBuilder.noSection')}</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </div>
      )}

      <div>
        <label className="field-label">{t('questionBuilder.questionLabel')}</label>
        <RichTextEditor
          value={form.question_text}
          onChange={(html) => setForm((p) => ({ ...p, question_text: html }))}
          placeholder={t('questionBuilder.questionPlaceholder')}
        />
        {ferr('question_text') && <p className="field-error">{ferr('question_text')}</p>}
      </div>

      <div className="space-y-3">
  <input
    ref={questionFileRef}
    type="file"
    accept="image/*,audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm"
    className="hidden"
    onChange={handleQuestionFileChange}
  />
  {form.image?.path ? (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-ink-800/50">
      {(form._pendingFile?.type?.startsWith('audio/') || isAudioUrl(form.image.path)) ? (
        <audio controls src={form.image.path} preload="metadata" className="w-full p-3" />
      ) : (
        <img src={form.image.path} alt="" className="w-full max-h-72 object-contain bg-white dark:bg-ink-900" />
      )}
      <button
        type="button"
        onClick={handleRemoveQuestionImage}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-ink/70 hover:bg-incorrect text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        aria-label={t('questionBuilder.removeImage')}
        title={t('questionBuilder.removeImage')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); questionFileRef.current?.click() }}
        disabled={qImgLoading}
        title="Upload image or audio (mp3)"
        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-primary hover:border-primary hover:bg-primary-50/50 dark:hover:bg-primary-900/20 transition-colors"
      >
        {qImgLoading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <ImageIcon className="w-4 h-4" />
        )}
        {qImgLoading ? t('questionBuilder.uploading') : t('questionBuilder.addMedia')}
      </button>
    </div>
  )}
</div>

      <div className="flex items-end gap-4">
        {isQuiz && !noGrade && (
          <div className="flex-1">
            {isEditing ? (
              <Input
                label={t('questionBuilder.points')}
                type="number"
                value={form.points}
                onChange={(e) => setForm((p) => ({ ...p, points: parseInt(e.target.value) || 0 }))}
                min={0}
                max={999}
                disabled={!form.is_scored || scoringMode === 'auto'}
                error={ferr('points')}
              />
            ) : (
              <div>
                <label className="field-label">{t('questionBuilder.points')}</label>
                <p className="text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-ink-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 h-11 flex items-center">
                  {scoringMode === 'auto' ? t('questionBuilder.pointsAuto', { points: projectedAutoPoints }) : t('questionBuilder.pointsAuto', { points: form.points })}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2.5 h-11 pb-[1px]">
          {isQuiz && isEditing && !noGrade && (
            <>
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('questionBuilder.countPoints')}</span>
              <Toggle
                label={t('questionBuilder.countPoints')}
                checked={form.is_scored}
                onChange={(v) => setForm((p) => ({ ...p, is_scored: v, points: v ? p.points : 0 }))}
              />
            </>
          )}
          <span className="text-sm text-gray-600 dark:text-gray-400">{t('questionBuilder.required')}</span>
          <Toggle label={t('questionBuilder.required')} checked={form.is_required} onChange={(v) => setForm((p) => ({ ...p, is_required: v }))} />
        </div>
      </div>

      {needsOptions && (
        <div className={`${optionsErr ? 'border border-incorrect rounded-xl p-3' : ''}`}>
          <div className="flex items-center justify-between mb-2.5">
            <label className="field-label !mb-0">
              {t('questionBuilder.answerOptions')}
            </label>
            <button type="button" onClick={addOption} className="text-sm font-medium text-primary hover:underline">
              {t('questionBuilder.addOption')}
            </button>
          </div>
          <div className="space-y-3">
            {form.options.map((opt, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-ink-800/30"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    {form.type === 'dropdown' ? (
                      <span className="w-7 h-7 rounded-lg bg-white dark:bg-ink-900 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center text-xs font-bold shrink-0 mt-1">{i + 1}</span>
                    ) : form.type === 'checkbox' ? (
                      <button
                        type="button"
                        onClick={() => setOption(i, 'is_correct', !opt.is_correct)}
                        aria-label={opt.is_correct ? 'Remove correct answer mark' : 'Mark as correct answer'}
                        title={opt.is_correct ? 'Remove correct answer mark' : 'Mark as correct answer'}
                        className="shrink-0 rounded-lg transition-transform hover:scale-105 active:scale-95 mt-1"
                      >
                        <span className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-colors ${opt.is_correct ? 'border-correct bg-correct text-white' : 'border-gray-300 bg-white dark:bg-ink-900 text-transparent hover:border-primary/60'
                          }`}>
                          {opt.is_correct && <Check className="w-4 h-4" strokeWidth={3.5} />}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOption(i, 'is_correct', !opt.is_correct)}
                        aria-label={opt.is_correct ? 'Remove correct answer mark' : 'Mark as correct answer'}
                        title={opt.is_correct ? 'Remove correct answer mark' : 'Mark as correct answer'}
                        className="shrink-0 transition-transform hover:scale-105 active:scale-95 mt-1"
                      >
                        <span className={`bubble ${opt.is_correct ? 'bubble-correct' : 'bubble-empty'}`}>
                          {opt.is_correct ? <Check className="w-3.5 h-3.5" /> : LETTERS[i % LETTERS.length]}
                        </span>
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <RichTextEditor
                        value={opt.option_text}
                        onChange={(html) => setOption(i, 'option_text', html)}
                        placeholder={t('questionBuilder.optionPlaceholder', { letter: LETTERS[i % LETTERS.length] })}
                        compact
                        minHeight={48}
                      />
                    </div>
                    {form.options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="shrink-0 mt-1 w-8 h-8 rounded-lg text-gray-400 dark:text-gray-500 hover:text-incorrect hover:bg-incorrect-soft border border-transparent hover:border-incorrect/20 transition-colors text-lg leading-none flex items-center justify-center"
                        aria-label="Remove option"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-9">
                    <input
                      ref={(el) => (optionFileRefs.current[i] = el)}
                      type="file"
                      accept="image/*,audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm"
                      className="hidden"
                      onChange={() => uploadOptionImage(opt, i)}
                    />
                    {!opt.image?.path && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          optionFileRefs.current[i]?.click()
                        }}
                        disabled={!!imgLoading}
                        title={opt.id ? 'Upload option image/audio' : 'Pilih gambar/audio — akan diupload setelah disimpan'}
                        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-primary hover:border-primary/40 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      >
                        {imgLoading === `opt-${i}` ? (
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5" />
                        )}
                        {t('questionBuilder.addImageAudio')}
                      </button>
                    )}
                  </div>
                  {opt.image?.path && (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900">
                      {(opt._pendingFile?.type?.startsWith('audio/') || isAudioUrl(opt.image.path)) ? (
                        <audio controls src={opt.image.path} preload="metadata" className="w-full p-3" />
                      ) : (
                        <img src={opt.image.path} alt="" className="w-full max-h-64 object-contain" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveOptionImage(i)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-ink/70 hover:bg-incorrect text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                        aria-label="Remove option image"
                        title={t('questionBuilder.removeImage')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {form.allow_other && (form.type === 'multiple_choice' || form.type === 'checkbox') && (
              <motion.div
                key="other-option"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-start gap-2 p-3 rounded-xl border border-dashed border-primary/40 bg-primary-50/40 dark:bg-primary-900/10"
              >
                {form.type === 'checkbox' ? (
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg border-2 border-primary/40 bg-white dark:bg-ink-900 shrink-0 mt-1">
                    <span className="text-xs font-medium text-primary">+</span>
                  </span>
                ) : (
                  <span className="bubble bubble-empty shrink-0 mt-1">
                    <span className="text-xs font-medium text-primary">+</span>
                  </span>
                )}
                  <p className="text-sm font-medium text-primary dark:text-primary-300">{t('questionBuilder.otherBadge')}</p>
              </motion.div>
            )}
          </div>
          {needsOptions && form.options.length > 0 && !hasCorrect && isQuiz && form.is_scored && CORRECT_OPTION_TYPES.includes(form.type) && (
            <p className="text-xs text-warn mt-2">{t('questionBuilder.markCorrectWarning')}</p>
          )}
          {(form.type === 'multiple_choice' || form.type === 'checkbox') && (
            <div className="flex items-center gap-2.5 mt-3">
              <Toggle
                label={t('questionBuilder.allowOther')}
                checked={!!form.allow_other}
                onChange={(v) => setForm((p) => ({ ...p, allow_other: v }))}
              />
              <div className="min-w-0">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('questionBuilder.allowOther')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('questionBuilder.allowOtherHint')}</p>
              </div>
            </div>
          )}
          {optionsErr && optionsMsg && (
            <p className="text-xs font-medium text-incorrect mt-2">{optionsMsg}</p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button onClick={() => onSave({ ...form, options: form.options })} disabled={!canSave || loading} loading={loading} className="flex-1" size="md">
          {loading ? t('questionBuilder.save') : t('questionBuilder.save')}
        </Button>
        <Button onClick={onCancel} variant="secondary" size="md">{t('questionBuilder.cancel')}</Button>
      </div>
    </div>
  )
}

function QuestionCard({ question, index, onDelete, onDuplicate, duplicating, isDragging, isQuiz, selected, onToggleSelect, groupId, groupIndex, _groupSize, moveButtons }) {
  const { t } = useTranslation()
  const typeLabels = {
    multiple_choice: t('questionBuilder.typeMultipleChoice'),
    checkbox: t('questionBuilder.typeCheckbox'),
    dropdown: t('questionBuilder.typeDropdown'),
    short_answer: t('questionBuilder.typeShortAnswer'),
    essay: t('questionBuilder.typeEssay'),
    password: t('questionBuilder.typePassword'),
    date: t('questionBuilder.typeDate'),
    time: t('questionBuilder.typeTime'),
    datetime: t('questionBuilder.typeDatetime'),
    file_upload: t('questionBuilder.typeFileUpload'),
  }
  return (
    <Card className={`transition-all ${isDragging ? 'shadow-lift border-primary/40 opacity-60' : selected ? '!border-primary ring-2 ring-primary/30 bg-primary-50/40 dark:bg-primary-900/15' : 'hover:border-gray-300 dark:hover:border-gray-700'} ${groupId ? 'border-l-4 !border-l-primary/50' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile: checkbox tersembunyi → bubble nomor jadi indikator seleksi */}
          <span
            className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-primary' : 'bg-ink dark:bg-ink-800'}`}
            aria-hidden={selected}
          >
            {selected ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : index + 1}
          </span>
          <Badge scheme="gray">{typeLabels[question.type]}</Badge>
          {groupId && (
            <Badge scheme="primary" title="Story group questions always appear in sequence even with shuffle active. Select question(s) then click Ungroup to remove.">
              <span className="hidden sm:inline">{t('questionBuilder.groupLabel', { n: groupIndex })}</span>
              <span className="sm:hidden">G{groupIndex}</span>
            </Badge>
          )}
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          {moveButtons}
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate?.(question) }}
            disabled={duplicating}
            className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-primary px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-wait"
            title={t('questionBuilder.duplicateTitle')}
            aria-label={t('questionBuilder.duplicateTitle')}
          >
            <Copy className={`w-3.5 h-3.5 ${duplicating ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(question) }}
            className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-incorrect px-2 py-1 transition-colors"
            title="Delete question"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(question.id)}
            onClick={(e) => e.stopPropagation()}
            className="hidden md:block w-4 h-4 rounded accent-primary cursor-pointer"
            aria-label={`Select question ${index + 1}`}
          />
        </div>
      </div>

      <div className="mb-3 flex items-start gap-1">
        <RichText html={question.question_text} className="rich-text block text-[15px] font-medium text-ink dark:text-gray-100" />
        {question.is_required !== false && (
          <span className="text-incorrect text-lg font-bold leading-none mt-0.5 shrink-0" title={t('questionBuilder.required')}>*</span>
        )}
      </div>
      {question.image && (isAudioUrl(question.image.path) ? (
        <audio controls src={question.image.path} preload="metadata" className="w-full max-w-sm mb-3" />
      ) : (
        <img src={question.image.path} alt="" className="mb-3 max-h-32 rounded-xl object-cover" />
      ))}
      {question.options?.length > 0 && (
        <div className="space-y-1.5">
          {question.options.map((opt, i) => (
            <div key={opt.id} className="flex items-center gap-2.5">
              {question.type === 'dropdown' ? (
                <span className="w-6 h-6 rounded-md bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
              ) : question.type === 'checkbox' ? (
                <span className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 ${opt.is_correct ? 'border-correct bg-correct text-white' : 'border-gray-300 text-transparent'}`}>
                  {opt.is_correct && <Check className="w-3 h-3" strokeWidth={3.5} />}
                </span>
              ) : (
                <span className={`bubble w-6 h-6 text-xs ${opt.is_correct ? 'bubble-correct' : 'bubble-empty'}`}>
                  {opt.is_correct ? <Check className="w-3 h-3" /> : LETTERS[i % LETTERS.length]}
                </span>
              )}
              <span className={`text-sm ${opt.is_correct && question.type !== 'dropdown' ? 'text-correct font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                <RichText html={opt.option_text} className="rich-text" />
              </span>
              {opt.image?.path && (
                isAudioUrl(opt.image.path) ? (
                  <audio controls src={opt.image.path} preload="metadata" className="w-24 h-7 rounded shrink-0" />
                ) : (
                  <img src={opt.image.path} alt="" className="w-6 h-6 object-cover rounded shrink-0" />
                )
              )}
            </div>
          ))}
          {question.allow_other && (
            <div key="other-option" className="flex items-center gap-2.5">
              {question.type === 'dropdown' ? (
                <span className="w-6 h-6 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary dark:text-primary-300 flex items-center justify-center text-[10px] font-bold shrink-0">{question.options.length + 1}</span>
              ) : question.type === 'checkbox' ? (
                <span className="flex items-center justify-center w-6 h-6 rounded-md border-2 border-primary/40 bg-primary-50 dark:bg-primary-900/20 shrink-0">
                  <span className="text-xs font-medium text-primary">+</span>
                </span>
              ) : (
                <span className={`bubble w-6 h-6 text-xs`} style={{ background: 'var(--primary-100)', color: 'var(--primary-600)' }}>
                  <span className="text-xs font-medium">+</span>
                </span>
              )}
              <span className="text-sm text-primary dark:text-primary-400 font-medium">
                {t('questionBuilder.otherBadge')}
              </span>
            </div>
          )}
        </div>
      )}
      {isQuiz && (!NO_GRADE_TYPES.includes(question.type) || ((question.type === 'essay' || question.type === 'short_answer') && (question.answer_key || '').trim())) && (question.is_scored ? question.points > 0 : true) && (
        <div className="flex justify-end mt-2 pt-2 border-t border-gray-300 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-500">
            {question.is_scored ? `${question.points} pts` : 'Not scored'}
          </span>
        </div>
      )}
    </Card>
  )
}

function SortableQuestionCard({ question, index, onEdit, onDelete, onDuplicate, duplicating, isQuiz, selected, onToggleSelect, groupId, groupIndex, groupSize, onMove, isFirst, isLast, selectCount }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
    data: { type: 'question', questionId: question.id },
  })
  // ponytail: dnd-kit Translate + transition = GPU, tanpa framer layout thrash
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }
  const holdProps = useHoldSelect({
    selectedCount: selectCount,
    onToggle: () => onToggleSelect(question.id),
  })
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...holdProps}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.12 }}
      className="relative select-none cursor-pointer"
      onClick={() => {
        if (isDragging) return
        if (selectCount > 0) {
          holdProps.onClick()
          return
        }
        onEdit(question)
      }}
    >
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        onPointerDown={(e) => {
          e.stopPropagation()
          listeners?.onPointerDown?.(e)
        }}
        className="absolute left-0 top-4 w-6 h-8 hidden md:flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
      >
        <GripVertical className="w-5 h-5" />
      </span>
      <div className="md:pl-7">
        <QuestionCard
          question={question}
          index={index}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          duplicating={duplicating}
          isDragging={isDragging}
          isQuiz={isQuiz}
          selected={selected}
          onToggleSelect={onToggleSelect}
          groupId={groupId}
          groupIndex={groupIndex}
          groupSize={groupSize}
          moveButtons={onMove ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onMove(-1) }}
                disabled={isFirst}
                aria-label="Move question up"
                className="w-7 h-7 rounded-lg bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all md:hidden"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMove(1) }}
                disabled={isLast}
                aria-label="Move question down"
                className="w-7 h-7 rounded-lg bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all md:hidden"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          ) : null}
        />
      </div>
    </motion.div>
  )
}

// inner card — samakan dengan QuestionCard biasa (ponytail: reuse, bukan varian baru)
function GroupInnerRow({ q, globalIndex, isQuiz, selected, onToggleSelect, onEdit, onDelete, onDuplicate, duplicating, selectCount }) {
  const holdProps = useHoldSelect({ selectedCount: selectCount, onToggle: () => onToggleSelect(q.id) })
  return (
    <div
      {...holdProps}
      onPointerDown={(e) => {
        e.stopPropagation()
        holdProps.onPointerDown?.(e)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (selectCount > 0) { holdProps.onClick(e); return }
        onEdit(q)
      }}
      className="cursor-pointer"
    >
      <QuestionCard
        question={q}
        index={globalIndex}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        duplicating={duplicating}
        isDragging={false}
        isQuiz={isQuiz}
        selected={selected}
        onToggleSelect={onToggleSelect}
        groupId={null}
        groupIndex={0}
        moveButtons={null}
      />
    </div>
  )
}

function SortableGroupCard({ groupId, questions: members, groupIndex, expanded, onToggle, isQuiz, selectedIds, onToggleSelect, onToggleGroupSelect, onEdit, onDelete, onDuplicate, duplicating, onUngroup, onMove, isFirst, isLast, selectCount, idToIndex, editing, showForm, onSave, onCancel, saveLoading, errors, sections, sectionsAllowed, scoringMode, allQuestions, onAddToGroup }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `g-${groupId}`,
    data: { type: 'group', groupId },
  })
  const style = { transform: CSS.Translate.toString(transform), transition }
  const allSel = members.every((q) => selectedIds.includes(q.id))
  const someSel = !allSel && members.some((q) => selectedIds.includes(q.id))
  const totalPts = members.reduce((s, q) => s + (q.points || 0), 0)
  // ponytail: hold di mobile untuk select grup — tap tidak toggle expand, hanya hold select
  const holdProps = useHoldSelect({
    selectedCount: selectCount,
    onToggle: () => onToggleGroupSelect(groupId),
  })
  const [showPicker, setShowPicker] = useState(false)
  const [pickIds, setPickIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const eligible = useMemo(() => {
    const sid = members[0]?.section_id
    return (allQuestions || []).filter((q) => !q.group_id && q.section_id === sid && !members.some((m) => m.id === q.id) && (filter ? (q.question_text || '').toLowerCase().includes(filter.toLowerCase()) : true))
  }, [allQuestions, members, filter])
  const { setNodeRef: setAddRef, isOver: isAddOver } = useDroppable({ id: `add-${groupId}`, data: { type: 'group-add', groupId } })
  const handleAdd = async () => {
    if (!pickIds.length) return
    setAdding(true)
    try {
      await onAddToGroup(groupId, pickIds)
      setPickIds([])
      setShowPicker(false)
    } finally {
      setAdding(false)
    }
  }
  return (
    <motion.div ref={setNodeRef} style={style} {...attributes} {...holdProps} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.12 }} className={`relative ${expanded ? 'select-text' : 'select-none'}`} onClick={(e) => { if (isDragging) return; holdProps.onClick(e) }}>
      <span ref={setActivatorNodeRef} {...listeners} onPointerDown={(e) => { e.stopPropagation(); listeners?.onPointerDown?.(e) }} className="absolute left-0 top-4 w-6 h-8 hidden md:flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"><GripVertical className="w-5 h-5" /></span>
      <div className="md:pl-7">
        <div className={`rounded-2xl border bg-white dark:bg-ink-900 shadow-sm overflow-hidden ${isDragging ? 'opacity-60 border-primary/40 shadow-lift' : allSel ? '!border-primary ring-2 ring-primary/20 bg-primary-50/30 dark:bg-primary-900/10' : expanded ? 'border-primary/30' : 'border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
          {/* header */}
          <div className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-primary-50/60 dark:bg-primary-900/15">
            <button onClick={(e) => { e.stopPropagation(); onToggle() }} className="w-8 h-8 rounded-xl bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-dark hover:text-primary flex items-center justify-center shrink-0 transition-colors" title={expanded ? 'Collapse' : 'Expand'}>
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm text-ink dark:text-gray-100">{t('questionBuilder.groupLabel', { n: groupIndex })}</span>
                <Badge scheme="primary" className="text-[11px]">{t('questionBuilder.questionCount', { count: members.length })}</Badge>
                {isQuiz && <span className="text-xs text-gray-500 hidden sm:inline">{totalPts} pts</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onMove && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); onMove(-1) }} disabled={isFirst} aria-label="Move group up" className="w-7 h-7 rounded-lg bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 flex items-center justify-center disabled:opacity-30 md:hidden"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); onMove(1) }} disabled={isLast} aria-label="Move group down" className="w-7 h-7 rounded-lg bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 flex items-center justify-center disabled:opacity-30 md:hidden"><ChevronDown className="w-4 h-4" /></button>
                </>
              )}
              <button onClick={(e) => { e.stopPropagation(); onUngroup(groupId) }} title={t('questionBuilder.bulkUngroup')} className="w-6 h-6 rounded-xl text-gray-500 hover:text-primary hover:bg-primary-50 flex items-center justify-center transition-colors"><Unlink className="w-3.5 h-3.5" /></button>
              <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = someSel }} onChange={() => onToggleGroupSelect(groupId)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded accent-primary hidden md:block" title={allSel ? t('questionBuilder.bulkCancel') : t('questionBuilder.bulkGroup')} />
            </div>
          </div>
          {/* body */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="overflow-hidden select-text">
                <div className="p-3 sm:p-4 space-y-2.5 bg-gray-50/50 dark:bg-ink-800/20 border-t border-gray-100 dark:border-gray-700 select-text" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  {members.map((q) => {
                    const gIdx = idToIndex.get(q.id) ?? 0
                    const isEdit = showForm && editing?.id === q.id
                    if (isEdit) {
                      return (
                        <motion.div
                          key={q.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="md:pl-0 select-text"
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => e.stopPropagation()}
                        >
                          <Card className="border-primary/50 shadow-card" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between gap-3 mb-4">
                              <span className="font-display font-semibold text-ink dark:text-gray-100 text-sm">Edit Soal {gIdx + 1}</span>
                              <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-ink hover:bg-gray-100 dark:hover:bg-ink-800"><X className="w-4 h-4" /></button>
                            </div>
                            <QuestionForm initial={{ question_text: q.question_text, type: q.type, points: q.points, is_scored: q.is_scored !== false, is_required: q.is_required, section_id: q.section_id || null, password_keyword: q.password_keyword || '', answer_key: q.answer_key || '', allow_other: !!q.allow_other, image: q.image, options: q.options?.length ? q.options.map((o) => ({ id: o.id, option_text: o.option_text, is_correct: o.is_correct, image: o.image })) : [{ option_text: '', is_correct: false }] }} onSave={onSave} onCancel={onCancel} loading={saveLoading} isQuiz={isQuiz} errors={errors} questionId={q.id} sections={sections} sectionsAllowed={sectionsAllowed} scoringMode={scoringMode} />
                          </Card>
                        </motion.div>
                      )
                    }
                    return <GroupInnerRow key={q.id} q={q} globalIndex={gIdx} isQuiz={isQuiz} selected={selectedIds.includes(q.id)} onToggleSelect={onToggleSelect} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} duplicating={duplicating} selectCount={selectCount} />
                  })}
                  {/* add picker / drop zone */}
                  <div ref={setAddRef} className={`rounded-xl border-2 border-dashed p-3 transition-colors ${isAddOver ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-ink-900/40'}`}>
                    {!showPicker ? (
                      <button onClick={() => setShowPicker(true)} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-primary transition-colors">
                        <Plus className="w-4 h-4" /> {t('questionBuilder.addQuestion')}
                        {isAddOver && <span className="text-xs text-primary ml-2">{t('questionBuilder.dropHereToAdd')}</span>}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search questions..." className="input-field h-8 text-sm flex-1" autoFocus />
                          <button onClick={() => { setShowPicker(false); setPickIds([]); setFilter('') }} className="p-1.5 rounded-lg text-gray-400 hover:text-ink"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {eligible.length ? eligible.map((q) => {
                            const checked = pickIds.includes(q.id)
                            return (
                              <label key={q.id} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-gray-100 dark:border-gray-700 hover:border-gray-300'}`}>
                                <input type="checkbox" checked={checked} onChange={(e) => setPickIds((prev) => e.target.checked ? [...prev, q.id] : prev.filter((x) => x !== q.id))} className="mt-0.5 w-4 h-4 rounded accent-primary" />
                                <span className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{(q.question_text || '').replace(/<[^>]*>/g, '').trim() || '(no text)'}</span>
                                <Badge scheme="gray" className="text-[10px] shrink-0">{q.type.replace('_',' ')}</Badge>
                              </label>
                            )
                          }) : <p className="text-xs text-gray-400 text-center py-2">{t('questionBuilder.emptySection')}</p>}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setShowPicker(false); setPickIds([]) }}>{t('questionBuilder.cancel')}</Button>
                          <Button size="sm" onClick={handleAdd} disabled={!pickIds.length || adding} loading={adding}>Add {pickIds.length ? `(${pickIds.length})` : ''}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* collapsed preview dots */}
          {!expanded && (
            <div className="px-3 pt-3 sm:px-4 pb-3 flex items-center gap-1.5">
              {members.slice(0, 6).map((q, i) => (
                <span key={q.id} className="w-7 h-7 rounded-full bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-xs font-bold flex items-center justify-center text-ink dark:text-gray-300">{(idToIndex.get(q.id) ?? i) + 1}</span>
              ))}
              {members.length > 6 && <span className="text-xs text-gray-400">+{members.length - 6}</span>}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function QuestionItem({ q, index, onEdit, onDelete, onDuplicate, duplicating, isQuiz, selected, onToggleSelect, editOpen, onSave, onCancel, saveLoading, errors, sections, sectionsAllowed, groupId, groupIndex, groupSize, onMove, totalCount, selectCount, scoringMode }) {
  const { t } = useTranslation()
  if (editOpen) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="md:pl-7">
        <Card className="border-primary/50 shadow-card">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                {index + 1}
              </span>
              <h3 className="font-display font-semibold text-ink dark:text-gray-100">Edit Question {index + 1}</h3>
            </div>
            <button
              onClick={onCancel}
              className="p-1.5 -mr-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
              aria-label={t('questionBuilder.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <QuestionForm
            initial={{
              question_text: q.question_text,
              type: q.type,
              points: q.points,
              is_scored: q.is_scored !== false,
              is_required: q.is_required,
              section_id: q.section_id || null,
              password_keyword: q.password_keyword || '',
              answer_key: q.answer_key || '',
              allow_other: !!q.allow_other,
              image: q.image,
              options: q.options?.length
                ? q.options.map((o) => ({ id: o.id, option_text: o.option_text, is_correct: o.is_correct, image: o.image }))
                : [{ option_text: '', is_correct: false }],
            }}
            onSave={onSave}
            onCancel={onCancel}
            loading={saveLoading}
            isQuiz={isQuiz}
            errors={errors}
            questionId={q.id}
            sections={sections}
            sectionsAllowed={sectionsAllowed}
            scoringMode={scoringMode}
          />
        </Card>
      </motion.div>
    )
  }

  return (
    <SortableQuestionCard
      question={q}
      index={index}
      onEdit={onEdit}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      duplicating={duplicating}
      isQuiz={isQuiz}
      selected={selected}
      onToggleSelect={onToggleSelect}
      groupId={groupId}
      groupIndex={groupIndex}
      groupSize={groupSize}
      onMove={onMove}
      isFirst={index === 0}
      isLast={index === totalCount - 1}
      selectCount={selectCount}
    />
  )
}

function SectionHeader({ section, count, canDelete, editing, draft, setDraft, onEdit, onSave, onCancel, onDelete, collapsible, collapsed, onToggle }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50 border-l-4 border-primary -mx-3 px-3 sm:px-4 py-3 mb-3">
      {editing ? (
        <div className="flex items-center gap-2 sm:gap-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            className="input-field h-9 text-sm flex-1"
            autoFocus
            placeholder={t('questionBuilder.sectionPlaceholder')}
          />
          <Button size="sm" onClick={onSave} icon={<Check className="w-3.5 h-3.5" />}>
            <span className="hidden sm:inline">{t('questionBuilder.save')}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} icon={<X className="w-3.5 h-3.5" />}>
            <span className="hidden sm:inline">{t('questionBuilder.cancel')}</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 sm:gap-3">
          {collapsible && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              title={collapsed ? 'Show questions' : 'Hide questions'}
              className="p-1.5 -ml-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors shrink-0"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            </button>
          )}
          <h3 className="font-display font-semibold text-ink dark:text-gray-100 flex-1 truncate text-sm sm:text-base">
            {section ? section.title : t('questionBuilder.sectionGeneral')}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 hidden sm:inline">{t('questionBuilder.questionCount', { count })}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 sm:hidden">{t('questionBuilder.questionCount', { count })}</span>
          {section && (
            <div className="flex items-center gap-1">
              <button onClick={onEdit} title="Rename section" className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors shrink-0">
                <Pencil className="w-4 h-4" />
              </button>
              {canDelete && (
                <button onClick={onDelete} title="Delete section" className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-incorrect hover:bg-incorrect-soft transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionDropZone({ _sectionId, children }) {
  // ponytail: tidak lagi droppable — pindah section lewat dropdown di edit soal.
  // Drag kini murni untuk reorder; drop target section menghilangkan sumber
  // loop pengukuran dnd-kit (setState di tengah drag).
  return <div className="rounded-xl -mx-3 px-3">{children}</div>
}

export default function QuestionBuilder() {
  const { formId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const typeLabels = {
    multiple_choice: t('questionBuilder.typeMultipleChoice'),
    checkbox: t('questionBuilder.typeCheckbox'),
    dropdown: t('questionBuilder.typeDropdown'),
    short_answer: t('questionBuilder.typeShortAnswer'),
    essay: t('questionBuilder.typeEssay'),
    password: t('questionBuilder.typePassword'),
    date: t('questionBuilder.typeDate'),
    time: t('questionBuilder.typeTime'),
    datetime: t('questionBuilder.typeDatetime'),
    file_upload: t('questionBuilder.typeFileUpload'),
  }
  const docxRef = useRef(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSectionId, setImportSectionId] = useState('')

  const [form, setForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [sections, setSections] = useState([])
  const [newSectionOpen, setNewSectionOpen] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [editingSectionId, setEditingSectionId] = useState(null)
  const [sectionTitleDraft, setSectionTitleDraft] = useState('')
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState(null)
  const [sectionSaving, setSectionSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [reorderSaving, setReorderSaving] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteWarning, setDeleteWarning] = useState(null) // { activeCount, questionIds, isBulk, questionName, questionObj }
  const [fieldErrors, setFieldErrors] = useState({})
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [showSectionManager, setShowSectionManager] = useState(false)
  // Section yang dilipat (accordion) — biar gampang cari soal di form panjang.
  const [collapsedSections, setCollapsedSections] = useState(() => new Set())
  const toggleSectionCollapse = (id) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [activeDrag, setActiveDrag] = useState(null)
  const dragStartOrderRef = useRef(null)
  const questionsRef = useRef(questions)
  useEffect(() => { questionsRef.current = questions }, [questions])
  // ponytail: rAF batch — hover switch tiap frame, tidak perlu leave-reenter
  const pendingRef = useRef(null)
  const rafRef = useRef(null)
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])
  const [grouping, setGrouping] = useState(false)
  const [ungrouping, setUngrouping] = useState(false)
  // Group expand/collapse — default compact (collapsed)
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())
  const toggleGroup = (gid) => setExpandedGroups((prev) => {
    const n = new Set(prev); if (n.has(gid)) n.delete(gid); else n.add(gid); return n
  })
  // auto-expand group saat edit anggotanya
  useEffect(() => {
    if (editing?.group_id) {
      setExpandedGroups((prev) => {
        if (prev.has(editing.group_id)) return prev
        const n = new Set(prev); n.add(editing.group_id); return n
      })
    }
  }, [editing])

  // Sections hanya untuk: semua quiz (style apapun), atau form + card
  const sectionsAllowed = form && (
    form.type === 'quiz' ||
    (form.type === 'form' && (form.display_style || 'card') === 'card')
  )
  // Import DOCX wajib pilih section tujuan hanya bila section >1.
  const importNeedsSection = sectionsAllowed && sections.length > 1
  const scoringMode = form?.scoring_mode || 'auto'

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ponytail: map id->index O(1), ganti indexOf O(n²) tiap render saat drag
  const idToIndex = useMemo(() => new Map(questions.map((q, i) => [q.id, i])), [questions])
  // ponytail: block = single atau group (compact). Group jadi satu card, reorder pindah slice utuh
  const allBlocks = useMemo(() => {
    if (!questions.length) return []
    const byGroup = new Map()
    questions.forEach((q) => {
      if (q.group_id) {
        if (!byGroup.has(q.group_id)) byGroup.set(q.group_id, [])
        byGroup.get(q.group_id).push(q)
      }
    })
    const seen = new Set()
    const blks = []
    for (const q of questions) {
      if (q.group_id) {
        if (seen.has(q.group_id)) continue
        seen.add(q.group_id)
        const members = byGroup.get(q.group_id).slice().sort((a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0))
        blks.push({ type: 'group', id: `g-${q.group_id}`, groupId: q.group_id, questions: members, sectionId: q.section_id })
      } else {
        blks.push({ type: 'single', id: q.id, question: q, sectionId: q.section_id })
      }
    }
    return blks
  }, [questions, idToIndex])
  const blockIds = useMemo(() => allBlocks.map((b) => b.id), [allBlocks])

  // Jumlah soal yang kini makan pool auto-100 (cermin filter backend
  // distribute_quiz_points) — untuk proyeksi jatah soal baru di form tambah.
  const poolCount = useMemo(() => questions.filter((q) =>
    q.is_scored !== false
    && !['date', 'time', 'datetime', 'file_upload', 'dropdown'].includes(q.type)
    && (q.type !== 'essay' || (q.answer_key || '').trim())
  ).length, [questions])

  const load = (silent = false) => {
    if (!silent) setLoading(true)
    Promise.all([
      api.get(`/forms/${formId}`),
      api.get(`/forms/${formId}/questions`),
      api.get(`/forms/${formId}/sections`),
    ])
      .then(([fRes, qRes, sRes]) => {
        setForm(fRes.data)
        setQuestions(qRes.data.data)
        setSections(sRes.data.data)
        setSelectedIds([])
      })
      .catch(() => { })
      .finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId])

  const handleSaveQuestion = async (data) => {
    setSaveLoading(true)
    setFieldErrors({})
    // Keep the client-side option list alongside the payload. New options can
    // have a pending media file before they receive a database ID; after the
    // question is saved, the response contains the generated option ID needed
    // by the media endpoint.
    const optionEntries = OPTION_TYPES.includes(data.type)
      ? data.options.filter((o) => {
          const hasText = (o.option_text || '').replace(/<[^>]*>/g, '').trim()
          const hasImage = !!(o.image?.path || o._pendingFile)
          return hasText || hasImage
        })
      : []
    const payload = {
      question_text: data.question_text,
      type: data.type,
      points: data.points,
      is_scored: data.is_scored !== false,
      is_required: data.is_required,
      section_id: data.section_id || null,
      password_keyword: data.type === 'password' ? data.password_keyword : undefined,
      answer_key: (data.type === 'essay' || data.type === 'short_answer')
        ? ((data.answer_key || '').trim() || null)
        : undefined,
      allow_other: (data.type === 'multiple_choice' || data.type === 'checkbox')
        ? !!data.allow_other
        : undefined,
      options: OPTION_TYPES.includes(data.type)
        ? optionEntries.map((o) => ({
            ...(o.id ? { id: o.id } : {}),
            option_text: (o.option_text || '').replace(/<[^>]*>/g, '').trim() ? o.option_text : (o.image?.path || o._pendingFile ? '<p><br></p>' : o.option_text),
            is_correct: data.type === 'dropdown' ? false : !!o.is_correct,
          }))
        : [],
    }
    const uploadPendingOptionImages = async (savedQuestion) => {
      let failed = 0
      const existingOptionIds = new Set(optionEntries.filter((o) => o.id).map((o) => o.id))
      const pendingEntries = optionEntries.filter((o) => o._pendingFile)
      // PUT /questions appends options without an id after existing options,
      // so match pending files against newly-created response options rather
      // than relying on the visual option index (a new option may be inserted
      // in the middle of the list).
      const newSavedOptions = (savedQuestion?.options || []).filter((o) => !existingOptionIds.has(o.id))
      for (let i = 0; i < pendingEntries.length; i++) {
        const opt = pendingEntries[i]
        const savedOpt = newSavedOptions[i]
        if (!savedOpt?.id) continue
        try {
          const fd = new FormData()
          fd.append('file', opt._pendingFile)
          await api.post(`/questions/${savedQuestion.id}/option/${savedOpt.id}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch (e) {
          failed += 1
          toast.error(e.response?.data?.message || e.response?.data?.detail || 'Gagal upload media opsi')
        }
      }
      return failed
    }
    try {
      if (editing) {
        const res = await api.put(`/questions/${editing.id}`, payload)
        await uploadPendingOptionImages(res.data)
        toast.success(t('questionBuilder.updated'))
      } else {
        const res = await api.post(`/forms/${formId}/questions`, payload)
        // ponytail: upload pending media queued before save (no ID at that time)
        const newQ = res.data
        if (data._pendingFile) {
          try {
            const fd = new FormData()
            fd.append('file', data._pendingFile)
            await api.post(`/questions/${newQ.id}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
          } catch (e) { toast.error(e.response?.data?.message || e.response?.data?.detail || 'Gagal upload media pertanyaan') }
        }
        await uploadPendingOptionImages(newQ)
        toast.success(t('questionBuilder.added'))
      }
      load()
      setShowForm(false)
      setEditing(null)
    } catch (err) {
      const data = err.response?.data
      if (data?.errors) {
        const mapped = {}
        data.errors.forEach((entry) => {
          Object.entries(entry).forEach(([k, v]) => { mapped[k] = v })
        })
        setFieldErrors(mapped)
        if (mapped._schema) toast.error(mapped._schema)
        else if (data.message) toast.error(data.message)
      } else {
        toast.error(data?.message || data?.detail || 'Failed to save question')
      }
    } finally {
      setSaveLoading(false)
    }
  }

  // Loading bersama untuk ConfirmModal (delete soal / section) — hanya satu
  // modal konfirmasi yang bisa terbuka pada satu waktu.
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [ungroupConfirm, setUngroupConfirm] = useState(null)

  const handleDelete = async () => {
    if (!deleteTarget) return
    setConfirmLoading(true)
    try {
      await api.delete(`/questions/${deleteTarget.id}`)
      setDeleteTarget(null)
      toast.success(t('questionBuilder.deleted'))
      load()
    } catch {
      toast.error('Failed to delete question')
      setDeleteTarget(null)
    } finally {
      setConfirmLoading(false)
    }
  }

  const confirmDeleteSingle = async (question) => {
    try {
      const { data } = await api.get(`/questions/${question.id}/active-count`)
      if (data.active_count > 0) {
        setDeleteWarning({ activeCount: data.active_count, questionIds: [question.id], isBulk: false, questionName: (question.question_text || '').replace(/<[^>]*>/g, '').slice(0, 50), questionObj: question })
      } else {
        setDeleteTarget(question)
      }
    } catch {
      setDeleteTarget(question)
    }
  }

  // Duplikasi penuh 1 soal tepat di bawah asal (server yang mengatur order).
  const [duplicatingId, setDuplicatingId] = useState(null)
  const handleDuplicate = async (question) => {
    if (duplicatingId) return
    setDuplicatingId(question.id)
    try {
      await api.post(`/questions/${question.id}/duplicate`)
      toast.success(t('questionBuilder.duplicated'))
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || t('questionBuilder.duplicateFailed'))
    } finally {
      setDuplicatingId(null)
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Grup cerita: hitung anggota per group_id untuk badge kartu
  const groupCounts = {}
  questions.forEach((q) => {
    if (q.group_id) groupCounts[q.group_id] = (groupCounts[q.group_id] || 0) + 1
  })
  // Stable group index: order by first appearance in the question list
  const groupIndexMap = {}
  questions.forEach((q) => {
    if (q.group_id && !(q.group_id in groupIndexMap)) {
      groupIndexMap[q.group_id] = Object.keys(groupIndexMap).length + 1
    }
  })

  const selectedQs = questions.filter((q) => selectedIds.includes(q.id))
  const selectionGrouped = selectedQs.some((q) => q.group_id)
  const canGroup =
    !selectionGrouped &&
    selectedQs.length >= 2 &&
    selectedQs.every((q) => q.section_id) &&
    new Set(selectedQs.map((q) => q.section_id)).size === 1
  const mixedGroupIds = [...new Set(selectedQs.filter((q) => q.group_id).map((q) => q.group_id))]
  const singleIdsForMixed = selectedQs.filter((q) => !q.group_id).map((q) => q.id)
  const canAddMixed = singleIdsForMixed.length > 0 && mixedGroupIds.length === 1 && new Set(selectedQs.map((q) => q.section_id)).size === 1 && selectedQs.every((q) => q.section_id)

  const handleGroup = async () => {
    setGrouping(true)
    try {
      await api.post(`/forms/${formId}/questions/group`, { question_ids: selectedIds })
      toast.success(`${selectedIds.length} question(s) grouped into one story group`)
      setSelectedIds([])
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to group questions')
    } finally {
      setGrouping(false)
    }
  }

  const handleUngroupSelected = async () => {
    const groupedQs = selectedQs.filter((q) => q.group_id)
    if (!groupedQs.length) return
    setUngrouping(true)
    try {
      for (const q of groupedQs) {
        await api.delete(`/forms/${formId}/questions/group/${q.group_id}/questions/${q.id}`)
      }
      toast.success(`${groupedQs.length} question(s) removed from group`)
      setSelectedIds([])
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove question(s) from group')
    } finally {
      setUngrouping(false)
    }
  }

  const toggleGroupSelect = (groupId) => {
    const members = questions.filter((q) => q.group_id === groupId).map((q) => q.id)
    const all = members.every((id) => selectedIds.includes(id))
    if (all) setSelectedIds((prev) => prev.filter((id) => !members.includes(id)))
    else setSelectedIds((prev) => [...new Set([...prev, ...members])])
  }

  const handleUngroupGroup = async (groupId) => {
    setUngrouping(true)
    try {
      await api.delete(`/forms/${formId}/questions/group/${groupId}`)
      toast.success('Group dihapus — questions kembali terpisah')
      setExpandedGroups((prev) => { const n = new Set(prev); n.delete(groupId); return n })
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to ungroup')
    } finally {
      setUngrouping(false)
    }
  }

  const handleAddToGroup = async (groupId, questionIds) => {
    if (!questionIds?.length) return
    try {
      await api.post(`/forms/${formId}/questions/group/${groupId}/questions`, { question_ids: questionIds })
      toast.success(`${questionIds.length} questions ditambahkan ke Group`)
      setExpandedGroups((prev) => { const n = new Set(prev); n.add(groupId); return n })
      setSelectedIds([])
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to add to group')
      throw err
    }
  }

  const moveBlock = async (blockId, dir) => {
    const idx = allBlocks.findIndex((b) => String(b.id) === String(blockId))
    if (idx === -1) return
    let to
    if (sectionsAllowed) {
      const secId = allBlocks[idx].sectionId
      const secBlocks = allBlocks.filter((b) => b.sectionId === secId)
      const pos = secBlocks.findIndex((b) => String(b.id) === String(blockId))
      const targetPos = pos + dir
      if (targetPos < 0 || targetPos >= secBlocks.length) return
      const targetId = secBlocks[targetPos].id
      to = allBlocks.findIndex((b) => String(b.id) === String(targetId))
    } else {
      to = idx + dir
      if (to < 0 || to >= allBlocks.length) return
    }
    const nextBlocks = arrayMove(allBlocks, idx, to)
    const nextQuestions = nextBlocks.flatMap((b) => b.type === 'group' ? b.questions : [b.question])
    setQuestions(nextQuestions)
    setReorderSaving(true)
    try {
      await api.patch('/questions/reorder', { form_id: parseInt(formId), orders: nextQuestions.map((q) => q.id) })
    } catch {
      load(true)
    } finally {
      setReorderSaving(false)
    }
  }

  const allSelected = questions.length > 0 && selectedIds.length === questions.length

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : questions.map((q) => q.id))
  }

  const handleBulkDelete = async () => {
    setShowBulkDelete(false)
    if (!selectedIds.length) return
    setBulkDeleting(true)
    try {
      await api.post(`/forms/${formId}/questions/bulk-delete`, { question_ids: selectedIds })
      toast.success(t('questionBuilder.deleted'))
      setSelectedIds([])
      load()
    } catch {
      toast.error('Failed to delete some questions')
      setSelectedIds([])
    } finally {
      setBulkDeleting(false)
    }
  }

  const confirmBulkDelete = async () => {
    if (!selectedIds.length) return
    try {
      const { data } = await api.post(`/forms/${formId}/questions/bulk-active-count`, { question_ids: selectedIds })
      if (data.active_count > 0) {
        setDeleteWarning({ activeCount: data.active_count, questionIds: selectedIds, isBulk: true, questionName: null })
      } else {
        setShowBulkDelete(true)
      }
    } catch {
      setShowBulkDelete(true)
    }
  }

  // helper build blocks dari flat questions (dipakai di drag handlers)
  const buildBlocks = (qs, idxMap) => {
    if (!qs.length) return []
    const byGroup = new Map()
    qs.forEach((q) => {
      if (q.group_id) {
        if (!byGroup.has(q.group_id)) byGroup.set(q.group_id, [])
        byGroup.get(q.group_id).push(q)
      }
    })
    const seen = new Set()
    const blks = []
    for (const q of qs) {
      if (q.group_id) {
        if (seen.has(q.group_id)) continue
        seen.add(q.group_id)
        const members = byGroup.get(q.group_id).slice().sort((a, b) => (idxMap.get(a.id) ?? 0) - (idxMap.get(b.id) ?? 0))
        blks.push({ type: 'group', id: `g-${q.group_id}`, groupId: q.group_id, questions: members, sectionId: q.section_id })
      } else {
        blks.push({ type: 'single', id: q.id, question: q, sectionId: q.section_id })
      }
    }
    return blks
  }

  const handleDragStart = (event) => {
    const data = event.active.data.current || {}
    setActiveDrag({ type: data.type, groupId: data.groupId, questionId: data.questionId, id: event.active.id })
    dragStartOrderRef.current = questions.map((q) => q.id)
    pendingRef.current = null
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  // ponytail: block-aware rAF — tiap frame 1 swap, hover di tempat yang sama tetap ke-trigger tanpa leave
  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over || String(active.id) === String(over.id)) return
    const aType = active.data.current?.type
    const oType = over.data.current?.type
    if (!['question', 'group'].includes(aType) || !['question', 'group'].includes(oType)) return
    pendingRef.current = { activeId: String(active.id), overId: String(over.id), aType, oType }
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const p = pendingRef.current
      pendingRef.current = null
      if (!p) return
      setQuestions((prev) => {
        const idxMap = new Map(prev.map((q, i) => [q.id, i]))
        const blks = buildBlocks(prev, idxMap)
        const from = blks.findIndex((b) => String(b.id) === p.activeId)
        const to = blks.findIndex((b) => String(b.id) === p.overId)
        if (from === -1 || to === -1 || from === to) return prev
        if (sectionsAllowed && blks[from].sectionId !== blks[to].sectionId) return prev
        const nextBlks = arrayMove(blks, from, to)
        return nextBlks.flatMap((b) => b.type === 'group' ? b.questions : [b.question])
      })
    })
  }

  const restoreOrder = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    pendingRef.current = null
    const snap = dragStartOrderRef.current
    dragStartOrderRef.current = null
    if (!snap) return
    setQuestions((prev) => {
      if (prev.length !== snap.length) return prev
      const byId = new Map(prev.map((q) => [q.id, q]))
      const restored = snap.map((id) => byId.get(id)).filter(Boolean)
      return restored.length === prev.length ? restored : prev
    })
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveDrag(null)
    // A: drop single question onto group add zone → add to group
    if (over && active && active.data.current?.type === 'question' && over.data.current?.type === 'group-add') {
      const gid = over.data.current.groupId
      const qid = active.data.current.questionId || active.id
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      pendingRef.current = null
      dragStartOrderRef.current = null
      await handleAddToGroup(gid, [qid])
      return
    }
    // flush pending hover biar drop di posisi terakhir tetap ke-apply
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (pendingRef.current) {
      const p = pendingRef.current
      pendingRef.current = null
      // apply pending swap synchronously sebelum persist
      setQuestions((prev) => {
        const idxMap = new Map(prev.map((q, i) => [q.id, i]))
        const blks = buildBlocks(prev, idxMap)
        const from = blks.findIndex((b) => String(b.id) === p.activeId)
        const to = blks.findIndex((b) => String(b.id) === p.overId)
        if (from === -1 || to === -1 || from === to) return prev
        if (sectionsAllowed && blks[from].sectionId !== blks[to].sectionId) return prev
        const nextBlks = arrayMove(blks, from, to)
        return nextBlks.flatMap((b) => b.type === 'group' ? b.questions : [b.question])
      })
      // tunggu state commit sebelum baca questionsRef — pakai timeout 0
      await new Promise((r) => setTimeout(r, 0))
    }
    const before = dragStartOrderRef.current
    dragStartOrderRef.current = null
    pendingRef.current = null
    if (!over) {
      if (before) {
        setQuestions((prev) => {
          const byId = new Map(prev.map((q) => [q.id, q]))
          const restored = before.map((id) => byId.get(id)).filter(Boolean)
          return restored.length === prev.length ? restored : prev
        })
      }
      return
    }
    const ids = questionsRef.current.map((q) => q.id)
    if (before && JSON.stringify(ids) === JSON.stringify(before)) return
    setReorderSaving(true)
    try {
      await api.patch('/questions/reorder', { form_id: parseInt(formId), orders: ids })
    } catch {
      load(true)
    } finally {
      setReorderSaving(false)
    }
  }

  const handleDragCancel = () => {
    setActiveDrag(null)
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    pendingRef.current = null
    restoreOrder()
  }

  // ponytail: legacy moveQuestion tetap ada untuk kompatibilitas
  const _moveQuestion = async (index, dir) => {
    const q = questions[index]
    if (!q) return
    const blockId = q.group_id ? `g-${q.group_id}` : q.id
    return moveBlock(blockId, dir)
  }

  const handleDocxImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    // Section >1: tujuan import wajib dipilih (divalidasi juga di backend).
    if (importNeedsSection && !importSectionId) {
      toast.error(t('questionBuilder.importNeedSection'))
      return
    }
    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    if (importSectionId) fd.append('section_id', importSectionId)
    try {
      const { data } = await api.post(`/forms/${formId}/import/docx`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowImportModal(false)
      setImportSectionId('')
      toast.success(t('questionBuilder.importSuccess', { count: data?.imported_count ?? 0 }))
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.detail || t('questionBuilder.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const editQuestion = (q) => {
    setEditing(q)
    setShowForm(true)
    setFieldErrors({})
  }

  const createSection = async () => {
    if (!newSectionTitle.trim()) return
    setSectionSaving(true)
    try {
      await api.post(`/forms/${formId}/sections`, { title: newSectionTitle.trim() })
      setNewSectionTitle('')
      setNewSectionOpen(false)
      toast.success('Section added')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add section')
    } finally {
      setSectionSaving(false)
    }
  }

  const renameSection = async (section) => {
    if (!sectionTitleDraft.trim()) return
    try {
      await api.patch(`/sections/${section.id}`, { title: sectionTitleDraft.trim() })
      setEditingSectionId(null)
      toast.success('Section updated')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update section')
    }
  }

  const deleteSection = async () => {
    if (!sectionDeleteTarget) return
    setConfirmLoading(true)
    try {
      const { data } = await api.delete(`/sections/${sectionDeleteTarget.id}`)
      setSectionDeleteTarget(null)
      const moved = data?.moved_question_count || 0
      toast.success(moved > 0 ? `Section deleted — ${moved} question(s) moved` : 'Section deleted')
      load()
    } catch {
      toast.error('Failed to delete section')
      setSectionDeleteTarget(null)
    } finally {
      setConfirmLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200/60 rounded-xl w-1/3 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    )
  }

  if (!form) return null

  return (
    <div>
      <button
        onClick={() => navigate(`/forms/${formId}`)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('questionBuilder.backToSettings')}
      </button>

      <PageHeader
        eyebrow={form.type === 'quiz' ? t('questionBuilder.quizBuilder') : t('questionBuilder.formBuilder')}
        title={<RichText html={form.title} />}
        description={t('questionBuilder.questionCount', { count: questions.length })}
        actions={
          <>
            <input ref={docxRef} type="file" accept=".docx" onChange={handleDocxImport} className="hidden" />
            <Button variant="secondary" onClick={() => { if (docxRef.current) docxRef.current.value = ''; setShowImportModal(true) }} icon={<Upload className="w-4 h-4" />}>
              <span className="hidden sm:inline">{t('questionBuilder.importDocx')}</span>
            </Button>
            {sectionsAllowed && (
              <Button variant="secondary" onClick={() => setShowSectionManager(true)} icon={<Layers className="w-4 h-4" />}>
                <span className="hidden sm:inline">{t('questionBuilder.manageSections')}</span>
              </Button>
            )}
            <Button onClick={() => { setEditing(null); setShowForm(true); setFieldErrors({}) }} icon={<Plus className="w-4 h-4" />}>
              <span className="hidden sm:inline">{t('questionBuilder.addQuestion')}</span>
            </Button>
          </>
        }
      />

      <FormSubNav formId={formId} className="mt-5" />

      <SectionManager
        formId={formId}
        show={showSectionManager}
        onClose={() => setShowSectionManager(false)}
        sections={sections}
        questions={questions}
        onSaved={() => load(true)}
      />

      {newSectionOpen && (
        <div className="flex gap-2 mt-4">
          <input
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createSection() }}
            className="input-field flex-1"
            placeholder={t('questionBuilder.sectionPlaceholder')}
            autoFocus
          />
          <Button onClick={createSection} loading={sectionSaving} disabled={!newSectionTitle.trim()}>{t('questionBuilder.addOption')}</Button>
          <Button variant="ghost" onClick={() => setNewSectionOpen(false)}>{t('questionBuilder.cancel')}</Button>
        </div>
      )}

      {reorderSaving && (
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl mt-4 text-sm flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {t('questionBuilder.savingOrder')}
        </div>
      )}

      <AnimatePresence>
        {showForm && !editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-6"
          >
            <Card>
              <div className="flex items-center gap-2 mb-5">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary text-xs font-bold flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </span>
                <h3 className="font-display font-semibold text-ink dark:text-gray-100">{t('questionBuilder.addNewQuestion')}</h3>
              </div>
              <QuestionForm
                onSave={(data) => handleSaveQuestion(data)}
                onCancel={() => { setShowForm(false); setEditing(null) }}
                loading={saveLoading}
                isQuiz={form.type === 'quiz'}
                errors={fieldErrors}
                questionId={editing?.id}
                sections={sections}
                sectionsAllowed={sectionsAllowed}
                scoringMode={scoringMode}
                poolCount={poolCount}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state generik hanya kalau memang tidak ada section utk ditampilkan;
          kalau ada section, biarkan list tampil dengan hint "belum ada soal". */}
      {questions.length === 0 && !showForm && (!sectionsAllowed || sections.length === 0) ? (
        <Card className="mt-6">
          <EmptyState
            icon={<HelpCircle className="w-6 h-6" />}
            title={t('questionBuilder.emptyTitle')}
            description={t('questionBuilder.emptyDesc')}
            action={
              <Button onClick={() => { setEditing(null); setShowForm(true); setFieldErrors({}) }} icon={<Plus className="w-4 h-4" />}>
                {t('questionBuilder.addQuestion')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="sticky top-0 z-20 mt-6 bg-white dark:bg-ink-900 border border-gray-200 dark:border-gray-700 shadow-lift rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3"
            >
              <label className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="hidden sm:inline">{t('questionBuilder.selectAll', { selected: selectedIds.length, total: questions.length })}</span>
                <span className="sm:hidden">{t('questionBuilder.selectAll', { selected: selectedIds.length, total: questions.length })}</span>
              </label>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setSelectedIds([])}
                  className="flex items-center gap-1.5 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                  title="Cancel selection"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm font-medium">{t('questionBuilder.bulkCancel')}</span>
                </button>
                {canAddMixed ? (
                  <button
                    onClick={() => handleAddToGroup(mixedGroupIds[0], singleIdsForMixed)}
                    disabled={grouping}
                    title={`Add ${singleIdsForMixed.length} question(s) to Group ${groupIndexMap[mixedGroupIds[0]] || ''}`}
                    className="flex items-center gap-1.5 p-2 rounded-lg text-primary hover:bg-primary-50 transition-colors"
                  >
                    {grouping ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <TextQuote className="w-4 h-4" />}
                    <span className="hidden sm:inline text-sm font-medium">{t('questionBuilder.bulkGroup')}</span>
                  </button>
                ) : selectionGrouped ? (
                  <button
                    onClick={() => {
                      const grouped = selectedQs.filter((q) => q.group_id)
                      const distinct = [...new Set(grouped.map((q) => q.group_id))]
                      setUngroupConfirm({ mode: 'selected', count: grouped.length, distinctCount: distinct.length, groupIds: distinct })
                    }}
                    disabled={ungrouping}
                    title="Remove from story group"
                    className="flex items-center gap-1.5 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-40"
                  >
                    {ungrouping ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Unlink className="w-4 h-4" />}
                    <span className="hidden sm:inline text-sm font-medium">{t('questionBuilder.bulkUngroup')}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleGroup}
                    disabled={!canGroup || grouping}
                    title={canGroup ? 'Group selected' : 'Select 2+ questions in same section'}
                    className="flex items-center gap-1.5 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-40"
                  >
                    {grouping ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <TextQuote className="w-4 h-4" />}
                    <span className="hidden sm:inline text-sm font-medium">{t('questionBuilder.bulkGroup')}</span>
                  </button>
                )}
                <button
                  onClick={confirmBulkDelete}
                  title={`Delete ${selectedIds.length} question(s)`}
                  className="flex items-center gap-1.5 p-2 rounded-lg text-incorrect hover:bg-incorrect-soft transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm font-medium">{t('questionBuilder.bulkDelete', { count: selectedIds.length })}</span>
                </button>
              </div>
            </motion.div>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-8 mt-6">
                {sectionsAllowed ? (
                  <>
                    {sections.map((sec) => {
                      const secBlocks = allBlocks.filter((b) => b.sectionId === sec.id)
                      const collapsed = collapsedSections.has(sec.id)
                      return (
                        <SectionDropZone key={sec.id} sectionId={sec.id}>
                          <SectionHeader
                            section={sec}
                            count={questions.filter((q) => q.section_id === sec.id).length}
                            canDelete={sections.length > 1}
                            editing={editingSectionId === sec.id}
                            draft={sectionTitleDraft}
                            setDraft={setSectionTitleDraft}
                            onEdit={() => { setEditingSectionId(sec.id); setSectionTitleDraft(sec.title) }}
                            onSave={() => renameSection(sec)}
                            onCancel={() => setEditingSectionId(null)}
                            onDelete={() => setSectionDeleteTarget(sec)}
                            collapsible
                            collapsed={collapsed}
                            onToggle={() => toggleSectionCollapse(sec.id)}
                          />
                          {!collapsed && (secBlocks.length ? (
                            <div className="space-y-3 mt-3">
                              {secBlocks.map((blk, blkIdx) => {
                                const isFirst = blkIdx === 0
                                const isLast = blkIdx === secBlocks.length - 1
                                if (blk.type === 'group') {
                                  const gid = blk.groupId
                                  return (
                                    <SortableGroupCard
                                      key={blk.id}
                                      groupId={gid}
                                      questions={blk.questions}
                                      groupIndex={groupIndexMap[gid] || 0}
                                      expanded={expandedGroups.has(gid)}
                                      onToggle={() => toggleGroup(gid)}
                                      isQuiz={form.type === 'quiz'}
                                      selectedIds={selectedIds}
                                      onToggleSelect={toggleSelect}
                                      onToggleGroupSelect={toggleGroupSelect}
                                      onEdit={editQuestion}
                                      onDelete={confirmDeleteSingle}
                                      onDuplicate={handleDuplicate}
                                      duplicating={duplicatingId}
                                      onUngroup={(gid) => setUngroupConfirm({ mode: 'group', groupId: gid, count: blk.questions.length, groupIndex: groupIndexMap[gid] || 0 })}
                                      onMove={(dir) => moveBlock(blk.id, dir)}
                                      isFirst={isFirst}
                                      isLast={isLast}
                                      selectCount={selectedIds.length}
                                      idToIndex={idToIndex}
                                      editing={editing}
                                      showForm={showForm}
                                      onSave={(data) => handleSaveQuestion(data)}
                                      onCancel={() => { setShowForm(false); setEditing(null) }}
                                      saveLoading={saveLoading}
                                      errors={fieldErrors}
                                      sections={sections}
                                      sectionsAllowed={sectionsAllowed}
                                      scoringMode={scoringMode}
                                      allQuestions={questions}
                                      onAddToGroup={handleAddToGroup}
                                    />
                                  )
                                }
                                const q = blk.question
                                return (
                                  <QuestionItem
                                    key={q.id}
                                    q={q}
                                    index={idToIndex.get(q.id) ?? 0}
                                    onEdit={editQuestion}
                                    onDelete={confirmDeleteSingle}
                                    onDuplicate={handleDuplicate}
                                    duplicating={duplicatingId}
                                    isQuiz={form.type === 'quiz'}
                                    selected={selectedIds.includes(q.id)}
                                    onToggleSelect={toggleSelect}
                                    editOpen={showForm && editing?.id === q.id}
                                    onSave={(data) => handleSaveQuestion(data)}
                                    onCancel={() => { setShowForm(false); setEditing(null) }}
                                    saveLoading={saveLoading}
                                    errors={fieldErrors}
                                    sections={sections}
                                    groupId={null}
                                    groupIndex={0}
                                    groupSize={0}
                                    onMove={(dir) => moveBlock(blk.id, dir)}
                                    totalCount={questions.length}
                                    selectCount={selectedIds.length}
                                    scoringMode={scoringMode}
                                  />
                                )
                              })}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 italic">
                              {t('questionBuilder.emptySection')}
                            </p>
                          ))}
                        </SectionDropZone>
                      )
                    })}
                  </>
                ) : (
                  <div className="space-y-3">
                    {allBlocks.map((blk, blkIdx) => {
                      const isFirst = blkIdx === 0
                      const isLast = blkIdx === allBlocks.length - 1
                      if (blk.type === 'group') {
                        const gid = blk.groupId
                        return (
                          <SortableGroupCard
                            key={blk.id}
                            groupId={gid}
                            questions={blk.questions}
                            groupIndex={groupIndexMap[gid] || 0}
                            expanded={expandedGroups.has(gid)}
                            onToggle={() => toggleGroup(gid)}
                            isQuiz={form.type === 'quiz'}
                            selectedIds={selectedIds}
                            onToggleSelect={toggleSelect}
                            onToggleGroupSelect={toggleGroupSelect}
                            onEdit={editQuestion}
                            onDelete={confirmDeleteSingle}
                            onDuplicate={handleDuplicate}
                            duplicating={duplicatingId}
                            onUngroup={(gid) => setUngroupConfirm({ mode: 'group', groupId: gid, count: blk.questions.length, groupIndex: groupIndexMap[gid] || 0 })}
                            onMove={(dir) => moveBlock(blk.id, dir)}
                            isFirst={isFirst}
                            isLast={isLast}
                            selectCount={selectedIds.length}
                            idToIndex={idToIndex}
                            editing={editing}
                            showForm={showForm}
                            onSave={(data) => handleSaveQuestion(data)}
                            onCancel={() => { setShowForm(false); setEditing(null) }}
                            saveLoading={saveLoading}
                            errors={fieldErrors}
                            sections={sections}
                            sectionsAllowed={sectionsAllowed}
                            scoringMode={scoringMode}
                            allQuestions={questions}
                            onAddToGroup={handleAddToGroup}
                          />
                        )
                      }
                      const q = blk.question
                      return (
                        <QuestionItem
                          key={q.id}
                          q={q}
                          index={idToIndex.get(q.id) ?? 0}
                          onEdit={editQuestion}
                          onDelete={confirmDeleteSingle}
                          onDuplicate={handleDuplicate}
                          duplicating={duplicatingId}
                          isQuiz={form.type === 'quiz'}
                          selected={selectedIds.includes(q.id)}
                          onToggleSelect={toggleSelect}
                          editOpen={showForm && editing?.id === q.id}
                          onSave={(data) => handleSaveQuestion(data)}
                          onCancel={() => { setShowForm(false); setEditing(null) }}
                          saveLoading={saveLoading}
                          errors={fieldErrors}
                          sections={sections}
                          sectionsAllowed={sectionsAllowed}
                          groupId={null}
                          groupIndex={0}
                          groupSize={0}
                          onMove={(dir) => moveBlock(blk.id, dir)}
                          totalCount={questions.length}
                          selectCount={selectedIds.length}
                          scoringMode={scoringMode}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
              {activeDrag?.type === 'group' && (() => {
                const blk = allBlocks.find((b) => String(b.id) === String(activeDrag.id))
                if (!blk || blk.type !== 'group') return null
                return (
                  <Card className="shadow-lift border-primary/40 bg-white dark:bg-ink-900 w-[640px] max-w-[90vw] opacity-95">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0"><ChevronDown className="w-4 h-4 text-gray-500" /></span>
                      <span className="font-display font-bold text-sm shrink-0">Group {groupIndexMap[blk.groupId] || 0}</span>
                      <Badge scheme="primary" className="shrink-0">{blk.questions.length} questions</Badge>
                      <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1">{(blk.questions[0]?.question_text || '').replace(/<[^>]*>/g, '').trim().slice(0, 60)}</span>
                    </div>
                  </Card>
                )
              })()}
              {activeDrag?.type === 'question' && (() => {
                const q = questions.find((qq) => qq.id === activeDrag.id)
                return q ? (
                  <Card className="shadow-lift border-primary/40 bg-white dark:bg-ink-900 w-[640px] max-w-[90vw] opacity-95">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-primary shrink-0" />
                      <Badge scheme="gray" className="shrink-0">{typeLabels[q.type]}</Badge>
                      <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1">
                        {(q.question_text || '').replace(/<[^>]*>/g, '').trim().slice(0, 80)}
                      </span>
                    </div>
                  </Card>
                ) : null
              })()}
            </DragOverlay>
          </DndContext>
        </>
      )}

      <ConfirmModal
        show={!!sectionDeleteTarget}
        title={t('questionBuilder.confirmDeleteSectionTitle')}
        message={t('questionBuilder.confirmDeleteSectionMessage', { title: sectionDeleteTarget?.title || '' })}
        onConfirm={deleteSection}
        onCancel={() => setSectionDeleteTarget(null)}
        loading={confirmLoading}
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        show={showBulkDelete}
        title={t('questionBuilder.confirmDeleteQuestionsTitle', { count: selectedIds.length })}
        message={
          <div>
            <p>{t('questionBuilder.confirmDeleteQuestionsMessage', { count: selectedIds.length })}</p>
            <ul className="mt-2 space-y-1 max-h-44 overflow-y-auto pr-1">
              {questions.filter((q) => selectedIds.includes(q.id)).map((q) => (
                <li key={q.id} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 leading-snug">
                  <span className="w-1.5 h-1.5 rounded-full bg-incorrect shrink-0 mt-1" />
                  <span className="line-clamp-2">{(q.question_text || '').replace(/<[^>]*>/g, '').trim()}</span>
                </li>
              ))}
            </ul>
          </div>
        }
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
        loading={bulkDeleting}
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        show={!!deleteWarning}
        title={t('questionBuilder.activeSubmissionsWarning')}
        message={
          <div>
            <p>
              {deleteWarning?.isBulk
                ? t('questionBuilder.activeSubmissionsMessage', { title: '', count: deleteWarning?.activeCount })
                : t('questionBuilder.activeSubmissionsMessage', { title: deleteWarning?.questionName || '', count: deleteWarning?.activeCount })
              }
            </p>
            <p className="mt-2 text-sm">Menghapus soal ini akan membuat submission yang sedang berjalan kehilangan data ini. Tetap hapus?</p>
          </div>
        }
        onConfirm={() => {
          if (deleteWarning?.isBulk) {
            setShowBulkDelete(true)
          } else {
            setDeleteTarget(deleteWarning?.questionObj)
          }
          setDeleteWarning(null)
        }}
        onCancel={() => setDeleteWarning(null)}
        confirmText="Tetap Hapus"
        variant="danger"
      />

      <ConfirmModal
        show={!!deleteTarget}
        title={t('questionBuilder.confirmDeleteQuestionTitle')}
        message={t('questionBuilder.confirmDeleteQuestionMessage', { title: (deleteTarget?.question_text || '').replace(/<[^>]*>/g, '').slice(0, 50) })}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={confirmLoading}
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        show={!!ungroupConfirm}
        title={ungroupConfirm?.mode === 'group' ? t('questionBuilder.confirmUngroupTitle', { n: ungroupConfirm.groupIndex }) : t('questionBuilder.confirmDeleteQuestionsTitle', { count: ungroupConfirm?.count || 0 })}
        message={
          ungroupConfirm?.mode === 'group'
            ? `Group ${ungroupConfirm.groupIndex} with ${ungroupConfirm.count} questions will be dissolved. The questions will remain as separate items in the same section.`
            : `Remove ${ungroupConfirm?.count || ''} question(s) from ${ungroupConfirm?.distinctCount || 1} group(s)? The questions will remain as separate items.`
        }
        onConfirm={async () => {
          const c = ungroupConfirm
          setUngroupConfirm(null)
          if (!c) return
          if (c.mode === 'group') {
            await handleUngroupGroup(c.groupId)
          } else {
            await handleUngroupSelected()
          }
        }}
        onCancel={() => setUngroupConfirm(null)}
        loading={ungrouping}
        confirmText={t('questionBuilder.bulkUngroup')}
        variant="secondary"
      />

      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
            onClick={() => { if (!importing) setShowImportModal(false) }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              className="bg-white dark:bg-ink-900 rounded-2xl w-full max-w-2xl max-h-[85dvh] flex flex-col shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-base sm:text-lg font-bold text-ink dark:text-gray-100">{t('questionBuilder.importTitle')}</h3>
                    <p className="text-[11px] sm:text-xs text-gray-400 dark:text-gray-500">{t('questionBuilder.importSubtitle')}</p>
                  </div>
                </div>
                <button
                  onClick={() => { if (!importing) setShowImportModal(false) }}
                  className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
                {importNeedsSection && (
                  <section>
                    <label className="field-label">Target section *</label>
                    <Select
                      value={importSectionId}
                      onChange={(e) => setImportSectionId(e.target.value)}
                    >
                      <option value="">{t('questionBuilder.noSection')}</option>
                      {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </Select>
                  </section>
                )}

                {/* Format rules */}
                <section>
                  <h4 className="text-xs sm:text-sm font-semibold text-ink dark:text-gray-100 mb-2">{t('questionBuilder.formatRules')}</h4>
                  <ul className="space-y-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-correct shrink-0 mt-0.5" /><span>Start each question with a number, e.g. <strong>1.</strong> or <strong>1)</strong></span></li>
                    <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-correct shrink-0 mt-0.5" /><span>List choices with letters: <strong>A.</strong>, <strong>B.</strong>, etc.</span></li>
                    <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-correct shrink-0 mt-0.5" /><span>Mark correct answer with <strong>Answer: B</strong></span></li>
                    <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-correct shrink-0 mt-0.5" /><span>Multiple correct = checkbox. No choices = essay.</span></li>
                  </ul>
                </section>

                {/* Example */}
                <section>
                  <h4 className="text-xs sm:text-sm font-semibold text-ink dark:text-gray-100 mb-2">{t('questionBuilder.example')}</h4>
                  <div className="rounded-xl bg-gray-50 dark:bg-ink-800/60 border border-gray-200 dark:border-gray-700 p-3 sm:p-4 font-mono text-[11px] sm:text-[13px] leading-relaxed text-gray-700 dark:text-gray-300 overflow-auto max-h-48 whitespace-pre">{`1. What is the capital of France?
   A. London
   B. Paris
   C. Berlin
   D. Madrid
   Answer: B

2. Which of the following are prime numbers?
   A. 2
   B. 4
   C. 7
   D. 9
   Answer: A, C

3. Explain how photosynthesis works.`}</div>
                </section>

                {/* Notes */}
                <section>
                  <h4 className="text-xs sm:text-sm font-semibold text-ink dark:text-gray-100 mb-2">{t('questionBuilder.notes')}</h4>
                  <ul className="space-y-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 list-disc pl-4">
                    <li>Only .docx files are accepted.</li>
                    <li>Imported questions are appended at the end.</li>
                    <li>For quizzes, points are redistributed automatically.</li>
                  </ul>
                </section>
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0 gap-2">
                <a
                  href="/template-soal.docx"
                  download
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-primary hover:text-primary-700 dark:hover:text-primary-300 transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{t('questionBuilder.downloadTemplate')}</span>
                  <span className="sm:hidden">{t('questionBuilder.template')}</span>
                </a>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowImportModal(false)} disabled={importing} size="sm">{t('questionBuilder.cancel')}</Button>
                  <Button
                    onClick={() => {
                      if (importNeedsSection && !importSectionId) { toast.error(t('questionBuilder.importNeedSection')); return }
                      docxRef.current?.click()
                    }}
                    loading={importing}
                    icon={!importing && <Upload className="w-4 h-4" />}
                    size="sm"
                  >
                    {importing ? 'Importing...' : 'Choose file'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
