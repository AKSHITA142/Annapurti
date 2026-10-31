import { useEffect, useState } from 'react'
import {
  CheckCircle,
  Clock,
  KeyRound,
  Package,
  RefreshCw,
  ShieldAlert,
  Truck,
  Utensils,
} from 'lucide-react'
import {
  DonationRequest,
  FoodListing,
  cancelRequest,
  confirmJobDelivered,
  createRequest,
  getListings,
  getMyRequests,
  listAllocations,
  submitUtilizationReport,
  DeliveryJob,
} from '../api/client'
import { FeasibilityBadge } from '../components/FeasibilityBadge'
import { SpoilageCountdown } from '../components/SpoilageCountdown'
import { SimulatedBadge } from '../components/SimulatedBadge'

export function NgoDashboard() {
  const [listings, setListings] = useState<FoodListing[]>([])
  const [myRequests, setMyRequests] = useState<DonationRequest[]>([])
  const [activeJobs, setActiveJobs] = useState<DeliveryJob[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')

  // Request lots modal
  const [selectedListing, setSelectedListing] = useState<FoodListing | null>(null)
  const [requestedLots, setRequestedLots] = useState(1)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null)
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // OTP Confirmation modal
  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [confirmingOtp, setConfirmingOtp] = useState(false)

  // Utilization Report modal
  const [reportingReq, setReportingReq] = useState<DonationRequest | null>(null)
  const [reportData, setReportData] = useState({
    reported_distributed_lots: 1,
    people_served: 10,
    photo_url: '',
    notes: '',
  })
  const [submittingReport, setSubmittingReport] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [listData, reqData, jobsData] = await Promise.all([
        getListings(categoryFilter || undefined),
        getMyRequests().catch(() => []),
        listAllocations().catch(() => []),
      ])
      setListings(listData)
      setMyRequests(reqData)
      setActiveJobs(jobsData)
    } catch (err: any) {
      console.error('Failed to load NGO dashboard data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [categoryFilter])

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedListing) return
    setRequestError(null)
    setRequestSuccess(null)
    setSubmittingRequest(true)

    try {
      const req = await createRequest(selectedListing.id, requestedLots)
      setRequestSuccess(`Reserved ${req.allocated_lots} lots atomically! Reservation confirmed.`)
      setTimeout(() => {
        setSelectedListing(null)
        setRequestSuccess(null)
      }, 1500)
      await loadData()
    } catch (err: any) {
      setRequestError(err.message || 'Failed to reserve food lots')
    } finally {
      setSubmittingRequest(false)
    }
  }

  async function handleCancelRequest(id: number) {
    if (!confirm('Are you sure you want to cancel this request? Reserved lots will be returned to inventory.')) {
      return
    }
    try {
      await cancelRequest(id)
      await loadData()
    } catch (err: any) {
      alert(`Error cancelling request: ${err.message}`)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedJob) return
    setOtpError(null)
    setConfirmingOtp(true)

    try {
      await confirmJobDelivered(selectedJob.id, otpCode)
      alert('Handover confirmed! Delivery lots moved to delivered.')
      setSelectedJob(null)
      setOtpCode('')
      await loadData()
    } catch (err: any) {
      setOtpError(err.message || 'Invalid OTP code')
    } finally {
      setConfirmingOtp(false)
    }
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportingReq) return
    setSubmittingReport(true)

    try {
      // Find matching job for this request
      const matchedJob = activeJobs.find((j) => j.request_ids.includes(reportingReq.id))
      const jobId = matchedJob ? matchedJob.id : activeJobs[0]?.id || 1

      await submitUtilizationReport(jobId, {
        request_id: reportingReq.id,
        reported_distributed_lots: Number(reportData.reported_distributed_lots),
        people_served: Number(reportData.people_served),
        photo_url: reportData.photo_url || undefined,
        notes: reportData.notes || undefined,
      })

      alert('Utilisation report successfully submitted! Impact metrics updated.')
      setReportingReq(null)
      await loadData()
    } catch (err: any) {
      alert(`Error submitting utilisation report: ${err.message}`)
    } finally {
      setSubmittingReport(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-slate-800">NGO & Community Kitchen Portal</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
              Receiver Mode
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Browse available food lots in Ahmedabad with real-time feasibility badges, claim lots, and confirm receipt.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white"
          >
            <option value="">All Categories</option>
            <option value="cooked_hot">Cooked Hot</option>
            <option value="cooked_chilled">Cooked Chilled</option>
            <option value="raw_refrigerated">Raw Refrigerated</option>
            <option value="sealed_packaged">Sealed Packaged</option>
          </select>

          <button
            onClick={loadData}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Available City Listings Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
          <Package className="w-5 h-5 text-purple-600" />
          <span>Surplus Food Discovery in Ahmedabad ({listings.length})</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((l) => (
            <div
              key={l.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{l.name}</h3>
                    <div className="flex items-center space-x-1.5 text-xs text-slate-500 mt-0.5">
                      <span className="capitalize">{l.category.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>{l.lot_size} meals/lot</span>
                    </div>
                  </div>

                  <FeasibilityBadge
                    badge={l.feasibility_badge}
                    slackMinutes={l.journey_slack_minutes}
                  />
                </div>

                {/* Spoilage Countdown */}
                <div className="my-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500 mb-1 flex items-center justify-between">
                    <span>Perishable Deadline</span>
                    <Clock className="w-3 h-3 text-slate-400" />
                  </div>
                  <SpoilageCountdown safeDeadline={l.safe_deadline} />
                </div>

                <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100 text-xs space-y-1 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Available:</span>
                    <span className="font-bold text-purple-900">
                      {l.available_lots} lots ({l.available_lots * l.lot_size} meals)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Delivery Mode:</span>
                    <span className="capitalize text-slate-800 font-medium">
                      {l.delivery_mode_offered.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              <button
                disabled={l.available_lots <= 0 || l.feasibility_badge === 'infeasible'}
                onClick={() => {
                  setSelectedListing(l)
                  setRequestedLots(1)
                  setRequestError(null)
                  setRequestSuccess(null)
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-colors ${
                  l.available_lots > 0 && l.feasibility_badge !== 'infeasible'
                    ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {l.available_lots <= 0
                  ? 'Exhausted'
                  : l.feasibility_badge === 'infeasible'
                  ? 'Infeasible (Deadline Miss)'
                  : 'Request Food Lots'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* My Requests & Active Jobs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* My Requests List */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center space-x-2">
            <Utensils className="w-5 h-5 text-purple-600" />
            <span>My Claimed Requests ({myRequests.length})</span>
          </h2>

          {myRequests.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No donation requests yet.</p>
          ) : (
            <div className="space-y-3">
              {myRequests.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-800">
                      Request #{r.id}: {r.listing_name || `Listing #${r.listing_id}`}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Claimed: {r.allocated_lots > 0 ? r.allocated_lots : r.requested_lots} lots •{' '}
                      <span className="capitalize font-semibold text-purple-700">{r.status}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {r.status === 'completed' && (
                      <button
                        onClick={() => {
                          setReportingReq(r)
                          setReportData({
                            reported_distributed_lots: r.allocated_lots,
                            people_served: r.allocated_lots * 10,
                            photo_url: '',
                            notes: '',
                          })
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      >
                        Submit Report
                      </button>
                    )}

                    {['reserved', 'pending'].includes(r.status) && (
                      <button
                        onClick={() => handleCancelRequest(r.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Handover & OTP Verification */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <Truck className="w-5 h-5 text-blue-600" />
              <span>Active Delivery Jobs & OTP Handover</span>
            </h2>
            <SimulatedBadge />
          </div>

          {activeJobs.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No active delivery jobs scheduled.</p>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((j) => (
                <div
                  key={j.id}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-800">
                      Job #{j.id} • Status: <span className="capitalize text-blue-600">{j.status}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Requests in job: {j.request_ids.join(', ')} • Route stops:{' '}
                      {j.route?.stops ? j.route.stops.length : 0}
                    </div>
                  </div>

                  {j.status !== 'delivered' && (
                    <button
                      onClick={() => {
                        setSelectedJob(j)
                        setOtpCode('')
                        setOtpError(null)
                      }}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Confirm Receipt (OTP)</span>
                    </button>
                  )}

                  {j.status === 'delivered' && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                      Delivered ✓
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Request Lots Modal */}
      {selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Request Food Lots</h3>
            <p className="text-sm text-slate-500 mb-4">
              Reserves food atomically from <span className="font-semibold text-slate-800">{selectedListing.name}</span>.
            </p>

            {requestSuccess && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{requestSuccess}</span>
              </div>
            )}

            {requestError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 text-rose-800 text-xs font-medium border border-rose-200 flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{requestError}</span>
              </div>
            )}

            <form onSubmit={handleSendRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Lots to Request (Max available: {selectedListing.available_lots})
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedListing.available_lots}
                  required
                  value={requestedLots}
                  onChange={(e) => setRequestedLots(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  Total meals: {requestedLots * selectedListing.lot_size} meals
                </span>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedListing(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="px-6 py-2 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50"
                >
                  {submittingRequest ? 'Reserving...' : 'Confirm Reservation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OTP Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delivery Handover</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter the 6-digit confirmation OTP provided by the delivery partner to confirm safe food handover.
            </p>

            {otpError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 text-rose-800 text-xs font-medium border border-rose-200">
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  6-Digit OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="e.g. 849201"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full text-center tracking-widest text-lg font-mono font-bold px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirmingOtp || otpCode.length !== 6}
                  className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {confirmingOtp ? 'Verifying...' : 'Verify & Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Utilisation Report Modal */}
      {reportingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Post-Delivery Utilisation</h3>
            <p className="text-xs text-slate-500 mb-4">
              Document how many people were served with the rescued food lots.
            </p>

            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Distributed Lots
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={reportData.reported_distributed_lots}
                    onChange={(e) =>
                      setReportData({ ...reportData, reported_distributed_lots: Number(e.target.value) })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    People Served
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={reportData.people_served}
                    onChange={(e) =>
                      setReportData({ ...reportData, people_served: Number(e.target.value) })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Feedback & Field Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Served hot dinner to 80 children at shelter."
                  value={reportData.notes}
                  onChange={(e) => setReportData({ ...reportData, notes: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReportingReq(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="px-6 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
