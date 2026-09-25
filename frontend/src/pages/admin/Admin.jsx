import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, MoreVertical, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { Button, Card, ConfirmModal, EmptyState, Input, PageHeader } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'

function errorMessage(error) {
  return error.response?.data?.message || error.response?.data?.detail || 'Terjadi kesalahan'
}

export default function Admin() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], page: 1, limit: 20, total: 0, pages: 0 })
  const [selected, setSelected] = useState([])
  const [openMenu, setOpenMenu] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const users = await api.get('/admin/users', { params: { search: query || undefined, page, limit: 20 }, signal })
      setData(users.data)
      setSelected([])
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, query])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const mutate = async (request, successMessage) => {
    setSaving(true)
    try {
      await request()
      toast.success(successMessage)
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const updateRole = (user, role) => mutate(
    () => api.patch(`/admin/users/${user.id}/role`, { role }),
    'Role user berhasil diperbarui',
  )

  const updateStatus = (user) => mutate(
    () => api.patch(`/admin/users/${user.id}/status`, { is_active: !user.is_active }),
    user.is_active ? 'User dinonaktifkan' : 'User diaktifkan',
  )

  const permanentDelete = (user) => {
    setOpenMenu(null)
    setDeleteTarget(user)
    setDeleteConfirmation('')
  }

  const confirmPermanentDelete = () => {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.email) return
    setDeleteTarget(null)
    setDeleteConfirmation('')
    mutate(() => api.delete(`/admin/users/${deleteTarget.id}/permanent`, { data: { confirmation: deleteTarget.email } }), 'User berhasil dihapus')
  }

  const bulkDelete = () => {
    if (selected.length) setBulkDeleteOpen(true)
  }

  const confirmBulkDelete = () => {
    setBulkDeleteOpen(false)
    mutate(() => api.delete('/admin/bulk/users', { data: { user_ids: selected, permanent: true } }), 'User berhasil dihapus')
  }

  const toggleSelected = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const allVisibleSelected = data.items.length > 0 && data.items.every((user) => selected.includes(user.id))
  const submitSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('admin.eyebrow')}
        title={t('admin.navUsers')}
        description={t('admin.usersDescription')}
        actions={<Button variant="secondary" size="sm" onClick={() => load()} loading={loading}>{t('admin.refresh')}</Button>}
      />

      <Card padding={false} className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-200 dark:border-gray-700 p-5 lg:flex-row lg:items-center lg:justify-between">
          <form className="flex flex-1 gap-2" onSubmit={submitSearch}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('admin.searchPlaceholder')} className="pl-9" aria-label={t('admin.searchPlaceholder')} />
            </div>
            <Button type="submit" variant="secondary">{t('admin.search')}</Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            {selected.length > 0 && <Button variant="danger" size="sm" onClick={bulkDelete} loading={saving} icon={<Trash2 className="h-4 w-4" />}>{t('admin.deleteSelected', { count: selected.length })}</Button>}
          </div>
        </div>

        {error && <div className="m-5 flex items-center gap-2 rounded-xl bg-incorrect-soft px-4 py-3 text-sm text-incorrect"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-ink-800" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={t('admin.emptyTitle')} description={t('admin.emptyDescription')} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 dark:border-gray-700 text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="w-12 px-5 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? selected.filter((id) => !data.items.some((user) => user.id === id)) : [...new Set([...selected, ...data.items.map((user) => user.id)])])} aria-label={t('admin.selectAll')} className="rounded border-gray-300 text-primary focus:ring-primary" /></th>
                    <th className="px-3 py-3">{t('admin.user')}</th><th className="px-3 py-3">{t('admin.role')}</th><th className="px-3 py-3">{t('admin.status')}</th><th className="px-3 py-3">{t('admin.created')}</th><th className="px-5 py-3 text-right">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.items.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-ink-800/50">
                      <td className="px-5 py-4"><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleSelected(user.id)} aria-label={`${t('admin.select')} ${user.email}`} className="rounded border-gray-300 text-primary focus:ring-primary" /></td>
                      <td className="px-3 py-4"><p className="font-medium text-ink dark:text-gray-100">{user.name}</p><p className="text-xs text-gray-400">{user.email}</p></td>
                      <td className="px-3 py-4"><select value={user.role} onChange={(event) => updateRole(user, event.target.value)} disabled={saving || user.id === currentUser?.id} className="rounded-lg border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-ink-800"><option value="user">User</option><option value="admin">Admin</option></select></td>
                      <td className="px-3 py-4"><span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{user.is_active ? t('admin.active') : t('admin.inactive')}</span></td>
                      <td className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-4"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => updateStatus(user)} disabled={saving || user.id === currentUser?.id} icon={user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}>{user.is_active ? t('admin.disable') : t('admin.enable')}</Button><div className="relative"><button type="button" onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)} disabled={saving || user.id === currentUser?.id} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink disabled:opacity-50 dark:hover:bg-ink-800 dark:hover:text-gray-100" aria-label={t('admin.moreActions')} aria-expanded={openMenu === user.id}><MoreVertical className="h-4 w-4" /></button>{openMenu === user.id && <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift dark:border-gray-700 dark:bg-ink-900"><button type="button" onClick={() => permanentDelete(user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-incorrect transition-colors hover:bg-incorrect-soft"><Trash2 className="h-4 w-4" />{t('admin.delete')}</button></div>}</div></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
              {data.items.map((user) => <div key={user.id} className="space-y-3 p-4"><div className="flex items-start gap-3"><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleSelected(user.id)} aria-label={`${t('admin.select')} ${user.email}`} className="mt-1 rounded border-gray-300 text-primary focus:ring-primary" /><div className="min-w-0 flex-1"><p className="truncate font-medium text-ink dark:text-gray-100">{user.name}</p><p className="truncate text-xs text-gray-400">{user.email}</p></div><span className={`text-xs font-medium ${user.is_active ? 'text-green-600' : 'text-gray-400'}`}>{user.is_active ? t('admin.active') : t('admin.inactive')}</span></div><div className="flex flex-wrap items-center gap-2 pl-6"><select value={user.role} onChange={(event) => updateRole(user, event.target.value)} disabled={saving || user.id === currentUser?.id} className="rounded-lg border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-ink-800"><option value="user">User</option><option value="admin">Admin</option></select><Button variant="secondary" size="sm" onClick={() => updateStatus(user)} disabled={saving || user.id === currentUser?.id}>{user.is_active ? t('admin.disable') : t('admin.enable')}</Button><div className="relative ml-auto"><button type="button" onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)} disabled={saving || user.id === currentUser?.id} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink disabled:opacity-50 dark:hover:bg-ink-800 dark:hover:text-gray-100" aria-label={t('admin.moreActions')} aria-expanded={openMenu === user.id}><MoreVertical className="h-4 w-4" /></button>{openMenu === user.id && <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift dark:border-gray-700 dark:bg-ink-900"><button type="button" onClick={() => permanentDelete(user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-incorrect transition-colors hover:bg-incorrect-soft"><Trash2 className="h-4 w-4" />{t('admin.delete')}</button></div>}</div></div></div>)}
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"><span>{t('admin.showing', { from: data.total ? (data.page - 1) * data.limit + 1 : 0, to: Math.min(data.page * data.limit, data.total), total: data.total })}</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={page <= 1 || saving} onClick={() => setPage((value) => value - 1)} icon={<ChevronLeft className="h-4 w-4" />}>{t('admin.previous')}</Button><Button variant="ghost" size="sm" disabled={page >= data.pages || saving} onClick={() => setPage((value) => value + 1)} icon={<ChevronRight className="h-4 w-4" />}>{t('admin.next')}</Button></div></div>
          </>
        )}
      </Card>

      <ConfirmModal
        show={Boolean(deleteTarget)}
        title="Hapus user permanen?"
        message={deleteTarget ? `Tindakan ini akan menghapus ${deleteTarget.email} beserta semua datanya. Tulis email untuk konfirmasi.` : ''}
        inputLabel={deleteTarget ? `Ketik ${deleteTarget.email} untuk konfirmasi` : ''}
        inputPlaceholder={deleteTarget?.email}
        inputValue={deleteConfirmation}
        inputExpected={deleteTarget?.email || ''}
        onInputChange={(event) => setDeleteConfirmation(event.target.value)}
        onConfirm={confirmPermanentDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteConfirmation('') }}
        loading={saving}
        confirmText={t('admin.delete')}
      />

      <ConfirmModal
        show={bulkDeleteOpen}
        title="Hapus user terpilih?"
        message={`Hapus ${selected.length} user secara permanen?`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
        loading={saving}
        confirmText={t('admin.deleteSelected', { count: selected.length })}
      />
    </div>
  )
}
