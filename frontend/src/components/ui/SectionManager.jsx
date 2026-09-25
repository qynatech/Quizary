import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, X, Plus, Check, ChevronDown, ChevronUp, Pencil, Trash2, ArrowRight } from 'lucide-react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, pointerWithin,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { useTranslation } from 'react-i18next'
import { Button, Badge, ConfirmModal } from '../../components/ui'
import { stripTags } from '../../lib/sanitize'

const QUESTION_TYPE_KEYS = {
  multiple_choice: 'questionBuilder.typeMultipleChoice',
  checkbox: 'questionBuilder.typeCheckbox',
  dropdown: 'questionBuilder.typeDropdown',
  short_answer: 'questionBuilder.typeShortAnswer',
  essay: 'questionBuilder.typeEssay',
  password: 'questionBuilder.typePassword',
  date: 'questionBuilder.typeDate',
  time: 'questionBuilder.typeTime',
  datetime: 'questionBuilder.typeDatetime',
  file_upload: 'questionBuilder.typeFileUpload',
}

const textOf = (html) => stripTags(html || '')

function SortableSectionCard({ section, questions, canDelete, onDelete, editing, editDraft, setEditDraft, onEditStart, onEditSave, onEditCancel, collapsed, onToggleCollapse, onMove, isFirst, isLast, selectedIds, onToggleQuestion, onToggleSection, numberById }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useSortable({
    id: section.id,
    data: { type: 'section' },
  })
  const style = isDragging
    ? { transform: CSS.Transform.toString(transform), transition: 'none' }
    : undefined
  const secQs = questions.filter((q) => q.section_id === section.id)
  const allChecked = secQs.length > 0 && secQs.every((q) => selectedIds.includes(q.id))

  return (
    <motion.div
      data-tour="section-manager-section"
      layout={!isDragging}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ layout: { duration: 0.2, ease: 'easeOut' } }}
    >
      <div
        ref={setNodeRef}
        style={style}
        className={`rounded-xl border transition-all ${isDragging ? 'opacity-40 border-primary' : 'border-gray-200 dark:border-gray-700'}`}
      >
      <div className="flex items-center gap-3 px-4 py-3 cursor-default">
        <span
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          className="hidden md:block text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing"
          title={t('sectionManager.dragSection')}
        >
          <GripVertical className="w-5 h-5" />
        </span>
        {onMove && (
          <span className="flex md:hidden flex-col gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={isFirst}
              aria-label={t('sectionManager.moveSectionUp')}
              className="w-6 h-6 rounded-md bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={isLast}
              aria-label={t('sectionManager.moveSectionDown')}
              className="w-6 h-6 rounded-md bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          title={collapsed ? t('sectionManager.showQuestions') : t('sectionManager.hideQuestions')}
          className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-primary hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        {editing ? (
          <>
            <input
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel() }}
              className="input-field h-8 text-sm flex-1"
              autoFocus
            />
            <Button size="sm" onClick={onEditSave} icon={<Check className="w-3.5 h-3.5" />}>
              <span className="hidden sm:inline">{t('common.save')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onEditCancel} icon={<X className="w-3.5 h-3.5" />}>
              <span className="hidden sm:inline">{t('common.cancel')}</span>
            </Button>
          </>
        ) : (
          <>
            <span className="font-display font-semibold text-ink dark:text-gray-100 flex-1 truncate text-sm">{section.title}</span>
            <Badge scheme="gray" className="hidden sm:inline-flex">{t('sectionManager.questionCount', { count: secQs.length })}</Badge>
            <Badge scheme="gray" className="sm:hidden">{t('sectionManager.questionCountShort', { count: secQs.length })}</Badge>
            <button onClick={onEditStart} title={t('sectionManager.renameSection')} className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-primary p-1.5 transition-colors shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {canDelete && (
              <button onClick={onDelete} title={t('sectionManager.deleteSection')} className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-incorrect p-1.5 transition-colors shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Collapsed: header saja */}
      {!collapsed && (secQs.length > 0 ? (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 space-y-1.5">
          <label className="flex items-center gap-2 px-2 pt-0.5 text-xs font-medium text-gray-400 dark:text-gray-500 cursor-pointer hover:text-primary transition-colors">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => onToggleSection(section.id)}
              className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
            />
            {t('sectionManager.selectAllInSection')}
          </label>
          {secQs.map((q) => (
            <SelectableQuestion key={q.id} q={q} selected={selectedIds.includes(q.id)} onToggle={() => onToggleQuestion(q.id)} fallback={t('sectionManager.questionFallback', { n: numberById.get(q.id) ?? '' }).trim()} />
          ))}
        </div>
      ) : (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center italic">
          {t('sectionManager.noQuestions')}
        </div>
      ))}
    </div>
    </motion.div>
  )
}

