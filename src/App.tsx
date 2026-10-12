import React, { Component, type ReactNode } from 'react'
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


interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error caught by boundary:', error, errorInfo)
  }

  handleReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          await reg.unregister()
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        for (const key of keys) {
          await caches.delete(key)
        }
      }
    } catch (e) {
      console.warn('Error clearing cache:', e)
    }
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-3xl mb-4 shadow-xl shadow-blue-500/20">
            ⚡
          </div>
          <h1 className="text-xl font-bold mb-2">กำลังอัปเดตเวอร์ชันใหม่ของ AppliTrack</h1>
          <p className="text-slate-400 text-xs mb-6 max-w-xs leading-relaxed">
            มีไฟล์อัปเดตใหม่ถูกติดตั้ง แตะปุ่มด้านล่างเพื่อรีเฟรชเข้าใช้งานได้ทันทีครับ
          </p>
          <button
            onClick={this.handleReload}
            className="w-full max-w-xs py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
          >
            🔄 แตะเพื่อรีเฟรชและอัปเดตแอป
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  )
}
