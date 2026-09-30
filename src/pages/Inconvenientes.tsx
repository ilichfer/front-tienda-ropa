import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import ErrorCarga from '../ui/ErrorCarga'

interface Inconveniente {
  id: string
  whatsapp: string
  clienteNombre?: string | null
  tipo: string
  descripcion?: string | null
  estado: string
  pedidoId?: string | null
  fotos?: string[] | null
  notasInternas?: string | null
  createdAt: string
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function fmtDate(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function badgeTipo(tipo: string) {
  switch (tipo) {
    case 'INCOMPLETO': return 'badge-apartado'
    case 'DANO': return 'badge-cancelado'
    case 'IMPERFECCION': return 'badge-apartado'
    default: return 'badge-nuevo'
  }
}

function etiquetaTipo(tipo: string) {
  switch (tipo) {
    case 'INCOMPLETO': return '📦 Incompleto'
    case 'DANO': return '🔴 Dañado'
    case 'IMPERFECCION': return '🟠 Imperfección'
    case 'OTRO': return '⚪ Otro'
    default: return tipo
  }
}

function badgeEstado(estado: string) {
  switch (estado) {
    case 'RECIBIDO': return 'badge-nuevo'
    case 'EN_REVISION': return 'badge-apartado'
    case 'RESUELTO': return 'badge-pagado'
    case 'CERRADO': return 'badge-enviado'
    default: return 'badge-nuevo'
  }
}

function etiquetaEstado(estado: string) {
  switch (estado) {
    case 'RECIBIDO': return '📩 Recibido'
    case 'EN_REVISION': return '🔍 En revisión'
    case 'RESUELTO': return '✅ Resuelto'
    case 'CERRADO': return '🔒 Cerrado'
    default: return estado
  }
}

function fotoUrl(path: string): string {
  return `${API_BASE}/media/local/${path}`
}

export default function Inconvenientes() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [expandida, setExpandida] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>('')
  const [modalFoto, setModalFoto] = useState<string | null>(null)
  const [editarNotas, setEditarNotas] = useState<{ id: string; notas: string } | null>(null)

  const { data: inconvenientes = [], isLoading, isError, error, refetch } = useQuery<Inconveniente[]>({
    queryKey: ['inconvenientes', filtro],
    queryFn: () => api.get('/inconvenientes', { params: filtro ? { estado: filtro } : {} }).then(r => r.data),
    refetchInterval: 15_000,
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api.patch(`/inconvenientes/${id}/estado`, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inconvenientes'] }),
  })

  const guardarNotas = useMutation({
    mutationFn: ({ id, notas }: { id: string; notas: string }) =>
      api.patch(`/inconvenientes/${id}/notas`, { notas }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inconvenientes'] }); setEditarNotas(null) },
  })

  const recibidos = inconvenientes.filter(i => i.estado === 'RECIBIDO').length
  const enRevision = inconvenientes.filter(i => i.estado === 'EN_REVISION').length
  const resueltos = inconvenientes.filter(i => i.estado === 'RESUELTO').length
  const cerrados = inconvenientes.filter(i => i.estado === 'CERRADO').length

  if (isLoading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Inconvenientes</h1>
      </div>

      {isError && <ErrorCarga error={error} onReintentar={() => refetch()} que="los inconvenientes" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recibidos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1565c0' }}>{recibidos}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>En revisión</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e65100' }}>{enRevision}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Resueltos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2e7d32' }}>{resueltos}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cerrados</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{cerrados}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { val: '', label: 'Todos' },
          { val: 'RECIBIDO', label: '📩 Recibidos' },
          { val: 'EN_REVISION', label: '🔍 En revisión' },
          { val: 'RESUELTO', label: '✅ Resueltos' },
          { val: 'CERRADO', label: '🔒 Cerrados' },
        ].map(f => (
          <button
            key={f.val}
            className={`btn btn-sm ${filtro === f.val ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltro(f.val)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Fotos</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inconvenientes.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">{isError ? 'No se pudieron cargar los inconvenientes' : 'No hay inconvenientes registrados'}</td></tr>
              ) : inconvenientes.map(inc => (
                <Fragment key={inc.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpandida(expandida === inc.id ? null : inc.id)}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(inc.createdAt)}</td>
                    <td>
                      <strong>{inc.clienteNombre || inc.whatsapp}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inc.whatsapp}</div>
                    </td>
                    <td><span className={`badge ${badgeTipo(inc.tipo)}`}>{etiquetaTipo(inc.tipo)}</span></td>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.descripcion || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>{inc.fotos?.length || 0}</td>
                    <td><span className={`badge ${badgeEstado(inc.estado)}`}>{etiquetaEstado(inc.estado)}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className="btn btn-sm btn-secondary"
                        value={inc.estado}
                        onChange={e => cambiarEstado.mutate({ id: inc.id, estado: e.target.value })}
                        style={{ fontSize: 12, padding: '4px 8px' }}
                      >
                        <option value="RECIBIDO">Recibido</option>
                        <option value="EN_REVISION">En revisión</option>
                        <option value="RESUELTO">Resuelto</option>
                        <option value="CERRADO">Cerrado</option>
                      </select>
                    </td>
                  </tr>
                  {expandida === inc.id && (
                    <tr>
                      <td colSpan={7} style={{ background: '#fafafa', padding: 16 }}>
                        <div style={{ display: 'grid', gap: 16 }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                              <strong>Descripción:</strong>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => navigate(`/whatsapp?from=${encodeURIComponent(inc.whatsapp)}`)}
                              >
                                💬 Ver conversación
                              </button>
                            </div>
                            <p style={{ marginTop: 4 }}>{inc.descripcion || 'Sin descripción'}</p>
                          </div>

                          {inc.pedidoId && (
                            <div><strong>Pedido asociado:</strong> {inc.pedidoId}</div>
                          )}

                          {inc.fotos && inc.fotos.length > 0 && (
                            <div>
                              <strong>Fotos ({inc.fotos.length}):</strong>
                              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                {inc.fotos.map((foto, idx) => (
                                  <img
                                    key={idx}
                                    src={fotoUrl(foto)}
                                    alt={`Foto ${idx + 1}`}
                                    onClick={() => setModalFoto(fotoUrl(foto))}
                                    style={{
                                      width: 120, height: 120, objectFit: 'cover',
                                      borderRadius: 8, cursor: 'pointer', border: '2px solid var(--border)'
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong>Notas internas:</strong>
                              {editarNotas?.id !== inc.id && (
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => setEditarNotas({ id: inc.id, notas: inc.notasInternas || '' })}
                                >
                                  Editar
                                </button>
                              )}
                            </div>
                            {editarNotas?.id === inc.id ? (
                              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                <textarea
                                  className="input"
                                  value={editarNotas.notas}
                                  onChange={e => setEditarNotas({ ...editarNotas, notas: e.target.value })}
                                  rows={3}
                                  style={{ flex: 1, resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => guardarNotas.mutate({ id: inc.id, notas: editarNotas.notas })}
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => setEditarNotas(null)}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p style={{ marginTop: 4, color: inc.notasInternas ? 'var(--text)' : 'var(--text-muted)' }}>
                                {inc.notasInternas || 'Sin notas'}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalFoto && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer'
          }}
          onClick={() => setModalFoto(null)}
        >
          <img
            src={modalFoto}
            alt="Foto inconveniente"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
          />
          <button
            style={{
              position: 'absolute', top: 20, right: 20,
              background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff',
              fontSize: 24, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
