export interface User {
  id: number
  name: string
  email: string
  phone?: string
  organization?: string
  address?: string
  role: 'provider' | 'ngo' | 'volunteer' | 'admin' | 'both'
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
  is_archived?: boolean
  created_at: string
  feasibility_badge?: 'feasible' | 'tight' | 'infeasible'
  journey_slack_minutes?: number
  spoilage_minutes_remaining?: number
  provider_name?: string
  provider_email?: string
}

export interface DonationRequest {
  id: number
  listing_id: number
  receiver_id: number
  requested_lots: number
  allocated_lots: number
  status: 'pending' | 'reserved' | 'offered' | 'allocated' | 'dispatched' | 'rejected' | 'cancelled' | 'expired' | 'completed'
  reservation_expires_at?: string
  created_at: string
  updated_at: string
  listing_name?: string
  listing_category?: string
  receiver_name?: string
  receiver_priority_class?: string
  delivery_basis?: string
  partner_verified?: boolean
  partner_details?: string
  delivery_job_id?: number
  delivery_job_status?: string
  otp_code?: string
  provider_name?: string
  provider_email?: string
  receiver_email?: string
  nominal_price?: number
  offer_seconds_remaining?: number
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

export function updateCurrentUser(updates: Partial<User>): User | null {
  if (!currentUser) return null
  currentUser = { ...currentUser, ...updates }
  localStorage.setItem('foodrescue_user', JSON.stringify(currentUser))
  return currentUser
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // If holding a temporary demo session token but backend is online, seamlessly upgrade to signed token
  if (authToken && authToken.startsWith('demo-session-') && currentUser?.email && path !== '/auth/login') {
    try {
      const upgradeRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          name: currentUser.name,
          role: currentUser.role,
          lat: currentUser.lat || 23.0225,
          lng: currentUser.lng || 72.5714,
          city: currentUser.city || 'Ahmedabad',
          address: currentUser.address,
        }),
      })
      if (upgradeRes.ok) {
        const upgradeData = await upgradeRes.json()
        setSession(upgradeData.access_token, upgradeData.user)
      }
    } catch {
      // Keep existing session if offline
    }
  }

  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  // Automatic silent session recovery on 401 Unauthorized
  if (response.status === 401 && currentUser?.email && path !== '/auth/login') {
    try {
      const reAuthRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          name: currentUser.name,
          role: currentUser.role,
          lat: currentUser.lat || 23.0225,
          lng: currentUser.lng || 72.5714,
          city: currentUser.city || 'Ahmedabad',
          address: currentUser.address,
        }),
      })
      if (reAuthRes.ok) {
        const freshData = await reAuthRes.json()
        setSession(freshData.access_token, freshData.user)
        headers.set('Authorization', `Bearer ${freshData.access_token}`)
        const retryRes = await fetch(`${API_BASE_URL}${path}`, {
          ...options,
          headers,
        })
        if (retryRes.ok) {
          return retryRes.json()
        }
      }
    } catch {
      // standard handling below
    }
  }

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

