export interface User {
  id: number
  name: string
  email: string
  role: 'provider' | 'ngo' | 'volunteer' | 'admin'
  verified: boolean
  city: string
  lat?: number
  lng?: number
  created_at: string
}

export interface FoodListing {
  id: number
  provider_id: number
  name: string
  category: 'cooked_hot' | 'cooked_chilled' | 'raw_refrigerated' | 'sealed_packaged'
  veg: boolean
  unit: string
  lot_size: number
  total_lots: number
  available_lots: number
  reserved_lots: number
  collected_lots: number
  delivered_lots: number
  closed_lots: number
  prepared_at: string
  safe_deadline: string
  storage_requirement: string
  pickup_lat: number
  pickup_lng: number
  pickup_window_start: string
  pickup_window_end: string
  delivery_mode_offered: string
  delivery_contribution_type: string
  contribution_amount: number
  status: 'active' | 'fully_reserved' | 'completed' | 'expired' | 'cancelled'
  created_at: string
  feasibility_badge?: 'feasible' | 'tight' | 'infeasible'
  journey_slack_minutes?: number
  spoilage_minutes_remaining?: number
}

export interface DonationRequest {
  id: number
  listing_id: number
  receiver_id: number
  requested_lots: number
  allocated_lots: number
  status: 'pending' | 'reserved' | 'allocated' | 'rejected' | 'cancelled' | 'expired' | 'completed'
  reservation_expires_at?: string
  created_at: string
  updated_at: string
  listing_name?: string
  listing_category?: string
}

export interface RouteStop {
  stop_id: number
  request_id?: number
  stop_type: 'pickup' | 'delivery'
  coord: [number, number]
  lot_change: number
  name: string
  safe_deadline?: string
}

export interface DeliveryJob {
  id: number
  vehicle_id?: number
  request_ids: number[]
  route: {
    vehicle_id?: number
    stops: RouteStop[]
  }
  planned_start_time?: string
  planned_end_time?: string
  status: 'planned' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled' | 'recovery_needed'
  otp_code: string
  created_at: string
}

export interface DecisionLog {
  id: number
  created_at: string
  entity_type: string
  entity_id: number
  step: string
  decision: string
  reason_code: string
  message: string
  payload: Record<string, any>
}

export interface ImpactSummary {
  published_lots: number
  published_meals: number
  reserved_lots: number
  delivered_lots: number
  delivered_meals: number
  reported_distributed_lots: number
  reported_distributed_meals: number
  utilisation_percentage: number
  estimated_people_served: number
  co2_saved_kg: number
  co2_assumption: string
}

export interface AdminOverview {
  total_users: number
  users_by_role: Record<string, number>
  total_listings: number
  listings_by_status: Record<string, number>
  total_requests: number
  requests_by_status: Record<string, number>
  total_jobs: number
  jobs_by_status: Record<string, number>
  total_vehicles: number
}

export interface AllocationRunResponse {
  success: boolean
  total_requests: number
  allocated_count: number
  unallocated_count: number
  repair_rounds_run: number
  all_routes_valid: boolean
  jobs_created: number
  summary: Record<string, any>
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

let authToken: string | null = localStorage.getItem('foodrescue_token')
let currentUser: User | null = (() => {
  try {
    const raw = localStorage.getItem('foodrescue_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
})()

export function setSession(token: string, user: User) {
  authToken = token
  currentUser = user
  localStorage.setItem('foodrescue_token', token)
  localStorage.setItem('foodrescue_user', JSON.stringify(user))
}

export function clearSession() {
  authToken = null
  currentUser = null
  localStorage.removeItem('foodrescue_token')
  localStorage.removeItem('foodrescue_user')
}

export function getCurrentUser(): User | null {
  return currentUser
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorDetail = `Request failed: ${response.statusText}`
    try {
      const errJson = await response.json()
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail)
  }

  return response.json()
}

// API methods
export async function fetchHealth() {
  return request<{ status: string; app: string; version: string; environment: string; database: string }>('/health')
}

export async function login(email: string, name?: string, role: string = 'ngo', lat: number = 23.0225, lng: number = 72.5714) {
  const data = await request<{ access_token: string; token_type: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, name, role, lat, lng, city: 'Ahmedabad' }),
  })
  setSession(data.access_token, data.user)
  return data
}

export async function getMe() {
  return request<User>('/auth/me')
}

export async function getListings(category?: string, status?: string) {
  const params = new URLSearchParams()
  if (category) params.append('category', category)
  if (status) params.append('status', status)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request<FoodListing[]>(`/listings${qs}`)
}

export async function getListing(id: number) {
  return request<FoodListing>(`/listings/${id}`)
}

export async function createListing(payload: {
  name: string
  category: string
  veg: boolean
  unit?: string
  lot_size?: number
  total_lots: number
  prepared_at: string
  pickup_lat: number
  pickup_lng: number
  pickup_window_start: string
  pickup_window_end: string
  sender_declared_window_minutes?: number
  storage_requirement?: string
  delivery_mode_offered?: string
}) {
  return request<FoodListing>('/listings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createRequest(listingId: number, requestedLots: number) {
  return request<DonationRequest>('/requests', {
    method: 'POST',
    body: JSON.stringify({ listing_id: listingId, requested_lots: requestedLots }),
  })
}

export async function getMyRequests() {
  return request<DonationRequest[]>('/requests/mine')
}

export async function cancelRequest(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}`, {
    method: 'DELETE',
  })
}

export async function runAllocation(listingId?: number, maxRepairRounds: number = 5, trafficLevel: string = 'medium') {
  return request<AllocationRunResponse>('/allocate/run', {
    method: 'POST',
    body: JSON.stringify({
      listing_id: listingId,
      max_repair_rounds: maxRepairRounds,
      traffic_level: trafficLevel,
    }),
  })
}

export async function listAllocations() {
  return request<DeliveryJob[]>('/allocate')
}

export async function getAllocation(jobId: number) {
  return request<DeliveryJob>(`/allocate/${jobId}`)
}

export async function markJobCollected(jobId: number) {
  return request<DeliveryJob>(`/jobs/${jobId}/collected`, {
    method: 'POST',
  })
}

export async function confirmJobDelivered(jobId: number, otpCode: string, notes?: string) {
  return request<{ id: number; job_id: number; receiver_id: number; confirmed_at: string }>(
    `/jobs/${jobId}/delivered`,
    {
      method: 'POST',
      body: JSON.stringify({ otp_code: otpCode, notes }),
    }
  )
}

export async function submitUtilizationReport(jobId: number, report: {
  request_id: number
  reported_distributed_lots: number
  people_served: number
  photo_url?: string
  notes?: string
}) {
  return request<{ id: number; request_id: number; people_served: number }>(
    `/jobs/${jobId}/utilization`,
    {
      method: 'POST',
      body: JSON.stringify(report),
    }
  )
}

export async function getDecisions(entityType?: string, entityId?: number, reasonCode?: string) {
  const params = new URLSearchParams()
  if (entityType) params.append('entity_type', entityType)
  if (entityId !== undefined) params.append('entity_id', String(entityId))
  if (reasonCode) params.append('reason_code', reasonCode)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request<DecisionLog[]>(`/admin/decisions${qs}`)
}

export async function getAdminOverview() {
  return request<AdminOverview>('/admin/overview')
}

export async function triggerSimEvent(eventType: string, payload: Record<string, any> = {}) {
  return request<Record<string, any>>('/admin/sim/event', {
    method: 'POST',
    body: JSON.stringify({ event_type: eventType, payload }),
  })
}

export async function getImpactSummary() {
  return request<ImpactSummary>('/impact/summary')
}
