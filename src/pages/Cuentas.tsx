import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

interface Movimiento {
  id: string
  tipo: 'CARGO' | 'ABONO'
  concepto?: string | null
  valor?: number | null
  estado: string
  referencia?: string | null
  metodo?: string | null
  mediaId?: string | null
  mediaPath?: string | null
  mimeType?: string | null
  createdAt: string
}

interface Cuenta {
  id: string
  cliente: { id: string; whatsapp: string; nombre?: string | null; ciudad?: string | null }
  saldo: number
  totalCargos: number
  totalAbonos: number
  pendientesValor: number
  abonosPorValidar: number
  movimientos: Movimiento[]
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const fmt = (n: number) => '$' + (n || 0).toLocaleString('es-CO')

function mediaUrl(m: Movimiento): string | null {
  if (m.mediaPath) return `${API_BASE}/media/local/${m.mediaPath}`
  if (m.mediaId) return `${API_BASE}/media/${m.mediaId}`
  return null
}

function badgeEstado(estado: string) {
  switch (estado) {
    case 'CONFIRMADO': return 'badge-pagado'
    case 'PENDIENTE_VALIDAR': return 'badge-apartado'
    case 'VALOR_POR_DEFINIR': return 'badge-cancelado'
    case 'RECHAZADO': return 'badge-cancelado'
    default: return 'badge-nuevo'
  }
}

function etiquetaEstado(estado: string) {
  switch (estado) {
    case 'CONFIRMADO': return '✓ Confirmado'
    case 'PENDIENTE_VALIDAR': return '⏳ Por validar'
    case 'VALOR_POR_DEFINIR': return '⚠️ Valor por definir'
    case 'RECHAZADO': return '✗ Rechazado'
    default: return estado
  }
}

export default function Cuentas() {
  const qc = useQueryClient()
  const [expandida, setExpandida] = useState<string | null>(null)
  const [modal, setModal] = useState<'nueva' | 'cargo' | 'abono' | 'editar' | null>(null)
  const [cuentaActiva, setCuentaActiva] = useState<Cuenta | null>(null)
  const [movActivo, setMovActivo] = useState<Movimiento | null>(null)

  const [nuevaWhatsapp, setNuevaWhatsapp] = useState('')
  const [cargoForm, setCargoForm] = useState({ concepto: '', valor: '' })
  const [cargoFoto, setCargoFoto] = useState<string | null>(null)
  const [abonoForm, setAbonoForm] = useState({ valor: '', referencia: '', metodo: 'Nequi' })
  const [editarForm, setEditarForm] = useState({ concepto: '', valor: '' })

  const { data: cuentas = [], isLoading } = useQuery<Cuenta[]>({
    queryKey: ['cuentas'],
    queryFn: () => api.get('/cuentas').then(r => r.data).catch(() => [] as Cuenta[]),
    refetchInterval: 15_000,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['cuentas'] })

  const crearCuenta = useMutation({
    mutationFn: () => api.post('/cuentas', { whatsapp: nuevaWhatsapp.trim() }),
    onSuccess: () => { invalidar(); setModal(null); setNuevaWhatsapp('') },
  })

  const crearCargo = useMutation({
    mutationFn: () => api.post('/cuentas/cargos', {
      whatsapp: cuentaActiva?.cliente.whatsapp,
      concepto: cargoForm.concepto.trim() || 'Pedido',
      valor: cargoForm.valor ? Number(cargoForm.valor) : null,
      mediaPath: cargoFoto,
    }),
    onSuccess: () => { invalidar(); setModal(null); setCargoForm({ concepto: '', valor: '' }); setCargoFoto(null) },
  })

  const crearAbono = useMutation({
    mutationFn: () => api.post(`/cuentas/${cuentaActiva!.id}/abonos`, {
      valor: Number(abonoForm.valor),
      referencia: abonoForm.referencia.trim() || null,
      metodo: abonoForm.metodo,
    }),
    onSuccess: () => { invalidar(); setModal(null); setAbonoForm({ valor: '', referencia: '', metodo: 'Nequi' }) },
  })

  const guardarEdicion = useMutation({
    mutationFn: async () => {
      const calls: Promise<any>[] = []
      const v = editarForm.valor.trim() ? Number(editarForm.valor) : null
      if (v && v > 0 && v !== movActivo?.valor) {
        calls.push(api.patch(`/cuentas/movimientos/${movActivo!.id}/valor`, { valor: v }))
      }
      if (editarForm.concepto.trim() && editarForm.concepto.trim() !== (movActivo?.concepto || '')) {
        calls.push(api.patch(`/cuentas/movimientos/${movActivo!.id}/concepto`, { concepto: editarForm.concepto.trim() }))
      }
      await Promise.all(calls)
    },
    onSuccess: () => { invalidar(); setModal(null); setMovActivo(null) },
  })

  const validarAbono = useMutation({
    mutationFn: (id: string) => api.post(`/cuentas/movimientos/${id}/validar`),
    onSuccess: invalidar,
  })

  const rechazarAbono = useMutation({
    mutationFn: (id: string) => api.post(`/cuentas/movimientos/${id}/rechazar`),
    onSuccess: invalidar,
  })

  async function subirFoto(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const r = await api.post('/cuentas/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    setCargoFoto(r.data.path)
  }

  function abrirCargo(cuenta: Cuenta) {
    setCuentaActiva(cuenta); setModal('cargo')
  }
  function abrirAbono(cuenta: Cuenta) {
    setCuentaActiva(cuenta); setModal('abono')
  }
  function abrirEditar(m: Movimiento) {
    setMovActivo(m); setEditarForm({ concepto: m.concepto || '', valor: m.valor ? String(m.valor) : '' }); setModal('editar')
  }

  if (isLoading) return <div className="loading">Cargando...</div>

  const totalPorCobrar = cuentas.reduce((acc, c) => acc + Math.max(c.saldo, 0), 0)
  const cargosPorDefinir = cuentas.reduce((acc, c) => acc + c.pendientesValor, 0)
  const abonosPorValidar = cuentas.reduce((acc, c) => acc + c.abonosPorValidar, 0)

  return (
    <div>
      <div className="page-header">
        <h1>Cuentas por cobrar</h1>
        <button className="btn btn-primary" onClick={() => setModal('nueva')}>
          + Nueva cuenta
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total por cobrar</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(totalPorCobrar)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargos sin valor</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{cargosPorDefinir}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Abonos por validar</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{abonosPorValidar}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Cargos</th>
                <th>Abonos</th>
                <th>Saldo</th>
                <th>Pendientes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <Fragment key={c.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpandida(expandida === c.id ? null : c.id)}>
                    <td><strong>{c.cliente.nombre || c.cliente.whatsapp}</strong></td>
                    <td>{c.cliente.whatsapp}</td>
                    <td>{fmt(c.totalCargos)}</td>
                    <td>{fmt(c.totalAbonos)}</td>
                    <td style={{ fontWeight: 700, color: c.saldo > 0 ? '#c62828' : '#2e7d32' }}>
                      {c.saldo > 0 ? 'Debe ' : ''}{fmt(c.saldo)}
                    </td>
                    <td>
                      {c.pendientesValor > 0 && <span className="badge badge-cancelado" style={{ marginRight: 4 }}>{c.pendientesValor} sin valor</span>}
                      {c.abonosPorValidar > 0 && <span className="badge badge-apartado">{c.abonosPorValidar} por validar</span>}
                      {c.pendientesValor === 0 && c.abonosPorValidar === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm btn-secondary" onClick={() => abrirCargo(c)}>+ Cargo</button>
                      {' '}
                      <button className="btn btn-sm btn-secondary" onClick={() => abrirAbono(c)}>+ Abono</button>
                    </td>
                  </tr>
                  {expandida === c.id && (
                    <tr>
                      <td colSpan={7} style={{ background: '#fafafa' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                          <strong>Movimientos</strong>
                          <button className="btn btn-sm btn-secondary" onClick={() => abrirCargo(c)}>+ Agregar cargo</button>
                        </div>
                        {c.movimientos.length === 0 ? (
                          <div className="empty-state" style={{ padding: 20 }}>Sin movimientos aún</div>
                        ) : (
                          <div className="table-wrapper">
                            <table>
                              <thead>
                                <tr>
                                  <th>Tipo</th>
                                  <th>Concepto</th>
                                  <th>Valor</th>
                                  <th>Estado</th>
                                  <th>Fecha</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.movimientos.map(m => (
                                  <tr key={m.id}>
                                    <td>{m.tipo === 'CARGO' ? '🛍️ Cargo' : '💸 Abono'}</td>
                                    <td>
                                      {m.tipo === 'CARGO' && mediaUrl(m) ? (
                                        <a href={mediaUrl(m)!} target="_blank" rel="noopener noreferrer">🖼️ </a>
                                      ) : null}
                                      {m.concepto || (m.tipo === 'ABONO' ? (m.metodo || 'Pago') : 'Pedido')}
                                      {m.tipo === 'ABONO' && m.referencia ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.referencia}</div> : null}
                                    </td>
                                    <td>{m.valor != null ? fmt(m.valor) : <em style={{ color: 'var(--text-muted)' }}>Por definir</em>}</td>
                                    <td><span className={`badge ${badgeEstado(m.estado)}`}>{etiquetaEstado(m.estado)}</span></td>
                                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(m.createdAt).toLocaleString('es-CO')}</td>
                                    <td>
                                      {m.tipo === 'CARGO' && (
                                        <button className="btn btn-sm btn-secondary" onClick={() => abrirEditar(m)}>✏️ Editar</button>
                                      )}
                                      {m.tipo === 'ABONO' && m.estado === 'PENDIENTE_VALIDAR' && (
                                        <>
                                          <button className="btn btn-sm btn-primary" onClick={() => validarAbono.mutate(m.id)}>✓ Validar</button>
                                          {' '}
                                          <button className="btn btn-sm btn-secondary" onClick={() => rechazarAbono.mutate(m.id)}>✗ Rechazar</button>
                                        </>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {cuentas.length === 0 && (
                <tr><td colSpan={7} className="empty-state">No hay cuentas. Cuando un cliente aparte algo por WhatsApp, su cuenta aparecerá aquí.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nueva cuenta */}
      {modal === 'nueva' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Nueva cuenta</h2>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Número de WhatsApp</label>
              <input
                autoFocus
                value={nuevaWhatsapp}
                onChange={e => setNuevaWhatsapp(e.target.value)}
                placeholder="Ej: 573001234567"
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => crearCuenta.mutate()} disabled={!nuevaWhatsapp.trim() || crearCuenta.isPending}>
                {crearCuenta.isPending ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar cargo */}
      {modal === 'cargo' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Agregar cargo</h2>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              Cliente: <strong>{cuentaActiva?.cliente.nombre || cuentaActiva?.cliente.whatsapp}</strong>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Prenda</label>
              <input
                autoFocus
                value={cargoForm.concepto}
                onChange={e => setCargoForm({ ...cargoForm, concepto: e.target.value })}
                placeholder="Ej: Jean talla 32"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Valor (opcional)</label>
              <input
                type="number"
                value={cargoForm.valor}
                onChange={e => setCargoForm({ ...cargoForm, valor: e.target.value })}
                placeholder="Ej: 45000"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Foto de la prenda (opcional)</label>
              <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && subirFoto(e.target.files[0])} />
              {cargoFoto && <div style={{ fontSize: 12, color: '#2e7d32', marginTop: 4 }}>✓ Foto adjunta</div>}
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => crearCargo.mutate()} disabled={!cargoForm.concepto.trim() || crearCargo.isPending}>
                {crearCargo.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar abono */}
      {modal === 'abono' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Registrar abono</h2>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              Cliente: <strong>{cuentaActiva?.cliente.nombre || cuentaActiva?.cliente.whatsapp}</strong> — debe {fmt(cuentaActiva?.saldo || 0)}
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Valor</label>
              <input autoFocus type="number" value={abonoForm.valor} onChange={e => setAbonoForm({ ...abonoForm, valor: e.target.value })} placeholder="Ej: 50000" />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Método</label>
              <select value={abonoForm.metodo} onChange={e => setAbonoForm({ ...abonoForm, metodo: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}>
                <option value="Nequi">Nequi</option>
                <option value="Daviplata">Daviplata</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Contra entrega">Contra entrega</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Referencia (opcional)</label>
              <input value={abonoForm.referencia} onChange={e => setAbonoForm({ ...abonoForm, referencia: e.target.value })} placeholder="Ej: código de transacción" />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => crearAbono.mutate()} disabled={!abonoForm.valor || Number(abonoForm.valor) <= 0 || crearAbono.isPending}>
                {crearAbono.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar cargo */}
      {modal === 'editar' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Editar cargo</h2>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Prenda</label>
              <input autoFocus value={editarForm.concepto} onChange={e => setEditarForm({ ...editarForm, concepto: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Valor</label>
              <input type="number" value={editarForm.valor} onChange={e => setEditarForm({ ...editarForm, valor: e.target.value })} placeholder="Ej: 45000" />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => guardarEdicion.mutate()} disabled={guardarEdicion.isPending}>
                {guardarEdicion.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
