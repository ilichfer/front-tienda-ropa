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

export default function Bodega() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showPrendaForm, setShowPrendaForm] = useState(false)
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null)
  const [nuevoLote, setNuevoLote] = useState({ nombre: '', fechaLive: '', descripcion: '' })
  const [nuevaPrenda, setNuevaPrenda] = useState({ nombre: '', talla: '', color: '', precio: 0 })

  const { data: lotes = [], isLoading } = useQuery<Lote[]>({
    queryKey: ['lotes'],
    queryFn: () => api.get('/lotes').then(r => r.data),
  })

  const { data: prendas = [] } = useQuery<Prenda[]>({
    queryKey: ['prendas', loteSeleccionado],
    queryFn: () => api.get(`/lotes/${loteSeleccionado}/prendas`).then(r => r.data),
    enabled: !!loteSeleccionado,
  })

  const crearLote = useMutation({
    mutationFn: () => api.post('/lotes', {
      ...nuevoLote,
      fechaLive: nuevoLote.fechaLive || new Date().toISOString().split('T')[0],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lotes'] })
      setShowForm(false)
      setNuevoLote({ nombre: '', fechaLive: '', descripcion: '' })
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

  if (isLoading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Bodega / Inventario</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nuevo Lote
        </button>
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

      {/* Modal crear lote */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Nuevo Lote</h2>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Nombre</label>
              <input value={nuevoLote.nombre} onChange={e => setNuevoLote({ ...nuevoLote, nombre: e.target.value })} placeholder="Ej: Live 1-Jul" />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Fecha del live</label>
              <input type="date" value={nuevoLote.fechaLive} onChange={e => setNuevoLote({ ...nuevoLote, fechaLive: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Descripción</label>
              <textarea value={nuevoLote.descripcion} onChange={e => setNuevoLote({ ...nuevoLote, descripcion: e.target.value })} rows={2} />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => crearLote.mutate()} disabled={!nuevoLote.nombre || crearLote.isPending}>
                {crearLote.isPending ? 'Guardando...' : 'Crear Lote'}
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
