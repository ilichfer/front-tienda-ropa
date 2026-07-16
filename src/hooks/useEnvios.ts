import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

export interface Envio {
  id: string
  whatsapp: string
  nombreCompleto?: string
  telefono?: string
  cedula?: string
  direccion?: string
  ciudad?: string
  barrio?: string
  notas?: string
  estado: string
  createdAt: string
}

export function useEnvios(estado?: string) {
  return useQuery<Envio[]>({
    queryKey: ['envios', estado],
    queryFn: () => api.get('/envios', { params: estado ? { estado } : {} }).then(r => r.data),
    staleTime: 30_000,
  })
}

export function useCambiarEstadoEnvio() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api.patch(`/envios/${id}/estado`, { estado }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envios'] })
    },
  })
}
