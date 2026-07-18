import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Pedidos from './pages/Pedidos'
import Dashboard from './pages/Dashboard'
import Bodega from './pages/Bodega'
import WhatsAppPanel from './pages/WhatsAppPanel'

const nav = [
  { to: '/',        label: 'Dashboard', icon: '📊' },
  { to: '/pedidos', label: 'Pedidos',   icon: '📦' },
  { to: '/bodega',  label: 'Bodega',    icon: '🏭' },
  { to: '/whatsapp',label: 'WhatsApp',  icon: '💬' },
]

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Jireh</h2>
            <span className="sidebar-sub">Ropa Americana</span>
          </div>
          <nav className="sidebar-nav">
            {nav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/bodega" element={<Bodega />} />
            <Route path="/whatsapp" element={<WhatsAppPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {/* Bottom nav for mobile */}
        <nav className="bottom-nav">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </BrowserRouter>
  )
}