export async function login(
  email: string,
  name?: string,
  role: string = 'ngo',
  lat: number = 23.0225,
  lng: number = 72.5714,
  phone?: string,
  organization?: string,
  address?: string
) {
  try {
    const data = await request<{ access_token: string; token_type: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, name, role, lat, lng, city: 'Ahmedabad', address }),
    })
    if (phone) data.user.phone = phone
    if (organization) data.user.organization = organization
    if (address && !data.user.address) data.user.address = address
    setSession(data.access_token, data.user)
    return data
  } catch (err: any) {
    // If backend is unreachable or offline, provide immediate resilient demo session so user is NEVER blocked
    console.warn('Backend API unreachable, automatically falling back to offline demo session:', err)
    const getFallbackId = () => {
      if (role === 'admin') return 9
      if (role === 'both') return 19
      if (role === 'provider') {
        if (email.includes('donor.test')) return 17
        if (email.includes('taj.skyline')) return 10
        if (email.includes('taj.caterers')) return 1
        return 17
      }
      if (email.includes('ngo.test')) return 18
      if (email.includes('apang')) return 18
      if (email.includes('bpa')) return 12
      return 18
    }

    const mockUser: User = {
      id: getFallbackId(),
      name: name || (role === 'admin' ? 'City AMC Operations Admin' : role === 'provider' ? 'Annapurna Restaurant & Caterers' : role === 'both' ? 'Community Food Hub' : 'Apang Manav Mandal Shelter'),
      email: email,
      phone: phone || '+91 98765 43210',
      organization: organization || name || (role === 'provider' ? 'Annapurna Restaurant & Caterers' : 'Apang Manav Mandal Shelter'),
      address: address || (role === 'provider' ? 'CG Road, Navrangpura, Ahmedabad' : role === 'ngo' ? 'Drive In Road, Ahmedabad' : 'Maninagar, Ahmedabad'),
      role: role as any,
      verified: true,
      city: 'Ahmedabad',
      lat: lat || (role === 'provider' ? 23.0300 : role === 'ngo' ? 23.0450 : 22.9940),
      lng: lng || (role === 'provider' ? 72.5580 : role === 'ngo' ? 72.5270 : 72.6030),
      created_at: new Date().toISOString(),
    }
    const fallbackData = {
      access_token: `demo-session-${Date.now()}`,
      token_type: 'bearer',
      user: mockUser,
    }
    setSession(fallbackData.access_token, fallbackData.user)
    return fallbackData
  }
}

export async function updateProfileApi(updates: {
  name?: string
  address?: string
  lat?: number
  lng?: number
  city?: string
}): Promise<User | null> {
  try {
    const updatedUser = await request<User>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    updateCurrentUser(updatedUser)
    return updatedUser
  } catch (err) {
    console.warn('Backend update failed or offline, updating local session:', err)
    const local = updateCurrentUser(updates)
    return local
  }
}

export async function getMe() {
  return request<User>('/auth/me')
}

