import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** Todo lo que se imprime de una persona: sus datos de envío y lo que se le manda. */
export interface EtiquetaPersona {
  clave: string
  nombre?: string
  cedula?: string
  telefono?: string
  whatsapp?: string
  direccion?: string
  barrio?: string
  ciudad?: string
  contenido: string[]
}

interface Props {
  personas: EtiquetaPersona[]
  onCerrar: () => void
}

const COLUMNAS = [1, 2, 3] as const

/**
 * Vista previa + hoja para imprimir: un recuadro por persona, que crece según lo largo de sus
 * datos (una dirección larga no se corta). Los datos que falten salen como línea en blanco para
 * completarlos a mano. Se monta fuera de #root para que al imprimir solo salga la hoja.
 */
export default function HojaEtiquetas({ personas, onCerrar }: Props) {
  const [columnas, setColumnas] = useState<(typeof COLUMNAS)[number]>(2)

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.body.classList.add('imprimiendo-etiquetas')
    window.addEventListener('keydown', alTeclear)
    return () => {
      document.body.classList.remove('imprimiendo-etiquetas')
      window.removeEventListener('keydown', alTeclear)
    }
  }, [onCerrar])

  return createPortal(
    <div className="hoja-overlay" role="dialog" aria-modal="true" aria-label="Hoja de impresión de envíos">
      <div className="hoja-barra">
        <div>
          <strong>Hoja de envíos</strong>
          <span className="hoja-barra-detalle">
            {personas.length} {personas.length === 1 ? 'persona' : 'personas'}
          </span>
        </div>
        <div className="hoja-barra-acciones">
          <div className="filtros" role="group" aria-label="Recuadros por fila">
            {COLUMNAS.map(n => (
              <button
                key={n}
                className={`filter-btn ${columnas === n ? 'active' : ''}`}
                aria-pressed={columnas === n}
                onClick={() => setColumnas(n)}
              >
                {n} por fila
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <div className="hoja-papel">
        <div className={`hoja-grid hoja-cols-${columnas}`}>
          {personas.map(p => <Recuadro key={p.clave} persona={p} />)}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Recuadro({ persona: p }: { persona: EtiquetaPersona }) {
  return (
    <article className="etiqueta">
      <header className="etiqueta-cabecera">
        <span className="etiqueta-rotulo">Destinatario</span>
        <span className="etiqueta-remite">Remite: Patio de Ropa Jireh</span>
      </header>
      <p className={`etiqueta-nombre ${p.nombre ? '' : 'etiqueta-vacio'}`}>{p.nombre || ' '}</p>
      <dl className="etiqueta-datos">
        <Dato etiqueta="Cédula" valor={p.cedula} />
        <Dato etiqueta="Teléfono" valor={p.telefono} />
        <Dato etiqueta="Dirección" valor={p.direccion} ancho />
        <Dato etiqueta="Barrio" valor={p.barrio} />
        <Dato etiqueta="Ciudad" valor={p.ciudad} />
      </dl>
      {p.contenido.length > 0 && (
        <p className="etiqueta-contenido">
          <span>Contenido:</span> {p.contenido.join(', ')}
        </p>
      )}
    </article>
  )
}

function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor?: string; ancho?: boolean }) {
  return (
    <div className={`etiqueta-dato ${ancho ? 'etiqueta-dato-ancho' : ''}`}>
      <dt>{etiqueta}</dt>
      {/* Sin dato: queda una línea en blanco para escribirlo a mano. */}
      <dd className={valor ? '' : 'etiqueta-vacio'}>{valor || ' '}</dd>
    </div>
  )
}
