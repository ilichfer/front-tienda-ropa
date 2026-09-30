import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useCuentas, pendientesDe, type Cuenta, type Movimiento, type Pendiente } from '../hooks/useCuentas'
import { avisarError, avisarExito, mensajeError } from '../ui/avisos'
import ErrorCarga from '../ui/ErrorCarga'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const fmt = (n: number) => '$' + (n || 0).toLocaleString('es-CO')

type Filtro = 'todas' | 'pendientes' | 'deben'

const FILTROS: { val: Filtro; label: string }[] = [
  { val: 'todas', label: 'Todas' },
  { val: 'pendientes', label: 'Con pendientes' },
  { val: 'deben', label: 'Con saldo por cobrar' },
]

function mediaUrl(m: Movimiento): string | null {
  return fuentesFoto(m)[0] ?? null
}

// Copia guardada en el servidor primero y, si no está, la de Meta (que expira con el tiempo).
function fuentesFoto(m: Movimiento): string[] {
  const fuentes: string[] = []
  if (m.mediaPath) fuentes.push(`${API_BASE}/media/local/${m.mediaPath}`)
  if (m.mediaId) fuentes.push(`${API_BASE}/media/${m.mediaId}`)
  return fuentes
}

const fmtFecha = (fecha: string | null) => {
  const d = fecha ? new Date(fecha) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleString('es-CO') : '—'
}

function esImagen(m: Movimiento) {
  return !m.mimeType || m.mimeType.startsWith('image/')
}

