import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

// Respuestas rápidas para el compositor del panel de WhatsApp: texto libre y editable,
// pensadas para el chat 1:1 dentro de la ventana de 24h. No confundir con las plantillas
// de Meta (useWaPlantillasMeta), que son un concepto distinto para envíos masivos.
export interface WaPlantilla {
  id: string
  slug: string
  titulo: string
  cuerpo: string
  activa: boolean
}

export function useWaPlantillas(soloActivas = false) {
  return useQuery<WaPlantilla[]>({
    queryKey: ['wa-plantillas', soloActivas],
    queryFn: () => api.get('/wa-plantillas', { params: soloActivas ? { activa: true } : {} })
                      .then(r => r.data),
    staleTime: 30_000,
  })
}

export function useGuardarWaPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<WaPlantilla> & { slug: string; titulo: string; cuerpo: string }) =>
      p.id ? api.put(`/wa-plantillas/${p.id}`, p).then(r => r.data)
           : api.post('/wa-plantillas', p).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-plantillas'] }),
  })
}

export function useCambiarActivaWaPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) =>
      api.patch(`/wa-plantillas/${id}/activa`, { activa }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-plantillas'] }),
  })
}

export function useBorrarWaPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/wa-plantillas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-plantillas'] }),
  })
}
