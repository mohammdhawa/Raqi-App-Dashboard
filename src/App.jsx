import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, RequireAuth, RequireAttendanceAccess, RequireAttendanceCheck, RequireLeaveRegisterAccess, RequireNotEmployee, RequireRole, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import AdminLayout from './layouts/AdminLayout'
import LoginPage from './pages/LoginPage'
import lazyPage from './utils/lazyPage'

// Every signed-in page is its own chunk, fetched on first visit. The login
// page and the layout shell stay in the entry bundle: they are what a visitor
// sees first, and the shell is what holds the screen while a page loads.
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'))
const DocumentsPage = lazyPage(() => import('./pages/DocumentsPage'))
const UsersPage = lazyPage(() => import('./pages/UsersPage'))
const DepartmentsPage = lazyPage(() => import('./pages/DepartmentsPage'))
const SectionsPage = lazyPage(() => import('./pages/SectionsPage'))
const TemplatesPage = lazyPage(() => import('./pages/TemplatesPage'))
const TemplateBuilderPage = lazyPage(() => import('./pages/TemplateBuilderPage'))
const AttendancePage = lazyPage(() => import('./pages/AttendancePage'))
const AttendanceReportPage = lazyPage(() => import('./pages/AttendanceReportPage'))
const AttendanceMonthlyReportPage = lazyPage(() => import('./pages/AttendanceMonthlyReportPage'))
const AttendanceEmployeeReportPage = lazyPage(() => import('./pages/AttendanceEmployeeReportPage'))
const LeavePage = lazyPage(() => import('./pages/LeavePage'))
const LeaveRegisterPage = lazyPage(() => import('./pages/LeaveRegisterPage'))
const LeaveBalancesPage = lazyPage(() => import('./pages/LeaveBalancesPage'))
const LeaveTypesPage = lazyPage(() => import('./pages/LeaveTypesPage'))
const BroadcastPage = lazyPage(() => import('./pages/BroadcastPage'))
const DocumentInboxPage = lazyPage(() => import('./pages/DocumentInboxPage'))
const DocumentSentPage = lazyPage(() => import('./pages/DocumentSentPage'))
const DocumentSubmitPage = lazyPage(() => import('./pages/DocumentSubmitPage'))
const DocumentDetailPage = lazyPage(() => import('./pages/DocumentDetailPage'))
const MyAttendancePage = lazyPage(() => import('./pages/MyAttendancePage'))
const MyAttendanceHistoryPage = lazyPage(() => import('./pages/MyAttendanceHistoryPage'))

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'employee' && user?.attendance_check ? '/attendance' : '/dashboard'} replace />
}

export default function App() {
  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-sans)' }}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<HomeRedirect />} />
              <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/attendance" element={<RequireAttendanceCheck><MyAttendancePage /></RequireAttendanceCheck>} />
                <Route path="/attendance/history" element={<RequireAttendanceCheck><MyAttendanceHistoryPage /></RequireAttendanceCheck>} />
                <Route path="/admin/attendance" element={<RequireAttendanceAccess><AttendancePage /></RequireAttendanceAccess>} />
                <Route path="/admin/attendance/report" element={<RequireAttendanceAccess><AttendanceReportPage /></RequireAttendanceAccess>} />
                <Route path="/admin/attendance/monthly" element={<RequireAttendanceAccess><AttendanceMonthlyReportPage /></RequireAttendanceAccess>} />
                <Route path="/admin/attendance/employee" element={<RequireAttendanceAccess><AttendanceEmployeeReportPage /></RequireAttendanceAccess>} />
                <Route path="/admin/leave" element={<RequireRole roles={['admin', 'manager', 'chief', 'employee']}><LeavePage /></RequireRole>} />
                {/* Narrower than the attendance pages on purpose: the register
                    is admin + HR only server-side (leave.register.view), so a
                    manager who can open every attendance report is sent back
                    rather than shown a page that can only 403. */}
                <Route path="/admin/leave-register" element={<RequireLeaveRegisterAccess><LeaveRegisterPage /></RequireLeaveRegisterAccess>} />
                <Route path="/admin/leave-balances" element={<RequireAttendanceAccess><LeaveBalancesPage /></RequireAttendanceAccess>} />

                <Route element={<RequireRole roles="admin"><Outlet /></RequireRole>}>
                  <Route path="/admin/documents" element={<DocumentsPage />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/departments" element={<DepartmentsPage />} />
                  <Route path="/admin/sections" element={<SectionsPage />} />
                  <Route path="/admin/templates" element={<TemplatesPage />} />
                  <Route path="/admin/templates/new" element={<TemplateBuilderPage />} />
                  <Route path="/admin/templates/:id/edit" element={<TemplateBuilderPage />} />
                  <Route path="/admin/broadcast" element={<BroadcastPage />} />
                  {/* Writing leave types is admin-only server-side (403 otherwise) */}
                  <Route path="/admin/leave-types" element={<LeaveTypesPage />} />
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
