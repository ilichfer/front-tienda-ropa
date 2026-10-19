import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBorrarChat, useChatsAntiguos, useConservarChat, type ChatAntiguo } from '../hooks/useAvisosChat'
import { avisarExito } from '../ui/avisos'
import ErrorCarga from '../ui/ErrorCarga'

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)
}

/**
 * Chats sin mensajes hace más de mes y medio. El equipo decide con cada uno si lo borra
 * (libera la lista de WhatsApp) o lo conserva (no vuelve a aparecer hasta pasar otro mes y
 * medio desde esa decisión).
 */
export default function ChatsAntiguos() {
  const { data: chats = [], isLoading, isError, error, refetch } = useChatsAntiguos()
  const conservar = useConservarChat()
  const borrar = useBorrarChat()
  const [confirmarBorrar, setConfirmarBorrar] = useState<ChatAntiguo | null>(null)

  // Si falla, el aviso de error lo muestra el manejador global de mutaciones (main.tsx).
  async function conservarChat(c: ChatAntiguo) {
    try {
      await conservar.mutateAsync(c.whatsappFrom)
      avisarExito(`Se conserva el chat de ${c.nombre || c.whatsappFrom}.`)
    } catch { /* aviso global */ }
  }

  async function borrarChat(c: ChatAntiguo) {
    try {
      await borrar.mutateAsync(c.whatsappFrom)
      setConfirmarBorrar(null)
      avisarExito(`Chat de ${c.nombre || c.whatsappFrom} eliminado.`)
    } catch { /* aviso global */ }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Chats antiguos</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
        Conversaciones sin mensajes hace más de mes y medio. Elige si se eliminan o se conservan;
        las que conserves no vuelven a aparecer hasta dentro de otro mes y medio.
      </p>

      {isError && <ErrorCarga error={error} onReintentar={() => refetch()} que="los chats antiguos" />}

      {isLoading ? (
        <div className="loading">Cargando...</div>
      ) : chats.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">✅</div>
          <p>No hay chats antiguos por revisar.</p>
        </div>
      ) : (
        <div className="chats-antiguos-lista">
          {chats.map(c => (
            <div key={c.whatsappFrom} className="card chat-antiguo">
              <div className="chat-antiguo-info">
                <div style={{ fontWeight: 600 }}>{c.nombre || c.whatsappFrom}</div>
                {c.nombre && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.whatsappFrom}</div>}
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Último mensaje hace {diasDesde(c.ultimoMensaje)} días
                  ({new Date(c.ultimoMensaje).toLocaleDateString('es-CO')}) · {c.totalMensajes} mensajes
                </div>
              </div>
              <div className="chat-antiguo-acciones">
                <Link className="btn btn-sm btn-secondary" to={`/whatsapp?from=${encodeURIComponent(c.whatsappFrom)}`}>
                  Ver chat
                </Link>
                <button className="btn btn-sm btn-primary" disabled={conservar.isPending} onClick={() => conservarChat(c)}>
                  Conservar
                </button>
                <button className="btn btn-sm btn-peligro" onClick={() => setConfirmarBorrar(c)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmarBorrar && (
        <div className="modal-overlay" onClick={() => !borrar.isPending && setConfirmarBorrar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Eliminar chat</h2>
            <p style={{ marginBottom: 16 }}>
              Se borran permanentemente los {confirmarBorrar.totalMensajes} mensajes de{' '}
              <strong>{confirmarBorrar.nombre || confirmarBorrar.whatsappFrom}</strong>. El cliente,
              sus pedidos y su cuenta no se borran. ¿Continuar?
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" disabled={borrar.isPending} onClick={() => setConfirmarBorrar(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-peligro" disabled={borrar.isPending} onClick={() => borrarChat(confirmarBorrar)}>
                {borrar.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
