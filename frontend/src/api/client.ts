export interface HealthResponse {
  status: string
  app: string
  version: string
  environment: string
  database: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`)
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`)
  }
  return response.json()
}

