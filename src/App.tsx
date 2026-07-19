import { useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)

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
        {/* Hamburger button + dropdown menu (mobile) */}
        <button className="mobile-menu-btn" onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? '✕' : '☰'}
        </button>
        {menuOpen && (
          <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)}>
            <nav className="mobile-menu" onClick={e => e.stopPropagation()}>
              {nav.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `mobile-menu-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="mobile-menu-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>
    </BrowserRouter>
  )
}
