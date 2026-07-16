import { useState } from 'react'
import { usePedidos, useCambiarEstado, usePedidosRealtime, EstadoPedido } from '../hooks/usePedidos'
import { useEnvios, useCambiarEstadoEnvio } from '../hooks/useEnvios'

const ESTADOS: { key: EstadoPedido | undefined | 'ENVIOS'; label: string; color: string }[] = [
  { key: undefined,    label: 'Todos',     color: '' },
  { key: 'ENVIOS',     label: 'Envíos',    color: 'badge-envio' },
  { key: 'NUEVO',      label: 'Nuevos',    color: 'badge-nuevo' },
  { key: 'APARTADO',   label: 'Apartados', color: 'badge-apartado' },
  { key: 'PAGADO',     label: 'Pagados',   color: 'badge-pagado' },
  { key: 'EMPACADO',   label: 'Empacados', color: 'badge-empacado' },
  { key: 'ENVIADO',    label: 'Enviados',  color: 'badge-enviado' },
]

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
  EMPACADO: 'Marcar enviado',
}

export default function Pedidos() {
  const [filtro, setFiltro] = useState<EstadoPedido | undefined | 'ENVIOS'>(undefined)
  const [envioFiltro, setEnvioFiltro] = useState<'PENDIENTE' | 'ENVIADO'>('PENDIENTE')

  const { data: pedidos = [], isLoading } = usePedidos(
    filtro === 'ENVIOS' ? undefined : filtro as EstadoPedido | undefined
  )
  const { mutate: cambiarEstado, isPending } = useCambiarEstado()
  const { data: envios = [], isLoading: enviosLoading } = useEnvios(
    filtro === 'ENVIOS' ? envioFiltro : undefined
  )
  const { mutate: marcarEnviado } = useCambiarEstadoEnvio()

  usePedidosRealtime()

  const avanzar = (id: string, estadoActual: EstadoPedido) => {
    const siguiente = SIGUIENTE_ESTADO[estadoActual]
    if (!siguiente) return
    cambiarEstado({ id, estado: siguiente })
  }

  return (
    <div className="page">
      {/* Filtros */}
      <div className="filtros">
        {ESTADOS.map(e => (
          <button
            key={e.label}
            className={`filter-btn ${filtro === e.key ? 'active' : ''}`}
            onClick={() => setFiltro(e.key)}
          >
            {e.label}
          </button>
        ))}
      </div>

      {filtro === 'ENVIOS' ? (
        /* ── Sección Envíos ── */
        <>
          <div className="filtros" style={{ marginTop: 8 }}>
            <button
              className={`filter-btn ${envioFiltro === 'PENDIENTE' ? 'active' : ''}`}
              onClick={() => setEnvioFiltro('PENDIENTE')}
            >Pendientes</button>
            <button
              className={`filter-btn ${envioFiltro === 'ENVIADO' ? 'active' : ''}`}
              onClick={() => setEnvioFiltro('ENVIADO')}
            >Enviados</button>
          </div>

          {enviosLoading && <div className="loading">Cargando...</div>}

          <div className="pedidos-grid">
            {envios.map(envio => (
              <div key={envio.id} className="pedido-card">
                <div className="pedido-header">
                  <div>
                    <span className="pedido-num" style={{ fontSize: 13 }}>
                      {envio.createdAt
                        ? new Date(envio.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </span>
                    <span className="pedido-nombre">
                      {envio.nombreCompleto || envio.whatsapp}
                    </span>
                  </div>
                  <span className={`badge ${envio.estado === 'ENVIADO' ? 'badge-enviado' : 'badge-nuevo'}`}>
                    {envio.estado}
                  </span>
                </div>

                <div className="pedido-meta">
                  {envio.telefono && <span>📞 {envio.telefono}</span>}
                  {envio.cedula && <span>🪪 {envio.cedula}</span>}
                  {envio.direccion && <span>📍 {envio.direccion}</span>}
                  {envio.ciudad && <span>🏙️ {envio.ciudad}</span>}
                  {envio.barrio && <span>🏘️ {envio.barrio}</span>}
                  {envio.notas && !envio.nombreCompleto && (
                    <details style={{ marginTop: 8, fontSize: 12 }}>
                      <summary>Ver texto completo</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4, background: '#f5f5f5', padding: 8, borderRadius: 6 }}>
                        {envio.notas}
                      </pre>
                    </details>
                  )}
                </div>

                <div className="pedido-actions">
                  {envio.estado === 'PENDIENTE' && (
                    <button
                      className="btn-primary"
                      onClick={() => marcarEnviado({ id: envio.id, estado: 'ENVIADO' })}
                    >
                      Marcar enviado
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => window.open(`https://wa.me/${envio.whatsapp}`, '_blank')}
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            ))}
            {!enviosLoading && envios.length === 0 && (
              <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40 }}>
                <p>No hay solicitudes {envioFiltro === 'PENDIENTE' ? 'pendientes' : 'enviadas'}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Sección Pedidos ── */
        <>
          {isLoading && <div className="loading">Cargando...</div>}

          <div className="pedidos-grid">
            {pedidos.map(pedido => (
              <div key={pedido.id} className="pedido-card">
                <div className="pedido-header">
                  <div>
                    <span className="pedido-num">#{pedido.numero}</span>
                    <span className="pedido-nombre">{pedido.cliente.nombre}</span>
                  </div>
                  <span className={`badge badge-${pedido.estado.toLowerCase()}`}>
                    {pedido.estado}
                  </span>
                </div>

                <div className="pedido-meta">
                  <span>👕 {pedido.prenda.nombre} – {pedido.prenda.talla}</span>
                  <span>📦 {pedido.prenda.lote.nombre}</span>
                  <span>💵 ${pedido.total?.toLocaleString('es-CO')}</span>
                  {pedido.numeroGuia && <span>🚚 Guía: {pedido.numeroGuia}</span>}
                </div>

                <div className="pedido-actions">
                  {SIGUIENTE_ESTADO[pedido.estado] && (
                    <button
                      className="btn-primary"
                      disabled={isPending}
                      onClick={() => avanzar(pedido.id, pedido.estado)}
                    >
                      {LABEL_ACCION[pedido.estado]}
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => window.open(
                      `https://wa.me/${pedido.cliente.whatsapp}`, '_blank'
                    )}
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
