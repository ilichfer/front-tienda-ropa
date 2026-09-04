import { Fragment, useState } from 'react'
import { useClientes } from '../hooks/useClientes'
import {
  useWaPlantillasMeta, useRegistrarPlantillaMeta, useBorrarPlantillaMeta,
  useBroadcasts, useBroadcastDetalle, useCrearBroadcast,
  type WaPlantillaMeta,
} from '../hooks/useBroadcasts'

const TOKEN_NOMBRE_CLIENTE = '{{cliente_nombre}}'

export default function Difusion() {
  return (
    <div>
      <div className="page-header">
        <h1>Difusión</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, maxWidth: 640 }}>
        Envíos masivos usando <strong>plantillas ya aprobadas por Meta</strong> en WhatsApp
        Manager — es la única forma de llegar a un cliente sin importar cuándo te escribió por
        última vez. No confundir con las "Respuestas rápidas" del chat (esas son texto libre y
        solo sirven dentro de la ventana de 24h).
      </p>

      <PlantillasMetaCard />
      <NuevaDifusionCard />
      <HistorialCard />
    </div>
  )
}

// ── Plantillas de Meta registradas ─────────────────────────────────────────────

function PlantillasMetaCard() {
  const { data: plantillas = [] } = useWaPlantillasMeta()
  const registrar = useRegistrarPlantillaMeta()
  const borrar = useBorrarPlantillaMeta()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [idioma, setIdioma] = useState('es')
  const [variables, setVariables] = useState('')
  const [descripcion, setDescripcion] = useState('')

  async function crear() {
    if (!nombre.trim()) return
    await registrar.mutateAsync({ nombre: nombre.trim(), idioma: idioma.trim() || 'es', variables: variables.trim(), descripcion: descripcion.trim() })
    setNombre(''); setVariables(''); setDescripcion(''); setMostrarForm(false)
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>Plantillas de Meta registradas</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setMostrarForm(v => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Registrar plantilla'}
        </button>
      </div>

      {mostrarForm && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface-muted)', borderRadius: 'var(--radius-sm)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            El nombre debe coincidir EXACTO con el de una plantilla ya aprobada en WhatsApp
            Manager — esta app no la crea ni la manda a aprobar, solo registra sus datos.
          </p>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <div className="form-group">
              <label>Nombre exacto en WhatsApp Manager</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: notificacion_envio" />
            </div>
            <div className="form-group">
              <label>Idioma</label>
              <input value={idioma} onChange={e => setIdioma(e.target.value)} placeholder="es" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Variables en orden, separadas por coma (déjalo vacío si no tiene)</label>
            <input value={variables} onChange={e => setVariables(e.target.value)} placeholder="Ej: nombre,guia" />
          </div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Descripción (para reconocerla, no se manda al cliente)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Aviso de promoción de fin de semana" />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={crear} disabled={!nombre.trim() || registrar.isPending}>
              Registrar
            </button>
          </div>
        </div>
      )}

      {plantillas.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Todavía no registras ninguna plantilla de Meta.
        </p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Idioma</th><th>Variables</th><th>Descripción</th><th></th>
              </tr>
            </thead>
            <tbody>
              {plantillas.map(p => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.idioma}</td>
                  <td>{p.variables || '—'}</td>
                  <td>{p.descripcion || '—'}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => borrar.mutate(p.id)} title="Borrar">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Nueva difusión ──────────────────────────────────────────────────────────────

type ModoVariable = 'fijo' | 'cliente'

function NuevaDifusionCard() {
  const { data: plantillas = [] } = useWaPlantillasMeta(true)
  const { data: clientes = [] } = useClientes()
  const crear = useCrearBroadcast()

  const [plantillaId, setPlantillaId] = useState('')
  const [config, setConfig] = useState<Record<string, { modo: ModoVariable; valorFijo: string }>>({})
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)

  const plantilla = plantillas.find(p => p.id === plantillaId)
  const etiquetas = plantilla?.variables ? plantilla.variables.split(',').map(v => v.trim()).filter(Boolean) : []

  const clientesFiltrados = busqueda.trim()
    ? clientes.filter(c => (c.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) || c.whatsapp.includes(busqueda))
    : clientes

  function toggleSeleccionado(whatsapp: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(whatsapp) ? next.delete(whatsapp) : next.add(whatsapp)
      return next
    })
  }

  function seleccionarTodos() {
    setSeleccionados(new Set(clientesFiltrados.map(c => c.whatsapp)))
  }

  async function enviarDifusion() {
    if (!plantillaId || seleccionados.size === 0) return
    const variablesConfig: Record<string, string> = {}
    etiquetas.forEach(e => {
      const c = config[e]
      variablesConfig[e] = c?.modo === 'cliente' ? TOKEN_NOMBRE_CLIENTE : (c?.valorFijo || '')
    })
    await crear.mutateAsync({ plantillaMetaId: plantillaId, variablesConfig, destinatarios: Array.from(seleccionados) })
    setConfirmando(false)
    setSeleccionados(new Set())
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>Nueva difusión</h2>

      {plantillas.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Registra al menos una plantilla de Meta arriba para poder armar una difusión.
        </p>
      ) : (
        <>
          <div className="form-group" style={{ marginBottom: 16, maxWidth: 360 }}>
            <label>Plantilla</label>
            <select value={plantillaId} onChange={e => { setPlantillaId(e.target.value); setConfig({}) }}>
              <option value="">Selecciona una plantilla...</option>
              {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.descripcion ? ` — ${p.descripcion}` : ''}</option>)}
            </select>
          </div>

          {etiquetas.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Variables de la plantilla</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {etiquetas.map(etiqueta => {
                  const actual = config[etiqueta] || { modo: 'fijo' as ModoVariable, valorFijo: '' }
                  return (
                    <div key={etiqueta} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, minWidth: 100 }}>{etiqueta}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <input
                          type="radio"
                          checked={actual.modo === 'fijo'}
                          onChange={() => setConfig(c => ({ ...c, [etiqueta]: { ...actual, modo: 'fijo' } }))}
                        /> Texto fijo
                      </label>
                      {actual.modo === 'fijo' && (
                        <input
                          value={actual.valorFijo}
                          onChange={e => setConfig(c => ({ ...c, [etiqueta]: { ...actual, valorFijo: e.target.value } }))}
                          style={{ maxWidth: 220 }}
                          placeholder="Igual para todos"
                        />
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <input
                          type="radio"
                          checked={actual.modo === 'cliente'}
                          onChange={() => setConfig(c => ({ ...c, [etiqueta]: { ...actual, modo: 'cliente' } }))}
                        /> Nombre del cliente (distinto por persona)
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Destinatarios ({seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'})
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                placeholder="Buscar por nombre o número..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ flex: 1, maxWidth: 300 }}
              />
              <button className="btn btn-sm btn-secondary" onClick={seleccionarTodos}>Seleccionar todos</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setSeleccionados(new Set())}>Limpiar</button>
            </div>
            <div className="table-wrapper" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table>
                <tbody>
                  {clientesFiltrados.map(c => (
                    <tr key={c.id} onClick={() => toggleSeleccionado(c.whatsapp)} style={{ cursor: 'pointer' }}>
                      <td style={{ width: 32 }}>
                        <input type="checkbox" checked={seleccionados.has(c.whatsapp)} onChange={() => toggleSeleccionado(c.whatsapp)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td>{c.nombre || <span style={{ color: 'var(--text-muted)' }}>{c.whatsapp}</span>}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.whatsapp}</td>
                    </tr>
                  ))}
                  {clientesFiltrados.length === 0 && (
                    <tr><td className="empty-state">Sin clientes que coincidan</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn btn-primary"
              disabled={!plantillaId || seleccionados.size === 0}
              onClick={() => setConfirmando(true)}
            >
              Enviar difusión
            </button>
          </div>
        </>
      )}

      {confirmando && (
        <div className="modal-overlay" onClick={() => !crear.isPending && setConfirmando(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Confirmar difusión</h2>
            <p style={{ marginBottom: 16 }}>
              Vas a mandar la plantilla <strong>{plantilla?.nombre}</strong> a{' '}
              <strong>{seleccionados.size} destinatario{seleccionados.size === 1 ? '' : 's'}</strong>.
              No se puede deshacer. ¿Continuar?
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" disabled={crear.isPending} onClick={() => setConfirmando(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={crear.isPending} onClick={enviarDifusion}>
                {crear.isPending ? 'Enviando...' : 'Confirmar y enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────────

function HistorialCard() {
  const { data: broadcasts = [] } = useBroadcasts()
  const { data: plantillas = [] } = useWaPlantillasMeta()
  const [expandido, setExpandido] = useState<string | null>(null)

  function nombrePlantilla(id: string) {
    return plantillas.find((p: WaPlantillaMeta) => p.id === id)?.nombre || id
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>Historial</h2>
      {broadcasts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no has mandado ninguna difusión.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Plantilla</th><th>Total</th><th>Enviados</th><th>Fallidos</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {broadcasts.map(b => (
                <Fragment key={b.id}>
                  <tr onClick={() => setExpandido(expandido === b.id ? null : b.id)} style={{ cursor: 'pointer' }}>
                    <td>{new Date(b.createdAt).toLocaleString('es-CO')}</td>
                    <td>{nombrePlantilla(b.plantillaMetaId)}</td>
                    <td>{b.total}</td>
                    <td>{b.enviados}</td>
                    <td>{b.fallidos}</td>
                    <td>
                      <span className={`badge ${b.estado === 'COMPLETADO' ? 'badge-pagado' : 'badge-nuevo'}`}>{b.estado}</span>
                    </td>
                    <td>{expandido === b.id ? '▾' : '▸'}</td>
                  </tr>
                  {expandido === b.id && <DetalleBroadcast id={b.id} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DetalleBroadcast({ id }: { id: string }) {
  const { data } = useBroadcastDetalle(id)
  return (
    <tr>
      <td colSpan={7} style={{ background: 'var(--surface-muted)' }}>
        {!data ? 'Cargando...' : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
            {data.envios.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{e.whatsappFrom}</span>
                <span style={{ color: e.estado === 'FALLIDO' ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {e.estado}{e.error ? ` — ${e.error}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}
