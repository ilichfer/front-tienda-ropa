import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

interface Lote {
  id: string
  nombre: string
  fechaLive: string
  descripcion: string
  activo: boolean
  totalPrendas: number
  prendasDisponibles: number
  createdAt: string
}

interface Prenda {
  id: string
  nombre: string
  talla: string
  color: string
  precio: number
  estado: string
  fotoUrl: string
}

interface Pedido {
  id: string
  numero: number
  estado: string
  cliente?: { nombre: string; whatsapp: string; ciudad: string } | null
  prenda?: { nombre: string; talla: string; precio: number; lote: { nombre: string } } | null
  nombreDueño?: string
  ubicacion?: string
}

export default function Bodega() {
  const qc = useQueryClient()
  const [showPedidoForm, setShowPedidoForm] = useState(false)
  const [showPrendaForm, setShowPrendaForm] = useState(false)
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null)
  const [nuevaPrenda, setNuevaPrenda] = useState({ nombre: '', talla: '', color: '', precio: 0 })
  const [busqueda, setBusqueda] = useState('')
  const [pedidoNombre, setPedidoNombre] = useState('')
  const [pedidoUbicacion, setPedidoUbicacion] = useState('')

  const { data: lotes = [], isLoading } = useQuery<Lote[]>({
    queryKey: ['lotes'],
    queryFn: () => api.get('/lotes').then(r => r.data),
  })

  const { data: prendas = [] } = useQuery<Prenda[]>({
    queryKey: ['prendas', loteSeleccionado],
    queryFn: () => api.get(`/lotes/${loteSeleccionado}/prendas`).then(r => r.data),
    enabled: !!loteSeleccionado,
  })

  const { data: pedidos = [] } = useQuery<Pedido[]>({
    queryKey: ['pedidos'],
    queryFn: () => api.get('/pedidos').then(r => r.data),
  })

  const guardarPedido = useMutation({
    mutationFn: () => api.post('/pedidos/bodega', {
      nombre: pedidoNombre,
      ubicacion: pedidoUbicacion,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      setShowPedidoForm(false)
      setPedidoNombre('')
      setPedidoUbicacion('')
    },
  })

  const agregarPrenda = useMutation({
    mutationFn: () => api.post(`/lotes/${loteSeleccionado}/prendas`, nuevaPrenda),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prendas', loteSeleccionado] })
      qc.invalidateQueries({ queryKey: ['lotes'] })
      setShowPrendaForm(false)
      setNuevaPrenda({ nombre: '', talla: '', color: '', precio: 0 })
    },
  })

  const pedidosFiltrados = busqueda.trim()
    ? pedidos.filter(p => {
        const nombre = (p.nombreDueño || p.cliente?.nombre || '').toLowerCase()
        return nombre.includes(busqueda.toLowerCase())
      })
    : pedidos

  if (isLoading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Bodega / Inventario</h1>
        <button className="btn btn-primary" onClick={() => setShowPedidoForm(true)}>
          + Agregar Pedido
        </button>
      </div>

      {/* Pedidos en bodega */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h3>📦 Pedidos en bodega</h3>
          <input
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: 260, maxWidth: '100%', padding: '8px 12px', borderRadius: 20,
              border: '1px solid var(--border)', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.nombreDueño || p.cliente?.nombre}</strong></td>
                  <td>
                    {p.ubicacion ? (
                      <span className={`badge ${p.ubicacion === 'REPISA' ? 'badge-apartado' : 'badge-enviado'}`}>
                        {p.ubicacion === 'REPISA' ? '🏷️ Repisa' : '📦 Estante'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin asignar</span>
                    )}
                  </td>
                </tr>
              ))}
              {pedidosFiltrados.length === 0 && (
                <tr><td colSpan={2} className="empty-state">
                  {busqueda ? 'Sin resultados para "' + busqueda + '"' : 'No hay pedidos registrados'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla de lotes */}
      <div className="table-wrapper" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Fecha Live</th>
              <th>Prendas</th>
              <th>Disponibles</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotes.map(l => (
              <tr key={l.id}>
                <td><strong>{l.nombre}</strong></td>
                <td>{new Date(l.fechaLive).toLocaleDateString('es-CO')}</td>
                <td>{l.totalPrendas}</td>
                <td>{l.prendasDisponibles}</td>
                <td><span className={`badge ${l.activo ? 'badge-apartado' : 'badge-cancelado'}`}>{l.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <button className="btn btn-sm btn-secondary"
                    onClick={() => setLoteSeleccionado(l.id === loteSeleccionado ? null : l.id)}>
                    {l.id === loteSeleccionado ? 'Cerrar' : 'Ver prendas'}
                  </button>
                </td>
              </tr>
            ))}
            {lotes.length === 0 && (
              <tr><td colSpan={6} className="empty-state">No hay lotes registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Prendas del lote seleccionado */}
      {loteSeleccionado && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3>Prendas del lote</h3>
            <button className="btn btn-sm btn-primary" onClick={() => setShowPrendaForm(true)}>
              + Agregar prenda
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Talla</th>
                <th>Color</th>
                <th>Precio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {prendas.map(p => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.talla}</td>
                  <td>{p.color}</td>
                  <td>${p.precio?.toLocaleString('es-CO')}</td>
                  <td><span className={`badge badge-${p.estado.toLowerCase()}`}>{p.estado}</span></td>
                </tr>
              ))}
              {prendas.length === 0 && (
                <tr><td colSpan={5} className="empty-state">No hay prendas en este lote</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal agregar pedido */}
      {showPedidoForm && (
        <div className="modal-overlay" onClick={() => setShowPedidoForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Agregar Pedido</h2>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Nombre</label>
              <input
                autoFocus
                value={pedidoNombre}
                onChange={e => setPedidoNombre(e.target.value)}
                placeholder="Nombre de la persona"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Ubicación</label>
              <select
                value={pedidoUbicacion}
                onChange={e => setPedidoUbicacion(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
              >
                <option value="">— Seleccionar —</option>
                <option value="REPISA">🏷️ Repisa</option>
                <option value="ESTANTE">📦 Estante</option>
              </select>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowPedidoForm(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => guardarPedido.mutate()}
                disabled={!pedidoNombre.trim() || !pedidoUbicacion || guardarPedido.isPending}
              >
                {guardarPedido.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar prenda */}
      {showPrendaForm && (
        <div className="modal-overlay" onClick={() => setShowPrendaForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Agregar Prenda</h2>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Nombre</label>
              <input value={nuevaPrenda.nombre} onChange={e => setNuevaPrenda({ ...nuevaPrenda, nombre: e.target.value })} placeholder="Ej: Blusa floral" />
            </div>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Talla</label>
                <input value={nuevaPrenda.talla} onChange={e => setNuevaPrenda({ ...nuevaPrenda, talla: e.target.value })} placeholder="S, M, L" />
              </div>
              <div className="form-group">
                <label>Color</label>
                <input value={nuevaPrenda.color} onChange={e => setNuevaPrenda({ ...nuevaPrenda, color: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Precio</label>
              <input type="number" value={nuevaPrenda.precio || ''} onChange={e => setNuevaPrenda({ ...nuevaPrenda, precio: Number(e.target.value) })} />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowPrendaForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => agregarPrenda.mutate()} disabled={!nuevaPrenda.nombre || !nuevaPrenda.precio || agregarPrenda.isPending}>
                {agregarPrenda.isPending ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
