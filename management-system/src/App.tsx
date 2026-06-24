import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import { ThemeProvider } from './context/ThemeContext'
import { RealtimeProvider } from './context/RealtimeContext'
import { WorkflowProvider } from './context/WorkflowContext'
import { PortalDashboard } from './pages/PortalDashboard'
import { Login } from './pages/Login'
import { SelectRole } from './pages/SelectRole'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

function LoginRoute() {
  const { user, pendingGoogle } = useAuth()
  if (user) return <Navigate to="/dashboard" replace />
  if (pendingGoogle) return <Navigate to="/select-role" replace />
  return <Login />
}

function SelectRoleRoute() {
  const { user, pendingGoogle } = useAuth()
  if (user) return <Navigate to="/dashboard" replace />
  if (!pendingGoogle) return <Navigate to="/login" replace />
  return <SelectRole />
}

function EmailSignupRoute() {
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user, pendingGoogle } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/signup-email" element={<EmailSignupRoute />} />
      <Route path="/select-role" element={<SelectRoleRoute />} />
      <Route
        path="/dashboard/*"
        element={user ? <PortalDashboard /> : <Navigate to="/login" replace />}
      />
      <Route
        path="*"
        element={
          <Navigate
            to={user ? '/dashboard' : pendingGoogle ? '/select-role' : '/login'}
            replace
          />
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <RealtimeProvider>
              <WorkflowProvider>
                <AppRoutes />
              </WorkflowProvider>
            </RealtimeProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
