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
}

export default function WhatsAppPanel() {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
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
        {/* Lista de conversaciones */}
        <div className="wa-sidebar">
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
                  {conv.ultimo?.contenido.slice(0, 60)}...
                </div>
              </div>
            ))
          )}
        </div>

        {/* Conversación seleccionada */}
        <div className="wa-conversation">
          {selectedFrom ? (
            <>
              <div className="wa-conversation-header">
                {conversacionActual.find(m => m.cliente)?.cliente?.nombre || selectedFrom}
              </div>
              <div className="wa-conversation-body">
                {conversacionActual.map(m => (
                  <div key={m.id} className={`wa-bubble ${m.direccion === 'ENTRADA' ? 'in' : 'out'}`}>
                    {m.contenido}
                    <span className="wa-time">
                      {new Date(m.createdAt).toLocaleString('es-CO')}
                    </span>
                  </div>
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
    </div>
  )
}
