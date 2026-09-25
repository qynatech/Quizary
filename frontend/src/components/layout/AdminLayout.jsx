import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, Moon, Settings, ShieldCheck, Sun, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { AppMark } from '../ui'

const navItems = [
  { to: '/admin', labelKey: 'admin.navOverview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', labelKey: 'admin.navUsers', icon: Users, end: false },
  { to: '/admin/settings', labelKey: 'admin.navSettings', icon: Settings, end: false },
]

export default function AdminLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-dvh bg-paper dark:bg-ink-950">
      {open && <button type="button" className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-label={t('nav.closeMenu')} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform dark:border-gray-600 dark:bg-ink-900 lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-5 dark:border-gray-600">
          <AppMark size="sm" />
          <div className="min-w-0">
            <p className="font-display font-bold leading-none text-ink dark:text-gray-100">Quizary</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{t('admin.workspace')}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-xl p-2 text-gray-400 hover:bg-gray-100 lg:hidden dark:hover:bg-ink-800" aria-label={t('nav.closeMenu')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-500 hover:bg-gray-50 hover:text-ink dark:text-gray-400 dark:hover:bg-ink-800 dark:hover:text-gray-100'}`}>
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-3 dark:border-gray-600">
          <div className="rounded-xl bg-gray-50 p-3.5 dark:bg-ink-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('nav.loggedInAs')}</p>
            <p className="mt-1 truncate text-sm font-medium text-ink dark:text-gray-100">{user?.name || t('nav.userFallback')}</p>
            <button type="button" onClick={handleLogout} className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-incorrect transition-colors hover:bg-incorrect-soft">
              <LogOut className="h-3.5 w-3.5" />
              {t('auth.logout')}
            </button>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8 dark:border-gray-600 dark:bg-ink-900">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-ink-800" aria-label={t('nav.openMenu')}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-gray-100">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="hidden sm:inline">{t('admin.title')}</span>
              <span className="sm:hidden">{t('admin.navOverview')}</span>
            </div>
          </div>
          <button type="button" onClick={toggleTheme} className="rounded-xl p-2.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-ink-800" aria-label={t('nav.toggleTheme')} title={t('nav.toggleTheme')}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
