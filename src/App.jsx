import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, RequireAuth } from './context/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import AdminLayout from './layouts/AdminLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DocumentsPage from './pages/DocumentsPage'
import UsersPage from './pages/UsersPage'
import DepartmentsPage from './pages/DepartmentsPage'
import SectionsPage from './pages/SectionsPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateBuilderPage from './pages/TemplateBuilderPage'
import AttendancePage from './pages/AttendancePage'

export default function App() {
  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-sans)' }}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/admin/documents" element={<DocumentsPage />} />
                <Route path="/admin/users" element={<UsersPage />} />
                <Route path="/admin/departments" element={<DepartmentsPage />} />
                <Route path="/admin/sections" element={<SectionsPage />} />
                <Route path="/admin/attendance" element={<AttendancePage />} />
                <Route path="/admin/templates" element={<TemplatesPage />} />
                <Route path="/admin/templates/:id/edit" element={<TemplateBuilderPage />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  )
}
