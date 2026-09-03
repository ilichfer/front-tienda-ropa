import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { usePedidos } from '../hooks/usePedidos'

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
  cliente?: { nombre: string; requiereAsesor?: boolean; botSilenciado?: boolean }
  mediaId?: string
  mediaPath?: string
  mimeType?: string
  leido?: boolean
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

function Bubble({ m, onImgClick }: { m: WaMensaje, onImgClick: (url: string) => void }) {
  const [imgError, setImgError] = useState(false)
  const url = mediaUrl(m)

  if (m.tipo === 'image' && url && !imgError) {
    return (
      <div className={`wa-bubble ${m.direccion === 'ENTRADA' ? 'in' : 'out'}`}>
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
        <span className="wa-time">{new Date(m.createdAt).toLocaleString('es-CO')}</span>
      </div>
    )
  }

  return (
    <div className={`wa-bubble ${m.direccion === 'ENTRADA' ? 'in' : 'out'}`}>
      {m.tipo === 'image' ? <span>🖼️ {m.contenido}</span> :
       m.tipo === 'audio' && url ? <audio controls src={url} style={{ maxWidth: 250 }} /> :
       m.tipo === 'video' && url ? <video controls src={url} style={{ maxWidth: 250, borderRadius: 8 }} /> :
       m.tipo === 'sticker' && url ? <img src={url} alt="sticker" style={{ maxWidth: 120, display: 'block' }} /> :
       m.tipo === 'document' && url ? <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>📄 {m.contenido.startsWith('[') ? 'Abrir documento' : m.contenido}</a> :
       m.tipo === 'location' ? <span>📍 {m.contenido}</span> :
       <span>{icono(m.tipo)}{m.contenido}</span>}
      <span className="wa-time">{new Date(m.createdAt).toLocaleString('es-CO')}</span>
    </div>
  )
}

export default function WhatsAppPanel() {
  const [searchParams] = useSearchParams()
  const [selectedFrom, setSelectedFrom] = useState<string | null>(() => searchParams.get('from'))
  const [texto, setTexto] = useState('')
  const [modalImg, setModalImg] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editandoNombre, setEditandoNombre] = useState('')
  const [nombreInput, setNombreInput] = useState('')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  const [mostrarResumen, setMostrarResumen] = useState(true)
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: mensajes = [], isLoading } = useQuery<WaMensaje[]>({
    queryKey: ['wa-mensajes'],
    queryFn: () => api.get('/wa-mensajes').then(r => r.data).catch(() => [] as WaMensaje[]),
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
    noLeidos: msgs.filter(m => m.direccion === 'ENTRADA' && !m.leido).length,
    requiereAsesor: msgs.find(m => m.cliente?.requiereAsesor)?.cliente?.requiereAsesor ?? false,
    botSilenciado: msgs.find(m => m.cliente?.botSilenciado)?.cliente?.botSilenciado ?? false,
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
      await api.post('/wa-mensajes/enviar', { to: selectedFrom, texto })
      setTexto('')
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
      inputRef.current?.focus()
    } catch (e) {
      console.error('Error enviando mensaje', e)
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
      console.error('Error guardando nombre', e)
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
      console.error('Error cambiando estado del bot', e)
    }
  }

  async function borrarConversacion(whatsappFrom: string) {
    setBorrando(true)
    try {
      await api.delete(`/wa-mensajes/${encodeURIComponent(whatsappFrom)}`)
      if (selectedFrom === whatsappFrom) setSelectedFrom(null)
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
      setConfirmarBorrar(null)
    } catch (e) {
      console.error('Error borrando la conversación', e)
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
              <p>{busqueda ? 'Sin resultados' : 'No hay mensajes aún'}</p>
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

              <div
                className="wa-conversation-body"
                ref={bodyRef}
                style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
              >
                {conversacionActual.map(m => (
                  <Bubble key={m.id} m={m} onImgClick={url => setModalImg(url)} />
                ))}
              </div>
              <button
                className="wa-jump-bottom"
                title="Ir al último mensaje"
                onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })}
              >⬇️</button>
              <div className="wa-conversation-input" style={{ flexShrink: 0 }}>
                <input
                  ref={inputRef}
                  placeholder="Escribe un mensaje..."
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') enviar() }}
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
    </div>
  )
}