export async function getListings(category?: string, status?: string) {
  try {
    const params = new URLSearchParams()
    if (category) params.append('category', category)
    if (status) params.append('status', status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const serverListings = await request<FoodListing[]>(`/listings${qs}`)

    // Merge any offline created listings that are not yet on the server
    try {
      const stored = localStorage.getItem('foodrescue_offline_listings')
      if (stored) {
        const offlineList: FoodListing[] = JSON.parse(stored)
        const existingIds = new Set(serverListings.map((l) => l.id))
        const unmerged = offlineList.filter((l) => !existingIds.has(l.id))
        return [...unmerged, ...serverListings]
      }
    } catch {}

    try {
      const deletedIds = new Set<number>(JSON.parse(localStorage.getItem('foodrescue_deleted_ids') || '[]'))
      if (deletedIds.size > 0) {
        return serverListings.filter((l) => !deletedIds.has(l.id))
      }
    } catch {}

    return serverListings
  } catch (err) {
    console.warn('Backend offline or failed to fetch listings, serving cached listings:', err)
    try {
      const stored = localStorage.getItem('foodrescue_offline_listings')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }
}

export async function deleteListing(id: number): Promise<{ status: string; id: number }> {
  try {
    const result = await request<{ status: string; id: number }>(`/listings/${id}`, {
      method: 'DELETE',
    })
    try {
      const stored = localStorage.getItem('foodrescue_offline_listings')
      if (stored) {
        const list: FoodListing[] = JSON.parse(stored)
        const filtered = list.filter((l) => l.id !== id)
        localStorage.setItem('foodrescue_offline_listings', JSON.stringify(filtered))
      }
    } catch {}

    try {
      const deletedIds: number[] = JSON.parse(localStorage.getItem('foodrescue_deleted_ids') || '[]')
      if (!deletedIds.includes(id)) {
        deletedIds.push(id)
        localStorage.setItem('foodrescue_deleted_ids', JSON.stringify(deletedIds))
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings', { detail: { id, deleted: true } }))
    }
    return result
  } catch (err) {
    try {
      const stored = localStorage.getItem('foodrescue_offline_listings')
      if (stored) {
        const list: FoodListing[] = JSON.parse(stored)
        const filtered = list.filter((l) => l.id !== id)
        localStorage.setItem('foodrescue_offline_listings', JSON.stringify(filtered))
      }
    } catch {}

    try {
      const deletedIds: number[] = JSON.parse(localStorage.getItem('foodrescue_deleted_ids') || '[]')
      if (!deletedIds.includes(id)) {
        deletedIds.push(id)
        localStorage.setItem('foodrescue_deleted_ids', JSON.stringify(deletedIds))
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings', { detail: { id, deleted: true } }))
    }
    return { status: 'deleted', id }
  }
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
  try {
    const result = await request<FoodListing>('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings', { detail: result }))
    }
    return result
  } catch (err: any) {
    console.warn('Backend unavailable or failed to create listing, storing in resilient local cache:', err)
    const now = new Date()
    const safeMins = payload.sender_declared_window_minutes || (payload.category === 'cooked_hot' ? 240 : 480)
    const deadline = new Date(now.getTime() + safeMins * 60000).toISOString()
    const mockListing: FoodListing = {
      id: Date.now(),
      provider_id: currentUser?.id || 1,
      provider_name: currentUser?.name || 'Local Kitchen',
      name: payload.name,
      category: payload.category as any,
      veg: payload.veg,
      unit: payload.unit || 'meals',
      lot_size: payload.lot_size || 10,
      total_lots: payload.total_lots,
      available_lots: payload.total_lots,
      reserved_lots: 0,
      collected_lots: 0,
      delivered_lots: 0,
      closed_lots: 0,
      prepared_at: payload.prepared_at || now.toISOString(),
      safe_deadline: deadline,
      storage_requirement: payload.storage_requirement || 'ambient',
      pickup_lat: payload.pickup_lat,
      pickup_lng: payload.pickup_lng,
      pickup_window_start: payload.pickup_window_start,
      pickup_window_end: payload.pickup_window_end,
      delivery_mode_offered: payload.delivery_mode_offered || 'sender_vehicle',
      delivery_contribution_type: 'free',
      contribution_amount: 0,
      status: 'active',
      created_at: now.toISOString(),
      feasibility_badge: 'feasible',
      journey_slack_minutes: safeMins - 25,
      spoilage_minutes_remaining: safeMins,
    }

    try {
      const stored = localStorage.getItem('foodrescue_offline_listings')
      const list = stored ? JSON.parse(stored) : []
      list.unshift(mockListing)
      localStorage.setItem('foodrescue_offline_listings', JSON.stringify(list))
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings', { detail: mockListing }))
    }
    return mockListing
  }
}

export async function createRequest(listingId: number, requestedLots: number) {
  const result = await request<DonationRequest>('/requests', {
    method: 'POST',
    body: JSON.stringify({ listing_id: listingId, requested_lots: requestedLots }),
  })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('foodrescue:sync_listings', { detail: result }))
  }
  return result
}

export async function getMyRequests() {
  return request<DonationRequest[]>('/requests/mine')
}

export async function getDonorRequests() {
  return request<DonationRequest[]>('/requests/donor')
}

export async function confirmRequest(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}/confirm`, {
    method: 'POST',
  })
}

export async function sendDonorOffer(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}/donor-offer`, {
    method: 'POST',
  })
}

export async function ngoAcceptOffer(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}/ngo-accept`, {
    method: 'POST',
  })
}

export async function dispatchOrder(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}/dispatch`, {
    method: 'POST',
  })
}

export async function completeDelivery(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}/complete-delivery`, {
    method: 'POST',
  })
}

export async function rejectRequest(requestId: number) {
  return request<DonationRequest>(`/requests/${requestId}/reject`, {
    method: 'POST',
  })
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

export interface ChatMessage {
  id: number
  request_id?: number
  sender_id: number
  sender_name: string
  sender_role: 'provider' | 'ngo' | 'volunteer' | 'admin'
  recipient_id?: number
  message: string
  photo_url?: string
  people_served?: number
  message_type: 'text' | 'feedback_photo' | 'thank_you' | string
  created_at: string
}

export async function sendChatMessage(payload: {
  request_id?: number
  recipient_id?: number
  message: string
  photo_url?: string
  people_served?: number
  message_type?: string
}) {
  return request<ChatMessage>('/chat/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getChatMessages(requestId?: number) {
  const qs = requestId ? `?request_id=${requestId}` : ''
  return request<ChatMessage[]>(`/chat/messages${qs}`)
}

export async function getDonorFeedback() {
  return request<ChatMessage[]>('/chat/feedback/donor')
}