function SelectableQuestion({ q, selected, onToggle, fallback }) {
  const { t } = useTranslation()
  const label = textOf(q.question_text).slice(0, 60)
  const hasMedia = !!(q.image?.path || q.audio?.path)
  return (
    <label
      className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
        selected
          ? 'bg-primary-50 dark:bg-primary-900/20 text-ink dark:text-gray-100'
          : 'bg-gray-50 dark:bg-ink-800/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-ink-800'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
      />
      <span className={`truncate flex-1 ${label ? '' : 'italic text-gray-400 dark:text-gray-500'}`}>
        {label || fallback}{!label && hasMedia ? ` · ${t('sectionManager.hasMedia')}` : ''}
      </span>
      <Badge scheme="gray" className="text-[10px] shrink-0">{QUESTION_TYPE_KEYS[q.type] ? t(QUESTION_TYPE_KEYS[q.type]) : q.type}</Badge>
    </label>
  )
}

export default function SectionManager({ formId, show, onClose, sections: initialSections, questions: initialQuestions, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [sections, setSections] = useState(initialSections || [])
  const [questions, setQuestions] = useState(initialQuestions || [])
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sectionReordering, setSectionReordering] = useState(false)
  const [newSectionOpen, setNewSectionOpen] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [creatingSection, setCreatingSection] = useState(false)
  const [activeDrag, setActiveDrag] = useState(null)
  const dragStartOrderRef = useRef(null)
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const [selectedIds, setSelectedIds] = useState([])
  const [targetSectionId, setTargetSectionId] = useState('')
  const [moving, setMoving] = useState(false)

  const toggleCollapse = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleQuestion = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSection = (sectionId) => {
    const secQs = questions.filter((q) => q.section_id === sectionId)
    const ids = secQs.map((q) => q.id)
    setSelectedIds((prev) => {
      const allIn = ids.length > 0 && ids.every((id) => prev.includes(id))
      if (allIn) return prev.filter((id) => !ids.includes(id))
      return [...new Set([...prev, ...ids])]
    })
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (show) {
      setSections(initialSections || [])
      setQuestions(initialQuestions || [])
      setCollapsedIds(new Set((initialSections || []).map((s) => s.id)))
      setSelectedIds([])
      setTargetSectionId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  const load = () => {
    Promise.all([
      api.get(`/forms/${formId}/sections`),
      api.get(`/forms/${formId}/questions`),
    ]).then(([sRes, qRes]) => {
      setSections(sRes.data.data)
      setQuestions(qRes.data.data)
    }).catch(() => {})
  }

  const moveSelected = async () => {
    const target = Number(targetSectionId)
    if (!target || !sections.some((s) => s.id === target)) return
    const toMove = questions.filter((q) => selectedIds.includes(q.id) && q.section_id !== target)
    if (!toMove.length) {
      toast.error(t('sectionManager.alreadyInSection'))
      return
    }
    setMoving(true)
    const prevQuestions = questions
    setQuestions((prev) =>
      prev.map((q) => (toMove.some((m) => m.id === q.id) ? { ...q, section_id: target } : q))
    )
    try {
      const { data } = await api.post(`/forms/${formId}/questions/bulk-move-section`, {
        question_ids: toMove.map((q) => q.id),
        section_id: target,
      })
      const moved = data?.moved ?? toMove.length
      toast.success(t('sectionManager.moved', { count: moved }))
      setSelectedIds([])
      setTargetSectionId('')
      load()
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || t('sectionManager.moveFailed'))
      setQuestions(prevQuestions)
    } finally {
      setMoving(false)
    }
  }

  // Section asal (tempat soal terpilih berada) disembunyikan dari dropdown
  // tujuan — pindah ke section sendiri = pemborosan pilihan.
  const sourceSectionIds = new Set(
    questions.filter((q) => selectedIds.includes(q.id)).map((q) => q.section_id)
  )
  const targetSections = sections.filter((s) => !sourceSectionIds.has(s.id))

  const handleDragStart = (event) => {
    setActiveDrag({ type: event.active.data.current?.type, id: event.active.id })
    dragStartOrderRef.current = sections.map((s) => s.id)
  }

  const restoreSectionOrder = () => {
    const snap = dragStartOrderRef.current
    dragStartOrderRef.current = null
    if (!snap) return
    setSections((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]))
      const restored = snap.map((id) => byId.get(id)).filter(Boolean)
      return restored.length === prev.length ? restored : prev
    })
  }

  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over) return
    setSections((prev) => {
      const from = prev.findIndex((s) => s.id === active.id)
      const to = prev.findIndex((s) => s.id === over.id)
      if (from === -1 || to === -1 || from === to) return prev
      return arrayMove(prev, from, to)
    })
  }

  const moveSection = async (index, dir) => {
    const to = index + dir
    if (to < 0 || to >= sections.length) return
    const next = arrayMove(sections, index, to)
    setSections(next)
    setSectionReordering(true)
    try {
      await api.patch('/sections/reorder', { form_id: parseInt(formId), orders: next.map((s) => s.id) })
      onSaved()
    } catch {
      toast.error(t('sectionManager.orderFailed'))
      load()
    } finally {
      setSectionReordering(false)
    }
  }

  const handleDragEnd = async () => {
    setActiveDrag(null)
    const before = dragStartOrderRef.current
    dragStartOrderRef.current = null
    const ids = sections.map((s) => s.id)
    if (!before || JSON.stringify(ids) === JSON.stringify(before)) return
    setSectionReordering(true)
    try {
      await api.patch('/sections/reorder', { form_id: parseInt(formId), orders: ids })
      onSaved()
    } catch {
      toast.error(t('sectionManager.orderFailed'))
      load()
    } finally {
      setSectionReordering(false)
    }
  }

  const renameSection = async (section) => {
    if (!editDraft.trim()) return
    try {
      await api.patch(`/sections/${section.id}`, { title: editDraft.trim() })
      setEditingId(null)
      toast.success(t('sectionManager.renamed'))
      load()
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to rename section')
    }
  }

  const deleteSection = async () => {
    if (!deleteTarget) return
    try {
      const { data } = await api.delete(`/sections/${deleteTarget.id}`)
      setDeleteTarget(null)
      const moved = data?.moved_question_count || 0
      toast.success(
        moved > 0
          ? t('sectionManager.deletedWithMoved', { count: moved })
          : t('sectionManager.deleted')
      )
      load()
      onSaved()
    } catch {
      toast.error(t('sectionManager.deleteFailed'))
      setDeleteTarget(null)
    }
  }

  const createSection = async () => {
    if (!newSectionTitle.trim()) return
    setCreatingSection(true)
    try {
      await api.post(`/forms/${formId}/sections`, { title: newSectionTitle.trim() })
      setNewSectionTitle('')
      setNewSectionOpen(false)
      toast.success(t('sectionManager.added'))
      load()
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || t('sectionManager.addFailed'))
    } finally {
      setCreatingSection(false)
    }
  }

  const activeSection = activeDrag?.type === 'section'
    ? sections.find((s) => s.id === Number(activeDrag.id))
    : null

  // Nomor global soal (urutan form) untuk fallback "Soal N" saat
  // question_text kosong — mis. soal import yang cuma gambar/audio.
  const numberById = new Map(
    [...questions]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.id - b.id)
      .map((q, i) => [q.id, i + 1])
  )

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm"
            onClick={onClose}
          />
           <motion.div
             data-tour="section-manager-panel"
             initial={{ x: '100%' }}

            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 border border-l dark:border-ink-800 bottom-0 z-50 w-full max-w-lg bg-white dark:bg-ink-900 flex flex-col shadow-lift"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div>
                <h2 className="font-display text-lg font-bold text-ink dark:text-gray-100">{t('sectionManager.title')}</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('sectionManager.subtitle')}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={() => { setActiveDrag(null); restoreSectionOrder() }}
            >
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
                {sectionReordering && (
                  <div className="text-xs text-primary font-medium flex items-center gap-1.5 mb-2">
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {t('sectionManager.savingOrder')}
                  </div>
                )}

                {sections.length === 0 && !newSectionOpen && (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                    {t('sectionManager.emptyTitle')}
                  </div>
                )}

                <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {sections.map((section, secIdx) => (
                     <SortableSectionCard
                       key={section.id}
                       section={section}
                       questions={questions}
                       canDelete={sections.length > 1}
                       editing={editingId === section.id}
                       editDraft={editDraft}
                       setEditDraft={setEditDraft}
                       onEditStart={() => { setEditingId(section.id); setEditDraft(section.title) }}
                       onEditSave={() => renameSection(section)}
                       onEditCancel={() => setEditingId(null)}
                        onDelete={() => setDeleteTarget(section)}
                        collapsed={collapsedIds.has(section.id)}
                        onToggleCollapse={() => toggleCollapse(section.id)}
                        onMove={(dir) => moveSection(secIdx, dir)}
                        isFirst={secIdx === 0}
                        isLast={secIdx === sections.length - 1}
                        selectedIds={selectedIds}
                        onToggleQuestion={toggleQuestion}
                        onToggleSection={toggleSection}
                        numberById={numberById}
                     />
                   ))}
                </SortableContext>

                {newSectionOpen ? (
                  <div className="flex gap-2 items-center">
                    <input
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createSection() }}
                      className="input-field h-9 text-sm flex-1"
                      placeholder={t('sectionManager.sectionNamePlaceholder')}
                      autoFocus
                    />
                    <Button size="sm" onClick={createSection} loading={creatingSection} disabled={!newSectionTitle.trim()} icon={<Check className="w-3.5 h-3.5" />}>
                      <span className="hidden sm:inline">{t('sectionManager.add')}</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setNewSectionOpen(false); setNewSectionTitle('') }} icon={<X className="w-3.5 h-3.5" />}>
                      <span className="hidden sm:inline">{t('common.cancel')}</span>
                    </Button>
                  </div>
                ) : (
                   <button
                     data-tour="section-manager-add"
                     onClick={() => setNewSectionOpen(true)}

                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400 dark:text-gray-500 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {t('sectionManager.addSection')}
                  </button>
                )}
              </div>

              <DragOverlay dropAnimation={null} className="origin-top-left">
                {activeSection && (
                  <div className="bg-white dark:bg-ink-900 border border-primary/40 rounded-xl shadow-lift px-4 w-[280px] h-11 flex items-center font-display font-semibold text-ink dark:text-gray-100">
                    <span className="truncate">{activeSection.title}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            {selectedIds.length > 0 && (
              <div data-tour="section-manager-move" className="shrink-0 border-t border-gray-100 dark:border-gray-700 px-5 py-3 bg-gray-50/80 dark:bg-ink-800/60 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                  {t('sectionManager.selectedCount', { count: selectedIds.length })}
                </span>
                <select
                  value={targetSectionId}
                  onChange={(e) => setTargetSectionId(e.target.value)}
                  className="input-field h-9 text-sm flex-1 min-w-0"
                >
                  <option value="">{t('sectionManager.moveTo')}</option>
                  {targetSections.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedIds([]); setTargetSectionId('') }}>
                  {t('sectionManager.clear')}
                </Button>
                <Button
                  size="sm"
                  onClick={moveSelected}
                  loading={moving}
                  disabled={!targetSectionId || moving}
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  {t('sectionManager.move')}
                </Button>
              </div>
            )}

            <ConfirmModal
              show={!!deleteTarget}
              title={t('sectionManager.deleteTitle')}
              message={t('sectionManager.deleteMessage', { title: deleteTarget?.title || '' })}
              onConfirm={deleteSection}
              onCancel={() => setDeleteTarget(null)}
              confirmText={t('common.delete')}
              variant="danger"
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
