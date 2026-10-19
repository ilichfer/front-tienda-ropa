import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

export interface EsperandoAsesor {
  whatsappFrom: string
  nombre?: string
  desde?: string
}

export interface ResumenAvisos {
  esperandoAsesor: EsperandoAsesor[]
  ultimoEntrante?: { id: string; whatsappFrom: string; nombre?: string; contenido?: string; createdAt: string }
  noLeidos: number
  chatsAntiguos: number
}

export interface ChatAntiguo {
  whatsappFrom: string
  nombre?: string
  ultimoMensaje: string
  totalMensajes: number
}

// Consulta liviana que se repite en todas las pantallas: alimenta las notificaciones y los
// contadores del menú sin tener que traer todos los mensajes.
export function useResumenAvisos() {
  return useQuery<ResumenAvisos>({
    queryKey: ['avisos'],
    queryFn: () => api.get('/avisos').then(r => r.data),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })
}

export function useChatsAntiguos() {
  return useQuery<ChatAntiguo[]>({
    queryKey: ['chats-antiguos'],
    queryFn: () => api.get('/avisos/chats-antiguos').then(r => r.data),
  })
}

export function useConservarChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (whatsappFrom: string) => api.post('/avisos/chats-antiguos/conservar', { whatsappFrom }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats-antiguos'] })
      qc.invalidateQueries({ queryKey: ['avisos'] })
    },
  })
}

export function useBorrarChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (whatsappFrom: string) => api.delete(`/wa-mensajes/${encodeURIComponent(whatsappFrom)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats-antiguos'] })
      qc.invalidateQueries({ queryKey: ['avisos'] })
      qc.invalidateQueries({ queryKey: ['wa-mensajes'] })
    },
  })
}

/** "3 min", "1 h 20 min", "2 d" desde la fecha dada hasta ahora. */
export function tiempoEspera(desde?: string, ahora = Date.now()): string {
  if (!desde) return ''
  const min = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d`
}
