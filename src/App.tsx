import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Pedidos from './pages/Pedidos'
import Dashboard from './pages/Dashboard'
import Bodega from './pages/Bodega'
import WhatsAppPanel from './pages/WhatsAppPanel'
import Cuentas from './pages/Cuentas'
import Inconvenientes from './pages/Inconvenientes'
import Difusion from './pages/Difusion'
import ChatsAntiguos from './pages/ChatsAntiguos'
import PilaAvisos from './ui/PilaAvisos'
import Notificador from './ui/Notificador'
import { useResumenAvisos } from './hooks/useAvisosChat'

const nav = [
  { to: '/',        label: 'Dashboard', icon: '📊' },
  { to: '/pedidos', label: 'Pedidos',   icon: '📦' },
  { to: '/inconvenientes', label: 'Inconvenientes', icon: '⚠️' },
  { to: '/bodega',  label: 'Bodega',    icon: '🏭' },
  { to: '/cuentas', label: 'Cuentas',   icon: '💰' },
  { to: '/whatsapp',label: 'WhatsApp',  icon: '💬' },
  { to: '/difusion',label: 'Difusión',  icon: '📢' },
  { to: '/chats-antiguos', label: 'Chats antiguos', icon: '🗂️' },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { data: avisos } = useResumenAvisos()
  // Contador rojo en el menú: clientes esperando asesor en WhatsApp, chats antiguos por revisar.
  const contador: Record<string, number> = {
    '/whatsapp': avisos?.esperandoAsesor.length ?? 0,
    '/chats-antiguos': avisos?.chatsAntiguos ?? 0,
  }

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
                {contador[item.to] > 0 && <span className="nav-contador">{contador[item.to]}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/inconvenientes" element={<Inconvenientes />} />
            <Route path="/bodega" element={<Bodega />} />
            <Route path="/cuentas" element={<Cuentas />} />
            <Route path="/whatsapp" element={<WhatsAppPanel />} />
            <Route path="/difusion" element={<Difusion />} />
            <Route path="/chats-antiguos" element={<ChatsAntiguos />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {/* Hamburger button + dropdown menu (mobile) */}
        <button className="mobile-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Menú">
          {menuOpen ? '✕' : '☰'}
          {!menuOpen && (contador['/whatsapp'] + contador['/chats-antiguos']) > 0 && <span className="mobile-menu-punto" />}
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
                  {contador[item.to] > 0 && <span className="nav-contador">{contador[item.to]}</span>}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
        <PilaAvisos />
        <Notificador />
      </div>
    </BrowserRouter>
  )
}
