import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import StatusPage from './pages/StatusPage'
import Dashboard from './pages/Dashboard'
import MonitorDetail from './pages/MonitorDetail'
import AdminPage from './pages/AdminPage'
import GroupsPage from './pages/GroupsPage'
import LoginPage from './pages/LoginPage'
import { isLoggedIn } from './auth'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public status page — standalone layout */}
        <Route path="/" element={<StatusPage />} />

        {/* Login page */}
        <Route path="/login" element={<LoginPage />} />

        {/* Admin pages — protected, shared dark layout */}
        <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/monitors/:id" element={<MonitorDetail />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/groups" element={<GroupsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
