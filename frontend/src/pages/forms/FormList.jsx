import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ClipboardList, Search, Trophy, HelpCircle, FolderOpen, Settings2, MoreVertical, Pencil, FolderInput, Trash2, CheckSquare, Check, X } from 'lucide-react'
import api from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { useHoldSelect } from '../../hooks/useHoldSelect'
import { stripTags } from '../../lib/sanitize'
import { Button, Input, Card, PageHeader, EmptyState, CardSkeleton, SpotlightCard, RichText, CategoryManager, ConfirmModal } from '../../components/ui'

const TABS = ['All', 'Draft', 'Published', 'Closed']

const STATUS_DOT = {
  published: 'bg-correct',
  draft: 'bg-gray-400',
  closed: 'bg-incorrect',
}

function themeVars(color) {
  if (!color) {
    return {
      '--tb': '#8B7CF6',
      '--tbb': 'rgba(139,124,246,0.45)',
      '--tbbd': 'rgba(139,124,246,0.55)',
      '--ts': 'rgba(139,124,246,0.14)',
    }
  }
  return { '--tb': color, '--tbb': `${color}59`, '--tbbd': `${color}b3`, '--ts': `${color}24` }
}

function FormTypeCluster({ form }) {
  const isQuiz = form.type === 'quiz'
  return (
    <div className="absolute bottom-3 right-3 z-10 flex -space-x-2">
      <span
        className="relative z-30 w-9 h-9 rounded-xl border-2 flex items-center justify-center shadow-chip transition-all duration-200 ease-in-out group-hover:-translate-y-1 group-hover:-rotate-6"
        style={{ backgroundColor: 'var(--ts)', color: 'var(--tb)', borderColor: 'var(--ts)' }}
        title={isQuiz ? 'Quiz' : 'Form'}
      >
        {isQuiz ? <Trophy className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
      </span>
      <span
        className="relative z-20 h-9 px-2.5 rounded-xl border-2 flex items-center gap-1 text-xs font-bold tabular-nums shadow-chip bg-white dark:bg-ink-800 text-gray-600 dark:text-gray-300 transition-all duration-200 ease-in-out group-hover:-translate-y-2 delay-[40ms]"
        style={{ borderColor: 'var(--ts)' }}
        title={`${form.question_count} question(s)`}
      >
        <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
        {form.question_count}
      </span>
      <span className="relative z-10 w-9 h-9 rounded-xl border-2 flex items-center justify-center bg-white dark:bg-ink-800 shadow-chip transition-all duration-200 ease-in-out group-hover:-translate-y-3 delay-[80ms]" style={{ borderColor: 'var(--ts)' }} title={form.status}>
        <span className={`w-3 h-3 rounded-full ${STATUS_DOT[form.status] || 'bg-gray-400'}`} />
      </span>
    </div>
  )
}

// Card visual with overlay category + menu button (menu mati saat mode seleksi)
function FormVisual({ form, onMenu, menuOpen, selectionMode, badgeOffset }) {
  const { t } = useTranslation()
  const visual = form.banner_path ? (
    <img
      src={form.banner_path}
      alt=""
      className="w-full h-44 object-cover"
      loading="lazy"
    />
  ) : (
    <div
      className="h-44 w-full flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, var(--ts) 0%, var(--tbb) 100%)` }}
    >
      {form.type === 'quiz'
        ? <Trophy className="w-12 h-12 opacity-20" style={{ color: 'var(--tb)' }} />
        : <ClipboardList className="w-12 h-12 opacity-20" style={{ color: 'var(--tb)' }} />}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, var(--tb) 1px, transparent 0)`, backgroundSize: '18px 18px' }} />
    </div>
  )

  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl border-2 border-[var(--tbb)] dark:border-[var(--tbbd)] mb-3 group/visual">
      {visual}
      {/* subtle top gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-transparent pointer-events-none" />

      {/* category overlay - kiri atas, geser kanan saat checkbox seleksi tampil */}
      {form.category && (
        <div className={`absolute top-2.5 z-20 transition-all duration-150 ${badgeOffset ? 'left-12' : 'left-2.5'}`}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl bg-white/90 dark:bg-ink-900/80 border border-white/60 dark:border-gray-700/60 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
            <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: form.category.color || '#8B7CF6' }} />
            <span className="text-ink dark:text-gray-100 max-w-[110px] truncate">{form.category.name}</span>
          </span>
        </div>
      )}

      {/* titik tiga - kanan atas, disembunyikan saat mode seleksi */}
      {!selectionMode && (
        <div className="absolute top-2.5 right-2.5 z-20">
          <button
            onClick={onMenu}
            aria-label={t('forms.quickActions')}
            className={`w-8 h-8 rounded-full backdrop-blur-xl border shadow-sm flex items-center justify-center transition-all ${menuOpen ? 'bg-ink text-white border-ink dark:bg-white dark:text-ink' : 'bg-white/90 dark:bg-ink-900/80 border-white/60 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-white hover:scale-105'}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// Kartu form yang bisa diseleksi — satu komponen per kartu agar hook
// hold-select aman Rules of Hooks. Hold (mobile) masuk mode seleksi + haptic;
// saat mode aktif tap = toggle, saat nonaktif tap = buka detail.
function FormCardItem({ form, index, selected, selectedCount, selectionMode, onToggle, onOpen, menuOpen, onMenu, onEdit, onMove, onDelete }) {
  const { t } = useTranslation()
  const holdProps = useHoldSelect({ selectedCount, onToggle: () => onToggle(form.id), onTap: () => onOpen(form) })
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25,0.1,0.25,1] }}
      className="h-full select-none"
      onPointerDown={holdProps.onPointerDown}
      onPointerMove={holdProps.onPointerMove}
      onPointerUp={holdProps.onPointerUp}
      onPointerLeave={holdProps.onPointerLeave}
      onPointerCancel={holdProps.onPointerCancel}
      onContextMenu={holdProps.onContextMenu}
    >
      <SpotlightCard className="h-full rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] will-change-transform hover:-translate-y-1 hover:shadow-[0_10px_30px_-20px_var(--tb)]" intensity={0.08} style={themeVars(form.theme_color)}>
        <Card
          onClick={(e) => { e.stopPropagation(); holdProps.onClick() }}
          className={`cursor-pointer h-full flex flex-col relative group border-2 border-[var(--tbb)] dark:border-[var(--tbbd)] hover:border-[var(--tb)] transition-colors duration-300 ${selected ? '!border-primary ring-2 ring-primary/30 bg-primary-50/40 dark:bg-primary-900/15' : ''}`}
          style={themeVars(form.theme_color)}
        >
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-40 group-hover:opacity-70"
            style={{ background: 'radial-gradient(520px 280px at 85% 100%, var(--ts) 0%, transparent 62%)' }}
          />

          {/* checkbox seleksi — di dalam kartu (kiri atas visual) agar tidak
              terpotong overflow parent; badge kategori digeser saat ia tampil */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(form.id) }}
            aria-label={t('forms.selectForm', { title: stripTags(form.title) })}
            aria-pressed={selected}
            className={`absolute top-3 left-3 z-30 w-7 h-7 rounded-full border-2 shadow-lg flex items-center justify-center transition-all duration-150 active:scale-90 ${selected ? 'bg-primary border-primary text-white' : 'bg-white/95 dark:bg-ink-800/95 border-gray-300 dark:border-gray-600 text-transparent hover:border-primary'} ${selectionMode || selected ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'}`}
          >
            <Check className="w-4 h-4" strokeWidth={3} />
          </button>

          <FormVisual form={form} menuOpen={menuOpen} selectionMode={selectionMode} badgeOffset={selectionMode || selected} onMenu={(e)=>{ e.stopPropagation(); onMenu() }} />

          {/* menu dropdown — mati total saat mode seleksi */}
          <AnimatePresence>
            {menuOpen && !selectionMode && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e)=>{ e.stopPropagation(); onMenu() }} />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="absolute top-[56px] right-3 z-20 w-56 overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-ink-800 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
                  onClick={(e)=>e.stopPropagation()}
                >
                  <div className="p-1.5">
                    <button onClick={(e)=>{ e.stopPropagation(); onMenu(); onEdit(form)}} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-ink-700 transition-colors">
                      <Pencil className="w-4 h-4 text-gray-400" /> {t('forms.menuEdit')}
                    </button>
                    <button onClick={(e)=>{ e.stopPropagation(); onMenu(); onMove(form)}} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-ink dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-ink-700 transition-colors">
                      <FolderInput className="w-4 h-4 text-primary" /> {t('forms.menuMoveCategory')}
                    </button>
                    <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
                    <button onClick={(e)=>{ e.stopPropagation(); onMenu(); onDelete(form)}} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-incorrect hover:bg-incorrect-soft transition-colors">
                      <Trash2 className="w-4 h-4" /> {t('forms.menuDelete')}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <h3 className="relative text-[17px] font-display font-semibold text-ink dark:text-gray-100 leading-tight line-clamp-2"><RichText html={form.title} /></h3>
          <div className="relative h-7 mt-3" />
          <FormTypeCluster form={form} />
        </Card>
      </SpotlightCard>
    </motion.div>
  )
}

