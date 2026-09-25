import { useState, useRef, useEffect, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, ClipboardList, ListChecks, UserRound, Settings, X, Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { AppMark } from '../ui'
import { resolveMediaUrl } from '../../lib/media'

/* ── Mobile bottom nav ────────────────────────────────────── */
function BottomNav({ hidden }) {
  const { t } = useTranslation()
  const nav = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/forms', label: t('nav.forms'), icon: ClipboardList, end: false },
    { to: '/my-submissions', label: t('nav.mySubmissions'), icon: ListChecks, end: false },
    { to: '/profile', label: t('nav.profile'), icon: UserRound, end: false },
  ]
  const location = useLocation()
  return (
    <nav className={`fixed bottom-0 inset-x-0 z-40 lg:hidden overflow-hidden transition-[max-height] duration-200 ease-in-out ${hidden ? 'max-h-0' : 'max-h-14'}`}>
      <div className="bg-white dark:bg-ink-900 border-t border-gray-200 dark:border-gray-700 h-14 flex items-center justify-around">
        {nav.map((link) => {
          const isActive = link.end
            ? location.pathname === link.to
            : location.pathname.startsWith(link.to)
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${isActive ? 'text-primary' : 'text-gray-400 dark:text-gray-500'
                }`}
            >
              <link.icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{link.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function AiFab({ navHidden }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  if (location.pathname !== '/forms') return null
  return (
    <button
      type="button"
      onClick={() => navigate('/forms/ai')}
       title={t('forms.aiFab')}
       aria-label={t('forms.aiFab')}
       data-tour="forms-ai"

      className={`group fixed right-6 z-40 w-14 h-14 rounded-[18px] rounded-br-[6px] bg-primary text-white flex items-center justify-center
        shadow-[0_8px_24px_-10px_rgba(108,92,231,0.55)] hover:shadow-[0_14px_36px_-10px_rgba(108,92,231,0.70),0_0_32px_rgba(139,124,246,0.45)]
        hover:bg-primary-600 hover:scale-[1.06] active:scale-[0.96]
        transition-all duration-300 ease-out overflow-visible
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-paper
        ${navHidden ? 'bottom-[1rem]' : 'bottom-[4.5rem]'} lg:bottom-6`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-[26px] bg-primary/30 blur-xl opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70 transition-opacity duration-500" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[18px] rounded-br-[6px] overflow-hidden">
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full group-focus-visible:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12" />
      </span>
      <img src="/Quizary_Logo_White.png" alt="" className="relative w-7 h-7 object-contain transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-[360deg] group-hover:scale-110 group-focus-visible:rotate-[360deg] group-focus-visible:scale-110 drop-shadow-[0_1px_6px_rgba(0,0,0,0.2)] group-hover:drop-shadow-[0_3px_10px_rgba(0,0,0,0.28)]" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-[5px] right-[2.5px] w-4 h-4 rotate-45 -z-10 rounded-[4px] bg-primary group-hover:bg-primary-600 group-focus-visible:bg-primary-600 transition-colors shadow-[0_4px_12px_rgba(108,92,231,0.35)] group-hover:shadow-[0_6px_16px_rgba(108,92,231,0.45)]" />
    </button>
  )
}

/* ── Desktop sidebar ──────────────────────────────────────── */
function Sidebar({ open, onClose, onLogout, user }) {
  const { t } = useTranslation()
  const nav = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/forms', label: t('nav.forms'), icon: ClipboardList, end: false },
    { to: '/my-submissions', label: t('nav.mySubmissions'), icon: ListChecks, end: false },
    { to: '/profile', label: t('nav.profile'), icon: UserRound, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ]
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-white dark:bg-ink-900 border-r border-gray-200 dark:border-gray-600 transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:h-full ${open ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex items-center text-2xl gap-3 px-5 h-16 shrink-0 border-b border-gray-200 dark:border-gray-600">
          <AppMark size="sm" />
          <div className="min-w-0">
            <p className="font-display font-bold leading-none text-ink dark:text-gray-100">Quizary</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 -mr-2 rounded-xl text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors lg:hidden"
            aria-label={t('nav.closeMenu')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">{t('nav.menu')}</p>
          {nav.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={onClose}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium transition-colors duration-150 ${isActive
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-gray-500 dark:text-gray-400 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-ink-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-dot"
                      className="absolute left-0 top-1/3 -translate-y-1/2 w-1 h-5 rounded-full bg-primary"
                    />
                  )}
                  <link.icon className="w-[18px] h-[18px] shrink-0" />
                  {link.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100 dark:border-gray-600">
          <div className="px-3.5 py-3 rounded-xl bg-gray-50 dark:bg-ink-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">{t('nav.loggedInAs')}</p>
            <p className="text-sm font-medium text-ink dark:text-gray-100 truncate mt-1">{user?.name || t('nav.userFallback')}</p>
            <button
              onClick={() => { onClose(); onLogout() }}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-incorrect text-xs font-semibold hover:bg-incorrect-soft transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
              {t('auth.logout')}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

/* ── Layout ───────────────────────────────────────────────── */
export default function DashboardLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const mainRef = useRef(null)
  const [navHidden, setNavHidden] = useState(false)

  const location = useLocation()
  const isAiPage = location.pathname.startsWith('/forms/ai')

  const handleClickOutside = useCallback((e) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
      setDropdownOpen(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  // Scroll-to-hide navbar (mobile only) — hysteresis prevents feedback loop
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let lastY = 0
    let lockY = 0 // scroll position at last toggle — blocks reverse toggle within 50px
    let ticking = false
    const LOCK = 50
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = el.scrollTop
        const dy = y - lastY
        // At top → always show, reset
        if (y <= 5) {
          setNavHidden(false)
          lockY = 0
        } else if (y - lockY > LOCK && dy > 5) {
          setNavHidden(true)
          lockY = y
        } else if (lockY - y > LOCK && dy < -5) {
          setNavHidden(false)
          lockY = y
        }
        lastY = y
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--mobile-nav-offset', navHidden ? '0px' : '0.1rem')
    return () => document.documentElement.style.removeProperty('--mobile-nav-offset')
  }, [navHidden])

  const handleLogout = async () => {
    setDropdownOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-dvh bg-paper dark:bg-ink-950">
      {/* ═══ SIDEBAR: desktop only, slide-out di /forms/ai ═══ */}
      <div className={`hidden lg:block lg:h-full lg:shrink-0 overflow-hidden transition-all duration-300 ease-out ${isAiPage ? 'lg:w-0 lg:opacity-0' : 'lg:w-64 lg:opacity-100'}`}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={handleLogout} user={user} />
      </div>

      {/* ═══ MOBILE SIDEBAR OVERLAY ═══ */}
      <div className="lg:hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={handleLogout} user={user} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── NAVBAR ── */}
        {/* Desktop: static, no collapse. Mobile: max-h collapse on scroll. */}
        {/* /forms/ai: mobile hilang total, desktop slide-out smooth. */}
        <div
          className={isAiPage
            ? 'hidden lg:block shrink-0 overflow-hidden transition-all delay-[180ms] duration-300 ease-out lg:max-h-0 lg:opacity-0'
            : `shrink-0 transition-[max-height] duration-200 ease-in-out lg:max-h-none ${navHidden ? 'max-h-0' : 'max-h-16'
              } ${dropdownOpen ? 'overflow-visible' : 'overflow-hidden'}`}
        >          <div className="bg-white dark:bg-ink-900 border-b border-gray-200 dark:border-gray-600">
            <div className="h-14 px-4 flex items-center justify-between sm:h-16 sm:px-8">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {/* Mobile: logo */}
                <div className="lg:hidden">
                  <AppMark size="sm" />
                </div>
                {/* Desktop: workspace name */}
                <span className="hidden lg:inline text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                  {user?.name ? t('nav.workspace', { name: user.name.split(' ')[0] }) : t('nav.workspaceFallback')}
                </span>
                {/* Mobile: page title */}
                <span className="lg:hidden text-sm font-semibold text-ink dark:text-gray-100 truncate">
                  {user?.name ? t('nav.workspace', { name: user.name.split(' ')[0] }) : t('nav.workspaceFallback')}
                </span>
              </div>

              <div className="flex items-center gap-1 ml-auto">

                <button
                  onClick={toggleTheme}
                  className="p-2.5 rounded-xl text-gray-400 dark:text-gray-500 hover:text-ink dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                  aria-label={t('nav.toggleTheme')}
                  title={t('nav.toggleTheme')}
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-ink-800 transition-colors"
                    aria-label={t('nav.userMenu')}
                    aria-expanded={dropdownOpen}
                  >
                    <span className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary dark:text-primary-300 flex items-center justify-center text-sm font-bold overflow-hidden">
                      {user?.avatar ? (
                        <img src={resolveMediaUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user?.name?.charAt(0)?.toUpperCase() || 'U'
                      )}
                    </span>
                  </button>
                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-ink-900 rounded-2xl border border-gray-100 dark:border-gray-600 shadow-lift py-1.5 z-50"
                      >
                        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-600 mb-1">
                          <p className="text-sm font-semibold text-ink dark:text-gray-100 truncate">{user?.name || t('nav.userFallback')}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{user?.email || ''}</p>
                        </div>
                        <button
                          onClick={() => { setDropdownOpen(false); navigate('/profile') }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
                        >
                          {t('nav.profile')}
                        </button>
                        <button
                          onClick={() => { setDropdownOpen(false); navigate('/my-submissions') }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
                        >
                          {t('nav.mySubmissions')}
                        </button>
                        <button
                          onClick={() => { setDropdownOpen(false); navigate('/settings') }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-ink-800 transition-colors"
                        >
                          {t('nav.settings')}
                        </button>
                        <hr className="my-1 border-gray-100 dark:border-gray-600" />
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2.5 text-sm text-incorrect hover:bg-incorrect-soft transition-colors"
                        >
                          {t('auth.logout')}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>

        <main ref={mainRef} data-nav-hidden={navHidden ? 'true' : 'false'} className={`flex-1 overflow-y-auto ${isAiPage ? 'pb-0' : 'pb-16 lg:pb-0'}`}>
          <div className={`${isAiPage ? '' : 'max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8'}`}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom nav: mobile only, same hide/show as navbar; hilang total di /forms/ai */}
      {!isAiPage && <BottomNav hidden={navHidden} />}
      <AiFab navHidden={navHidden} />
    </div>
  )
}
