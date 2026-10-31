import { useEffect, useState } from 'react'
import {
  Clock,
  Layers,
  Plus,
  RefreshCw,
  Send,
  Truck,
  Utensils,
} from 'lucide-react'
import {
  FoodListing,
  createListing,
  getListings,
  runAllocation,
  AllocationRunResponse,
} from '../api/client'
import { SpoilageCountdown } from '../components/SpoilageCountdown'

export function DonorDashboard() {
  const [listings, setListings] = useState<FoodListing[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [allocationStatus, setAllocationStatus] = useState<string | null>(null)

  // Plain-language intake state
  const [plainInputText, setPlainInputText] = useState('')
  const [parsingIntake, setParsingIntake] = useState(false)
  const [intakeParsedNote, setIntakeParsedNote] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'cooked_hot',
    veg: true,
    lot_size: 10,
    total_lots: 5,
    pickup_lat: 23.0225,
    pickup_lng: 72.5714,
    sender_declared_window_minutes: 240,
    storage_requirement: 'ambient',
    delivery_mode_offered: 'sender_vehicle',
  })

  async function loadData() {
    setLoading(true)
    try {
      const data = await getListings()
      setListings(data)
    } catch (err: any) {
      console.error('Failed to load listings', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleParseIntake() {
    if (!plainInputText.trim()) return
    setParsingIntake(true)
    setIntakeParsedNote(null)

    try {
      const token = localStorage.getItem('foodrescue_token')
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
      const res = await fetch(`${API_BASE_URL}/listings/parse-intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: plainInputText }),
      })

      if (!res.ok) {
        throw new Error('Failed to parse intake text')
      }

      const data = await res.json()
      setFormData((prev) => ({
        ...prev,
        name: data.name,
        category: data.category,
        veg: data.veg,
        lot_size: data.lot_size,
        total_lots: data.total_lots,
        sender_declared_window_minutes: data.sender_declared_window_minutes,
        storage_requirement: data.storage_requirement,
      }))
      setIntakeParsedNote(
        `Parsed successfully: ${data.name} (${data.total_lots} lots, ${data.category}, ${data.veg ? 'Veg' : 'Non-veg'}). Please review parameters below before publishing.`
      )
    } catch (err: any) {
      alert(`Could not parse text: ${err.message}`)
    } finally {
      setParsingIntake(false)
    }
  }

  async function handleCreateListing(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const now = new Date()
      const pickupStart = new Date(now.getTime() + 10 * 60000)
      const pickupEnd = new Date(now.getTime() + 120 * 60000)

      await createListing({
        name: formData.name,
        category: formData.category,
        veg: formData.veg,
        lot_size: Number(formData.lot_size),
        total_lots: Number(formData.total_lots),
        prepared_at: now.toISOString(),
        pickup_lat: formData.pickup_lat,
        pickup_lng: formData.pickup_lng,
        pickup_window_start: pickupStart.toISOString(),
        pickup_window_end: pickupEnd.toISOString(),
        sender_declared_window_minutes: Number(formData.sender_declared_window_minutes),
        storage_requirement: formData.storage_requirement,
        delivery_mode_offered: formData.delivery_mode_offered,
      })

      setShowCreateModal(false)
      setFormData({
        name: '',
        category: 'cooked_hot',
        veg: true,
        lot_size: 10,
        total_lots: 5,
        pickup_lat: 23.0225,
        pickup_lng: 72.5714,
        sender_declared_window_minutes: 240,
        storage_requirement: 'ambient',
        delivery_mode_offered: 'sender_vehicle',
      })
      await loadData()
    } catch (err: any) {
      alert(`Error creating listing: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTriggerAllocation(listingId?: number) {
    setAllocationStatus('Running CSP solver & vehicle router...')
    try {
      const result: AllocationRunResponse = await runAllocation(listingId)
      if (result.success) {
        setAllocationStatus(
          `Allocation complete! Allocated: ${result.allocated_count}/${result.total_requests} requests in ${result.repair_rounds_run} repair rounds.`
        )
      } else {
        setAllocationStatus(
          `Allocation finished with partial feasibility. Repaired rounds: ${result.repair_rounds_run}. Check Admin Explain View.`
        )
      }
      await loadData()
    } catch (err: any) {
      setAllocationStatus(`Allocation error: ${err.message}`)
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-slate-800">Donor Surplus Food Portal</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
              Provider Mode
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Publish surplus meal lots, monitor live perishable food safety deadlines, and dispatch deliveries.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleTriggerAllocation()}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Run CSP Solver</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Food Listing</span>
          </button>
        </div>
      </div>

      {allocationStatus && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-blue-600 shrink-0" />
            <span>{allocationStatus}</span>
          </div>
          <button
            onClick={() => setAllocationStatus(null)}
            className="text-xs text-blue-700 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Listings Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <span>Active Food Listings ({listings.length})</span>
          </h2>
          <button
            onClick={loadData}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center space-x-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {listings.length === 0 && !loading && (
          <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300">
            <Utensils className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">No food listings published yet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Create your first surplus food listing to trigger automated CSP allocation and safe delivery.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
            >
              Post Surplus Food
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((l) => (
            <div
              key={l.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{l.name}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">
                        {l.category.replace('_', ' ')}
                      </span>
                      {l.veg ? (
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          VEG
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          NON-VEG
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                      l.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : l.status === 'fully_reserved'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {l.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Spoilage Countdown */}
                <div className="my-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                    <span className="font-medium">Perishable Safety Deadline</span>
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <SpoilageCountdown safeDeadline={l.safe_deadline} />
                </div>

                {/* Lot Inventory Breakdown */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Inventory:</span>
                    <span className="font-bold text-slate-800">
                      {l.total_lots} lots ({l.total_lots * l.lot_size} {l.unit})
                    </span>
                  </div>

                  {/* Visual Inventory Bar */}
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${(l.available_lots / l.total_lots) * 100}%` }}
                      className="bg-emerald-500"
                      title={`Available: ${l.available_lots}`}
                    ></div>
                    <div
                      style={{ width: `${(l.reserved_lots / l.total_lots) * 100}%` }}
                      className="bg-blue-500"
                      title={`Reserved: ${l.reserved_lots}`}
                    ></div>
                    <div
                      style={{ width: `${(l.delivered_lots / l.total_lots) * 100}%` }}
                      className="bg-purple-500"
                      title={`Delivered: ${l.delivered_lots}`}
                    ></div>
                    <div
                      style={{ width: `${(l.closed_lots / l.total_lots) * 100}%` }}
                      className="bg-rose-500"
                      title={`Closed / Expired: ${l.closed_lots}`}
                    ></div>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-[11px] text-center pt-1 font-medium text-slate-500">
                    <div>
                      <span className="text-emerald-600 font-bold">{l.available_lots}</span> avail
                    </div>
                    <div>
                      <span className="text-blue-600 font-bold">{l.reserved_lots}</span> res
                    </div>
                    <div>
                      <span className="text-purple-600 font-bold">{l.delivered_lots}</span> deliv
                    </div>
                    <div>
                      <span className="text-rose-600 font-bold">{l.closed_lots}</span> closed
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  ID #{l.id} • {new Date(l.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleTriggerAllocation(l.id)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Allocate This</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Listing Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Post Surplus Food Listing</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Plain-Language Smart Intake Assistant */}
            <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Plain-Language Quick Intake
                </label>
                <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
                  NLP Parser
                </span>
              </div>
              <p className="text-[11px] text-indigo-800 mb-2">
                Type in natural words: e.g. <span className="italic">"50 veg biryani boxes made at 1 pm, pickup till 4"</span>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 50 veg biryani boxes made at 1 pm, pickup till 4"
                  value={plainInputText}
                  onChange={(e) => setPlainInputText(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleParseIntake}
                  disabled={parsingIntake || !plainInputText.trim()}
                  className="px-3.5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {parsingIntake ? 'Parsing...' : 'Smart Parse'}
                </button>
              </div>

              {intakeParsedNote && (
                <div className="mt-2.5 p-2 rounded-lg bg-emerald-100 text-emerald-900 text-[11px] font-medium border border-emerald-300">
                  {intakeParsedNote}
                </div>
              )}
            </div>

            <form onSubmit={handleCreateListing} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Food Item Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gujarati Thali Surplus, Vegetable Biryani"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Category (Food Safety)
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cooked_hot">Cooked Hot (4h Max Window)</option>
                    <option value="cooked_chilled">Cooked Chilled (8h Cold Chain)</option>
                    <option value="raw_refrigerated">Raw Produce / Dairy (12h Cold Chain)</option>
                    <option value="sealed_packaged">Sealed Packaged (7 Days)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Dietary Type
                  </label>
                  <select
                    value={formData.veg ? 'veg' : 'nonveg'}
                    onChange={(e) => setFormData({ ...formData, veg: e.target.value === 'veg' })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="veg">Vegetarian (Pure Veg)</option>
                    <option value="nonveg">Non-Vegetarian</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Total Lots
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.total_lots}
                    onChange={(e) => setFormData({ ...formData, total_lots: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Meals Per Lot
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.lot_size}
                    onChange={(e) => setFormData({ ...formData, lot_size: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Sender Safe Window (Minutes)
                </label>
                <input
                  type="number"
                  min="30"
                  max="10080"
                  value={formData.sender_declared_window_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, sender_declared_window_minutes: Number(e.target.value) })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  *Sender can only shorten safety window; category rules enforce hard FSSAI ceiling.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Publishing...' : 'Publish Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
