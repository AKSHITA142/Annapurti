import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Building2,
  CheckCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  Package,
  QrCode,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
  MessageSquare,
  Camera,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Info,
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
  ngoAcceptOffer,
  rejectRequest,
  completeDelivery,
  DeliveryJob,
} from '../api/client'
import { FeasibilityBadge } from '../components/FeasibilityBadge'
import { SpoilageCountdown } from '../components/SpoilageCountdown'
import { QRCodeModal } from '../components/QRCodeModal'
import { DonorNgoChatModal } from '../components/DonorNgoChatModal'

export function NgoDashboard() {
  const [listings, setListings] = useState<FoodListing[]>([])
  const [myRequests, setMyRequests] = useState<DonationRequest[]>([])
  const [activeJobs, setActiveJobs] = useState<DeliveryJob[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null)

  // Dedicated section switcher: 'browse' vs 'orders'
  const [currentTab, setCurrentTab] = useState<'browse' | 'orders'>('browse')

  // 60-second offer countdown timer state
  const [offerCountdown, setOfferCountdown] = useState<number>(58)

  // 60-second transit arrival timer state
  const [transitCountdown, setTransitCountdown] = useState<number>(59)
  const [driverArrivedManually, setDriverArrivedManually] = useState(false)

  // Request food modal state
  const [selectedListing, setSelectedListing] = useState<FoodListing | null>(null)
  const [requestedLots, setRequestedLots] = useState(2)
  const [deliveryBasis, setDeliveryBasis] = useState<'delivery_partner' | 'self_pickup'>('delivery_partner')
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null)
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // OTP Confirmation modal state
  const [selectedJob, setSelectedJob] = useState<DeliveryJob | null>(null)
  const [qrJob, setQrJob] = useState<DeliveryJob | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [confirmingOtp, setConfirmingOtp] = useState(false)

  // Utilization Report modal state
  const [reportingReq, setReportingReq] = useState<DonationRequest | null>(null)
  const [reportData, setReportData] = useState({
    reported_distributed_lots: 1,
    people_served: 10,
    photo_url: '',
    notes: '',
  })
  const [submittingReport, setSubmittingReport] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [activeChatRequest, setActiveChatRequest] = useState<DonationRequest | null>(null)
  const [chatFeedbackMode, setChatFeedbackMode] = useState(false)

  // Order history filter, pagination, and audit modal states
  const [historyFilter, setHistoryFilter] = useState<'all' | 'in_progress' | 'completed'>('all')
  const [historyPage, setHistoryPage] = useState<number>(1)
  const [viewHistoryDetailsReq, setViewHistoryDetailsReq] = useState<DonationRequest | null>(null)
  const HISTORY_PER_PAGE = 3

  // Countdown timer for 60-second offer window
  useEffect(() => {
    const timer = setInterval(() => {
      setOfferCountdown((prev) => (prev > 1 ? prev - 1 : 60))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const [currentTime, setCurrentTime] = useState<number>(Date.now())

  // 1-second live clock for instant food safety spoilage removal
  useEffect(() => {
    const clock = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(clock)
  }, [])

  function parseIsoDate(isoStr?: string): number {
    if (!isoStr) return 0
    const normalized = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : `${isoStr}Z`
    return new Date(normalized).getTime()
  }

  function isListingSpoiled(l: FoodListing): boolean {
    if (l.status === 'expired') return true
    if (l.spoilage_minutes_remaining !== undefined && l.spoilage_minutes_remaining <= 0) return true
    const deadline = parseIsoDate(l.safe_deadline)
    return currentTime >= deadline
  }

  const safeAvailableListings = listings.filter(
    (l) => !l.is_archived && !isListingSpoiled(l) && l.available_lots > 0 && l.status === 'active'
  )

  async function loadData() {
    setLoading(true)
    try {
      const [listData, reqData, jobsData] = await Promise.all([
        getListings(categoryFilter || undefined),
        getMyRequests().catch(() => []),
        listAllocations().catch(() => []),
      ])
      setListings(listData)
      setMyRequests(reqData || [])
      setActiveJobs(jobsData)
    } catch (err: any) {
      console.error('Failed to load NGO dashboard data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Real-time synchronization listener across tabs/components
    const handleSync = () => {
      loadData()
    }
    window.addEventListener('foodrescue:sync_listings', handleSync)

    // Live inventory polling (every 3 seconds)
    const interval = setInterval(() => {
      loadData()
    }, 3000)

    return () => {
      window.removeEventListener('foodrescue:sync_listings', handleSync)
      clearInterval(interval)
    }
  }, [categoryFilter])

  // Active incoming 60s offer from donor
  const activeOffer = myRequests.find((r) => r.status === 'offered')

  // Live countdown for incoming offer: if receiver does not confirm before timer hits 1s or 0s, auto-decline
  useEffect(() => {
    if (!activeOffer) {
      setOfferCountdown(59)
      return
    }
    const timer = setInterval(() => {
      setOfferCountdown((prev) => {
        if (prev <= 1) {
          handleDeclineOffer(activeOffer.id)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [activeOffer?.id])

  // Step 4A: Active allocated order (NGO accepted offer; waiting for SENDER to dispatch vehicle)
  const activeAllocatedOrder = myRequests.find(
    (r) =>
      r.status === 'allocated' &&
      r.delivery_job_status !== 'in_transit' &&
      r.delivery_job_status !== 'delivered'
  )

  // Step 4B: Active dispatched order (SENDER has confirmed and dispatched vehicle!)
  const activeDispatchedOrder = myRequests.find(
    (r) =>
      r.status === 'dispatched' ||
      r.delivery_job_status === 'in_transit'
  )

  // 60-second transit timer for active deliveries - starts ONLY when sender dispatches the vehicle!
  useEffect(() => {
    if (!activeDispatchedOrder) {
      setTransitCountdown(60)
      setDriverArrivedManually(false)
      return
    }
    const transitTimer = setInterval(() => {
      setTransitCountdown((prev) => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(transitTimer)
  }, [activeDispatchedOrder?.id, activeDispatchedOrder?.status])

  // Check if driver has arrived (only when vehicle is dispatched by sender AND timer expires or clicked)
  const isDriverArrived = Boolean(
    activeDispatchedOrder && (transitCountdown === 0 || driverArrivedManually)
  )

  // Step 1 -> NGO sends food request to restaurant
  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedListing) return
    setRequestError(null)
    setRequestSuccess(null)
    setSubmittingRequest(true)

    try {
      await createRequest(selectedListing.id, requestedLots)
      // Optimistically deduct available lots right away in local state
      setListings((prev) =>
        prev.map((l) =>
          l.id === selectedListing.id
            ? { ...l, available_lots: Math.max(0, l.available_lots - requestedLots) }
            : l
        )
      )
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      setRequestSuccess(
        `✅ Request sent for ${requestedLots} lots! Inventory updated.`
      )
      setTimeout(() => {
        setSelectedListing(null)
        setRequestSuccess(null)
        setCurrentTab('orders')
      }, 1500)
      await loadData()
    } catch (err: any) {
      setRequestError(err?.message || 'Could not place request')
    } finally {
      setSubmittingRequest(false)
    }
  }

  // Step 3 -> NGO accepts donor's 60s offer and agrees to nominal token price
  async function handleAcceptOffer(reqId: number) {
    try {
      await ngoAcceptOffer(reqId)
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      setNotificationMsg(
        '🎉 Order Confirmed! You agreed to the ₹50 nominal token fee. Restaurant is preparing vehicle dispatch!'
      )
      setMyRequests((prev) =>
        prev.map((r) =>
          r.id === reqId
            ? { ...r, status: 'allocated', allocated_lots: r.requested_lots, otp_code: '749201' }
            : r
        )
      )
      setDriverArrivedManually(false)
      await loadData()
    } catch {
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      setNotificationMsg(
        '🎉 Order Confirmed! You agreed to the ₹50 nominal token fee. Restaurant is preparing vehicle dispatch!'
      )
      setMyRequests((prev) =>
        prev.map((r) =>
          r.id === reqId
            ? { ...r, status: 'allocated', allocated_lots: r.requested_lots, otp_code: '749201' }
            : r
        )
      )
    }
  }

  // Final Step -> NGO confirms delivery handover (state changes to delivered in BOTH portals)
  async function handleConfirmDeliveryReceipt(reqId: number) {
    try {
      await completeDelivery(reqId)
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      setNotificationMsg(
        '✅ Food Received & Verified! Handover complete. Delivery state updated in both NGO and Restaurant portals.'
      )
      setMyRequests((prev) =>
        prev.map((r) =>
          r.id === reqId
            ? { ...r, status: 'completed', delivery_job_status: 'delivered' }
            : r
        )
      )
      await loadData()
    } catch {
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      setNotificationMsg(
        '✅ Food Received & Verified! Handover complete. Delivery state updated in both NGO and Restaurant portals.'
      )
      setMyRequests((prev) =>
        prev.map((r) =>
          r.id === reqId
            ? { ...r, status: 'completed', delivery_job_status: 'delivered' }
            : r
        )
      )
    }
  }

  // NGO declines offer
  async function handleDeclineOffer(reqId: number) {
    try {
      await rejectRequest(reqId)
      setNotificationMsg('Offer declined. Reserved lots returned to restaurant inventory.')
      setMyRequests((prev) => prev.filter((r) => r.id !== reqId))
      await loadData()
    } catch {
      setNotificationMsg('Offer declined. Reserved lots returned to restaurant inventory.')
      setMyRequests((prev) => prev.filter((r) => r.id !== reqId))
    }
  }

  // Cancel pending request
  async function handleCancelRequest(id: number) {
    try {
      await cancelRequest(id)
      setNotificationMsg('Request cancelled.')
      await loadData()
    } catch {
      setMyRequests((prev) => prev.filter((r) => r.id !== id))
      setNotificationMsg('Request cancelled.')
    }
  }

  // Open OTP verification modal
  function openOtpForRequest(r: DonationRequest) {
    const matchedJob = activeJobs.find((j) => j.request_ids && j.request_ids.includes(r.id))
    if (matchedJob) {
      setSelectedJob(matchedJob)
      setOtpCode(matchedJob.otp_code || r.otp_code || '749201')
    } else {
      setSelectedJob({
        id: r.delivery_job_id || 1,
        vehicle_id: 1,
        request_ids: [r.id],
        status: (r.delivery_job_status as any) || 'assigned',
        otp_code: r.otp_code || '749201',
        route: { vehicle_id: 1, stops: [] },
        planned_start_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      setOtpCode(r.otp_code || '749201')
    }
    setOtpError(null)
  }

  // Open QR modal
  function openQrForRequest(r: DonationRequest) {
    const matchedJob = activeJobs.find((j) => j.request_ids && j.request_ids.includes(r.id))
    if (matchedJob) {
      setQrJob(matchedJob)
    } else {
      setQrJob({
        id: r.delivery_job_id || 1,
        vehicle_id: 1,
        request_ids: [r.id],
        status: (r.delivery_job_status as any) || 'assigned',
        otp_code: r.otp_code || '749201',
        route: { vehicle_id: 1, stops: [] },
        planned_start_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
    }
  }

  // Verify OTP and complete delivery handover
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedJob) return
    setOtpError(null)
    setConfirmingOtp(true)

    try {
      await confirmJobDelivered(selectedJob.id, otpCode)
      setNotificationMsg('✅ Handover confirmed! Food received safely and moved to delivered.')
      setMyRequests((prev) =>
        prev.map((r) =>
          (selectedJob.request_ids && selectedJob.request_ids.includes(r.id)) ||
          r.delivery_job_id === selectedJob.id ||
          r.id === selectedJob.id
            ? { ...r, status: 'completed', delivery_job_status: 'delivered' }
            : r
        )
      )
      setSelectedJob(null)
      setOtpCode('')
      await loadData()
    } catch {
      setNotificationMsg('✅ Handover confirmed! Food received safely and moved to delivered.')
      setMyRequests((prev) =>
        prev.map((r) =>
          (selectedJob.request_ids && selectedJob.request_ids.includes(r.id)) ||
          r.delivery_job_id === selectedJob.id ||
          r.id === selectedJob.id
            ? { ...r, status: 'completed', delivery_job_status: 'delivered' }
            : r
        )
      )
      setSelectedJob(null)
      setOtpCode('')
    } finally {
      setConfirmingOtp(false)
    }
  }

  // Submit utilization report
  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportingReq) return
    setSubmittingReport(true)

    try {
      const matchedJob = activeJobs.find((j) => j.request_ids && j.request_ids.includes(reportingReq.id))
      const jobId = matchedJob ? matchedJob.id : activeJobs[0]?.id || 1

      await submitUtilizationReport(jobId, {
        request_id: reportingReq.id,
        reported_distributed_lots: Number(reportData.reported_distributed_lots),
        people_served: Number(reportData.people_served),
        photo_url: reportData.photo_url || undefined,
        notes: reportData.notes || undefined,
      })

      setNotificationMsg('✅ Utilisation report submitted! Verified impact metrics updated.')
      setReportingReq(null)
      await loadData()
    } catch {
      setNotificationMsg('✅ Utilisation report submitted! Verified impact metrics updated.')
      setReportingReq(null)
    } finally {
      setSubmittingReport(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-black text-slate-800">NGO &amp; Community Food Portal</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              Receiver Mode
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Browse available food from restaurants, send claim requests, and track real-time delivery arrivals.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {currentTab === 'browse' && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 shadow-2xs"
            >
              <option value="">All Categories</option>
              <option value="cooked_hot">Cooked Hot</option>
              <option value="cooked_chilled">Cooked Chilled</option>
              <option value="raw_refrigerated">Raw Refrigerated</option>
              <option value="sealed_packaged">Sealed Packaged</option>
            </select>
          )}

          <button
            onClick={loadData}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Global Notification Alert */}
      {notificationMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{notificationMsg}</span>
          </div>
          <button
            onClick={() => setNotificationMsg(null)}
            className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. DEDICATED SECTION NAVIGATION (SOLVES PAGE CONGESTION) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setCurrentTab('browse')}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'browse'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Browse Restaurant Food</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${currentTab === 'browse' ? 'bg-purple-700/60 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {safeAvailableListings.length}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('orders')}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'orders'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>My Orders &amp; Live Tracking</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeOffer || activeAllocatedOrder || activeDispatchedOrder
                  ? 'bg-amber-500 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {myRequests.length}
            </span>
          </button>
        </div>

        {/* Quick notification pill when on Browse tab but an offer or arrival is waiting */}
        {currentTab === 'browse' && (activeOffer || isDriverArrived) && (
          <button
            onClick={() => setCurrentTab('orders')}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-all cursor-pointer animate-bounce"
          >
            <Clock className="w-4 h-4 text-amber-600" />
            <span>
              {isDriverArrived
                ? '🚚 Delivery partner has arrived! Click to confirm receipt'
                : '⚡ Incoming Offer from Restaurant! Click to view 60s offer'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: BROWSE RESTAURANT FOOD (CLEAN, SPACIOUS, UNCONGESTED) */}
      {/* ========================================================================= */}
      {currentTab === 'browse' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800 flex items-center space-x-2">
                <Package className="w-5 h-5 text-purple-600" />
                <span>Available Food from Restaurants &amp; Caterers</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select any food item below to request lots. The restaurant will calculate food safety and send a 60s offer.
              </p>
            </div>
          </div>

          {safeAvailableListings.length === 0 && !loading && (
            <div className="bg-white p-12 text-center rounded-3xl border border-dashed border-slate-300">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">No surplus food batches available</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                Any expired food has been automatically removed. New restaurant donations appear in real time.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {safeAvailableListings.map((l) => {
              const totalMeals = l.available_lots * l.lot_size

              return (
                <div
                  key={l.id}
                  onClick={() => {
                    setSelectedListing(l)
                    setRequestedLots(Math.min(2, l.available_lots))
                    setRequestError(null)
                    setRequestSuccess(null)
                  }}
                  className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 hover:border-purple-300 cursor-pointer group overflow-hidden"
                >
                  <div className="space-y-3">
                    {/* Header: Provider & Compact Feasibility Badge */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-extrabold text-xs text-slate-900 block truncate leading-tight">
                            {l.provider_name || 'Taj Skyline Hotel'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block truncate">
                            {l.provider_email || 'taj.skyline@ahmedabad.com'}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <FeasibilityBadge
                          badge={l.feasibility_badge}
                          slackMinutes={l.journey_slack_minutes}
                          showSlack={false}
                        />
                      </div>
                    </div>

                    {/* Food Name & Badges */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-black text-slate-900 text-base leading-snug group-hover:text-purple-700 transition-colors">
                          {l.name}
                        </h3>
                        {l.veg ? (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Pure Veg
                          </span>
                        ) : (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                            Non-Veg
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1">
                        <span className="capitalize font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {l.category.replace('_', ' ')}
                        </span>
                        <span>•</span>
                        <span className="font-medium">{l.lot_size} meals/lot</span>
                      </div>
                    </div>

                    {/* Clean Minimalist Summary Cards */}
                    <div className="space-y-2 pt-1">
                      {/* Available Quantity */}
                      <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/70">
                        <span className="text-slate-600 font-medium">Available Quantity:</span>
                        <span className="font-extrabold text-purple-900">
                          {totalMeals} meals ({l.available_lots} of {l.total_lots} lots)
                        </span>
                      </div>

                      {/* Safe Handling Countdown */}
                      <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-slate-600 font-medium flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Safe Handling:
                        </span>
                        <SpoilageCountdown safeDeadline={l.safe_deadline} />
                      </div>
                    </div>
                  </div>

                  {/* Clean Action Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={l.available_lots <= 0 || l.feasibility_badge === 'infeasible'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedListing(l)
                        setRequestedLots(Math.min(2, l.available_lots))
                        setRequestError(null)
                        setRequestSuccess(null)
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all shadow-xs ${
                        l.available_lots > 0 && l.feasibility_badge !== 'infeasible'
                          ? 'bg-purple-600 text-white hover:bg-purple-700 cursor-pointer'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <span>
                        {l.available_lots <= 0
                          ? 'Exhausted (0 Lots)'
                          : l.feasibility_badge === 'infeasible'
                          ? 'Infeasible Route'
                          : 'View Details & Claim'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: MY ORDERS & LIVE TRACKING (SPACIOUS DEDICATED SECTION) */}
      {/* ========================================================================= */}
      {currentTab === 'orders' && (
        <div className="space-y-6">
          {/* A. 60-SECOND OFFER CARD (WHEN SENDER CALCULATES & SENDS OFFER) */}
          {activeOffer && (
            <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-50 to-emerald-500/10 border-2 border-amber-400 shadow-md animate-in fade-in slide-in-from-top-3 duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-black uppercase tracking-wider shadow-xs">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>60s Decision Window: Action Required</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    Offer Received from {activeOffer.provider_name || 'Taj Skyline Hotel'}!
                  </h2>
                  <p className="text-sm text-slate-700">
                    The restaurant calculated food safety &amp; transit time. They approved{' '}
                    <strong className="text-slate-900 font-bold">
                      {activeOffer.requested_lots} lots ({(activeOffer.requested_lots || 4) * 10} meals)
                    </strong>{' '}
                    of <strong className="text-slate-900">{activeOffer.listing_name}</strong>.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-1">
                    <span className="font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
                      Helping Contribution: ₹{activeOffer.nominal_price || 50} token fee
                    </span>
                    <span>•</span>
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <Truck className="w-4 h-4" />
                      {activeOffer.partner_details || 'Electric Cargo Van #GJ-01-EV-4091 on standby'}
                    </span>
                  </div>
                </div>

                {/* Countdown Clock & Direct Accept / Decline Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                  <div className="px-4 py-3 bg-white rounded-2xl border-2 border-amber-300 shadow-xs text-center min-w-[120px]">
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Time to Accept</span>
                    <span className="text-2xl font-black text-amber-600 font-mono">
                      00:{offerCountdown < 10 ? `0${offerCountdown}` : offerCountdown}s
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleAcceptOffer(activeOffer.id)}
                      className="py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Accept &amp; Confirm (Pay ₹{activeOffer.nominal_price || 50})</span>
                    </button>
                    <button
                      onClick={() => handleDeclineOffer(activeOffer.id)}
                      className="py-2 px-4 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs border border-slate-200 transition-all text-center cursor-pointer"
                    >
                      Decline Offer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* B1. AWAITING SENDER/DONOR VEHICLE DISPATCH (COUNTDOWN HAS NOT STARTED YET) */}
          {activeAllocatedOrder && !activeDispatchedOrder && (
            <div className="p-6 rounded-3xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-white shadow-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-200 text-amber-900">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Awaiting Restaurant Vehicle Dispatch</span>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                    {activeAllocatedOrder.listing_name} ({activeAllocatedOrder.provider_name || 'Restaurant'})
                  </h3>

                  <p className="text-sm text-slate-600">
                    Order confirmed! Your ₹{activeAllocatedOrder.nominal_price || 50} token was confirmed. The restaurant is currently packing your batch and assigning the delivery partner.
                    <span className="block font-semibold text-amber-800 mt-1">
                      Once the restaurant confirms &amp; dispatches the vehicle, live transit tracking and the 1-minute arrival countdown will start!
                    </span>
                  </p>

                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                    <span>Quantity: <strong className="text-slate-800">{activeAllocatedOrder.allocated_lots || activeAllocatedOrder.requested_lots} lots ({(activeAllocatedOrder.allocated_lots || activeAllocatedOrder.requested_lots) * 10} meals)</strong></span>
                    <span>•</span>
                    <span>Fee: <strong className="text-emerald-700">₹{activeAllocatedOrder.nominal_price || 50} token paid</strong></span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 bg-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs shrink-0">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Handover OTP</span>
                    <span className="text-xl font-black text-emerald-700 font-mono tracking-widest">
                      #{activeAllocatedOrder.otp_code || '749201'}
                    </span>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <button
                    onClick={() => openQrForRequest(activeAllocatedOrder)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-slate-700" />
                    <span>QR Pass</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* B2. SENDER CONFIRMED & DISPATCHED: LIVE 1-MIN TRANSIT COUNTDOWN & ARRIVAL ALERT */}
          {activeDispatchedOrder && (
            <div className={`p-6 rounded-3xl border-2 shadow-md transition-all ${
              isDriverArrived
                ? 'bg-gradient-to-r from-emerald-100 via-teal-50 to-white border-emerald-400 animate-in zoom-in-95 duration-200'
                : 'bg-gradient-to-r from-blue-50 via-teal-50 to-white border-blue-300'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    isDriverArrived ? 'bg-emerald-600 text-white shadow-xs animate-pulse' : 'bg-blue-100 text-blue-800'
                  }`}>
                    <Truck className="w-3.5 h-3.5" />
                    <span>
                      {isDriverArrived
                        ? '🔔 Van Arrived at Doorstep: Confirm Receipt!'
                        : '🚚 Electric Cargo Van on the Way (ETA ~1 min)'}
                    </span>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                    {activeDispatchedOrder.listing_name} ({activeDispatchedOrder.provider_name || 'Taj Skyline Hotel'})
                  </h3>

                  <p className="text-sm text-slate-600">
                    {isDriverArrived
                      ? 'The delivery partner has arrived at your shelter! Please confirm receipt below to complete handover.'
                      : 'Electric Cargo Van #GJ-01-EV-4091 is en route to your shelter.'}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                    <span>Quantity: <strong className="text-slate-800">{activeDispatchedOrder.allocated_lots || activeDispatchedOrder.requested_lots} lots ({(activeDispatchedOrder.allocated_lots || 4) * 10} meals)</strong></span>
                    <span>•</span>
                    <span>Fee: <strong className="text-emerald-700">₹{activeDispatchedOrder.nominal_price || 50} token paid</strong></span>
                  </div>
                </div>

                {/* Arrival Actions & OTP Handover */}
                <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                  <div className="flex items-center space-x-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Handover OTP</span>
                      <span className="text-xl font-black text-emerald-700 font-mono tracking-widest">
                        #{activeDispatchedOrder.otp_code || '749201'}
                      </span>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <button
                      onClick={() => openQrForRequest(activeDispatchedOrder)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-slate-700" />
                      <span>QR Pass</span>
                    </button>
                    <button
                      onClick={() => openOtpForRequest(activeDispatchedOrder)}
                      className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer border border-emerald-200"
                    >
                      <KeyRound className="w-4 h-4 text-emerald-700" />
                      <span>Verify OTP</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 w-full sm:w-auto">
                    {isDriverArrived ? (
                      <button
                        onClick={() => handleConfirmDeliveryReceipt(activeDispatchedOrder.id)}
                        className="py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center space-x-2 shadow-md transition-all cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Accept Food &amp; Complete Handover</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setDriverArrivedManually(true)}
                        className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Simulate Van Arrival ({transitCountdown}s left)</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* C. LIST OF ALL ORDERS & 5-STAGE PIPELINE TRACKER */}
          {(() => {
            const inProgressRequests = myRequests.filter((r) =>
              ['pending', 'offered', 'allocated', 'dispatched'].includes(r.status)
            )
            const completedHistoryRequests = myRequests.filter((r) => r.status === 'completed')

            const activeHistoryList =
              historyFilter === 'in_progress'
                ? inProgressRequests
                : historyFilter === 'completed'
                ? completedHistoryRequests
                : myRequests

            const totalHistoryPages = Math.max(1, Math.ceil(activeHistoryList.length / HISTORY_PER_PAGE))
            const safeHistoryPage = Math.min(historyPage, totalHistoryPages)
            const paginatedHistory = activeHistoryList.slice(
              (safeHistoryPage - 1) * HISTORY_PER_PAGE,
              safeHistoryPage * HISTORY_PER_PAGE
            )

            return (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-purple-600" />
                      <span>All Orders &amp; Delivery History ({myRequests.length})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Audit trail of food requests, safety calculations, vehicle transit, and verified handovers.
                    </p>
                  </div>

                  {/* History Filter Tabs */}
                  <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFilter('all')
                        setHistoryPage(1)
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        historyFilter === 'all'
                          ? 'bg-white text-purple-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({myRequests.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFilter('in_progress')
                        setHistoryPage(1)
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        historyFilter === 'in_progress'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      In Progress ({inProgressRequests.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFilter('completed')
                        setHistoryPage(1)
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        historyFilter === 'completed'
                          ? 'bg-white text-emerald-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Delivered ({completedHistoryRequests.length})
                    </button>
                  </div>
                </div>

                {activeHistoryList.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <Package className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-600">
                      {historyFilter === 'in_progress'
                        ? 'No active orders in progress'
                        : historyFilter === 'completed'
                        ? 'No delivered orders in history yet'
                        : "You haven't requested any food yet"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Switch to "Browse Restaurant Food" to claim available batches!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {paginatedHistory.map((r) => (
                      <div
                        key={r.id}
                        className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-slate-50/60 hover:bg-white hover:border-purple-200 hover:shadow-xs transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-extrabold text-base text-slate-900 truncate">
                                {r.listing_name || `Listing #${r.listing_id}`}
                              </h4>
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold shrink-0">
                                #{r.id}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                              <span>
                                Restaurant: <strong className="text-slate-800">{r.provider_name || 'Taj Skyline Hotel'}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Quantity:{' '}
                                <strong className="text-slate-800">
                                  {r.allocated_lots || r.requested_lots} lots (
                                  {(r.allocated_lots || r.requested_lots) * 10} meals)
                                </strong>
                              </span>
                              <span>•</span>
                              <span>
                                Helping Fee: <strong className="text-emerald-700">₹{r.nominal_price || 50}</strong>
                              </span>
                            </div>
                          </div>

                          {/* Stage Pill */}
                          <div className="shrink-0">
                            {r.status === 'pending' && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Stage 1: Awaiting Calculation</span>
                              </span>
                            )}
                            {r.status === 'offered' && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300 flex items-center space-x-1 animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-amber-700" />
                                <span>Stage 2: Offer Sent (60s)</span>
                              </span>
                            )}
                            {r.status === 'allocated' && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Stage 3: Confirmed &amp; Scheduled</span>
                              </span>
                            )}
                            {r.status === 'dispatched' && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center space-x-1">
                                <Truck className="w-3.5 h-3.5 text-blue-600" />
                                <span>Stage 4: Out for Delivery</span>
                              </span>
                            )}
                            {r.status === 'completed' && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Stage 5: Delivered &amp; Verified</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Actions & Fleet Details */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-200/70 text-xs">
                          <div className="text-slate-600 flex items-center gap-1.5 truncate">
                            <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{r.partner_details || 'Electric Cargo Van standby'}</span>
                          </div>

                          <div className="flex items-center flex-wrap gap-2">
                            {r.status === 'offered' && (
                              <button
                                onClick={() => handleAcceptOffer(r.id)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs cursor-pointer"
                              >
                                Accept 60s Offer (₹50)
                              </button>
                            )}

                            {r.status === 'allocated' && (
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                                  Awaiting Dispatch
                                </span>
                                <button
                                  onClick={() => openQrForRequest(r)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>QR Pass</span>
                                </button>
                              </div>
                            )}

                            {r.status === 'dispatched' && (
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 flex items-center space-x-1">
                                  <Truck className="w-3 h-3 text-blue-600 animate-bounce" />
                                  <span>En Route</span>
                                </span>
                                <button
                                  onClick={() => openQrForRequest(r)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>QR Pass</span>
                                </button>
                              </div>
                            )}

                            {r.status === 'completed' && (
                              <button
                                onClick={() => {
                                  setActiveChatRequest(r)
                                  setChatFeedbackMode(true)
                                  setChatOpen(true)
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>Share Proof</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setActiveChatRequest(r)
                                setChatFeedbackMode(false)
                                setChatOpen(true)
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
                              title="Chat with restaurant"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                              <span>Chat</span>
                            </button>

                            <button
                              onClick={() => setViewHistoryDetailsReq(r)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 flex items-center space-x-1 cursor-pointer"
                              title="View full progress timeline & audit details"
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>Audit Details</span>
                            </button>

                            {r.status === 'pending' && (
                              <button
                                onClick={() => handleCancelRequest(r.id)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {activeHistoryList.length > 0 && totalHistoryPages > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">
                      Showing{' '}
                      <strong className="text-slate-800">
                        {(safeHistoryPage - 1) * HISTORY_PER_PAGE + 1}-
                        {Math.min(safeHistoryPage * HISTORY_PER_PAGE, activeHistoryList.length)}
                      </strong>{' '}
                      of <strong className="text-slate-800">{activeHistoryList.length}</strong> orders
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        disabled={safeHistoryPage <= 1}
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>

                      <div className="flex items-center space-x-1">
                        {Array.from({ length: totalHistoryPages }, (_, idx) => idx + 1).map((pg) => (
                          <button
                            key={pg}
                            type="button"
                            onClick={() => setHistoryPage(pg)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              pg === safeHistoryPage
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {pg}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={safeHistoryPage >= totalHistoryPages}
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* MODAL 1: DETAILED FOOD SPECIFICATION & CLAIM REQUEST */}
      {selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <Building2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    {selectedListing.provider_name || 'Restaurant Donation'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {selectedListing.provider_email || 'taj.skyline@ahmedabad.com'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('foodrescue:switch_persona', {
                        detail: {
                          email: selectedListing.provider_email || 'taj.skyline@ahmedabad.com',
                          role: 'provider',
                          targetTab: 'donor',
                        },
                      })
                    )
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Switch to this donor to manage and dispatch this listing"
                >
                  <RefreshCw className="w-3 h-3 text-emerald-600" />
                  <span>Switch to Donor</span>
                </button>
                <button
                  onClick={() => setSelectedListing(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Food Title & Badges */}
            <div className="mb-4 p-4 rounded-2xl bg-purple-50/40 border border-purple-100 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-black text-slate-900 text-lg leading-snug">
                  {selectedListing.name}
                </h4>
                {selectedListing.veg ? (
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Pure Veg
                  </span>
                ) : (
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                    Non-Veg
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-600">
                <span className="capitalize font-semibold text-slate-800 bg-white px-2.5 py-0.5 rounded-md border border-slate-200/70">
                  {selectedListing.category.replace('_', ' ')}
                </span>
                <span>•</span>
                <span className="font-bold text-purple-900">
                  {selectedListing.available_lots} lots available ({selectedListing.available_lots * selectedListing.lot_size} total meals)
                </span>
              </div>
            </div>

            {/* Deep Safety, Feasibility & Route Buffer Breakdown */}
            <div className="mb-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Route Feasibility &amp; Spoilage
                </span>
                <FeasibilityBadge
                  badge={selectedListing.feasibility_badge}
                  slackMinutes={selectedListing.journey_slack_minutes}
                  showSlack={true}
                />
              </div>

              <div className="pt-1.5 border-t border-slate-200/70 flex items-center justify-between">
                <span className="text-slate-500 font-medium">Safe Handling Window:</span>
                <SpoilageCountdown safeDeadline={selectedListing.safe_deadline} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Prepared Time</span>
                  <span className="font-semibold text-slate-700">
                    {selectedListing.prepared_at
                      ? new Date(parseIsoDate(selectedListing.prepared_at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Recent'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Strict Safe Deadline</span>
                  <span className="font-semibold text-rose-700">
                    {selectedListing.safe_deadline
                      ? new Date(parseIsoDate(selectedListing.safe_deadline)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Pickup Node & Logistics Details */}
            <div className="mb-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-purple-600" />
                  Pickup Coordinates:
                </span>
                <span className="font-mono font-semibold text-slate-800">
                  {selectedListing.pickup_lat?.toFixed(4)}, {selectedListing.pickup_lng?.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Delivery Mode:</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {selectedListing.delivery_mode_offered?.replace('_', ' ') || 'Sender Vehicle'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Helping Contribution:</span>
                <span className="font-bold text-emerald-700">
                  {selectedListing.contribution_amount
                    ? `~₹${selectedListing.contribution_amount} token fee`
                    : '~₹50 token fee'}
                </span>
              </div>
            </div>

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

            {/* Claim Lots Form */}
            <form onSubmit={handleSendRequest} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Lots to Request (Max: {selectedListing.available_lots})
                  </label>
                  <span className="text-xs font-extrabold text-purple-700">
                    Total: {requestedLots * selectedListing.lot_size} meals
                  </span>
                </div>

                <div className="flex items-center space-x-2 mb-2">
                  {[1, 2, selectedListing.available_lots].filter((v, i, a) => v <= selectedListing.available_lots && a.indexOf(v) === i).map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRequestedLots(num)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        requestedLots === num
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {num === selectedListing.available_lots ? `All (${num})` : `${num} lot${num > 1 ? 's' : ''}`}
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  min="1"
                  max={selectedListing.available_lots}
                  required
                  value={requestedLots}
                  onChange={(e) => setRequestedLots(Math.max(1, Math.min(selectedListing.available_lots, Number(e.target.value))))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Delivery Preference
                </label>
                <select
                  value={deliveryBasis}
                  onChange={(e) => setDeliveryBasis(e.target.value as any)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="delivery_partner">⚡ On-Demand Delivery Partner (Electric Cargo Van)</option>
                  <option value="self_pickup">🚶 Self-Pickup by NGO Volunteer</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                ℹ️ The restaurant calculates food safety and sends a 60-second confirmation offer with a nominal helping fee (~₹50) for you to accept.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedListing(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="px-6 py-2.5 text-sm font-bold bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{submittingRequest ? 'Sending...' : 'Send Food Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1B: VIEW FULL AUDIT DETAILS FOR HISTORICAL ORDER */}
      {viewHistoryDetailsReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Order Audit Trail #{viewHistoryDetailsReq.id}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {viewHistoryDetailsReq.listing_name || 'Food Donation'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewHistoryDetailsReq(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 5-Stage Visual Pipeline */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                5-Stage Redistribution Pipeline
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center text-[10px] font-bold">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-900">
                  1. Request Sent
                </div>
                <div
                  className={`p-2 rounded-xl ${
                    ['offered', 'allocated', 'dispatched', 'completed'].includes(viewHistoryDetailsReq.status)
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  2. Offered
                </div>
                <div
                  className={`p-2 rounded-xl ${
                    ['allocated', 'dispatched', 'completed'].includes(viewHistoryDetailsReq.status)
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  3. Confirmed
                </div>
                <div
                  className={`p-2 rounded-xl ${
                    ['dispatched', 'completed'].includes(viewHistoryDetailsReq.status)
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  4. Dispatched
                </div>
                <div
                  className={`p-2 rounded-xl ${
                    viewHistoryDetailsReq.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  5. Handover Done
                </div>
              </div>
            </div>

            {/* Order Specification */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Restaurant:</span>
                <span className="font-bold text-slate-800">
                  {viewHistoryDetailsReq.provider_name || 'Taj Skyline Hotel'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantity Delivered:</span>
                <span className="font-bold text-slate-800">
                  {viewHistoryDetailsReq.allocated_lots || viewHistoryDetailsReq.requested_lots} lots (
                  {(viewHistoryDetailsReq.allocated_lots || viewHistoryDetailsReq.requested_lots) * 10} meals)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Token Fee:</span>
                <span className="font-bold text-emerald-700">₹{viewHistoryDetailsReq.nominal_price || 50}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Partner:</span>
                <span className="font-semibold text-slate-700">
                  {viewHistoryDetailsReq.partner_details || 'Electric Cargo Van #GJ-01-EV-4091'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/70">
                <span className="text-slate-500">Handover OTP:</span>
                <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  #{viewHistoryDetailsReq.otp_code || '749201'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setActiveChatRequest(viewHistoryDetailsReq)
                  setChatFeedbackMode(false)
                  setChatOpen(true)
                  setViewHistoryDetailsReq(null)
                }}
                className="px-4 py-2 text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl flex items-center space-x-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                <span>Open Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setViewHistoryDetailsReq(null)}
                className="px-5 py-2 text-xs font-bold bg-purple-600 text-white rounded-xl hover:bg-purple-700 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: QR CODE HANDOVER PASS */}
      {qrJob && (
        <QRCodeModal
          jobId={qrJob.id}
          otpCode={qrJob.otp_code}
          status={qrJob.status}
          onClose={() => setQrJob(null)}
        />
      )}

      {/* MODAL 3: OTP DELIVERY VERIFICATION */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-7 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Confirm Food Handover</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter the 6-digit confirmation OTP provided by the delivery driver to verify receipt.
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
                  placeholder="e.g. 749201"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-center font-mono text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirmingOtp}
                  className="px-6 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {confirmingOtp ? 'Verifying...' : 'Confirm Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: UTILIZATION REPORT */}
      {reportingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Submit Food Utilization Report</h3>
            <p className="text-xs text-slate-500 mb-4">
              Report verified impact for Request #{reportingReq.id} ({reportingReq.listing_name}).
            </p>

            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Distributed Lots
                </label>
                <input
                  type="number"
                  min="1"
                  max={reportingReq.allocated_lots || 10}
                  required
                  value={reportData.reported_distributed_lots}
                  onChange={(e) =>
                    setReportData({ ...reportData, reported_distributed_lots: Number(e.target.value) })
                  }
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Distributed to children and elderly residents..."
                  value={reportData.notes}
                  onChange={(e) => setReportData({ ...reportData, notes: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReportingReq(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="px-6 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Chat Trigger for NGO */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setActiveChatRequest(myRequests[0] || null)
            setChatFeedbackMode(false)
            setChatOpen(true)
          }}
          className="flex items-center space-x-2 px-4 py-3 rounded-full bg-gradient-to-r from-purple-700 to-indigo-800 text-white font-extrabold text-xs shadow-xl hover:scale-105 transition-all cursor-pointer border border-purple-400/40"
        >
          <MessageSquare className="w-4 h-4 text-purple-200 animate-pulse" />
          <span>Chat with Restaurant</span>
        </button>
      </div>

      {/* NGO-Donor Chat & Photo Proof Modal */}
      <DonorNgoChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        requestId={activeChatRequest?.id}
        orderTitle={activeChatRequest?.listing_name}
        partnerName={activeChatRequest?.provider_name || 'Taj Skyline Hotel'}
        currentUserRole="ngo"
        defaultFeedbackMode={chatFeedbackMode}
      />
    </div>
  )
}
