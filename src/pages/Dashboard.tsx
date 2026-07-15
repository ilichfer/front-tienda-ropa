import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { usePedidosRealtime } from '../hooks/usePedidos'

interface Resumen {
  totalPedidos: number
  nuevos: number
  apartados: number
  pagados: number
  enviados: number
  totalClientes: number
  prendasDisponibles: number
}

export default function Dashboard() {
  usePedidosRealtime()

  const { data: stats, isLoading } = useQuery<Resumen>({
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
        totalClientes: new Set(pedidos.map((p: any) => p.cliente.whatsapp)).size,
        prendasDisponibles: 0,
      }
    }),
    refetchInterval: 15_000,
  })

  if (isLoading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Pedidos Totales</span>
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
    </div>
  )
}
