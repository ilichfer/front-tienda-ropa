import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useResumenAvisos } from '../hooks/useAvisosChat'

const CLAVE_SONIDO = 'notificaciones-sonido'
const TITULO_BASE = document.title

function leerPreferenciaSonido(): boolean {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== 'no'
  } catch {
    return true
  }
}

// Un "ding" corto generado en el navegador: no depende de un archivo de audio.
function sonar(urgente: boolean) {
  try {
    const ctx = new AudioContext()
    const notas = urgente ? [880, 660, 880] : [740]
    notas.forEach((frecuencia, i) => {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = frecuencia
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.18
      vol.gain.setValueAtTime(0.0001, t)
      vol.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.connect(vol).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.17)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {
    // Sin audio (navegador sin soporte o sin permiso todavía): solo queda la notificación visual.
  }
}

function notificar(titulo: string, cuerpo: string, from: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const n = new Notification(titulo, { body: cuerpo, tag: from, icon: '/favicon.ico' })
    n.onclick = () => {
      window.focus()
      window.location.assign(`/whatsapp?from=${encodeURIComponent(from)}`)
      n.close()
    }
  } catch {
    // Algunos navegadores de celular solo permiten notificaciones desde un service worker.
  }
}

/**
 * Avisa al equipo, esté en la pantalla que esté, cuando un cliente pide un asesor (aviso
 * fuerte) o escribe un mensaje nuevo (aviso suave): sonido, notificación del navegador y el
 * número de chats sin leer en el título de la pestaña.
 */
export default function Notificador() {
  const { data } = useResumenAvisos()
  const queryClient = useQueryClient()
  const [sonido, setSonido] = useState(leerPreferenciaSonido)
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-soportado'>(
    'Notification' in window ? Notification.permission : 'no-soportado')
  const ultimoEntranteVisto = useRef<string | null>(null)
  const esperandoVistos = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!data) return
    // En la primera carga solo se toma la foto de cómo está todo: no se avisa de lo viejo.
    if (esperandoVistos.current === null) {
      esperandoVistos.current = new Set(data.esperandoAsesor.map(e => e.whatsappFrom))
      ultimoEntranteVisto.current = data.ultimoEntrante?.id ?? null
      return
    }

    const nuevosEsperando = data.esperandoAsesor.filter(e => !esperandoVistos.current!.has(e.whatsappFrom))
    esperandoVistos.current = new Set(data.esperandoAsesor.map(e => e.whatsappFrom))

    const entrante = data.ultimoEntrante
    const hayMensajeNuevo = !!entrante && entrante.id !== ultimoEntranteVisto.current
    ultimoEntranteVisto.current = entrante?.id ?? null

    if (nuevosEsperando.length > 0) {
      const e = nuevosEsperando[0]
      if (sonido) sonar(true)
      notificar('🟠 Un cliente pide asesor', e.nombre || e.whatsappFrom, e.whatsappFrom)
    } else if (hayMensajeNuevo && entrante) {
      if (sonido) sonar(false)
      notificar(`💬 ${entrante.nombre || entrante.whatsappFrom}`, (entrante.contenido || '').slice(0, 120), entrante.whatsappFrom)
    }
    if (hayMensajeNuevo) queryClient.invalidateQueries({ queryKey: ['wa-mensajes'] })
  }, [data, sonido, queryClient])

  useEffect(() => {
    const pendientes = (data?.esperandoAsesor.length ?? 0)
    const noLeidos = data?.noLeidos ?? 0
    const total = pendientes + noLeidos
    document.title = total > 0 ? `(${total}) ${TITULO_BASE}` : TITULO_BASE
  }, [data])

  function cambiarSonido() {
    const nuevo = !sonido
    setSonido(nuevo)
    try { localStorage.setItem(CLAVE_SONIDO, nuevo ? 'si' : 'no') } catch { /* sin almacenamiento */ }
    if (nuevo) sonar(false)
  }

  async function pedirPermiso() {
    if (!('Notification' in window)) return
    setPermiso(await Notification.requestPermission())
  }

  return (
    <div className="notificador">
      {permiso === 'default' && (
        <button className="notificador-btn" onClick={pedirPermiso} title="Recibir un aviso aunque estés en otra pestaña">
          🔔 Activar avisos
        </button>
      )}
      <button
        className="notificador-btn"
        onClick={cambiarSonido}
        title={sonido ? 'Sonido de avisos activado (clic para silenciar)' : 'Sonido de avisos silenciado (clic para activar)'}
      >
        {sonido ? '🔊' : '🔈'}
      </button>
    </div>
  )
}
