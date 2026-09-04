import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

// Plantillas YA aprobadas por Meta en WhatsApp Manager, registradas acá solo para poder
// dispararlas en un envío masivo. Distinto de WaPlantilla (respuestas rápidas del chat 1:1).
export interface WaPlantillaMeta {
  id: string
  nombre: string
  idioma: string
  variables?: string
  descripcion?: string
  activa: boolean
}

export interface WaBroadcast {
  id: string
  plantillaMetaId: string
  variablesConfig?: string
  total: number
  enviados: number
  fallidos: number
  estado: 'PENDIENTE' | 'COMPLETADO'
  createdAt: string
}

export interface WaBroadcastEnvio {
  id: string
  broadcastId: string
  whatsappFrom: string
  estado: 'PENDIENTE' | 'ENVIADO' | 'FALLIDO'
  waMessageId?: string
  error?: string
}

// ── Plantillas de Meta ───────────────────────────────────────────────────────

export function useWaPlantillasMeta(soloActivas = false) {
  return useQuery<WaPlantillaMeta[]>({
    queryKey: ['wa-plantillas-meta', soloActivas],
    queryFn: () => api.get('/wa-plantillas-meta', { params: soloActivas ? { activa: true } : {} })
                      .then(r => r.data),
    staleTime: 30_000,
  })
}

export function useRegistrarPlantillaMeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { nombre: string; idioma: string; variables?: string; descripcion?: string }) =>
      api.post('/wa-plantillas-meta', p).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-plantillas-meta'] }),
  })
}

export function useBorrarPlantillaMeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/wa-plantillas-meta/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-plantillas-meta'] }),
  })
}

// ── Difusiones ────────────────────────────────────────────────────────────────

export function useBroadcasts() {
  return useQuery<WaBroadcast[]>({
    queryKey: ['broadcasts'],
    queryFn: () => api.get('/broadcasts').then(r => r.data),
    refetchInterval: 5_000,
  })
}

export function useBroadcastDetalle(id: string | null) {
  return useQuery<{ broadcast: WaBroadcast; envios: WaBroadcastEnvio[] }>({
    queryKey: ['broadcasts', id],
    queryFn: () => api.get(`/broadcasts/${id}`).then(r => r.data),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.broadcast.estado === 'PENDIENTE' ? 3_000 : false,
  })
}

export function useCrearBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { plantillaMetaId: string; variablesConfig: Record<string, string>; destinatarios: string[] }) =>
      api.post('/broadcasts', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}
