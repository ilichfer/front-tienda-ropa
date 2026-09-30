import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePedidos, useCambiarEstado, usePedidosRealtime, EstadoPedido, Pedido } from '../hooks/usePedidos'
import { useEnvios, useCambiarEstadoEnvio, Envio } from '../hooks/useEnvios'
import ErrorCarga from '../ui/ErrorCarga'
import HojaEtiquetas, { type EtiquetaPersona } from '../ui/HojaEtiquetas'

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

const clavePedido = (id: string) => `p-${id}`
const claveEnvio = (id: string) => `e-${id}`

const instante = (s?: string) => (s ? Date.parse(s) : NaN) || 0

// Un mismo número de WhatsApp puede pedir envíos para personas distintas (ej. un regalo), así
// que el recuadro es por destinatario: número + cédula (o nombre, si no dio cédula).
const claveDestinatario = (e: Envio) =>
  `${e.whatsapp}|${(e.cedula || e.nombreCompleto || '').trim().toLowerCase()}`

/**
 * Arma un recuadro por destinatario con lo seleccionado. Si una persona tiene varios pedidos (o
 * un pedido y su solicitud de envío) sale una sola vez, con todo lo que se le manda en
 * "Contenido". Los datos salen de la solicitud de envío (la que tiene cédula, barrio, etc.); un
 * pedido sin solicitud seleccionada usa la más reciente de ese número y, si no hay ninguna, lo
 * que se sabe del cliente en el pedido.
 */
function construirEtiquetas(seleccion: Set<string>, pedidos: Pedido[], envios: Envio[]): EtiquetaPersona[] {
  const envioMasReciente = (whatsapp?: string, entre: Envio[] = envios) =>
    whatsapp
      ? entre.filter(e => e.whatsapp === whatsapp).sort((a, b) => instante(b.createdAt) - instante(a.createdAt))[0]
      : undefined

  const enviosSeleccionados = envios.filter(e => seleccion.has(claveEnvio(e.id)))
  const personas = new Map<string, EtiquetaPersona>()

  const persona = (clave: string, base: () => EtiquetaPersona) => {
    if (!personas.has(clave)) personas.set(clave, base())
    return personas.get(clave)!
  }

  const desdeEnvio = (clave: string, whatsapp: string | undefined, envio: Envio | undefined,
                      respaldo: Partial<EtiquetaPersona> = {}): EtiquetaPersona => ({
    clave,
    nombre: envio?.nombreCompleto || respaldo.nombre,
    cedula: envio?.cedula,
    telefono: envio?.telefono || whatsapp,
    whatsapp,
    direccion: envio?.direccion || respaldo.direccion,
    barrio: envio?.barrio,
    ciudad: envio?.ciudad || respaldo.ciudad,
    contenido: [],
  })

  // Del más nuevo al más viejo: si el mismo destinatario pidió envío dos veces, quedan sus
  // datos más recientes.
  const porFecha = [...enviosSeleccionados].sort((a, b) => instante(b.createdAt) - instante(a.createdAt))
  for (const e of porFecha) {
    const clave = claveDestinatario(e)
    persona(clave, () => desdeEnvio(clave, e.whatsapp, e))
  }

  for (const pedido of pedidos.filter(p => seleccion.has(clavePedido(p.id)))) {
    const whatsapp = pedido.cliente?.whatsapp
    const envio = envioMasReciente(whatsapp, enviosSeleccionados) ?? envioMasReciente(whatsapp)
    const clave = envio ? claveDestinatario(envio) : whatsapp || clavePedido(pedido.id)
    const p = persona(clave, () => desdeEnvio(clave, whatsapp, envio, {
      nombre: pedido.cliente?.nombre || pedido.nombreDueño,
      direccion: pedido.cliente?.direccion,
      ciudad: pedido.cliente?.ciudad,
    }))
    p.contenido.push(pedido.prenda
      ? `#${pedido.numero} ${pedido.prenda.nombre}${pedido.prenda.talla ? ` talla ${pedido.prenda.talla}` : ''}`
      : `Pedido #${pedido.numero}`)
  }

  return Array.from(personas.values())
    .sort((a, b) => (a.nombre || a.whatsapp || '').localeCompare(b.nombre || b.whatsapp || ''))
}

function irAWhatsApp(navigate: ReturnType<typeof useNavigate>, whatsapp?: string) {
  if (!whatsapp) return
  navigate(`/whatsapp?from=${encodeURIComponent(whatsapp)}`)
}

