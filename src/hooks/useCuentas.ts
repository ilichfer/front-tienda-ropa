import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

export interface Movimiento {
  id: string
  tipo: 'CARGO' | 'ABONO'
  concepto?: string | null
  valor?: number | null
  estado: string
  referencia?: string | null
  metodo?: string | null
  mediaId?: string | null
  mediaPath?: string | null
  mimeType?: string | null
  createdAt: string | null
}

export interface Cuenta {
  id: string
  cliente: { id: string; whatsapp: string; nombre?: string | null; ciudad?: string | null }
  saldo: number
  totalCargos: number
  totalAbonos: number
  pendientesValor: number
  abonosPorValidar: number
  movimientos: Movimiento[]
}

/** Un movimiento que necesita que alguien del equipo lo revise, con su cuenta al lado. */
export interface Pendiente {
  cuenta: Cuenta
  mov: Movimiento
}

export function useCuentas() {
  return useQuery<Cuenta[]>({
    queryKey: ['cuentas'],
    queryFn: () => api.get('/cuentas').then(r => r.data),
    refetchInterval: 15_000,
  })
}

// Cargos sin valor (fotos guardadas en el baúl por WhatsApp) y abonos sin validar
// (comprobantes que mandó el cliente). Desde que el bot ya no le pregunta el valor al cliente,
// todas las fotos terminan acá.
export function esPendiente(m: Movimiento) {
  return (m.tipo === 'CARGO' && m.valor == null)
    || (m.tipo === 'ABONO' && m.estado === 'PENDIENTE_VALIDAR')
}

// Milisegundos de la fecha, o 0 si no viene (hay filas viejas sin created_at).
const instante = (fecha: string | null) => (fecha ? Date.parse(fecha) : NaN) || 0

/** Todos los pendientes de todas las cuentas, el más antiguo primero (como una cola). */
export function pendientesDe(cuentas: Cuenta[]): Pendiente[] {
  return cuentas
    .flatMap(cuenta => cuenta.movimientos.filter(esPendiente).map(mov => ({ cuenta, mov })))
    .sort((a, b) => instante(a.mov.createdAt) - instante(b.mov.createdAt))
}
