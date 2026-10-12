import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RequestsPage from './pages/RequestsPage'
import RequestDetailPage from './pages/RequestDetailPage'
import CreateRequestPage from './pages/CreateRequestPage'
import LoansPage from './pages/LoansPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import NotificationsPage from './pages/NotificationsPage'
import UsagePage from './pages/UsagePage'
import MasterApplicatorsPage from './pages/MasterApplicatorsPage'
import ToolJourneyPage from './pages/ToolJourneyPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#0f172a] flex items-center justify-center flex-col gap-4">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse">
        <span className="text-white text-xl font-bold">📦</span>
      </div>
      <p className="text-slate-400 text-sm">กำลังโหลด...</p>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="requests/new" element={<CreateRequestPage />} />
        <Route path="requests/:id" element={<RequestDetailPage />} />
        <Route path="loans" element={<LoansPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="master-applicators" element={<MasterApplicatorsPage />} />
        <Route path="tool-journey" element={<ToolJourneyPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