export default function Pedidos() {
  const [tab, setTab] = useState<Tab>('PENDIENTES')
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [mostrarHoja, setMostrarHoja] = useState(false)
  const navigate = useNavigate()

  // Se trae todo y se separa en el cliente: así "Envíos pendientes" puede incluir
  // cualquier pedido que todavía no se haya enviado, sin importar en qué paso
  // del proceso vaya (nuevo, apartado, pagado o empacado).
  const { data: pedidos = [], isLoading: cargandoPedidos, isError: errorPedidos, error: errPedidos, refetch: recargarPedidos } = usePedidos()
  const { mutate: cambiarEstado, isPending: cambiandoPedido } = useCambiarEstado()
  usePedidosRealtime()

  // Las solicitudes de envío (dirección, cédula, teléfono, etc. que el cliente da por
  // WhatsApp) son un registro aparte de los pedidos de prenda — no todo el que da sus
  // datos de envío tiene necesariamente un pedido creado. Por eso se muestran también
  // acá, para que ninguna solicitud quede "perdida" fuera de esta sección.
  const { data: envios = [], isLoading: cargandoEnvios, isError: errorEnvios, error: errEnvios, refetch: recargarEnvios } = useEnvios()
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

  // Lo que se ve en la pestaña actual es lo que "Seleccionar todos" marca.
  const clavesVisibles = tab === 'PENDIENTES'
    ? [...pedidosPendientes.map(p => clavePedido(p.id)), ...enviosPendientes.map(e => claveEnvio(e.id))]
    : [...pedidosEnviadosFiltrados.map(p => clavePedido(p.id)), ...enviosEnviadosFiltrados.map(e => claveEnvio(e.id))]
  const seleccionadosVisibles = clavesVisibles.filter(k => seleccion.has(k)).length
  const todosSeleccionados = clavesVisibles.length > 0 && seleccionadosVisibles === clavesVisibles.length

  const etiquetas = useMemo(
    () => construirEtiquetas(seleccion, pedidos, envios),
    [seleccion, pedidos, envios]
  )

  const alternar = (clave: string) => setSeleccion(prev => {
    const nueva = new Set(prev)
    if (nueva.has(clave)) nueva.delete(clave)
    else nueva.add(clave)
    return nueva
  })

  const alternarTodos = () => setSeleccion(todosSeleccionados ? new Set() : new Set(clavesVisibles))

  const cambiarTab = (t: Tab) => {
    setTab(t)
    setSeleccion(new Set())
  }

  const casilla = (clave: string, nombre: string) => (
    <label className="pedido-check">
      <input
        type="checkbox"
        checked={seleccion.has(clave)}
        onChange={() => alternar(clave)}
        aria-label={`Seleccionar a ${nombre}`}
      />
    </label>
  )

  const barraSeleccion = clavesVisibles.length > 0 && (
    <div className={`seleccion-barra ${seleccion.size > 0 ? 'activa' : ''}`}>
      <label className="seleccion-todos">
        <input
          type="checkbox"
          checked={todosSeleccionados}
          ref={el => { if (el) el.indeterminate = seleccionadosVisibles > 0 && !todosSeleccionados }}
          onChange={alternarTodos}
          aria-label="Seleccionar todos"
        />
        Seleccionar todos ({clavesVisibles.length})
      </label>
      {seleccion.size > 0 && (
        <div className="seleccion-acciones">
          <span>
            {seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'},{' '}
            {etiquetas.length} {etiquetas.length === 1 ? 'persona' : 'personas'}
          </span>
          <button className="btn btn-sm btn-secondary" onClick={() => setSeleccion(new Set())}>Quitar selección</button>
          <button className="btn btn-sm btn-primary" onClick={() => setMostrarHoja(true)}>Generar hoja de impresión</button>
        </div>
      )}
    </div>
  )

  const hayError = errorPedidos || errorEnvios

  return (
    <div className="page">
      {errorPedidos && <ErrorCarga error={errPedidos} onReintentar={() => recargarPedidos()} que="los pedidos" />}
      {errorEnvios && <ErrorCarga error={errEnvios} onReintentar={() => recargarEnvios()} que="las solicitudes de envío" />}

      <div className="filtros">
        <button
          className={`filter-btn ${tab === 'PENDIENTES' ? 'active' : ''}`}
          onClick={() => cambiarTab('PENDIENTES')}
        >
          Envíos pendientes
        </button>
        <button
          className={`filter-btn ${tab === 'ENVIADOS' ? 'active' : ''}`}
          onClick={() => cambiarTab('ENVIADOS')}
        >
          Enviados
        </button>
      </div>

      {tab === 'PENDIENTES' ? (
        <>
          {isLoading && <div className="loading">Cargando...</div>}

          {barraSeleccion}
          <div className="pedidos-grid">
            {pedidosPendientes.map(pedido => (
              <div key={`p-${pedido.id}`} className={`pedido-card ${seleccion.has(clavePedido(pedido.id)) ? 'seleccionado' : ''}`}>
                {casilla(clavePedido(pedido.id), pedido.cliente?.nombre || pedido.nombreDueño || `pedido #${pedido.numero}`)}
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
              <div key={`e-${envio.id}`} className={`pedido-card ${seleccion.has(claveEnvio(envio.id)) ? 'seleccionado' : ''}`}>
                {casilla(claveEnvio(envio.id), envio.nombreCompleto || envio.whatsapp)}
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

            {!isLoading && !hayError && totalPendientes === 0 && (
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

          {barraSeleccion}
          <div className="pedidos-grid">
            {pedidosEnviadosFiltrados.map((pedido: Pedido) => (
              <div key={`p-${pedido.id}`} className={`pedido-card ${seleccion.has(clavePedido(pedido.id)) ? 'seleccionado' : ''}`}>
                {casilla(clavePedido(pedido.id), pedido.cliente?.nombre || pedido.nombreDueño || `pedido #${pedido.numero}`)}
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
              <div key={`e-${envio.id}`} className={`pedido-card ${seleccion.has(claveEnvio(envio.id)) ? 'seleccionado' : ''}`}>
                {casilla(claveEnvio(envio.id), envio.nombreCompleto || envio.whatsapp)}
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

            {!isLoading && !hayError && totalEnviados === 0 && (
              <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40 }}>
                <p>{busqueda ? 'Sin resultados para esa búsqueda' : 'Aún no hay pedidos enviados'}</p>
              </div>
            )}
          </div>
        </>
      )}

      {mostrarHoja && etiquetas.length > 0 && (
        <HojaEtiquetas personas={etiquetas} onCerrar={() => setMostrarHoja(false)} />
      )}
    </div>
  )
}
