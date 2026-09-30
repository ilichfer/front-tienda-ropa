import { mensajeError } from './avisos'

interface Props {
  error: unknown
  onReintentar: () => void
  /** Qué se estaba cargando, en minúscula: "las cuentas", "los chats"... */
  que: string
}

/**
 * Se muestra cuando una lista no se pudo cargar. Antes esos errores se convertían en una lista
 * vacía y la pantalla decía "No hay cuentas" aunque el problema fuera que el servidor no
 * respondió.
 */
export default function ErrorCarga({ error, onReintentar, que }: Props) {
  return (
    <div className="error-carga" role="alert">
      <p>{mensajeError(error, `cargar ${que}`)}</p>
      <button className="btn btn-sm btn-secondary" onClick={onReintentar}>Reintentar</button>
    </div>
  )
}
