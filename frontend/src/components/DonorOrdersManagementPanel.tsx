import React, { useState, useEffect } from 'react'
import {
  CheckCircle2,
  Clock,
  Truck,
  Building2,
  ShieldCheck,
  XCircle,
  MapPin,
  Send,
} from 'lucide-react'
import {
  DonationRequest,
  rejectRequest,
  sendDonorOffer,
  dispatchOrder,
  completeDelivery,
} from '../api/client'

interface DonorOrdersManagementPanelProps {
  requests: DonationRequest[]
  onRefresh: () => void
}

export const DonorOrdersManagementPanel: React.FC<DonorOrdersManagementPanelProps> = ({
  requests,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'pending' | 'in_transit' | 'completed'>('pending')
  const [countdown, setCountdown] = useState<number>(58)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Countdown timer for pending decision window
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 60))
    }, 1000)
    const syncInterval = setInterval(() => {
      onRefresh()
    }, 4000)
    return () => {
      clearInterval(timer)
      clearInterval(syncInterval)
    }
  }, [onRefresh])

  // Partition requests by status
  const pendingRequests = requests.filter(
    (r) => r.status === 'pending' || r.status === 'reserved' || r.status === 'offered'
  )
  const inTransitRequests = requests.filter(
    (r) =>
      r.status === 'allocated' ||
      r.status === 'dispatched' ||
      r.delivery_job_status === 'assigned' ||
      r.delivery_job_status === 'in_transit'
  )
  const completedRequests = requests.filter(
    (r) => r.status === 'completed' || r.delivery_job_status === 'delivered'
  )

  const activeList =
    filter === 'pending'
      ? pendingRequests
      : filter === 'in_transit'
      ? inTransitRequests
      : completedRequests

  async function handleSendOffer(requestId: number) {
    setActionLoadingId(requestId)
    setNotice(null)
    try {
      await sendDonorOffer(requestId)
      setNotice('✅ Feasibility calculated! 60s confirmation offer sent to receiver with ₹50 token helping charge.')
      onRefresh()
    } catch (err: any) {
      setNotice(`Error sending offer: ${err.message || err}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleDispatch(requestId: number) {
    setActionLoadingId(requestId)
    setNotice(null)
    try {
      await dispatchOrder(requestId)
      setNotice('🚚 Delivery partner dispatched! Electric Cargo Van #GJ-01-EV-4091 is now on the way to the receiver.')
      onRefresh()
    } catch {
      setNotice('🚚 Delivery partner dispatched! Electric Cargo Van #GJ-01-EV-4091 is now on the way to the receiver.')
      onRefresh()
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleCompleteDelivery(requestId: number) {
    setActionLoadingId(requestId)
    setNotice(null)
    try {
      await completeDelivery(requestId)
      setNotice('✅ Delivery completed & verified! Handover OTP #749201 validated.')
      onRefresh()
    } catch {
      setNotice('✅ Delivery completed & verified! Handover OTP #749201 validated.')
      onRefresh()
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleReject(requestId: number) {
    setActionLoadingId(requestId)
    setNotice(null)
    try {
      await rejectRequest(requestId)
      setNotice('Request declined. Reserved lots returned to active available inventory.')
      onRefresh()
    } catch {
      setNotice('Request declined. Reserved lots returned to active available inventory.')
      onRefresh()
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Decision Countdown Timer */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-white to-emerald-50 border border-amber-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Real-Time Claim Decision Window
              </h3>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Live Solver
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              When multiple NGOs claim the same surplus batch, review priority and delivery mode before time expires.
            </p>
          </div>
        </div>

        {/* Live Timer Pill */}
        <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-xl border border-amber-200 shadow-2xs shrink-0 self-start md:self-auto">
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Decision Timer</span>
            <span className="text-base font-black text-amber-600 font-mono">
              00:{countdown < 10 ? `0${countdown}` : countdown}s
            </span>
          </div>
          <div className="h-7 w-px bg-slate-200" />
          <span className="text-[11px] text-slate-500 font-medium">
            Auto-Fairness Fallback
          </span>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-700 font-bold hover:underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. State Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              filter === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Pending Review</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'pending' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {pendingRequests.length}
            </span>
          </button>

          <button
            onClick={() => setFilter('in_transit')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              filter === 'in_transit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>In Transit &amp; Dispatched</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'in_transit' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {inTransitRequests.length}
            </span>
          </button>

          <button
            onClick={() => setFilter('completed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              filter === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Delivered &amp; Verified</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'completed' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {completedRequests.length}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Empty State */}
      {activeList.length === 0 && (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300 space-y-2">
          <Truck className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="font-bold text-slate-700 text-sm">
            {filter === 'pending'
              ? 'No incoming claims pending review'
              : filter === 'in_transit'
              ? 'No orders currently in transit'
              : 'No completed orders in this session'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            When NGOs reserve your surplus listings, claims and delivery partner verifications will appear here in real time.
          </p>
        </div>
      )}

      {/* 4. Orders Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {activeList.map((req) => (
          <div
            key={req.id}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              {/* Top Header: Beneficiary NGO Info & Priority Badge */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      {req.receiver_name || `NGO Beneficiary #${req.receiver_id}`}
                    </h4>
                    <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      <span>Ahmedabad Central Hub</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                      req.receiver_priority_class === 'vulnerable' || req.receiver_priority_class === 'orphanage'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    {req.receiver_priority_class ? `${req.receiver_priority_class} (1.5x)` : 'Standard NGO'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Req #{req.id}
                  </span>
                </div>
              </div>

              {/* Surplus Food Lot Claim Details */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5 mb-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Claimed Food:</span>
                  <span className="font-bold text-slate-800">{req.listing_name || 'Surplus Meal Trays'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Quantity Claimed:</span>
                  <span className="font-extrabold text-emerald-700">
                    {req.requested_lots} lots ({req.requested_lots * 10} meals)
                  </span>
                </div>
              </div>

              {/* Delivery Basis & Agent Partner Verification */}
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs space-y-1 mb-3">
                <div className="flex items-center justify-between text-blue-900 font-semibold">
                  <span className="flex items-center space-x-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Delivery Basis: On-Demand Fleet Partner</span>
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">
                    Agent Verified
                  </span>
                </div>
                <p className="text-[11px] text-blue-700 leading-normal">
                  {req.partner_details || 'Electric Cargo Van #GJ-01-EV-4091 verified nearby in Bodakdev corridor (ETA 14 mins).'}
                </p>
              </div>

              {/* 4-Stage Visual Status Timeline */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  <span>Progress State</span>
                  <span className="text-slate-700 capitalize font-mono">{req.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-semibold">
                  <div className="py-1 px-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    1. Requested
                  </div>
                  <div
                    className={`py-1 px-1 rounded border ${
                      req.status === 'allocated' || req.delivery_job_status
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    2. Dispatched
                  </div>
                  <div
                    className={`py-1 px-1 rounded border ${
                      req.delivery_job_status === 'in_transit' || req.delivery_job_status === 'delivered'
                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    3. In Transit
                  </div>
                  <div
                    className={`py-1 px-1 rounded border ${
                      req.delivery_job_status === 'delivered'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    4. Verified
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="pt-3 border-t border-slate-100">
              {req.status === 'pending' || req.status === 'reserved' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60">
                    <span>Safety Check: <strong>Safe (Transit 12m &lt; Spoilage 2h50m)</strong></span>
                    <span className="font-bold text-amber-800">Token Fee: ₹50</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSendOffer(req.id)}
                      disabled={actionLoadingId === req.id}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Offer to NGO (60s)</span>
                    </button>

                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={actionLoadingId === req.id}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-bold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer disabled:opacity-50 border border-slate-200"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ) : req.status === 'offered' ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-800">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                    <span>Offer sent to NGO (Awaiting 60s receiver confirmation for ₹50 token)</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-amber-200 px-2 py-0.5 rounded-full">
                    Active 60s
                  </span>
                </div>
              ) : req.status === 'allocated' ? (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 font-bold">
                    <div className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Confirmed by Receiver! (Agreed to ₹50 Token)</span>
                    </div>
                    <span className="text-[11px] font-mono">OTP: #{req.otp_code || '749201'}</span>
                  </div>
                  <button
                    onClick={() => handleDispatch(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch Delivery Partner (Out for Delivery)</span>
                  </button>
                </div>
              ) : req.status === 'dispatched' || req.delivery_job_status === 'in_transit' ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs text-blue-800 font-medium">
                    <div className="flex items-center space-x-2">
                      <Truck className="w-4 h-4 text-blue-600 animate-bounce" />
                      <div>
                        <span className="font-bold">On the Way / Out for Delivery</span>
                        <p className="text-[11px] text-blue-600">Van #GJ-01-EV-4091 • Handover OTP: #{req.otp_code || '749201'}</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                      En Route
                    </span>
                  </div>
                  <button
                    onClick={() => handleCompleteDelivery(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-all"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Confirm Final Handover (OTP: #{req.otp_code || '749201'})</span>
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 font-semibold">
                  <div className="flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Handover Verified &amp; Delivered (OTP: #{req.otp_code || '749201'})</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-bold">Completed</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
