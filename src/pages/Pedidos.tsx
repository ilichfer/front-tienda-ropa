import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePedidos, useCambiarEstado, usePedidosRealtime, EstadoPedido, Pedido } from '../hooks/usePedidos'
import { useEnvios, useCambiarEstadoEnvio, Envio } from '../hooks/useEnvios'

type Tab = 'PENDIENTES' | 'ENVIADOS'

// Todo pedido que no esté en uno de estos estados terminales de envío cuenta como
// "pendiente" — así aparecen ahí los recién solicitados (NUEVO) y los que van
// avanzando (APARTADO, PAGADO, EMPACADO), no solo los ya empacados.
const ESTADOS_NO_PENDIENTES: EstadoPedido[] = ['ENVIADO', 'ENTREGADO', 'CANCELADO']

const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  NUEVO:    'APARTADO',
  APARTADO: 'PAGADO',
  PAGADO:   'EMPACADO',
  EMPACADO: 'ENVIADO',
}

const LABEL_ACCION: Partial<Record<EstadoPedido, string>> = {
  NUEVO:    'Apartar prenda',
  APARTADO: 'Confirmar pago',
  PAGADO:   'Marcar empacado',
  EMPACADO: 'Marcar como enviado',
}

function fmtFecha(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function irAWhatsApp(navigate: ReturnType<typeof useNavigate>, whatsapp?: string) {
  if (!whatsapp) return
  navigate(`/whatsapp?from=${encodeURIComponent(whatsapp)}`)
}

export default function Pedidos() {
  const [tab, setTab] = useState<Tab>('PENDIENTES')
  const [busqueda, setBusqueda] = useState('')
  const navigate = useNavigate()

  // Se trae todo y se separa en el cliente: así "Envíos pendientes" puede incluir
  // cualquier pedido que todavía no se haya enviado, sin importar en qué paso
  // del proceso vaya (nuevo, apartado, pagado o empacado).
  const { data: pedidos = [], isLoading: cargandoPedidos } = usePedidos()
  const { mutate: cambiarEstado, isPending: cambiandoPedido } = useCambiarEstado()
  usePedidosRealtime()

  // Las solicitudes de envío (dirección, cédula, teléfono, etc. que el cliente da por
  // WhatsApp) son un registro aparte de los pedidos de prenda — no todo el que da sus
  // datos de envío tiene necesariamente un pedido creado. Por eso se muestran también
  // acá, para que ninguna solicitud quede "perdida" fuera de esta sección.
  const { data: envios = [], isLoading: cargandoEnvios } = useEnvios()
  const { mutate: cambiarEstadoEnvio, isPending: cambiandoEnvio } = useCambiarEstadoEnvio()

  const isLoading = cargandoPedidos || cargandoEnvios
  const isPending = cambiandoPedido || cambiandoEnvio

  const pedidosPendientes = useMemo(
    () => pedidos.filter(p => !ESTADOS_NO_PENDIENTES.includes(p.estado)),
    [pedidos]
  )
  const pedidosEnviados = useMemo(
    () => pedidos.filter(p => p.estado === 'ENVIADO'),
    [pedidos]
  )

  const enviosPendientes = useMemo(
    () => envios.filter(e => e.estado === 'PENDIENTE'),
    [envios]
  )
  const enviosEnviados = useMemo(
    () => envios.filter(e => e.estado === 'ENVIADO'),
    [envios]
  )

  const q = busqueda.trim().toLowerCase()
  const coincideNombre = (nombre: string) => !q || nombre.toLowerCase().includes(q)

  const pedidosEnviadosFiltrados = useMemo(
    () => pedidosEnviados.filter(p => coincideNombre(p.cliente?.nombre || p.nombreDueño || '')),
    [pedidosEnviados, q]
  )
  const enviosEnviadosFiltrados = useMemo(
    () => enviosEnviados.filter(e => coincideNombre(e.nombreCompleto || '')),
    [enviosEnviados, q]
  )

  const avanzar = (id: string, estadoActual: EstadoPedido) => {
    const siguiente = SIGUIENTE_ESTADO[estadoActual]
    if (!siguiente) return
    cambiarEstado({ id, estado: siguiente })
  }

  const marcarEnvioComoEnviado = (id: string) => {
    cambiarEstadoEnvio({ id, estado: 'ENVIADO' })
  }

  const totalPendientes = pedidosPendientes.length + enviosPendientes.length
  const totalEnviados = pedidosEnviadosFiltrados.length + enviosEnviadosFiltrados.length

  return (
    <div className="page">
      <div className="filtros">
        <button
          className={`filter-btn ${tab === 'PENDIENTES' ? 'active' : ''}`}
          onClick={() => setTab('PENDIENTES')}
        >
          Envíos pendientes
        </button>
        <button
          className={`filter-btn ${tab === 'ENVIADOS' ? 'active' : ''}`}
          onClick={() => setTab('ENVIADOS')}
        >
          Enviados
        </button>
      </div>

      {tab === 'PENDIENTES' ? (
        <>
          {isLoading && <div className="loading">Cargando...</div>}

          <div className="pedidos-grid">
            {pedidosPendientes.map(pedido => (
              <div key={`p-${pedido.id}`} className="pedido-card">
                <div className="pedido-header">
                  <div>
                    <span className="pedido-num">#{pedido.numero}</span>
                    <span className="pedido-nombre">
                      {pedido.cliente?.nombre || pedido.nombreDueño || 'Sin cliente'}
                    </span>
                  </div>
                  <span className={`badge badge-${pedido.estado.toLowerCase()}`}>
                    {pedido.estado}
                  </span>
                </div>

                <div className="pedido-meta">
                  {pedido.prenda ? (
                    <>
                      <span>👕 {pedido.prenda.nombre} – {pedido.prenda.talla}</span>
                      <span>📦 {pedido.prenda.lote?.nombre}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {pedido.ubicacion ? `📍 ${pedido.ubicacion}` : 'Pedido en bodega (sin prenda asignada)'}
                    </span>
                  )}
                  {pedido.cliente?.ciudad && <span>🏙️ {pedido.cliente.ciudad}</span>}
                  {pedido.cliente?.direccion && <span>📍 {pedido.cliente.direccion}</span>}
                  {pedido.total ? (
                    <span>💵 ${pedido.total.toLocaleString('es-CO')}</span>
                  ) : null}
                </div>

                <div className="pedido-actions">
                  {SIGUIENTE_ESTADO[pedido.estado] && pedido.cliente && (
                    <button
                      className="btn-primary"
                      disabled={isPending}
                      onClick={() => avanzar(pedido.id, pedido.estado)}
                    >
                      {LABEL_ACCION[pedido.estado]}
                    </button>
                  )}
                  {pedido.cliente && (
                    <button
                      className="btn-secondary"
                      onClick={() => irAWhatsApp(navigate, pedido.cliente?.whatsapp)}
                    >
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>
            ))}

            {enviosPendientes.map((envio: Envio) => (
              <div key={`e-${envio.id}`} className="pedido-card">
                <div className="pedido-header">
                  <div>
                    <span className="pedido-num" style={{ fontSize: 13 }}>
                      {fmtFecha(envio.createdAt)}
                    </span>
                    <span className="pedido-nombre">
                      {envio.nombreCompleto || envio.whatsapp}
                    </span>
                  </div>
                  <span className="badge badge-nuevo">Datos de envío</span>
                </div>

                <div className="pedido-meta">
                  {envio.telefono && <span>📞 {envio.telefono}</span>}
                  {envio.cedula && <span>🪪 {envio.cedula}</span>}
                  {envio.direccion && <span>📍 {envio.direccion}</span>}
                  {envio.ciudad && <span>🏙️ {envio.ciudad}</span>}
                  {envio.barrio && <span>🏘️ {envio.barrio}</span>}
                </div>

                <div className="pedido-actions">
                  <button
                    className="btn-primary"
                    disabled={isPending}
                    onClick={() => marcarEnvioComoEnviado(envio.id)}
                  >
                    Marcar como enviado
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => irAWhatsApp(navigate, envio.whatsapp)}
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            ))}

            {!isLoading && totalPendientes === 0 && (
              <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40 }}>
                <p>No hay envíos pendientes</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <input
            placeholder="Buscar por nombre del cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: 320, maxWidth: '100%', padding: '8px 12px', borderRadius: 20,
              border: '1px solid var(--border)', fontSize: 13, outline: 'none',
              marginBottom: 16, display: 'block',
            }}
          />

          {isLoading && <div className="loading">Cargando...</div>}

          <div className="pedidos-grid">
            {pedidosEnviadosFiltrados.map((pedido: Pedido) => (
              <div key={`p-${pedido.id}`} className="pedido-card">
                <div className="pedido-header">
                  <div>
                    <span className="pedido-num">#{pedido.numero}</span>
                    <span className="pedido-nombre">
                      {pedido.cliente?.nombre || pedido.nombreDueño || 'Sin cliente'}
                    </span>
                  </div>
                  <span className="badge badge-enviado">{pedido.estado}</span>
                </div>

                <div className="pedido-meta">
                  <span>📅 Enviado: {fmtFecha(pedido.fechaEnvio || pedido.createdAt)}</span>
                  {pedido.cliente?.ciudad && <span>🏙️ {pedido.cliente.ciudad}</span>}
                  {pedido.cliente?.direccion && <span>📍 {pedido.cliente.direccion}</span>}
                  {pedido.cliente?.whatsapp && <span>📞 {pedido.cliente.whatsapp}</span>}
                  {pedido.numeroGuia && <span>🚚 Guía: {pedido.numeroGuia}</span>}
                  {pedido.transportadora && <span>🚛 {pedido.transportadora}</span>}
                </div>

                <div className="pedido-actions">
                  {pedido.cliente && (
                    <button
                      className="btn-secondary"
                      onClick={() => irAWhatsApp(navigate, pedido.cliente?.whatsapp)}
                    >
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>
            ))}

            {enviosEnviadosFiltrados.map((envio: Envio) => (
              <div key={`e-${envio.id}`} className="pedido-card">
                <div className="pedido-header">
                  <div>
                    <span className="pedido-num" style={{ fontSize: 13 }}>#</span>
                    <span className="pedido-nombre">
                      {envio.nombreCompleto || envio.whatsapp}
                    </span>
                  </div>
                  <span className="badge badge-enviado">ENVIADO</span>
                </div>

                <div className="pedido-meta">
                  <span>📅 Enviado: {fmtFecha(envio.updatedAt || envio.createdAt)}</span>
                  {envio.telefono && <span>📞 {envio.telefono}</span>}
                  {envio.cedula && <span>🪪 {envio.cedula}</span>}
                  {envio.direccion && <span>📍 {envio.direccion}</span>}
                  {envio.ciudad && <span>🏙️ {envio.ciudad}</span>}
                  {envio.barrio && <span>🏘️ {envio.barrio}</span>}
                </div>

                <div className="pedido-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => irAWhatsApp(navigate, envio.whatsapp)}
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            ))}

            {!isLoading && totalEnviados === 0 && (
              <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40 }}>
                <p>{busqueda ? 'Sin resultados para esa búsqueda' : 'Aún no hay pedidos enviados'}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
