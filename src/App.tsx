import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { OperatorProfilePage } from './features/operators/OperatorProfilePage'
import { OperatorsPage } from './features/operators/OperatorsPage'
import { OrdersPage } from './features/orders/OrdersPage'
import { ProductionPage } from './features/production/ProductionPage'
import { ReferenceRoutePage } from './features/references/ReferenceRoutePage'
import { ReferencesPage } from './features/references/ReferencesPage'
import { ReportsPage } from './features/reports/ReportsPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="produccion" element={<ProductionPage />} />
          <Route path="operarios" element={<OperatorsPage />} />
          <Route path="operarios/:id" element={<OperatorProfilePage />} />
          <Route path="referencias" element={<ReferencesPage />} />
          <Route path="referencias/:id/ruta" element={<ReferenceRoutePage />} />
          <Route path="ordenes" element={<OrdersPage />} />
          <Route path="reportes" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