function CategoryMoveModal({ open, onClose, form, forms: formsProp, categories, onMoved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)

  // Mode bulk bila forms[] diisi; satuan bila form diisi (kompatibel pemanggil lama)
  const targets = formsProp?.length ? formsProp : (form ? [form] : [])
  const isBulk = (formsProp?.length || 0) > 0

  useEffect(() => {
    if (!open || targets.length === 0) return
    // Bulk: preselect bila semua target sekategori, bila beda → null (tanpa kategori)
    const first = targets[0].category_id || null
    setSelected(targets.every((f) => (f.category_id || null) === first) ? first : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || targets.length === 0) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isBulk) {
        const res = await api.patch('/forms/category', { form_ids: targets.map((f) => f.id), category_id: selected })
        toast.success(res.data.message || t('forms.bulkMoved', { count: res.data.moved ?? targets.length }))
        onMoved?.(res.data)
      } else {
        if (selected === (targets[0].category_id || null)) { onClose(); return }
        const res = await api.put(`/forms/${targets[0].id}`, { category_id: selected })
        toast.success(selected ? t('forms.movedTo', { category: categories.find(c=>c.id===selected)?.name }) : t('forms.removedFromCategory'))
        onMoved?.(res.data)
      }
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.moveFailed'))
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" onClick={onClose}>
          <motion.div initial={{ scale: 0.96, y: 8, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.96, y: 8, opacity: 0 }} className="bg-white dark:bg-ink-900 rounded-2xl w-full max-w-md shadow-lift overflow-hidden" onClick={(e)=>e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4">
              <h3 className="font-display text-lg font-bold text-ink dark:text-gray-100 flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-primary" /> {isBulk ? t('forms.bulkMoveTitle', { count: targets.length }) : t('forms.changeCategoryTitle')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{isBulk ? t('forms.bulkMoveSubtitle', { count: targets.length }) : `“${stripTags(targets[0].title)}”`}</p>
            </div>
            <div className="px-3 pb-3 max-h-[320px] overflow-y-auto space-y-1">
              <button
                onClick={()=>setSelected(null)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-all ${selected===null ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-transparent bg-gray-50 dark:bg-ink-800 hover:border-gray-200 dark:hover:border-gray-700'}`}
              >
                <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-ink-700 flex items-center justify-center shrink-0"><FolderOpen className="w-4 h-4 text-gray-500" /></span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink dark:text-gray-100">{t('forms.noCategory')}</span>
                  <span className="block text-xs text-gray-400">{t('forms.noCategoryDesc')}</span>
                </span>
                {selected===null && <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0"><span className="w-2 h-2 rounded-full bg-white" /></span>}
              </button>
              {categories.map((cat)=>(
                <button
                  key={cat.id}
                  onClick={()=>setSelected(cat.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-all ${selected===cat.id ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-transparent bg-gray-50 dark:bg-ink-800 hover:border-gray-200 dark:hover:border-gray-700'}`}
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${cat.color || '#8B7CF6'}18`, color: cat.color || '#8B7CF6' }}>
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#8B7CF6' }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink dark:text-gray-100 truncate">{cat.name}</span>
                    <span className="block text-xs text-gray-400">{cat.form_count} form</span>
                  </span>
                  {selected===cat.id && <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0"><span className="w-2 h-2 rounded-full bg-white" /></span>}
                </button>
              ))}
            </div>
            <div className="px-6 py-4 flex gap-3 border-t border-gray-100 dark:border-gray-800">
              <Button variant="ghost" className="flex-1" onClick={onClose}>{t('forms.cancel')}</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}>{t('forms.save')}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function FormList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [forms, setForms] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1, per_page: 20 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [menuOpen, setMenuOpen] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  // Bulk select — scope halaman ini saja (direset tiap filter berubah)
  const [selected, setSelected] = useState(() => new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkMove, setShowBulkMove] = useState(false)

  const fetchCategories = () => {
    api.get('/categories').then((res) => setCategories(res.data)).catch(() => {})
  }
  useEffect(() => { fetchCategories() }, [])

  const fetchForms = () => {
    setLoading(true)
    const status = activeTab === 'All' ? undefined : activeTab.toLowerCase()
    const params = { page: meta.page, per_page: meta.per_page, status }
    if (activeCategory !== null) params.category_id = activeCategory
    api.get('/forms', { params })
      .then((res) => { setForms(res.data.data); setMeta(res.data.meta) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchForms() }, [activeTab, activeCategory, meta.page, meta.per_page])

  const handleCategoryChanged = (created, deletedId) => {
    fetchCategories()
    if (deletedId && activeCategory === deletedId) setActiveCategory(null)
    setMeta((m) => ({ ...m, page: 1 }))
    // if a form currently shows menu, refresh to update badge count
    fetchForms()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/forms/${deleteTarget.id}`)
      toast.success(t('forms.deleted'))
      setDeleteTarget(null)
      fetchForms()
      fetchCategories()
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.deleteFailed'))
    } finally { setDeleting(false) }
  }

  const handleMoved = () => {
    fetchForms()
    fetchCategories()
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return forms
    const q = search.toLowerCase()
    return forms.filter((f) => stripTags(f.title).toLowerCase().includes(q))
  }, [forms, search])

  // Seleksi bulk — reset tiap konteks daftar berubah (scope halaman ini saja)
  useEffect(() => { setSelected(new Set()); setMenuOpen(null) }, [activeTab, activeCategory, search, meta.page])
  const selectionMode = selected.size > 0
  const selectedForms = useMemo(() => filtered.filter((f) => selected.has(f.id)), [filtered, selected])
  const allSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id))

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((f) => f.id)))
  }
  const clearSelection = () => { setSelected(new Set()); setMenuOpen(null) }

  const handleBulkDelete = async () => {
    if (selectedForms.length === 0) return
    setBulkDeleting(true)
    try {
      const res = await api.delete('/forms', { data: { form_ids: selectedForms.map((f) => f.id) } })
      toast.success(res.data.message || t('forms.bulkDeleted', { count: res.data.deleted ?? selectedForms.length }))
      setShowBulkDelete(false)
      clearSelection()
      fetchForms()
      fetchCategories()
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.bulkDeleteFailed'))
    } finally { setBulkDeleting(false) }
  }

  const handleBulkMoved = () => {
    clearSelection()
    fetchForms()
    fetchCategories()
  }

  const totalPages = Math.ceil(meta.total / meta.per_page)

  return (
    <div>
      <PageHeader
        eyebrow={t('forms.eyebrow')}
        title={t('forms.title')}
        description={t('forms.description')}
        actions={
          <Button onClick={() => navigate('/forms/new')} icon={<Plus className="w-4 h-4" />}>
            {t('forms.createNew')}
          </Button>
        }
      />

      {/* top controls */}
      <div className="flex flex-col gap-4 mt-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Input
              placeholder={t('forms.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-full"
              aria-label="Search forms"
            />
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 dark:text-gray-500" />
          </div>
          <div className="flex gap-1.5 bg-gray-100 dark:bg-ink rounded-full p-1 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setMeta((m) => ({ ...m, page: 1 })) }}
                className={`px-4 h-8 rounded-full text-sm font-medium transition-all ${activeTab === tab ? 'bg-white dark:bg-ink-800 shadow-sm text-primary font-semibold' : 'text-gray-500 dark:text-gray-400 hover:text-ink dark:hover:text-gray-100'}`}
              >
                {{ All: t('forms.tabAll'), Draft: t('forms.tabDraft'), Published: t('forms.tabPublished'), Closed: t('forms.tabClosed') }[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-primary-50/70 via-white to-white dark:from-ink-800/40 dark:via-ink-900 dark:to-ink-900 border border-primary-100/60 dark:border-gray-800 p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary-700 dark:text-primary-300">
               <FolderOpen className={`w-4 h-4 ${activeCategory===null ? 'text-dark dark:text-primary' : 'text-gray-400 group-hover:text-primary'}`} />{t('forms.categoryLabel')}
            </span>
            <span className="h-3 w-px bg-primary-100 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">{t('forms.categoryCount', { count: categories.length })}</span>
            <button onClick={() => setShowCatMgr(true)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-700 dark:text-primary-300">
              <Settings2 className="w-3.5 h-3.5" /> {t('forms.manageCategories')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => { setActiveCategory(null); setMeta((m) => ({ ...m, page: 1 })) }}
              className={`group inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-medium border transition-all duration-200 ${activeCategory === null ? 'bg-ink text-white border-ink shadow-md dark:bg-white dark:text-ink scale-[1.02]' : 'bg-white dark:bg-ink-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-200 hover:bg-primary-50/50 dark:hover:bg-ink-700 hover:shadow-sm hover:-translate-y-0.5'}`}
            >
              {t('forms.allCategories')}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeCategory===null ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-ink-700 text-gray-500'}`}>{meta.total}</span>
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setMeta((m) => ({ ...m, page: 1 })) }}
                className={`group inline-flex items-center gap-2 pl-3 pr-3.5 h-9 rounded-full text-sm font-medium border transition-all duration-200 ${activeCategory === cat.id ? 'text-white border-transparent shadow-md scale-[1.02]' : 'bg-white dark:bg-ink-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:shadow-sm hover:-translate-y-0.5 hover:border-primary-200'}`}
                style={activeCategory === cat.id ? { backgroundColor: cat.color || '#8B7CF6' } : {}}
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 -ml-1" style={{ backgroundColor: activeCategory===cat.id ? 'rgba(255,255,255,0.22)' : `${cat.color || '#8B7CF6'}14`, color: activeCategory===cat.id ? 'white' : cat.color || '#8B7CF6' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeCategory===cat.id ? 'white' : cat.color || '#8B7CF6' }} />
                </span>
                <span className="truncate max-w-[120px]">{cat.name}</span>
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeCategory===cat.id ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-ink-700 text-gray-500 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20'}`}>{cat.form_count}</span>
              </button>
            ))}

            {categories.length === 0 && (
              <span className="inline-flex items-center gap-2 px-4 h-9 rounded-full border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-ink-800/40 text-sm text-gray-400">
                {t('forms.emptyCategoriesHint')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* bulk action bar — sticky ala Results, muncul saat ada yang dipilih */}
      {selectionMode && (
        <div className="sticky top-2 z-30 mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-white dark:bg-ink-900 px-4 py-3 shadow-lift">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label={t('forms.selectAll')}
            title={t('forms.selectAll')}
            className="accent-primary w-4 h-4 cursor-pointer shrink-0"
          />
          <span className="text-sm font-semibold text-ink dark:text-gray-100 shrink-0">{t('forms.selectedCount', { count: selected.size })}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={clearSelection} icon={<X className="w-4 h-4" />}>
              <span className="hidden sm:inline">{t('forms.cancelSelection')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowBulkMove(true)} icon={<FolderInput className="w-4 h-4" />}>
              <span className="hidden sm:inline">{t('forms.menuMoveCategory')}</span>
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setShowBulkDelete(true)}>
              <span className="hidden sm:inline">{t('forms.deleteConfirm')}</span>
            </Button>
          </div>
        </div>
      )}

      <CategoryManager open={showCatMgr} onClose={() => setShowCatMgr(false)} categories={categories} onChanged={handleCategoryChanged} />
      <CategoryMoveModal open={!!moveTarget} onClose={()=>setMoveTarget(null)} form={moveTarget} categories={categories} onMoved={handleMoved} />
      <ConfirmModal
        show={!!deleteTarget}
        title={t('forms.deleteTitle')}
        message={t('forms.deleteMessage', { title: stripTags(deleteTarget?.title || '') })}
        confirmText={t('forms.deleteConfirm')}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={()=>setDeleteTarget(null)}
      />
      <CategoryMoveModal open={showBulkMove} onClose={()=>setShowBulkMove(false)} forms={selectedForms} categories={categories} onMoved={handleBulkMoved} />
      <ConfirmModal
        show={showBulkDelete}
        title={t('forms.bulkDeleteTitle', { count: selectedForms.length })}
        message={t('forms.bulkDeleteMessage', { count: selectedForms.length })}
        confirmText={t('forms.deleteConfirm')}
        variant="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={()=>setShowBulkDelete(false)}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title={search.trim() ? t('forms.noMatch') : activeCategory ? t('forms.emptyCategory') : t('forms.noForms')}
            description={search.trim() ? t('forms.noMatchDesc') : activeCategory ? t('forms.emptyCategoryDesc') : t('forms.noFormsDesc')}
            action={
              !search.trim() && (
                <Button onClick={() => navigate('/forms/new')} icon={<Plus className="w-4 h-4" />}>
                  {t('forms.createNew')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 py-1 -my-1">
            {filtered.map((form, i) => (
              <FormCardItem
                key={form.id}
                form={form}
                index={i}
                selected={selected.has(form.id)}
                selectedCount={selected.size}
                selectionMode={selectionMode}
                onToggle={toggleSelect}
                onOpen={(f) => navigate(`/forms/${f.id}`)}
                menuOpen={menuOpen===form.id}
                onMenu={() => setMenuOpen(menuOpen===form.id ? null : form.id)}
                onEdit={(f) => navigate(`/forms/${f.id}`)}
                onMove={(f) => setMoveTarget(f)}
                onDelete={(f) => setDeleteTarget(f)}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <Button variant="ghost" size="sm" disabled={meta.page <= 1} onClick={() => setMeta((m) => ({ ...m, page: m.page - 1 }))}>{t('forms.previous')}</Button>
              <span className="flex items-center text-sm text-gray-500 dark:text-gray-400 px-2">{t('forms.page', { page: meta.page, total: totalPages })}</span>
              <Button variant="ghost" size="sm" disabled={meta.page >= totalPages} onClick={() => setMeta((m) => ({ ...m, page: m.page + 1 }))}>{t('forms.next')}</Button>
            </div>
          )}
        </>
      )}

    </div>
  )
}
