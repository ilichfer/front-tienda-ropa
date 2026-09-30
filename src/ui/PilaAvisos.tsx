import { useAvisos } from './avisos'

/** Pila de avisos fija abajo a la derecha. Se monta una sola vez en App. */
export default function PilaAvisos() {
  const { avisos, cerrar } = useAvisos()
  if (avisos.length === 0) return null

  return (
    <div className="avisos" aria-live="polite">
      {avisos.map(a => (
        <div key={a.id} className={`aviso aviso-${a.tipo}`} role={a.tipo === 'error' ? 'alert' : 'status'}>
          <span className="aviso-icono" aria-hidden="true">{a.tipo === 'error' ? '!' : '✓'}</span>
          <p className="aviso-texto">{a.texto}</p>
          <button className="aviso-cerrar" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso">✕</button>
        </div>
      ))}
    </div>
  )
}
