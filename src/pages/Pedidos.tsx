import { useState } from 'react'
import { usePedidos, useCambiarEstado, usePedidosRealtime, EstadoPedido } from '../hooks/usePedidos'

const ESTADOS: { key: EstadoPedido | undefined; label: string; color: string }[] = [
  { key: undefined,    label: 'Todos',     color: '' },
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
  const [filtro, setFiltro] = useState<EstadoPedido | undefined>(undefined)
  const { data: pedidos = [], isLoading } = usePedidos(filtro)
  const { mutate: cambiarEstado, isPending } = useCambiarEstado()

  // Suscripción WebSocket para actualizaciones en tiempo real
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

      {/* Lista */}
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
    </div>
  )
}
