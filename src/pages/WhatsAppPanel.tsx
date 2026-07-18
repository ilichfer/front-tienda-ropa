import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

interface WaMensaje {
  id: string
  whatsappFrom: string
  contenido: string
  tipo: string
  direccion: 'ENTRADA' | 'SALIDA'
  createdAt: string
  cliente?: { nombre: string }
  mediaId?: string
  mimeType?: string
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function icono(tipo: string) {
  switch (true) {
    case tipo === 'image':    return '🖼️ '
    case tipo === 'audio':    return '🎵 '
    case tipo === 'video':    return '🎬 '
    case tipo === 'document': return '📄 '
    case tipo === 'sticker':  return '🎨 '
    case tipo === 'location': return '📍 '
    case tipo.startsWith('button_'): return '🔘 '
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
  if (m.tipo.startsWith('button_')) return '🔘 ' + m.contenido
  return m.contenido
}

function Bubble({ m, onImgClick }: { m: WaMensaje, onImgClick: (url: string) => void }) {
  const [imgError, setImgError] = useState(false)

  if (m.tipo === 'image' && m.mediaId && !imgError) {
    return (
      <div className={`wa-bubble ${m.direccion === 'ENTRADA' ? 'in' : 'out'}`}>
        <img
          src={`${API_BASE}/media/${m.mediaId}`}
          alt={m.contenido}
          onClick={() => onImgClick(`${API_BASE}/media/${m.mediaId}`)}
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
       m.tipo === 'audio' && m.mediaId ? <audio controls src={`${API_BASE}/media/${m.mediaId}`} style={{ maxWidth: 250 }} /> :
       m.tipo === 'video' && m.mediaId ? <video controls src={`${API_BASE}/media/${m.mediaId}`} style={{ maxWidth: 250, borderRadius: 8 }} /> :
       m.tipo === 'sticker' && m.mediaId ? <img src={`${API_BASE}/media/${m.mediaId}`} alt="sticker" style={{ maxWidth: 120, display: 'block' }} /> :
       m.tipo === 'document' && m.mediaId ? <a href={`${API_BASE}/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>📄 {m.contenido.startsWith('[') ? 'Abrir documento' : m.contenido}</a> :
       m.tipo === 'location' ? <span>📍 {m.contenido}</span> :
       <span>{icono(m.tipo)}{m.contenido}</span>}
      <span className="wa-time">{new Date(m.createdAt).toLocaleString('es-CO')}</span>
    </div>
  )
}

export default function WhatsAppPanel() {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [modalImg, setModalImg] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: mensajes = [], isLoading } = useQuery<WaMensaje[]>({
    queryKey: ['wa-mensajes'],
    queryFn: () => api.get('/wa-mensajes').then(r => r.data).catch(() => [] as WaMensaje[]),
    refetchInterval: 10_000,
  })

  const conversaciones = Array.from(
    mensajes.reduce((acc, m) => {
      if (!acc.has(m.whatsappFrom)) acc.set(m.whatsappFrom, [])
      acc.get(m.whatsappFrom)!.push(m)
      return acc
    }, new Map<string, WaMensaje[]>())
  ).map(([from, msgs]) => ({
    from,
    cliente: msgs.find(m => m.cliente)?.cliente,
    ultimo: msgs[msgs.length - 1],
    noLeidos: msgs.filter(m => m.direccion === 'ENTRADA').length,
  }))

  const conversacionActual = selectedFrom
    ? mensajes.filter(m => m.whatsappFrom === selectedFrom)
    : []

  async function enviar() {
    if (!texto.trim() || !selectedFrom) return
    try {
      await api.post('/wa-mensajes/enviar', { to: selectedFrom, texto })
      setTexto('')
      queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
    } catch (e) {
      console.error('Error enviando mensaje', e)
    }
  }

  if (isLoading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <h1>WhatsApp</h1>
      </div>

      <div className="wa-panel">
        {/* Sidebar */}
        <div className={`wa-sidebar ${selectedFrom ? 'mobile-hidden' : ''}`}>
          {conversaciones.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-icon">💬</div>
              <p>No hay mensajes aún</p>
            </div>
          ) : (
            conversaciones.map(conv => (
              <div
                key={conv.from}
                onClick={() => setSelectedFrom(conv.from)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selectedFrom === conv.from ? '#f0f2f5' : undefined,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {conv.cliente?.nombre || conv.from}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {icono(conv.ultimo?.tipo || '')}
                  {etiqueta(conv.ultimo!).slice(0, 60)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Conversación */}
        <div className={`wa-conversation ${selectedFrom ? '' : 'mobile-hidden'}`}>
          {selectedFrom ? (
            <>
              <div className="wa-conversation-header">
                <button className="wa-back-btn" onClick={() => setSelectedFrom(null)}>←</button>
                {conversacionActual.find(m => m.cliente)?.cliente?.nombre || selectedFrom}
              </div>
              <div className="wa-conversation-body">
                {conversacionActual.map(m => (
                  <Bubble key={m.id} m={m} onImgClick={url => setModalImg(url)} />
                ))}
              </div>
              <div className="wa-conversation-input">
                <input
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
    </div>
  )
}
