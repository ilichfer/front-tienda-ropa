import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Client } from '@stomp/stompjs'
import api from '../api/client'

export type EstadoPedido =
  | 'NUEVO' | 'APARTADO' | 'PAGADO' | 'EMPACADO'
  | 'ENVIADO' | 'ENTREGADO' | 'CANCELADO'

export interface Pedido {
  id: string
  numero: number
  estado: EstadoPedido
  cliente: { nombre: string; whatsapp: string; ciudad: string }
  prenda:  { nombre: string; talla: string; precio: number; lote: { nombre: string } }
  precioFinal: number
  costoEnvio: number
  total: number
  numeroGuia?: string
  createdAt: string
}

// ── Listar pedidos ─────────────────────────────────────────────────────────────

export function usePedidos(estado?: EstadoPedido) {
  return useQuery<Pedido[]>({
    queryKey: ['pedidos', estado],
    queryFn: () => api.get('/pedidos', { params: estado ? { estado } : {} })
                      .then(r => r.data),
    staleTime: 30_000,
  })
}

// ── Cambiar estado ─────────────────────────────────────────────────────────────

export function useCambiarEstado() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, estado, nota }: { id: string; estado: EstadoPedido; nota?: string }) =>
      api.patch(`/pedidos/${id}/estado`, { estado, nota }).then(r => r.data),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
    },
  })
}

// ── WebSocket: actualización en tiempo real ────────────────────────────────────

export function usePedidosRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const client = new Client({
      brokerURL: `${import.meta.env.VITE_WS_URL}/ws`,
      onConnect: () => {
        client.subscribe('/topic/pedidos', (msg) => {
          const evento = JSON.parse(msg.body)
          // Actualizar el pedido en caché sin refetch completo
          qc.setQueryData<Pedido[]>(['pedidos', undefined], (prev) =>
            prev?.map(p => p.id === evento.id
              ? { ...p, estado: evento.estado }
              : p
            ) ?? []
          )
        })
      },
      reconnectDelay: 5000,
    })

    client.activate()
    return () => { client.deactivate() }
  }, [qc])
}
