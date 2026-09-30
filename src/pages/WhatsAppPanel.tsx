import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { usePedidos } from '../hooks/usePedidos'
import { useWaPlantillas, useGuardarWaPlantilla, useCambiarActivaWaPlantilla, useBorrarWaPlantilla, type WaPlantilla } from '../hooks/useWaPlantillas'
import { useWaNotas, useAgregarWaNota, useBorrarWaNota } from '../hooks/useWaNotas'
import { avisarError, mensajeError } from '../ui/avisos'
import ErrorCarga from '../ui/ErrorCarga'

const VENTANA_24H_MS = 24 * 60 * 60 * 1000

// Pedidos que todavía no terminaron su ciclo (ni entregados ni cancelados): son los que
// tiene sentido mostrarle al operador como "activos" en el resumen del cliente.
const ESTADOS_ACTIVOS = new Set(['NUEVO', 'APARTADO', 'PAGADO', 'EMPACADO', 'ENVIADO'])

interface WaMensaje {
  id: string
  whatsappFrom: string
  contenido: string
  tipo: string
  direccion: 'ENTRADA' | 'SALIDA'
  createdAt: string
  cliente?: { nombre: string; requiereAsesor?: boolean; botSilenciado?: boolean; esBuzonGuias?: boolean }
  mediaId?: string
  mediaPath?: string
  mimeType?: string
  leido?: boolean
  waMessageId?: string
  contextWaMessageId?: string
  estadoEntrega?: string
  errorEntrega?: string
}

