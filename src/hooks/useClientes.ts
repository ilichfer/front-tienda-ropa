import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

export interface Cliente {
  id: string
  whatsapp: string
  nombre?: string
  ciudad?: string
  direccion?: string
}

export function useClientes() {
  return useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
    staleTime: 30_000,
  })
}