function haceCuanto(fecha: string | null) {
  const t = fecha ? Date.parse(fecha) : NaN
  if (isNaN(t)) return '—'
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
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

const nombreCliente = (c: Cuenta) => c.cliente.nombre || c.cliente.whatsapp

export default function Cuentas() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const filtroParam = searchParams.get('filtro') as Filtro | null
  const filtro: Filtro = filtroParam && FILTROS.some(f => f.val === filtroParam) ? filtroParam : 'todas'
  const [busqueda, setBusqueda] = useState('')
  const [expandida, setExpandida] = useState<string | null>(null)
  const [modal, setModal] = useState<'nueva' | 'cargo' | 'abono' | 'editar' | null>(null)
  const [cuentaActiva, setCuentaActiva] = useState<Cuenta | null>(null)
  const [movActivo, setMovActivo] = useState<Movimiento | null>(null)

  const [nuevaWhatsapp, setNuevaWhatsapp] = useState('')
  const [cargoForm, setCargoForm] = useState({ concepto: '', valor: '' })
  const [cargoFoto, setCargoFoto] = useState<string | null>(null)
  const [abonoForm, setAbonoForm] = useState({ valor: '', referencia: '', metodo: 'Nequi' })
  const [editarForm, setEditarForm] = useState({ concepto: '', valor: '' })

  const { data: cuentas = [], isLoading, isError, error, refetch } = useCuentas()

  const invalidar = () => qc.invalidateQueries({ queryKey: ['cuentas'] })

  const crearCuenta = useMutation({
    mutationFn: () => api.post('/cuentas', { whatsapp: nuevaWhatsapp.trim() }),
    meta: { accion: 'crear la cuenta' },
    onSuccess: () => { invalidar(); setModal(null); setNuevaWhatsapp(''); avisarExito('Cuenta creada') },
  })

  const crearCargo = useMutation({
    mutationFn: () => api.post('/cuentas/cargos', {
      whatsapp: cuentaActiva?.cliente.whatsapp,
      concepto: cargoForm.concepto.trim() || 'Pedido',
      valor: cargoForm.valor ? Number(cargoForm.valor) : null,
      mediaPath: cargoFoto,
    }),
    meta: { accion: 'guardar el cargo' },
    onSuccess: () => { invalidar(); setModal(null); setCargoForm({ concepto: '', valor: '' }); setCargoFoto(null); avisarExito('Cargo guardado') },
  })

  const crearAbono = useMutation({
    mutationFn: () => api.post(`/cuentas/${cuentaActiva!.id}/abonos`, {
      valor: Number(abonoForm.valor),
      referencia: abonoForm.referencia.trim() || null,
      metodo: abonoForm.metodo,
    }),
    meta: { accion: 'registrar el abono' },
    onSuccess: () => { invalidar(); setModal(null); setAbonoForm({ valor: '', referencia: '', metodo: 'Nequi' }); avisarExito('Abono registrado') },
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
    meta: { accion: 'guardar los cambios' },
    onSuccess: () => { invalidar(); setModal(null); setMovActivo(null); avisarExito('Cambios guardados') },
  })

  const validarAbono = useMutation({
    mutationFn: (id: string) => api.post(`/cuentas/movimientos/${id}/validar`),
    meta: { accion: 'validar el pago' },
    onSuccess: () => { invalidar(); avisarExito('Pago validado') },
  })

  const rechazarAbono = useMutation({
    mutationFn: (id: string) => api.post(`/cuentas/movimientos/${id}/rechazar`),
    meta: { accion: 'rechazar el pago' },
    onSuccess: () => { invalidar(); avisarExito('Pago rechazado') },
  })

  async function subirFoto(file: File) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/cuentas/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setCargoFoto(r.data.path)
    } catch (e) {
      avisarError(mensajeError(e, 'subir la foto'))
    }
  }

  function cambiarFiltro(f: Filtro) {
    setSearchParams(f === 'todas' ? {} : { filtro: f }, { replace: true })
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

  const pendientes = useMemo(() => pendientesDe(cuentas), [cuentas])

  // Primero las cuentas con algo por revisar, después las que más deben.
  const cuentasVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return cuentas
      .filter(c => !q || (c.cliente.nombre || '').toLowerCase().includes(q) || c.cliente.whatsapp.includes(q))
      .filter(c => filtro === 'todas'
        || (filtro === 'pendientes' && c.pendientesValor + c.abonosPorValidar > 0)
        || (filtro === 'deben' && c.saldo > 0))
      .sort((a, b) =>
        (b.pendientesValor + b.abonosPorValidar) - (a.pendientesValor + a.abonosPorValidar)
        || b.saldo - a.saldo)
  }, [cuentas, busqueda, filtro])

  if (isLoading) return <div className="loading">Cargando...</div>

  const totalPorCobrar = cuentas.reduce((acc, c) => acc + Math.max(c.saldo, 0), 0)
  const cargosPorDefinir = cuentas.reduce((acc, c) => acc + c.pendientesValor, 0)
  const abonosPorValidar = cuentas.reduce((acc, c) => acc + c.abonosPorValidar, 0)

  let mensajeVacio = 'No hay cuentas. Cuando un cliente aparte algo por WhatsApp, su cuenta aparecerá aquí.'
  if (isError) mensajeVacio = 'No se pudieron cargar las cuentas'
  else if (busqueda.trim()) mensajeVacio = `Ningún cliente coincide con "${busqueda.trim()}"`
  else if (filtro === 'pendientes') mensajeVacio = 'Ninguna cuenta tiene pendientes por revisar'
  else if (filtro === 'deben') mensajeVacio = 'Nadie tiene saldo por cobrar'

  return (
    <div>
      <div className="page-header">
        <h1>Cuentas por cobrar</h1>
        <button className="btn btn-primary" onClick={() => setModal('nueva')}>
          + Nueva cuenta
        </button>
      </div>

      {isError && <ErrorCarga error={error} onReintentar={() => refetch()} que="las cuentas" />}

      <div className="stats-grid">
        <button className="stat-card stat-card-boton" onClick={() => cambiarFiltro('deben')}>
          <span className="stat-label">Total por cobrar</span>
          <span className="stat-value">{fmt(totalPorCobrar)}</span>
        </button>
        <button className="stat-card stat-card-boton" onClick={() => cambiarFiltro('pendientes')}>
          <span className="stat-label">Prendas sin valor</span>
          <span className={`stat-value ${cargosPorDefinir > 0 ? 'warning' : ''}`}>{cargosPorDefinir}</span>
        </button>
        <button className="stat-card stat-card-boton" onClick={() => cambiarFiltro('pendientes')}>
          <span className="stat-label">Pagos por validar</span>
          <span className={`stat-value ${abonosPorValidar > 0 ? 'warning' : ''}`}>{abonosPorValidar}</span>
        </button>
      </div>

      {!isError && <BandejaPendientes pendientes={pendientes} />}

      <div className="cuentas-toolbar">
        <input
          className="input cuentas-buscar"
          type="search"
          placeholder="Buscar por nombre o número..."
          aria-label="Buscar cuenta por nombre o número"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        <div className="filtros" role="group" aria-label="Filtrar cuentas">
          {FILTROS.map(f => (
            <button
              key={f.val}
              className={`filter-btn ${filtro === f.val ? 'active' : ''}`}
              aria-pressed={filtro === f.val}
              onClick={() => cambiarFiltro(f.val)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

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
            {cuentasVisibles.map(c => (
              <Fragment key={c.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setExpandida(expandida === c.id ? null : c.id)}>
                  <td><strong>{nombreCliente(c)}</strong></td>
                  <td>{c.cliente.whatsapp}</td>
                  <td>{fmt(c.totalCargos)}</td>
                  <td>{fmt(c.totalAbonos)}</td>
                  <td style={{ fontWeight: 700, color: c.saldo > 0 ? 'var(--danger)' : 'var(--success)' }}>
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
                    <td colSpan={7} style={{ background: 'var(--surface-muted)' }}>
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
                                    {mediaUrl(m) ? (
                                      <a href={mediaUrl(m)!} target="_blank" rel="noopener noreferrer" aria-label="Ver foto">🖼️ </a>
                                    ) : null}
                                    {m.concepto || (m.tipo === 'ABONO' ? (m.metodo || 'Pago') : 'Pedido')}
                                    {m.tipo === 'ABONO' && m.referencia ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.referencia}</div> : null}
                                  </td>
                                  <td>{m.valor != null ? fmt(m.valor) : <em style={{ color: 'var(--text-muted)' }}>Por definir</em>}</td>
                                  <td><span className={`badge ${badgeEstado(m.estado)}`}>{etiquetaEstado(m.estado)}</span></td>
                                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(m.createdAt)}</td>
                                  <td>
                                    {/* Los comprobantes que llegan por WhatsApp ya no traen valor (el bot no
                                        se lo pregunta al cliente): se completa acá antes de validarlos. */}
                                    <button className="btn btn-sm btn-secondary" onClick={() => abrirEditar(m)}>✏️ Editar</button>
                                    {m.tipo === 'ABONO' && m.estado === 'PENDIENTE_VALIDAR' && (
                                      <>
                                        {' '}
                                        <button
                                          className="btn btn-sm btn-primary"
                                          onClick={() => validarAbono.mutate(m.id)}
                                          disabled={m.valor == null}
                                          title={m.valor == null ? 'Primero registra el valor del pago con ✏️ Editar' : undefined}
                                        >✓ Validar</button>
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
            {cuentasVisibles.length === 0 && (
              <tr><td colSpan={7} className="empty-state">{mensajeVacio}</td></tr>
            )}
          </tbody>
        </table>
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
              Cliente: <strong>{cuentaActiva && nombreCliente(cuentaActiva)}</strong>
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
              {cargoFoto && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>✓ Foto adjunta</div>}
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
              Cliente: <strong>{cuentaActiva && nombreCliente(cuentaActiva)}</strong> — debe {fmt(cuentaActiva?.saldo || 0)}
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Valor</label>
              <input autoFocus type="number" value={abonoForm.valor} onChange={e => setAbonoForm({ ...abonoForm, valor: e.target.value })} placeholder="Ej: 50000" />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Método</label>
              <select value={abonoForm.metodo} onChange={e => setAbonoForm({ ...abonoForm, metodo: e.target.value })}>
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

      {/* Modal editar cargo / abono */}
      {modal === 'editar' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{movActivo?.tipo === 'ABONO' ? 'Editar pago' : 'Editar cargo'}</h2>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>{movActivo?.tipo === 'ABONO' ? 'Concepto' : 'Prenda'}</label>
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

// ── Bandeja de pendientes ─────────────────────────────────────────────────────

/**
 * Todo lo que llegó por WhatsApp y espera a alguien del equipo: prendas guardadas en el baúl
 * sin valor y comprobantes de pago sin validar. Se resuelve cada uno acá mismo, viendo la foto,
 * sin tener que buscar al cliente y abrir su cuenta.
 */
function BandejaPendientes({ pendientes }: { pendientes: Pendiente[] }) {
  if (pendientes.length === 0) {
    return (
      <p className="bandeja-al-dia">
        ✓ Todo revisado: no hay prendas esperando valor ni pagos por validar.
      </p>
    )
  }

  return (
    <section className="bandeja" aria-labelledby="bandeja-titulo">
      <div className="bandeja-encabezado">
        <h2 id="bandeja-titulo">Por revisar ({pendientes.length})</h2>
        <p>Fotos que llegaron por WhatsApp, la más antigua primero. Escribe el valor y confírmalo.</p>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Cliente</th>
              <th>Qué es</th>
              <th>Llegó</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map(p => <PendienteFila key={p.mov.id} pendiente={p} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PendienteFila({ pendiente }: { pendiente: Pendiente }) {
  const { cuenta, mov } = pendiente
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [valor, setValor] = useState(mov.valor != null ? String(mov.valor) : '')
  // Rechazar no se puede deshacer desde el panel: el primer clic solo pide confirmación.
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false)
  const esPago = mov.tipo === 'ABONO'
  const numero = Number(valor)
  const valorValido = valor.trim() !== '' && Number.isFinite(numero) && numero > 0
  const url = mediaUrl(mov)
  const nombre = nombreCliente(cuenta)

  const confirmar = useMutation({
    mutationFn: async () => {
      if (numero !== mov.valor) {
        await api.patch(`/cuentas/movimientos/${mov.id}/valor`, { valor: numero })
      }
      if (esPago) {
        await api.post(`/cuentas/movimientos/${mov.id}/validar`)
      }
    },
    meta: { accion: esPago ? 'validar el pago' : 'guardar el valor' },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuentas'] })
      avisarExito(esPago
        ? `Pago de ${fmt(numero)} de ${nombre} validado`
        : `Prenda de ${nombre} guardada por ${fmt(numero)}`)
    },
  })

  const rechazar = useMutation({
    mutationFn: () => api.post(`/cuentas/movimientos/${mov.id}/rechazar`),
    meta: { accion: 'rechazar el pago' },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuentas'] })
      avisarExito(`Pago de ${nombre} rechazado`)
    },
  })

  const ocupado = confirmar.isPending || rechazar.isPending

  return (
    <tr>
      <td>
        {url && esImagen(mov) ? (
          <MiniaturaFoto fuentes={fuentesFoto(mov)} alt={`Foto enviada por ${nombre}`} />
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">📄 Ver archivo</a>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin foto</span>
        )}
      </td>
      <td>
        <strong>{nombre}</strong>
        <div>
          <button
            className="enlace"
            onClick={() => navigate(`/whatsapp?from=${encodeURIComponent(cuenta.cliente.whatsapp)}`)}
          >
            Ver chat
          </button>
        </div>
      </td>
      <td>
        <span className={`badge ${esPago ? 'badge-pagado' : 'badge-apartado'}`}>
          {esPago ? '💳 Comprobante de pago' : '🛍️ Prenda para el baúl'}
        </span>
        {mov.concepto && mov.concepto !== 'Soporte de pago' && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{mov.concepto}</div>
        )}
      </td>
      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }} title={fmtFecha(mov.createdAt)}>
        {haceCuanto(mov.createdAt)}
      </td>
      <td>
        <input
          className="input pendiente-valor"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="Ej: 45000"
          aria-label={esPago ? `Valor del pago de ${nombre}` : `Valor de la prenda de ${nombre}`}
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && valorValido && !ocupado) confirmar.mutate() }}
        />
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn btn-sm btn-primary" disabled={!valorValido || ocupado} onClick={() => confirmar.mutate()}>
          {confirmar.isPending ? 'Guardando...' : esPago ? 'Validar pago' : 'Guardar valor'}
        </button>
        {esPago && (
          <>
            {' '}
            <button
              className={`btn btn-sm ${confirmandoRechazo ? 'btn-peligro' : 'btn-secondary'}`}
              disabled={ocupado}
              onClick={() => confirmandoRechazo ? rechazar.mutate() : setConfirmandoRechazo(true)}
              onBlur={() => setConfirmandoRechazo(false)}
            >
              {rechazar.isPending ? 'Rechazando...' : confirmandoRechazo ? '¿Rechazar? Confirmar' : 'Rechazar'}
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

/**
 * Miniatura que prueba la copia local y luego la de Meta; si ninguna carga (archivo borrado o
 * enlace de Meta vencido) lo dice en vez de mostrar una imagen rota.
 */
function MiniaturaFoto({ fuentes, alt }: { fuentes: string[]; alt: string }) {
  const [intento, setIntento] = useState(0)
  const src = fuentes[intento]
  if (!src) {
    return <span className="pendiente-foto pendiente-foto-vacia">Foto no disponible</span>
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img className="pendiente-foto" src={src} alt={alt} loading="lazy" onError={() => setIntento(i => i + 1)} />
    </a>
  )
}
