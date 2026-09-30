import { create } from 'zustand'
import axios from 'axios'

export type TipoAviso = 'error' | 'exito'

export interface Aviso {
  id: number
  tipo: TipoAviso
  texto: string
}

interface AvisosState {
  avisos: Aviso[]
  mostrar: (tipo: TipoAviso, texto: string) => void
  cerrar: (id: number) => void
}

let siguienteId = 1

// Los errores se quedan hasta que el operador los cierra (no puede pasar desapercibido que
// algo no se guardó); las confirmaciones se van solas.
const DURACION_EXITO_MS = 3500

export const useAvisos = create<AvisosState>((set, get) => ({
  avisos: [],
  mostrar: (tipo, texto) => {
    const id = siguienteId++
    // Si el mismo error ya está en pantalla (ej. el servidor caído y varias acciones fallando),
    // no se apila otra copia.
    if (get().avisos.some(a => a.tipo === tipo && a.texto === texto)) return
    set(s => ({ avisos: [...s.avisos, { id, tipo, texto }].slice(-4) }))
    if (tipo === 'exito') {
      setTimeout(() => get().cerrar(id), DURACION_EXITO_MS)
    }
  },
  cerrar: id => set(s => ({ avisos: s.avisos.filter(a => a.id !== id) })),
}))

export const avisarError = (texto: string) => useAvisos.getState().mostrar('error', texto)
export const avisarExito = (texto: string) => useAvisos.getState().mostrar('exito', texto)

/** Convierte cualquier error (axios u otro) en una frase que el operador pueda entender. */
export function mensajeError(err: unknown, accion?: string): string {
  const prefijo = accion ? `No se pudo ${accion}` : 'No se pudo completar la acción'
  if (axios.isAxiosError(err)) {
    if (!err.response) return `${prefijo}: no hay conexión con el servidor. Revisa tu internet e intenta de nuevo.`
    const data = err.response.data as { message?: string; error?: string } | string | undefined
    const detalle = typeof data === 'string' ? '' : data?.message
    if (detalle) return `${prefijo}: ${detalle}`
    if (err.response.status >= 500) return `${prefijo}: el servidor tuvo un problema (error ${err.response.status}). Intenta de nuevo en un momento.`
    return `${prefijo} (error ${err.response.status}).`
  }
  return `${prefijo}.`
}
