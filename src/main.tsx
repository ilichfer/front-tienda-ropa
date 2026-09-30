import React from 'react'
import ReactDOM from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { avisarError, mensajeError } from './ui/avisos'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
  },
  // Cualquier acción (useMutation) que falle se le muestra al operador, en todas las
  // pantallas, sin que cada una tenga que acordarse de hacerlo. Una mutación puede decir qué
  // estaba haciendo con meta.accion ("validar el pago") para que el aviso sea más claro.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const accion = mutation.meta?.accion as string | undefined
      avisarError(mensajeError(error, accion))
    },
  }),
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
