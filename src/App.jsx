import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import DashboardPage from './pages/DashboardPage'
import UsersPage from './pages/UsersPage'
import DepartmentsPage from './pages/DepartmentsPage'
import SectionsPage from './pages/SectionsPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateBuilderPage from './pages/TemplateBuilderPage'

export default function App() {
  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-sans)' }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/departments" element={<DepartmentsPage />} />
            <Route path="/admin/sections" element={<SectionsPage />} />
            <Route path="/admin/templates" element={<TemplatesPage />} />
            <Route path="/admin/templates/:id/edit" element={<TemplateBuilderPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  )
}
