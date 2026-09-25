import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { Suspense, lazy } from 'react'
import { PreferencesProvider } from './context/PreferencesContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './hooks/useAuth'
import { getAuthenticatedPath } from './lib/authRedirect'
import { ToastProvider } from './context/ToastContext.jsx'
import { TourProvider } from './features/tour/TourContext'
import DashboardLayout from './components/layout/DashboardLayout'
import AdminLayout from './components/layout/AdminLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import VerifyOtp from './pages/auth/VerifyOtp'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import Dashboard from './pages/dashboard/Dashboard'
import FormList from './pages/forms/FormList'
import FormCreate from './pages/forms/FormCreate'
import AIGenerate from './pages/forms/AIGenerate'
import FormEdit from './pages/forms/FormEdit'
import QuestionBuilder from './pages/forms/QuestionBuilder'
import Results from './pages/results/Results'
import Analytics from './pages/results/Analytics'
import Profile from './pages/profile/Profile'
import MySubmissions from './pages/profile/MySubmissions'
import Settings from './pages/profile/Settings'
import Admin from './pages/admin/Admin'
import AdminOverview from './pages/admin/AdminOverview'
import AdminSettings from './pages/admin/AdminSettings'

// ponytail: public routes di-lazy — responden /q & /s tidak unduh 1.6MB dashboard/builder
const FormLanding = lazy(() => import('./pages/public/FormLanding'))
const AnswerQuiz = lazy(() => import('./pages/public/AnswerQuiz'))
const QuizResult = lazy(() => import('./pages/public/QuizResult'))

function PublicFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-paper dark:bg-ink-950">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return null
  if (!user) {
    const from = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(from)}`} state={{ from }} replace />
  }
  return children
}

function AdminRoute({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function UserRoute({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  // Tunggu validasi /me dulu — user basi belum dibersihkan bikin bounce
  // /login → /q/... → /login (loop di Chrome desktop bertoken expired).
  if (!ready) return null
  if (user) {
    if (user.role === 'admin') return <Navigate to={getAuthenticatedPath(user)} replace />
    const from = location.state?.from || new URLSearchParams(location.search).get('next')
    // cegah loop jika from masih halaman auth
    const safe = from && !from.startsWith('/login') && !from.startsWith('/register') && !from.startsWith('/otp') && !from.startsWith('/forgot-password') && !from.startsWith('/reset-password') ? from : '/'
    return <Navigate to={safe} replace />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/otp" element={<VerifyOtp />} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
      <Route path="/q/:shortCode" element={<Suspense fallback={<PublicFallback />}><FormLanding /></Suspense>} />
      <Route path="/s/:submissionId" element={<Suspense fallback={<PublicFallback />}><AnswerQuiz /></Suspense>} />
      <Route path="/s/:submissionId/result" element={<Suspense fallback={<PublicFallback />}><QuizResult /></Suspense>} />
      <Route element={<ProtectedRoute><AdminRoute><AdminLayout /></AdminRoute></ProtectedRoute>}>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/users" element={<Admin />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
      </Route>
      <Route element={<ProtectedRoute><UserRoute><DashboardLayout /></UserRoute></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/forms" element={<FormList />} />
        <Route path="/forms/new" element={<FormCreate />} />
        <Route path="/forms/ai" element={<AIGenerate />} />
        <Route path="/forms/:formId" element={<FormEdit />} />
        <Route path="/forms/:formId/questions" element={<QuestionBuilder />} />
        <Route path="/forms/:formId/results" element={<Results />} />
        <Route path="/forms/:formId/analytics" element={<Analytics />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/my-submissions" element={<MySubmissions />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <PreferencesProvider>
          <AuthProvider>
            <ToastProvider>
              <TourProvider>
                <AppRoutes />
              </TourProvider>
            </ToastProvider>
          </AuthProvider>
        </PreferencesProvider>
      </MotionConfig>
    </BrowserRouter>
  )
}
