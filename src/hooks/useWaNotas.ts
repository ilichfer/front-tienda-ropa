import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

// Notas internas por conversación: solo las ven los asesores, nunca se le mandan al cliente.
export interface WaNota {
  id: string
  whatsappFrom: string
  autor?: string
  contenido: string
  createdAt: string
}

export function useWaNotas(whatsappFrom: string | null) {
  return useQuery<WaNota[]>({
    queryKey: ['wa-notas', whatsappFrom],
    queryFn: () => api.get('/wa-notas', { params: { whatsappFrom } }).then(r => r.data),
    enabled: !!whatsappFrom,
  })
}

export function useAgregarWaNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nota: { whatsappFrom: string; autor?: string; contenido: string }) =>
      api.post('/wa-notas', nota).then(r => r.data),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['wa-notas', vars.whatsappFrom] }),
  })
}

export function useBorrarWaNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/wa-notas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-notas'] }),
  })
}
