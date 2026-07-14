import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, RequireAuth, RequireAttendanceAccess, RequireNotEmployee, RequireRole } from './context/AuthContext'
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
import AttendanceReportPage from './pages/AttendanceReportPage'
import AttendanceMonthlyReportPage from './pages/AttendanceMonthlyReportPage'
import AttendanceEmployeeReportPage from './pages/AttendanceEmployeeReportPage'
import LeavePage from './pages/LeavePage'
import BroadcastPage from './pages/BroadcastPage'
import DocumentInboxPage from './pages/DocumentInboxPage'
import DocumentSentPage from './pages/DocumentSentPage'
import DocumentSubmitPage from './pages/DocumentSubmitPage'
import DocumentDetailPage from './pages/DocumentDetailPage'

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
                <Route path="/admin/attendance" element={<RequireAttendanceAccess><AttendancePage /></RequireAttendanceAccess>} />
                <Route path="/admin/attendance/report" element={<RequireAttendanceAccess><AttendanceReportPage /></RequireAttendanceAccess>} />
                <Route path="/admin/attendance/monthly" element={<RequireAttendanceAccess><AttendanceMonthlyReportPage /></RequireAttendanceAccess>} />
                <Route path="/admin/attendance/employee" element={<RequireAttendanceAccess><AttendanceEmployeeReportPage /></RequireAttendanceAccess>} />
                <Route path="/admin/leave" element={<RequireRole roles={['admin', 'manager', 'chief', 'employee']}><LeavePage /></RequireRole>} />

                <Route element={<RequireRole roles="admin"><Outlet /></RequireRole>}>
                  <Route path="/admin/documents" element={<DocumentsPage />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/departments" element={<DepartmentsPage />} />
                  <Route path="/admin/sections" element={<SectionsPage />} />
                  <Route path="/admin/templates" element={<TemplatesPage />} />
                  <Route path="/admin/templates/new" element={<TemplateBuilderPage />} />
                  <Route path="/admin/templates/:id/edit" element={<TemplateBuilderPage />} />
                  <Route path="/admin/broadcast" element={<BroadcastPage />} />
                </Route>

                <Route element={<RequireNotEmployee><Outlet /></RequireNotEmployee>}>
                  <Route path="/documents/inbox" element={<DocumentInboxPage />} />
                  <Route path="/documents/sent" element={<DocumentSentPage />} />
                  <Route path="/documents/new" element={<DocumentSubmitPage />} />
                  <Route path="/documents/:id" element={<DocumentDetailPage />} />
                </Route>
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  )
}
