import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { usePedidosRealtime } from '../hooks/usePedidos'
import { useCuentas } from '../hooks/useCuentas'
import type { Cliente } from '../hooks/useClientes'
import ErrorCarga from '../ui/ErrorCarga'

interface Resumen {
  totalPedidos: number
  nuevos: number
  apartados: number
  pagados: number
  enviados: number
  totalClientes: number
}

interface Inconveniente {
  id: string
  estado: string
}

export default function Dashboard() {
  usePedidosRealtime()

  const { data: stats, isLoading, isError, error, refetch } = useQuery<Resumen>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/pedidos').then(r => {
      const pedidos = r.data
      return {
        totalPedidos: pedidos.length,
        nuevos: pedidos.filter((p: any) => p.estado === 'NUEVO').length,
        apartados: pedidos.filter((p: any) => p.estado === 'APARTADO').length,
        pagados: pedidos.filter((p: any) => p.estado === 'PAGADO').length,
        enviados: pedidos.filter((p: any) =>
          ['ENVIADO', 'ENTREGADO'].includes(p.estado)).length,
        totalClientes: new Set(pedidos.map((p: any) => p.cliente?.whatsapp).filter(Boolean)).size,
      }
    }),
    refetchInterval: 15_000,
  })

  // Lo que hay que atender. Mismas claves de consulta que las pantallas de destino, así al
  // entrar a Cuentas o Inconvenientes los datos ya están cargados.
  const clientes = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
    refetchInterval: 15_000,
  })
  const cuentas = useCuentas()
  const inconvenientes = useQuery<Inconveniente[]>({
    queryKey: ['inconvenientes', ''],
    queryFn: () => api.get('/inconvenientes', { params: {} }).then(r => r.data),
    refetchInterval: 15_000,
  })

  const chatsEsperando = clientes.data?.filter(c => c.requiereAsesor && !c.esBuzonGuias).length
  const prendasSinValor = cuentas.data?.reduce((acc, c) => acc + c.pendientesValor, 0)
  const pagosPorValidar = cuentas.data?.reduce((acc, c) => acc + c.abonosPorValidar, 0)
  const incAbiertos = inconvenientes.data?.filter(i => i.estado === 'RECIBIDO' || i.estado === 'EN_REVISION').length

  const tarjetas = [
    { label: 'Chats esperando un asesor', valor: chatsEsperando, error: clientes.isError, to: '/whatsapp', hint: 'Abrir WhatsApp' },
    { label: 'Prendas sin valor', valor: prendasSinValor, error: cuentas.isError, to: '/cuentas?filtro=pendientes', hint: 'Revisar en Cuentas' },
    { label: 'Pagos por validar', valor: pagosPorValidar, error: cuentas.isError, to: '/cuentas?filtro=pendientes', hint: 'Revisar en Cuentas' },
    { label: 'Inconvenientes abiertos', valor: incAbiertos, error: inconvenientes.isError, to: '/inconvenientes', hint: 'Ver inconvenientes' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <h2 className="dash-seccion-titulo">Para atender</h2>
      <div className="stats-grid">
        {tarjetas.map(t => (
          <Link key={t.label} to={t.to} className="stat-card stat-card-boton">
            <span className="stat-label">{t.label}</span>
            <span className={`stat-value ${t.valor ? 'warning' : ''}`}>
              {t.error ? '—' : t.valor ?? '…'}
            </span>
            <span className="stat-hint">{t.error ? 'No se pudo cargar' : t.hint}</span>
          </Link>
        ))}
      </div>

      <h2 className="dash-seccion-titulo">Pedidos</h2>
      {isError && <ErrorCarga error={error} onReintentar={() => refetch()} que="los pedidos" />}
      {isLoading ? (
        <div className="loading">Cargando...</div>
      ) : (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Pedidos totales</span>
            <span className="stat-value primary">{stats?.totalPedidos ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Nuevos</span>
            <span className="stat-value warning">{stats?.nuevos ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Apartados</span>
            <span className="stat-value">{stats?.apartados ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Pagados</span>
            <span className="stat-value success">{stats?.pagados ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Enviados</span>
            <span className="stat-value info">{stats?.enviados ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Clientes</span>
            <span className="stat-value">{stats?.totalClientes ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  )
}
