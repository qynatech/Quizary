import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, X, Plus, Check, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, useDraggable, pointerWithin,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { Button, Badge, ConfirmModal } from '../../components/ui'

const QUESTION_PREFIX = 'q-'

function SortableSectionCard({ section, questions, canDelete, onDelete, editing, editDraft, setEditDraft, onEditStart, onEditSave, onEditCancel, collapsed, onToggleCollapse, onMove, isFirst, isLast }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useSortable({
    id: section.id,
    data: { type: 'section' },
  })
  // ponytail: dnd-kit transform hanya aktif saat drag. Untuk mobile reorder
  // (tombol ↑↓), framer-motion `layout` handle animasi position change.
  const style = isDragging
    ? { transform: CSS.Transform.toString(transform), transition: 'none' }
    : undefined // framer layout handles non-drag reorder
  const secQs = questions.filter((q) => q.section_id === section.id)

  return (
    <motion.div
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
          title="Drag to reorder sections"
        >
          <GripVertical className="w-5 h-5" />
        </span>
        {onMove && (
          <span className="flex md:hidden flex-col gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={isFirst}
              aria-label="Move section up"
              className="w-6 h-6 rounded-md bg-white dark:bg-ink-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={isLast}
              aria-label="Move section down"
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
          title={collapsed ? 'Show questions' : 'Hide questions'}
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
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onEditCancel} icon={<X className="w-3.5 h-3.5" />}>
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          </>
        ) : (
          <>
            <span className="font-display font-semibold text-ink dark:text-gray-100 flex-1 truncate text-sm">{section.title}</span>
            <Badge scheme="gray" className="hidden sm:inline-flex">{secQs.length} question(s)</Badge>
            <Badge scheme="gray" className="sm:hidden">{secQs.length}Q</Badge>
            <button onClick={onEditStart} title="Rename section" className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-primary p-1.5 transition-colors shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {canDelete && (
              <button onClick={onDelete} title="Delete section" className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-incorrect p-1.5 transition-colors shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Collapsed: header saja — drop ke card tetap berfungsi */}
      {!collapsed && (isDragging ? (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center italic">
          Releasing question… drag to move
        </div>
      ) : secQs.length > 0 ? (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 space-y-1.5">
          {secQs.map((q) => (
            <DraggableQuestion key={q.id} q={q} />
          ))}
        </div>
      ) : (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center italic">
          Drop questions here
        </div>
      ))}
    </div>
    </motion.div>
  )
}

function DraggableQuestion({ q }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${QUESTION_PREFIX}${q.id}`,
    data: { type: 'question', questionId: q.id },
  })
  return (
    <div
      ref={setNodeRef}
      className={`group flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-ink-800/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors ${isDragging ? 'opacity-40' : ''}`}
      style={{userSelect:'none'}}
    >
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing inline-flex shrink-0">
        <GripVertical className="w-3.5 h-3.5 opacity-50" />
      </span>
      <span className="truncate flex-1">{(q.question_text || '').replace(/<[^>]*>/g, '').slice(0, 60)}</span>
      <Badge scheme="gray" className="text-[10px] shrink-0">{q.type.replace('_', ' ')}</Badge>
    </div>
  )
}

export default function SectionManager({ formId, show, onClose, sections: initialSections, questions: initialQuestions, onSaved }) {
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
  // Default tiap card collapse biar list pendek & drag ringan.
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())

  const toggleCollapse = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
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

  const moveQuestionToSection = async (qId, targetSectionId) => {
    const q = questions.find((qq) => qq.id === qId)
    if (!q) return

    if (!sections.some((s) => s.id === targetSectionId)) return
    if (q.section_id === targetSectionId) return

    setQuestions((prev) =>
      prev.map((qq) => qq.id === qId ? { ...qq, section_id: targetSectionId } : qq)
    )

    try {
      await api.put(`/questions/${qId}`, { section_id: targetSectionId })
      toast.success('Question moved')
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to move question')
      load()
    }
  }

  const handleDragStart = (event) => {
    setActiveDrag({ type: event.active.data.current?.type, id: event.active.id })
    // Snapshot urutan section sebelum drag — acuan rollback & deteksi perubahan.
    if (event.active.data.current?.type === 'section') {
      dragStartOrderRef.current = sections.map((s) => s.id)
    }
  }

  // Kembalikan urutan section ke kondisi pra-drag (dipakai saat drop di luar
  // droppable / drag dibatalkan — dragOver sudah menukar state secara live).
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
    if (active.data.current?.type !== 'section') return
    // Functional update — hindari swap ping-pong dari indeks closure basi.
    setSections((prev) => {
      const from = prev.findIndex((s) => s.id === active.id)
      const to = prev.findIndex((s) => s.id === over.id)
      if (from === -1 || to === -1 || from === to) return prev
      return arrayMove(prev, from, to)
    })
  }

  const handleDragCancel = () => setActiveDrag(null)

  // Pindah section via tombol panah (mobile — drag sentuh sering bentrok scroll).
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
      toast.error('Failed to save section order')
      load()
    } finally {
      setSectionReordering(false)
    }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveDrag(null)
    if (!over) {
      // Drop di luar semua droppable — batalkan swap hasil onDragOver.
      restoreSectionOrder()
      return
    }

    const type = active.data.current?.type

    // Resolusi drop target: drop boleh di mana saja DI DALAM section tujuan —
    // termasuk di atas kartu soalnya (id ber-prefix 'q-'). Tanpa ini, drop di
    // atas kartu soal tidak melakukan apa-apa dan drop ke pool salah mengenai
    // section terdekat (collision rect corner).
    const resolveTarget = () => {
      if (typeof over.id === 'string' && over.id.startsWith(QUESTION_PREFIX)) {
        const overQ = questions.find((qq) => qq.id === Number(over.id.slice(QUESTION_PREFIX.length)))
        if (!overQ) return null
        return overQ.section_id
      }
      return over.id
    }

    if (type === 'question') {
      const qId = Number(active.data.current.questionId)
      const target = resolveTarget()
      if (typeof target === 'number') {
        await moveQuestionToSection(qId, target)
      }
      return
    }

    if (type === 'section') {
      // Urutan final SUDAH diatur live oleh onDragOver. Jangan hitung
      // oldIndex/newIndex lagi dari state yang sudah terswap — itu membuat
      // guard `oldIndex === newIndex` selamat return dan API tidak pernah
      // dipanggil (bug lama). Bandingkan saja dengan snapshot awal drag.
      const before = dragStartOrderRef.current
      dragStartOrderRef.current = null
      const ids = sections.map((s) => s.id)
      if (!before || JSON.stringify(ids) === JSON.stringify(before)) return

      setSectionReordering(true)
      try {
        await api.patch('/sections/reorder', { form_id: parseInt(formId), orders: ids })
        onSaved()
      } catch {
        toast.error('Failed to save section order')
        load()
      } finally {
        setSectionReordering(false)
      }
    }
  }

  const renameSection = async (section) => {
    if (!editDraft.trim()) return
    try {
      await api.patch(`/sections/${section.id}`, { title: editDraft.trim() })
      setEditingId(null)
      toast.success('Section renamed')
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
          ? `Section deleted — ${moved} question(s) moved to a nearby section`
          : 'Section deleted'
      )
      load()
      onSaved()
    } catch {
      toast.error('Failed to delete section')
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
      toast.success('Section added')
      load()
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add section')
    } finally {
      setCreatingSection(false)
    }
  }

  const activeQuestion = activeDrag?.type === 'question'
    ? questions.find((q) => q.id === Number(activeDrag.id?.toString().replace(QUESTION_PREFIX, '')))
    : null
  const activeSection = activeDrag?.type === 'section'
    ? sections.find((s) => s.id === Number(activeDrag.id))
    : null

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
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white dark:bg-ink-900 flex flex-col shadow-lift"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div>
                <h2 className="font-display text-lg font-bold text-ink dark:text-gray-100">Manage Sections</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Drag sections to reorder · Drag questions to move</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-xl text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <DndContext
              sensors={sensors}
              // pointerWithin: drop hanya mengenai droppable yang DIBAWAH POINTER —
              // closestCorners memilih rect terdekat, sehingga drop ke pool
              // bisa salah mendarat di section terdekat (bug lama).
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
                    Saving section order...
                  </div>
                )}

                {sections.length === 0 && !newSectionOpen && (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                    No sections yet. Add one to organize your questions.
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
                      placeholder="Section name"
                      autoFocus
                    />
                    <Button size="sm" onClick={createSection} loading={creatingSection} disabled={!newSectionTitle.trim()} icon={<Check className="w-3.5 h-3.5" />}>
                      <span className="hidden sm:inline">Add</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setNewSectionOpen(false); setNewSectionTitle('') }} icon={<X className="w-3.5 h-3.5" />}>
                      <span className="hidden sm:inline">Cancel</span>
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setNewSectionOpen(true)}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400 dark:text-gray-500 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Section
                  </button>
                )}
              </div>

              <DragOverlay dropAnimation={null} className="origin-top-left">
                {activeQuestion && (
                  <div className="bg-white dark:bg-ink-900 border border-primary/40 rounded-lg shadow-lift px-3 py-2 h-10 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 opacity-50" />
                    <span className="truncate max-w-[280px]">{(activeQuestion.question_text || '').replace(/<[^>]*>/g, '').slice(0, 60)}</span>
                  </div>
                )}
                {activeSection && (
                  <div className="bg-white dark:bg-ink-900 border border-primary/40 rounded-xl shadow-lift px-4 w-[280px] h-11 flex items-center font-display font-semibold text-ink dark:text-gray-100">
                    <span className="truncate">{activeSection.title}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            <ConfirmModal
              show={!!deleteTarget}
              title="Delete Section?"
              message={`Section "${deleteTarget?.title || ''}" will be deleted. Questions inside will be moved to a nearby section.`}
              onConfirm={deleteSection}
              onCancel={() => setDeleteTarget(null)}
              confirmText="Delete"
              variant="danger"
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