// Ticks de estado de entrega para mensajes SALIDA, igual a la convención visual de WhatsApp
// (que el operador ya conoce), en vez de inventar un lenguaje nuevo.
function TickEntrega({ estado, error }: { estado?: string; error?: string }) {
  if (!estado || estado === 'sent') return <span title="Enviado">✓</span>
  if (estado === 'delivered') return <span title="Entregado">✓✓</span>
  if (estado === 'read') return <span title="Leído" style={{ color: '#53bdeb' }}>✓✓</span>
  if (estado === 'failed') return <span title={error || 'No se pudo entregar'} style={{ color: '#fca5a5' }}>⚠️</span>
  return null
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function mediaUrl(m: WaMensaje): string | null {
  if (m.mediaPath) return `${API_BASE}/media/local/${m.mediaPath}`
  if (m.mediaId) return `${API_BASE}/media/${m.mediaId}`
  return null
}

function icono(tipo: string) {
  switch (true) {
    case tipo === 'image':    return '🖼️ '
    case tipo === 'audio':    return '🎵 '
    case tipo === 'video':    return '🎬 '
    case tipo === 'document': return '📄 '
    case tipo === 'sticker':  return '🎨 '
    case tipo === 'location': return '📍 '
    case tipo === 'list': return '📋 '
    case tipo.startsWith('button_'): return '🔘 '
    case tipo.startsWith('list_'): return '📋 '
    default: return ''
  }
}

function etiqueta(m: WaMensaje) {
  if (m.tipo === 'image')    return m.contenido.startsWith('[') ? '🖼️ Imagen' : m.contenido
  if (m.tipo === 'audio')    return m.contenido.startsWith('[') ? '🎵 Audio' : m.contenido
  if (m.tipo === 'video')    return m.contenido.startsWith('[') ? '🎬 Video' : m.contenido
  if (m.tipo === 'sticker')  return '🎨 Sticker'
  if (m.tipo === 'document') return '📄 ' + (m.contenido.startsWith('[') ? 'Documento' : m.contenido)
  if (m.tipo === 'location') return m.contenido
  if (m.tipo === 'list') return '📋 ' + m.contenido
  if (m.tipo.startsWith('list_')) return '📋 ' + m.contenido
  if (m.tipo.startsWith('button_')) return '🔘 ' + m.contenido
  return m.contenido
}

// Vista previa del mensaje citado (arriba de la burbuja), igual que "Responder" en WhatsApp
// Web. Se resuelve por wa_message_id contra los mensajes ya cargados de la conversación — si
// el mensaje original no está en la lista (poco probable, pero por ejemplo si se borró la
// conversación y luego llegó algo referenciándolo) simplemente no se muestra nada.
function Cita({ citado, onClick }: { citado: WaMensaje, onClick: () => void }) {
  const url = mediaUrl(citado)
  return (
    <div className="wa-quote" onClick={onClick}>
      <div className="wa-quote-autor">{citado.direccion === 'ENTRADA' ? '📥 Cliente' : '📤 Tú'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {citado.tipo === 'image' && url && (
          <img src={url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
        )}
        <div className="wa-quote-texto">{icono(citado.tipo)}{etiqueta(citado).slice(0, 80)}</div>
      </div>
    </div>
  )
}

function Bubble({ m, onImgClick, onReply, onReenviar, mensajesPorWaId }: {
  m: WaMensaje
  onImgClick: (url: string) => void
  onReply: (m: WaMensaje) => void
  onReenviar: (m: WaMensaje) => void
  mensajesPorWaId: Map<string, WaMensaje>
}) {
  const [imgError, setImgError] = useState(false)
  const url = mediaUrl(m)
  const citado = m.contextWaMessageId ? mensajesPorWaId.get(m.contextWaMessageId) : undefined
  const esEntrada = m.direccion === 'ENTRADA'

  function irAlCitado() {
    if (!citado) return
    const el = document.getElementById(`msg-${citado.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const botonResponder = m.waMessageId && (
    <button
      className="wa-reply-btn"
      title="Responder citando este mensaje"
      onClick={() => onReply(m)}
    >↩️</button>
  )

  // Reenviar a otro chat: solo tiene sentido para imágenes que ya se pudieron mostrar (si
  // falló guardar la foto no hay nada que reenviar).
  const botonReenviar = m.tipo === 'image' && url && !imgError && (
    <button
      className="wa-reply-btn"
      title="Reenviar esta imagen a otro chat"
      onClick={() => onReenviar(m)}
    >📤</button>
  )

  let contenidoBubble
  if (m.tipo === 'image' && url && !imgError) {
    contenidoBubble = (
      <div id={`msg-${m.id}`} className={`wa-bubble ${esEntrada ? 'in' : 'out'}`}>
        {citado && <Cita citado={citado} onClick={irAlCitado} />}
        <img
          src={url}
          alt={m.contenido}
          onClick={() => onImgClick(url)}
          onError={() => setImgError(true)}
          style={{ maxWidth: 200, borderRadius: 8, cursor: 'pointer', display: 'block' }}
        />
        {m.contenido && !m.contenido.startsWith('[') && (
          <div style={{ marginTop: 4, fontSize: 13 }}>{m.contenido}</div>
        )}
        <span className="wa-time">
          {new Date(m.createdAt).toLocaleString('es-CO')}
          {!esEntrada && <> <TickEntrega estado={m.estadoEntrega} error={m.errorEntrega} /></>}
        </span>
      </div>
    )
  } else {
    contenidoBubble = (
      <div id={`msg-${m.id}`} className={`wa-bubble ${esEntrada ? 'in' : 'out'}`}>
        {citado && <Cita citado={citado} onClick={irAlCitado} />}
        {m.tipo === 'image' ? <span>🖼️ {m.contenido}</span> :
         m.tipo === 'audio' && url ? <audio controls src={url} style={{ maxWidth: 250 }} /> :
         m.tipo === 'video' && url ? <video controls src={url} style={{ maxWidth: 250, borderRadius: 8 }} /> :
         m.tipo === 'sticker' && url ? <img src={url} alt="sticker" style={{ maxWidth: 120, display: 'block' }} /> :
         m.tipo === 'document' && url ? <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>📄 {m.contenido.startsWith('[') ? 'Abrir documento' : m.contenido}</a> :
         m.tipo === 'location' ? <span>📍 {m.contenido}</span> :
         <span>{icono(m.tipo)}{m.contenido}</span>}
        <span className="wa-time">
          {new Date(m.createdAt).toLocaleString('es-CO')}
          {!esEntrada && <> <TickEntrega estado={m.estadoEntrega} error={m.errorEntrega} /></>}
        </span>
      </div>
    )
  }

  return (
    <div className={`wa-bubble-row ${esEntrada ? 'in' : 'out'}`}>
      {!esEntrada && botonReenviar}
      {!esEntrada && botonResponder}
      {contenidoBubble}
      {esEntrada && botonResponder}
      {esEntrada && botonReenviar}
    </div>
  )
}

export default function WhatsAppPanel() {
  const [searchParams] = useSearchParams()
  const [selectedFrom, setSelectedFrom] = useState<string | null>(() => searchParams.get('from'))
  const [texto, setTexto] = useState('')
  const [replyTo, setReplyTo] = useState<WaMensaje | null>(null)
  const [modalImg, setModalImg] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editandoNombre, setEditandoNombre] = useState('')
  const [nombreInput, setNombreInput] = useState('')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  const [mostrarResumen, setMostrarResumen] = useState(true)
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [mostrarPlantillas, setMostrarPlantillas] = useState(false)
  const [gestionandoPlantillas, setGestionandoPlantillas] = useState(false)
  const [mostrarNotas, setMostrarNotas] = useState(false)
  const [notaTexto, setNotaTexto] = useState('')
  const [reenviarMsg, setReenviarMsg] = useState<WaMensaje | null>(null)
  const [reenviarBusqueda, setReenviarBusqueda] = useState('')
  const [reenviarDestino, setReenviarDestino] = useState<string | null>(null)
  const [reenviando, setReenviando] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: mensajes = [], isLoading, isError, error, refetch } = useQuery<WaMensaje[]>({
    queryKey: ['wa-mensajes'],
    queryFn: () => api.get('/wa-mensajes').then(r => r.data),
    refetchInterval: 10_000,
  })

  // Pedidos del cliente seleccionado, para el resumen debajo del encabezado del chat.
  const { data: pedidos = [] } = usePedidos()
  const pedidosCliente = selectedFrom ? pedidos.filter(p => p.cliente?.whatsapp === selectedFrom) : []
  const pedidosActivos = pedidosCliente.filter(p => ESTADOS_ACTIVOS.has(p.estado))

  const conversaciones = Array.from(
    mensajes.reduce((acc, m) => {
      if (!acc.has(m.whatsappFrom)) acc.set(m.whatsappFrom, [])
      acc.get(m.whatsappFrom)!.push(m)
      return acc
    }, new Map<string, WaMensaje[]>())
  ).map(([from, msgs]) => ({
    from,
    cliente: msgs.find(m => m.cliente)?.cliente,
    ultimo: msgs[0],
    // Más reciente ENTRADA (no el último mensaje sea cual sea su dirección) — define la
    // ventana de 24h en la que Meta permite texto libre sin plantilla aprobada.
    ultimoEntradaAt: msgs.find(m => m.direccion === 'ENTRADA')?.createdAt,
    noLeidos: msgs.filter(m => m.direccion === 'ENTRADA' && !m.leido).length,
    requiereAsesor: msgs.find(m => m.cliente?.requiereAsesor)?.cliente?.requiereAsesor ?? false,
    botSilenciado: msgs.find(m => m.cliente?.botSilenciado)?.cliente?.botSilenciado ?? false,
    esBuzonGuias: msgs.find(m => m.cliente?.esBuzonGuias)?.cliente?.esBuzonGuias ?? false,
  })).sort((a, b) => {
    if (a.requiereAsesor && !b.requiereAsesor) return -1
    if (!a.requiereAsesor && b.requiereAsesor) return 1
    return 0
  })

  const conversacionesFiltradas = busqueda.trim()
    ? conversaciones.filter(c => {
        const nombre = (c.cliente?.nombre || '').toLowerCase()
        const num = c.from.toLowerCase()
        const q = busqueda.toLowerCase()
        return nombre.includes(q) || num.includes(q)
      })
    : conversaciones

  const conversacionActual = selectedFrom
    ? [...mensajes.filter(m => m.whatsappFrom === selectedFrom)].reverse()
    : []

  const convActualInfo = selectedFrom ? conversaciones.find(c => c.from === selectedFrom) : undefined

  // Ventana de 24h: Meta solo permite texto libre si el cliente escribió en las últimas 24h;
  // fuera de esa ventana, cualquier mensaje business-initiated necesita una plantilla
  // aprobada. Es informativo, no bloquea el envío (evita falsos positivos por reloj/huso).
  const dentroVentana24h = convActualInfo?.ultimoEntradaAt
    ? Date.now() - new Date(convActualInfo.ultimoEntradaAt).getTime() < VENTANA_24H_MS
    : false

  const { data: plantillas = [] } = useWaPlantillas(true)
  const { data: notas = [] } = useWaNotas(mostrarNotas ? selectedFrom : null)
  const agregarNotaMutation = useAgregarWaNota()
  const borrarNotaMutation = useBorrarWaNota()

  // Para resolver rápido, por wa_message_id, a qué mensaje se refiere una cita — tanto la que
  // se muestra dentro de una burbuja como la del mensaje que se está por responder.
  const mensajesPorWaId = new Map<string, WaMensaje>()
  conversacionActual.forEach(m => {
    if (m.waMessageId) mensajesPorWaId.set(m.waMessageId, m)
  })

  // Al cambiar de conversación, cualquier respuesta que se estuviera armando ya no aplica.
  useEffect(() => {
    setReplyTo(null)
  }, [selectedFrom])

  useEffect(() => {
    const from = searchParams.get('from')
    if (from) setSelectedFrom(from)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Detecta pantallas de celular para mostrar SOLO la lista de chats o SOLO la conversación
  // a la vez (como WhatsApp), en vez de las dos apiladas una sobre la otra.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const actualizar = () => setIsMobile(mq.matches)
    actualizar()
    mq.addEventListener('change', actualizar)
    return () => mq.removeEventListener('change', actualizar)
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [selectedFrom, conversacionActual.length])

  useEffect(() => {
    if (!selectedFrom) return
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [selectedFrom])

  useEffect(() => {
    if (!selectedFrom) return
    api.post('/wa-mensajes/leer', { whatsappFrom: selectedFrom })
      .catch(() => {})
      .finally(() => queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] }))
    // La marca naranja de "requiere asesor" YA NO se quita solo por abrir el chat a mirarlo
    // (antes pasaba acá) — se queda marcado hasta que el asesor realmente lo gestiona
    // respondiendo algo, que es cuando el backend la quita (ver WaMensajeController.enviar).
  }, [selectedFrom, mensajes.length])

  async function enviar() {
    if (!texto.trim() || !selectedFrom) return
    try {
      await api.post('/wa-mensajes/enviar', {
        to: selectedFrom,
        texto,
        ...(replyTo?.waMessageId ? { replyToWaMessageId: replyTo.waMessageId } : {}),
      })
      setTexto('')
      setReplyTo(null)
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
      inputRef.current?.focus()
    } catch (e) {
      // El texto se queda en la caja para poder reintentar sin volver a escribirlo.
      avisarError(mensajeError(e, 'enviar el mensaje'))
    }
  }

  // Prepara el input para responder citando un mensaje puntual (como "Responder" en WhatsApp
  // Web). Si el mensaje no tiene wa_message_id (no debería pasar, pero por si acaso) no hay
  // nada que citar y se ignora.
  function iniciarRespuesta(m: WaMensaje) {
    if (!m.waMessageId) return
    setReplyTo(m)
    inputRef.current?.focus()
  }

  // Inserta el cuerpo de una respuesta rápida en el compositor, reemplazando "{nombre}" por
  // el nombre del cliente de la conversación actual (si lo tiene guardado) para no tener que
  // editarlo a mano cada vez.
  function usarPlantilla(p: WaPlantilla) {
    const nombreCliente = convActualInfo?.cliente?.nombre
    setTexto(p.cuerpo.split('{nombre}').join(nombreCliente || ''))
    setMostrarPlantillas(false)
    inputRef.current?.focus()
  }

  async function guardarNota() {
    if (!notaTexto.trim() || !selectedFrom) return
    try {
      await agregarNotaMutation.mutateAsync({ whatsappFrom: selectedFrom, contenido: notaTexto.trim() })
      setNotaTexto('')
    } catch {
      // El aviso de error ya lo muestra el manejador global de mutaciones (main.tsx).
    }
  }

  async function guardarNombre(whatsappFrom: string) {
    if (!nombreInput.trim()) return
    try {
      await api.put('/wa-mensajes/cliente', { whatsappFrom, nombre: nombreInput.trim() })
      setEditandoNombre('')
      setNombreInput('')
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
    } catch (e) {
      avisarError(mensajeError(e, 'guardar el nombre'))
    }
  }

  function iniciarEdicion(whatsappFrom: string, nombreActual: string) {
    setEditandoNombre(whatsappFrom)
    setNombreInput(nombreActual)
  }

  async function toggleSilenciarBot(whatsappFrom: string, silenciarAhora: boolean) {
    try {
      await api.patch('/wa-mensajes/silenciar-bot', { whatsappFrom, silenciado: silenciarAhora })
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
    } catch (e) {
      avisarError(mensajeError(e, silenciarAhora ? 'silenciar el bot' : 'reactivar el bot'))
    }
  }

  // Marca/desmarca el chat actual como el buzón de donde llegan las fotos de guías de envío
  // (ej. Interrápidísimo) — el backend también activa "silenciar bot" al marcarlo.
  async function toggleBuzonGuias(whatsappFrom: string, marcarAhora: boolean) {
    try {
      await api.patch('/wa-mensajes/marcar-buzon-guias', { whatsappFrom, esBuzonGuias: marcarAhora })
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
    } catch (e) {
      avisarError(mensajeError(e, 'cambiar el buzón de guías'))
    }
  }

  async function reenviarImagen(mensajeId: string, destinatario: string) {
    await api.post('/wa-mensajes/reenviar-imagen', { mensajeId, destinatario })
    queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
  }

  async function borrarConversacion(whatsappFrom: string) {
    setBorrando(true)
    try {
      await api.delete(`/wa-mensajes/${encodeURIComponent(whatsappFrom)}`)
      if (selectedFrom === whatsappFrom) setSelectedFrom(null)
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
      setConfirmarBorrar(null)
    } catch (e) {
      avisarError(mensajeError(e, 'borrar la conversación'))
    } finally {
      setBorrando(false)
    }
  }

  if (isLoading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <h1>WhatsApp</h1>
      </div>

      {isError && <ErrorCarga error={error} onReintentar={() => refetch()} que="los chats" />}

      <div
        className="wa-panel"
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          height: 'calc(100vh - 140px)',
          overflow: 'hidden',
        }}
      >
        {/* Lista de chats: en PC queda fija y con su propio scroll interno, para que no se
            oculte al bajar dentro de una conversación (antes se iba toda la página junto con
            los mensajes). En celular solo se muestra si no hay conversación seleccionada. */}
        <div
          className="wa-sidebar"
          style={{
            display: isMobile && selectedFrom ? 'none' : 'flex',
            flexDirection: 'column',
            width: isMobile ? '100%' : undefined,
            height: '100%',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <input
              placeholder="Buscar por nombre o número..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 20,
                border: '1px solid var(--border)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          {conversacionesFiltradas.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-icon">💬</div>
              <p>{busqueda ? 'Sin resultados' : isError ? 'No se pudieron cargar los chats' : 'No hay mensajes aún'}</p>
            </div>
          ) : (
            conversacionesFiltradas.map(conv => (
              <div
                key={conv.from}
                onClick={() => setSelectedFrom(conv.from)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selectedFrom === conv.from ? '#f0f2f5' : conv.requiereAsesor ? '#fff3e6' : conv.noLeidos > 0 ? '#eef7ee' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: conv.noLeidos > 0 ? 700 : 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {conv.requiereAsesor && (
                      <span style={{
                        display: 'inline-block', width: 8, height: 8,
                        borderRadius: 4, background: '#f97316', flexShrink: 0,
                      }} title="Requiere asesor" />
                    )}
                    {conv.cliente?.nombre || (
                      <span style={{ color: 'var(--text-muted)' }}>{conv.from}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {icono(conv.ultimo?.tipo || '')}
                    {etiqueta(conv.ultimo!).slice(0, 60)}
                  </div>
                </div>
                {conv.noLeidos > 0 && (
                  <div style={{
                    minWidth: 22, height: 22, borderRadius: 11,
                    background: 'var(--primary)', color: '#fff',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 6px',
                  }}>
                    {conv.noLeidos}
                  </div>
                )}
                <button
                  title="Borrar conversación"
                  onClick={e => { e.stopPropagation(); setConfirmarBorrar(conv.from) }}
                  style={{
                    flexShrink: 0, border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 16, padding: 4, borderRadius: 6,
                    color: 'var(--text-muted)', lineHeight: 1,
                  }}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        {/* Conversación: en PC ocupa el resto del ancho con su propio scroll interno (el
            encabezado con el nombre queda fijo y la lista de chats de la izquierda ya no se
            oculta al bajar). En celular solo se muestra cuando hay una seleccionada, ocupando
            toda la pantalla (como al abrir un chat en WhatsApp) en vez de quedar apilada
            debajo de la lista. */}
        <div
          className={`wa-conversation ${selectedFrom ? '' : 'mobile-hidden'}`}
          style={{
            display: isMobile && !selectedFrom ? 'none' : 'flex',
            flexDirection: 'column',
            width: isMobile ? '100%' : undefined,
            flex: isMobile ? undefined : 1,
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {selectedFrom ? (
            <>
              <div
                className="wa-conversation-header"
                style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--card-bg, var(--bg, #fff))' }}
              >
                <button className="wa-back-btn" onClick={() => setSelectedFrom(null)}>←</button>
                {editandoNombre === selectedFrom ? (
                  <input
                    autoFocus
                    value={nombreInput}
                    onChange={e => setNombreInput(e.target.value)}
                    onBlur={() => guardarNombre(selectedFrom!)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') guardarNombre(selectedFrom!)
                      if (e.key === 'Escape') setEditandoNombre('')
                    }}
                    style={{
                      flex: 1, padding: '4px 8px', borderRadius: 6,
                      border: '1px solid var(--primary)', fontSize: 14, outline: 'none',
                    }}
                  />
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conversacionActual.find(m => m.cliente)?.cliente?.nombre || (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{selectedFrom}</span>
                        )}
                      </span>
                      {/* El número solo se repite abajo si ya se está mostrando el nombre arriba */}
                      {conversacionActual.find(m => m.cliente)?.cliente?.nombre && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedFrom}</span>
                      )}
                    </div>
                    <button
                      className="wa-edit-btn"
                      onClick={() => iniciarEdicion(
                        selectedFrom!,
                        conversacionActual.find(m => m.cliente)?.cliente?.nombre || ''
                      )}
                      title="Editar nombre"
                    >✏️</button>
                    {convActualInfo?.requiereAsesor && (
                      <span
                        title="Este cliente quedó marcado como que necesita atención de un asesor"
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                          background: '#fff3e6', color: '#c2410c', marginLeft: 8, whiteSpace: 'nowrap',
                        }}
                      >
                        🟠 Requiere asesor
                      </span>
                    )}
                    <span
                      title={dentroVentana24h
                        ? 'El cliente escribió en las últimas 24h: puedes mandar texto libre.'
                        : 'El cliente no escribió en las últimas 24h: WhatsApp solo entrega mensajes de plantilla aprobada por Meta (ver Difusión).'}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                        background: dentroVentana24h ? 'var(--success-tint)' : 'var(--danger-tint)',
                        color: dentroVentana24h ? 'var(--success)' : 'var(--danger)',
                        marginLeft: 8, whiteSpace: 'nowrap',
                      }}
                    >
                      {dentroVentana24h ? '🟢 Dentro de ventana' : '🔴 Fuera de ventana'}
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={() => toggleSilenciarBot(selectedFrom!, !convActualInfo?.botSilenciado)}
                      title={convActualInfo?.botSilenciado ? 'El bot está silenciado en esta conversación. Clic para reactivarlo.' : 'Silenciar el bot en esta conversación (para que un asesor responda manualmente).'}
                      style={{
                        marginLeft: 8, borderRadius: 999, padding: '4px 12px', fontSize: 12,
                        fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        background: convActualInfo?.botSilenciado ? '#fee2e2' : '#eef2ff',
                        color: convActualInfo?.botSilenciado ? '#b91c1c' : '#4338ca',
                      }}
                    >
                      {convActualInfo?.botSilenciado ? '🔇 Bot silenciado' : '🔊 Silenciar bot'}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => toggleBuzonGuias(selectedFrom!, !convActualInfo?.esBuzonGuias)}
                      title={convActualInfo?.esBuzonGuias
                        ? 'Este chat está marcado como buzón de guías. Clic para desmarcarlo.'
                        : 'Marcar este chat como el buzón de donde llegan las fotos de guías de envío (no es un cliente).'}
                      style={{
                        marginLeft: 8, borderRadius: 999, padding: '4px 12px', fontSize: 12,
                        fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        background: convActualInfo?.esBuzonGuias ? 'var(--primary-tint)' : 'var(--surface-muted)',
                        color: convActualInfo?.esBuzonGuias ? 'var(--primary-dark)' : 'var(--text-muted)',
                      }}
                    >
                      {convActualInfo?.esBuzonGuias ? '📦 Buzón de guías' : '📦 Marcar buzón de guías'}
                    </button>
                  </>
                )}
              </div>

              {/* Resumen del cliente: contexto de su cuenta sin salir del chat. Colapsable
                  para no ocupar espacio de la conversación cuando no se necesita. */}
              <div
                onClick={() => setMostrarResumen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '6px 16px', fontSize: 12, color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)', background: 'var(--card-bg, #fafafa)',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 600 }}>📋 Resumen del cliente</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                  background: pedidosActivos.length > 0 ? '#eef7ee' : 'var(--border)',
                  color: pedidosActivos.length > 0 ? '#15803d' : 'var(--text-muted)',
                }}>
                  {pedidosActivos.length} pedido{pedidosActivos.length === 1 ? '' : 's'} activo{pedidosActivos.length === 1 ? '' : 's'}
                </span>
                <span style={{ marginLeft: 'auto' }}>{mostrarResumen ? '▾' : '▸'}</span>
              </div>
              {mostrarResumen && (
                <div style={{ padding: '10px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  {pedidosCliente.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Este cliente no tiene pedidos registrados.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {pedidosCliente.slice(0, 5).map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            #{p.numero} — {p.prenda?.nombre || 'sin prenda'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {p.estado} · ${p.total?.toLocaleString('es-CO')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* TODO: agregar aquí el saldo pendiente del cliente cuando tengamos acceso
                      al endpoint de cuentas (ver Cuentas.tsx / hook de cuentas del proyecto). */}
                </div>
              )}

              {/* Notas internas: solo las ve el asesor, nunca se le mandan al cliente. Mismo
                  patrón colapsable que "Resumen del cliente" de arriba. */}
              <div
                onClick={() => setMostrarNotas(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '6px 16px', fontSize: 12, color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)', background: 'var(--card-bg, #fafafa)',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 600 }}>📝 Notas internas</span>
                {notas.length > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: 'var(--border)' }}>
                    {notas.length}
                  </span>
                )}
                <span style={{ marginLeft: 'auto' }}>{mostrarNotas ? '▾' : '▸'}</span>
              </div>
              {mostrarNotas && (
                <div style={{ padding: '10px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  {notas.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Sin notas todavía.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 160, overflowY: 'auto' }}>
                      {notas.map(n => (
                        <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {n.autor ? n.autor + ' · ' : ''}{new Date(n.createdAt).toLocaleString('es-CO')}
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{n.contenido}</div>
                          </div>
                          <button
                            title="Borrar nota"
                            onClick={() => borrarNotaMutation.mutate(n.id)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
                          >🗑️</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea
                      className="input"
                      placeholder="Agregar una nota interna..."
                      value={notaTexto}
                      onChange={e => setNotaTexto(e.target.value)}
                      rows={2}
                      style={{ flex: 1, resize: 'vertical', fontSize: 13 }}
                    />
                    <button className="btn btn-sm btn-primary" onClick={guardarNota} disabled={!notaTexto.trim()}>
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              <div
                className="wa-conversation-body"
                ref={bodyRef}
                style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
              >
                {conversacionActual.map(m => (
                  <Bubble
                    key={m.id}
                    m={m}
                    onImgClick={url => setModalImg(url)}
                    onReply={iniciarRespuesta}
                    onReenviar={setReenviarMsg}
                    mensajesPorWaId={mensajesPorWaId}
                  />
                ))}
              </div>
              <button
                className="wa-jump-bottom"
                title="Ir al último mensaje"
                onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })}
              >⬇️</button>
              <div className="wa-conversation-input" style={{ flexShrink: 0 }}>
                {replyTo && (
                  <div className="wa-reply-preview">
                    <div style={{ flex: 1, minWidth: 0, borderLeft: '3px solid var(--primary)', paddingLeft: 8 }}>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 12 }}>
                        Respondiendo a {replyTo.direccion === 'ENTRADA' ? (convActualInfo?.cliente?.nombre || selectedFrom) : 'ti mismo'}
                      </div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 13 }}>
                        {icono(replyTo.tipo)}{etiqueta(replyTo).slice(0, 100)}
                      </div>
                    </div>
                    {replyTo.tipo === 'image' && mediaUrl(replyTo) && (
                      <img src={mediaUrl(replyTo)!} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    )}
                    <button
                      onClick={() => setReplyTo(null)}
                      title="Cancelar respuesta"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }}
                    >✕</button>
                  </div>
                )}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    title="Respuestas rápidas"
                    onClick={() => setMostrarPlantillas(v => !v)}
                  >⚡</button>
                  {mostrarPlantillas && (
                    <div
                      className="card"
                      style={{
                        position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                        width: 280, maxHeight: 320, overflowY: 'auto', zIndex: 10, padding: 8,
                      }}
                    >
                      {plantillas.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>
                          No tienes respuestas rápidas todavía.
                        </p>
                      ) : (
                        plantillas.map(p => (
                          <div
                            key={p.id}
                            onClick={() => usarPlantilla(p)}
                            style={{
                              padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontWeight: 600 }}>{p.titulo}</div>
                            <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.cuerpo}
                            </div>
                          </div>
                        ))
                      )}
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ width: '100%' }}
                          onClick={() => { setMostrarPlantillas(false); setGestionandoPlantillas(true) }}
                        >
                          ⚙️ Gestionar respuestas rápidas
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  placeholder={replyTo ? 'Escribe tu respuesta...' : 'Escribe un mensaje...'}
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') enviar()
                    if (e.key === 'Escape' && replyTo) setReplyTo(null)
                  }}
                />
                <button className="btn btn-primary btn-sm" onClick={enviar}>Enviar</button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <p>Selecciona una conversación</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de imagen */}
      {modalImg && (
        <div
          className="modal-overlay"
          onClick={() => setModalImg(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'pointer',
          }}
        >
          <img
            src={modalImg}
            alt="Imagen"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Modal de confirmación para borrar toda la conversación de un chat */}
      {confirmarBorrar && (
        <div className="modal-overlay" onClick={() => !borrando && setConfirmarBorrar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Borrar conversación</h2>
            <p style={{ marginBottom: 16 }}>
              Esto elimina permanentemente todos los mensajes de{' '}
              <strong>
                {conversaciones.find(c => c.from === confirmarBorrar)?.cliente?.nombre || confirmarBorrar}
              </strong>
              . No se puede deshacer. ¿Continuar?
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" disabled={borrando} onClick={() => setConfirmarBorrar(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#c62828', borderColor: '#c62828' }}
                disabled={borrando}
                onClick={() => borrarConversacion(confirmarBorrar)}
              >
                {borrando ? 'Borrando...' : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gestionandoPlantillas && (
        <GestionarPlantillasModal onClose={() => setGestionandoPlantillas(false)} />
      )}

      {/* Reenviar una imagen a otro chat: paso 1 elegir destinatario, paso 2 confirmar. */}
      {reenviarMsg && (
        <div
          className="modal-overlay"
          onClick={() => { if (!reenviando) { setReenviarMsg(null); setReenviarDestino(null); setReenviarBusqueda('') } }}
        >
          <div className="modal" onClick={e => e.stopPropagation()}>
            {!reenviarDestino ? (
              <>
                <h2>Reenviar imagen</h2>
                <input
                  autoFocus
                  placeholder="Buscar por nombre o número..."
                  value={reenviarBusqueda}
                  onChange={e => setReenviarBusqueda(e.target.value)}
                  style={{ width: '100%', marginBottom: 12 }}
                />
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {conversaciones
                    .filter(c => c.from !== reenviarMsg.whatsappFrom)
                    .filter(c => {
                      if (!reenviarBusqueda.trim()) return true
                      const q = reenviarBusqueda.toLowerCase()
                      return (c.cliente?.nombre || '').toLowerCase().includes(q) || c.from.toLowerCase().includes(q)
                    })
                    .map(c => (
                      <div
                        key={c.from}
                        onClick={() => setReenviarDestino(c.from)}
                        className="card"
                        style={{ padding: '8px 12px', cursor: 'pointer' }}
                      >
                        {c.cliente?.nombre || <span style={{ color: 'var(--text-muted)' }}>{c.from}</span>}
                      </div>
                    ))}
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => { setReenviarMsg(null); setReenviarBusqueda('') }}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Confirmar reenvío</h2>
                <p style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {mediaUrl(reenviarMsg) && (
                    <img src={mediaUrl(reenviarMsg)!} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                  )}
                  <span>
                    ¿Reenviar esta imagen a{' '}
                    <strong>{conversaciones.find(c => c.from === reenviarDestino)?.cliente?.nombre || reenviarDestino}</strong>?
                  </span>
                </p>
                <div className="form-actions">
                  <button className="btn btn-secondary" disabled={reenviando} onClick={() => setReenviarDestino(null)}>
                    Atrás
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={reenviando}
                    onClick={async () => {
                      setReenviando(true)
                      try {
                        await reenviarImagen(reenviarMsg.id, reenviarDestino)
                        setReenviarMsg(null)
                        setReenviarDestino(null)
                        setReenviarBusqueda('')
                      } catch (e) {
                        avisarError(mensajeError(e, 'reenviar la imagen'))
                      } finally {
                        setReenviando(false)
                      }
                    }}
                  >
                    {reenviando ? 'Enviando...' : 'Reenviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Modal de CRUD de respuestas rápidas — separado del componente principal porque tiene su
// propio formulario de edición y no necesita nada del estado del chat.
function GestionarPlantillasModal({ onClose }: { onClose: () => void }) {
  const { data: plantillas = [] } = useWaPlantillas()
  const guardar = useGuardarWaPlantilla()
  const cambiarActiva = useCambiarActivaWaPlantilla()
  const borrar = useBorrarWaPlantilla()

  const [editando, setEditando] = useState<WaPlantilla | null>(null)
  const [slug, setSlug] = useState('')
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')

  function editar(p: WaPlantilla | null) {
    setEditando(p)
    setSlug(p?.slug || '')
    setTitulo(p?.titulo || '')
    setCuerpo(p?.cuerpo || '')
  }

  async function guardarForm() {
    if (!slug.trim() || !titulo.trim() || !cuerpo.trim()) return
    await guardar.mutateAsync({ id: editando?.id, slug: slug.trim(), titulo: titulo.trim(), cuerpo: cuerpo.trim() })
    editar(null)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2>Respuestas rápidas</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Texto libre para el compositor del chat. Usa <code>{'{nombre}'}</code> para que se
          reemplace con el nombre del cliente al usarla.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 260, overflowY: 'auto' }}>
          {plantillas.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay ninguna.</p>
          )}
          {plantillas.map(p => (
            <div key={p.id} className="card" style={{ padding: 10, opacity: p.activa ? 1 : .5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.cuerpo}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => editar(p)} title="Editar">✏️</button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => cambiarActiva.mutate({ id: p.id, activa: !p.activa })}
                    title={p.activa ? 'Desactivar' : 'Activar'}
                  >{p.activa ? '🙈' : '👁️'}</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => borrar.mutate(p.id)} title="Borrar">🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 15 }}>{editando ? 'Editar' : 'Nueva'} respuesta rápida</h2>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Título (para reconocerla en la lista)</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Datos de pago" />
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Slug (identificador corto, sin espacios)</label>
          <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="Ej: datos-pago" />
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Cuerpo del mensaje</label>
          <textarea className="input" rows={4} value={cuerpo} onChange={e => setCuerpo(e.target.value)} />
        </div>
        <div className="form-actions">
          {editando && (
            <button className="btn btn-secondary" onClick={() => editar(null)}>Cancelar edición</button>
          )}
          <button className="btn btn-primary" onClick={guardarForm} disabled={guardar.isPending}>
            {editando ? 'Guardar cambios' : 'Crear'}
          </button>
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
