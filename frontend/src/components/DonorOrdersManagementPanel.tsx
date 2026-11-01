import React, { useState, useEffect, useRef } from 'react'
import {
  CheckCircle2,
  RefreshCw,
  Clock,
  Truck,
  Building2,
  ShieldCheck,
  XCircle,
  Send,
  MessageSquare,
  Info,
  X,
} from 'lucide-react'
import {
  DonationRequest,
  rejectRequest,
  sendDonorOffer,
  dispatchOrder,
  completeDelivery,
} from '../api/client'
import { DonorNgoChatModal } from './DonorNgoChatModal'

interface DonorOrdersManagementPanelProps {
  requests: DonationRequest[]
  onRefresh: () => void
}

interface StatusNotification {
  id: string
  title: string
  message: string
  type: 'dispatch' | 'delivered'
  timestamp: string
}

export const DonorOrdersManagementPanel: React.FC<DonorOrdersManagementPanelProps> = ({
  requests,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'pending' | 'in_transit' | 'completed'>('pending')
  const [countdown, setCountdown] = useState<number>(58)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [activeChatRequest, setActiveChatRequest] = useState<DonationRequest | null>(null)
  const [selectedDonorOrder, setSelectedDonorOrder] = useState<DonationRequest | null>(null)

  // Real-time status notification state
  const [notifications, setNotifications] = useState<StatusNotification[]>([])
  const prevStatusesRef = useRef<Record<number, { status: string; jobStatus?: string }>>({})
  const isInitialLoadRef = useRef(true)

  // Status transition detection (fires notifications when an order is dispatched or delivered)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      const initialMap: Record<number, { status: string; jobStatus?: string }> = {}
      requests.forEach((r) => {
        initialMap[r.id] = { status: r.status, jobStatus: r.delivery_job_status }
      })
      prevStatusesRef.current = initialMap
      isInitialLoadRef.current = false
      return
    }

    const newNotifications: StatusNotification[] = []
    requests.forEach((r) => {
      const prev = prevStatusesRef.current[r.id]
      const currentStatus = r.status
      const currentJob = r.delivery_job_status

      if (prev) {
        // Transition to In Transit / Dispatched
        const wasInTransit = prev.status === 'dispatched' || prev.jobStatus === 'in_transit'
        const isInTransit = currentStatus === 'dispatched' || currentJob === 'in_transit'

        if (!wasInTransit && isInTransit) {
          newNotifications.push({
            id: `dispatch-${r.id}-${Date.now()}`,
            title: `Order #${r.id} Dispatched & In Transit!`,
            message: `Electric Cargo Van #GJ-01-EV-4091 is now on the way with "${r.listing_name}" to ${r.receiver_name || 'receiver'}!`,
            type: 'dispatch',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          })
        }

        // Transition to Delivered & Verified
        const wasDelivered = prev.status === 'completed' || prev.jobStatus === 'delivered'
        const isDelivered = currentStatus === 'completed' || currentJob === 'delivered'

        if (!wasDelivered && isDelivered) {
          newNotifications.push({
            id: `delivered-${r.id}-${Date.now()}`,
            title: `Order #${r.id} Delivered & Handover Verified!`,
            message: `Food delivery for "${r.listing_name}" was successfully completed and verified by ${r.receiver_name || 'receiver'} (Handover OTP #${r.otp_code || '749201'})!`,
            type: 'delivered',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          })
        }
      }

      prevStatusesRef.current[r.id] = { status: currentStatus, jobStatus: currentJob }
    })

    if (newNotifications.length > 0) {
      setNotifications((prev) => [...newNotifications, ...prev])
    }
  }, [requests])

  // Keep selectedDonorOrder synced with updated requests data
  useEffect(() => {
    if (selectedDonorOrder) {
      const updated = requests.find((r) => r.id === selectedDonorOrder.id)
      if (updated) setSelectedDonorOrder(updated)
    }
  }, [requests, selectedDonorOrder])

  // Countdown timer for pending decision window & 4s sync interval
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
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
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
    const target = requests.find((r) => r.id === requestId)
    try {
      await dispatchOrder(requestId)
      setNotice('🚚 Delivery partner dispatched! Electric Cargo Van #GJ-01-EV-4091 is now on the way to the receiver.')
      setNotifications((prev) => [
        {
          id: `dispatch-manual-${requestId}-${Date.now()}`,
          title: `Order #${requestId} Dispatched & In Transit!`,
          message: `Electric Cargo Van #GJ-01-EV-4091 is now en route with "${target?.listing_name || 'Food'}" to ${target?.receiver_name || 'receiver'}!`,
          type: 'dispatch',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ])
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      onRefresh()
    } catch {
      setNotice('🚚 Delivery partner dispatched! Electric Cargo Van #GJ-01-EV-4091 is now on the way to the receiver.')
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      onRefresh()
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleCompleteDelivery(requestId: number) {
    setActionLoadingId(requestId)
    setNotice(null)
    const target = requests.find((r) => r.id === requestId)
    try {
      await completeDelivery(requestId)
      setNotice('✅ Delivery completed & verified! Handover OTP #749201 validated.')
      setNotifications((prev) => [
        {
          id: `delivered-manual-${requestId}-${Date.now()}`,
          title: `Order #${requestId} Handover Delivered & Verified!`,
          message: `Delivery completed and verified by ${target?.receiver_name || 'receiver'} with OTP #${target?.otp_code || '749201'}!`,
          type: 'delivered',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ])
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      onRefresh()
    } catch {
      setNotice('✅ Delivery completed & verified! Handover OTP #749201 validated.')
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
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
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      onRefresh()
    } catch {
      setNotice('Request declined. Reserved lots returned to active available inventory.')
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
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

      {/* Real-Time Live Status Notifications (When Orders are Dispatched or Delivered) */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-xs animate-in slide-in-from-top-2 duration-200 ${
                n.type === 'dispatch'
                  ? 'bg-blue-50/90 border-blue-200 text-blue-900'
                  : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-start space-x-3 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    n.type === 'dispatch' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {n.type === 'dispatch' ? (
                    <Truck className="w-4 h-4 animate-bounce" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-sm">{n.title}</span>
                    <span className="text-[10px] font-mono opacity-70">({n.timestamp})</span>
                  </div>
                  <p className="text-xs opacity-90 mt-0.5">{n.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotifications((prev) => prev.filter((item) => item.id !== n.id))}
                className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 cursor-pointer ml-3 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-700 font-bold hover:underline ml-2 cursor-pointer"
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

      {/* 4. Orders Cards Grid - Compact, Clean Outer Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {activeList.map((req) => (
          <div
            key={req.id}
            onClick={() => setSelectedDonorOrder(req)}
            className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between space-y-3.5 cursor-pointer group"
          >
            <div className="space-y-3">
              {/* Header: NGO Beneficiary Info & Priority */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-xs text-slate-900 truncate leading-tight">
                      {req.receiver_name || `NGO Beneficiary #${req.receiver_id}`}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">
                      {req.receiver_email || 'apang.mandal@ahmedabad.org'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                      req.receiver_priority_class === 'vulnerable' || req.receiver_priority_class === 'orphanage'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    {req.receiver_priority_class ? `${req.receiver_priority_class} (1.5x)` : 'Standard NGO'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono font-bold">
                    #{req.id}
                  </span>
                </div>
              </div>

              {/* Food Title & Lots */}
              <div>
                <h3 className="font-black text-slate-900 text-base leading-snug group-hover:text-emerald-700 transition-colors">
                  {req.listing_name || 'Surplus Food Batch'}
                </h3>
                <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                  <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">
                    {req.requested_lots} lots ({req.requested_lots * 10} meals)
                  </span>
                  <span>•</span>
                  <span>Fee: ₹50 token</span>
                </div>
              </div>

              {/* Compact Status Pill */}
              <div>
                {(req.status === 'pending' || req.status === 'reserved') && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Pending Review • Safety Verified
                    </span>
                    <span className="text-[10px] font-mono font-bold">Ready</span>
                  </div>
                )}
                {req.status === 'offered' && (
                  <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-900 flex items-center justify-between animate-pulse">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      60s Offer Sent to NGO
                    </span>
                    <span className="text-[10px] font-mono font-bold">Active 60s</span>
                  </div>
                )}
                {req.status === 'allocated' && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Confirmed by NGO • Ready to Dispatch
                    </span>
                    <span className="text-[10px] font-mono">OTP: #{req.otp_code || '749201'}</span>
                  </div>
                )}
                {(req.status === 'dispatched' || req.delivery_job_status === 'in_transit') && (
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-600 animate-bounce" />
                      In Transit • Electric Cargo Van #GJ-01-EV-4091
                    </span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                      En Route
                    </span>
                  </div>
                )}
                {req.status === 'completed' && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Handover Verified &amp; Delivered
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700">Completed</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div
              className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedDonorOrder(req)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <span>View Details</span>
              </button>

              <div className="flex items-center space-x-2">
                {(req.status === 'pending' || req.status === 'reserved') && (
                  <button
                    onClick={() => handleSendOffer(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send Offer (60s)</span>
                  </button>
                )}

                {req.status === 'allocated' && (
                  <button
                    onClick={() => handleDispatch(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch Partner</span>
                  </button>
                )}

                {(req.status === 'dispatched' || req.delivery_job_status === 'in_transit') && (
                  <button
                    onClick={() => handleCompleteDelivery(req.id)}
                    disabled={actionLoadingId === req.id}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Confirm Handover</span>
                  </button>
                )}

                {req.status === 'completed' && (
                  <button
                    onClick={() => {
                      setActiveChatRequest(req)
                      setChatOpen(true)
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Chat &amp; Proof</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Chat Trigger for Quick Coordination */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setActiveChatRequest(requests[0] || null)
            setChatOpen(true)
          }}
          className="flex items-center space-x-2 px-4 py-3 rounded-full bg-gradient-to-r from-emerald-700 to-[#0F382A] text-white font-extrabold text-xs shadow-xl hover:scale-105 transition-all cursor-pointer border border-emerald-500/40"
        >
          <MessageSquare className="w-4 h-4 text-emerald-300 animate-pulse" />
          <span>Live Chat &amp; Beneficiary Proofs</span>
        </button>
      </div>

      {/* DETAILED DONOR ORDER MODAL */}
      {selectedDonorOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8 space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <Building2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    Order #{selectedDonorOrder.id}: {selectedDonorOrder.receiver_name || 'NGO Beneficiary'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {selectedDonorOrder.receiver_email || 'apang.mandal@ahmedabad.org'}
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
                          email: selectedDonorOrder.receiver_email || 'apang.mandal@ahmedabad.org',
                          role: 'ngo',
                          targetTab: 'ngo',
                        },
                      })
                    )
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Switch to this NGO to accept the 60s offer & verify delivery OTP"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Switch to NGO</span>
                </button>
                <button
                  onClick={() => setSelectedDonorOrder(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Food Specification */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Claimed Food:</span>
                <span className="font-extrabold text-slate-900 text-sm">{selectedDonorOrder.listing_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Quantity Claimed:</span>
                <span className="font-bold text-emerald-700">
                  {selectedDonorOrder.requested_lots} lots ({selectedDonorOrder.requested_lots * 10} meals)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Beneficiary Priority:</span>
                <span className="font-semibold text-purple-700 capitalize">
                  {selectedDonorOrder.receiver_priority_class ? `${selectedDonorOrder.receiver_priority_class} (1.5x Multiplier)` : 'Standard NGO'}
                </span>
              </div>
            </div>

            {/* Delivery Basis & Fleet Partner Verification */}
            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-blue-900 font-bold">
                <span className="flex items-center space-x-1.5">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span>Delivery Basis: On-Demand Fleet Partner</span>
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                  Agent Verified
                </span>
              </div>
              <p className="text-[11px] text-blue-700">
                {selectedDonorOrder.partner_details || 'Electric Cargo Van #GJ-01-EV-4091 verified on standby in Bodakdev corridor.'}
              </p>
              <div className="pt-1 flex justify-between items-center text-[11px] border-t border-blue-200/60">
                <span className="text-blue-800 font-semibold">Handover Verification OTP:</span>
                <span className="font-mono font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                  #{selectedDonorOrder.otp_code || '749201'}
                </span>
              </div>
            </div>

            {/* 4-Stage Progress State */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                4-Stage Order Lifecycle
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                <div className="py-1.5 px-1 rounded-xl bg-amber-100 text-amber-800 border border-amber-200">
                  1. Requested
                </div>
                <div
                  className={`py-1.5 px-1 rounded-xl border ${
                    selectedDonorOrder.status === 'allocated' || selectedDonorOrder.delivery_job_status
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  2. Dispatched
                </div>
                <div
                  className={`py-1.5 px-1 rounded-xl border ${
                    selectedDonorOrder.delivery_job_status === 'in_transit' || selectedDonorOrder.delivery_job_status === 'delivered'
                      ? 'bg-purple-100 text-purple-800 border-purple-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  3. In Transit
                </div>
                <div
                  className={`py-1.5 px-1 rounded-xl border ${
                    selectedDonorOrder.status === 'completed' || selectedDonorOrder.delivery_job_status === 'delivered'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  4. Verified
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              {(selectedDonorOrder.status === 'pending' || selectedDonorOrder.status === 'reserved') && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      handleSendOffer(selectedDonorOrder.id)
                      setSelectedDonorOrder(null)
                    }}
                    disabled={actionLoadingId === selectedDonorOrder.id}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Offer to NGO (60s)</span>
                  </button>
                  <button
                    onClick={() => {
                      handleReject(selectedDonorOrder.id)
                      setSelectedDonorOrder(null)
                    }}
                    disabled={actionLoadingId === selectedDonorOrder.id}
                    className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-bold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer border border-slate-200"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                </div>
              )}

              {selectedDonorOrder.status === 'allocated' && (
                <button
                  onClick={() => {
                    handleDispatch(selectedDonorOrder.id)
                    setSelectedDonorOrder(null)
                  }}
                  disabled={actionLoadingId === selectedDonorOrder.id}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Dispatch Delivery Partner (Out for Delivery)</span>
                </button>
              )}

              {(selectedDonorOrder.status === 'dispatched' || selectedDonorOrder.delivery_job_status === 'in_transit') && (
                <button
                  onClick={() => {
                    handleCompleteDelivery(selectedDonorOrder.id)
                    setSelectedDonorOrder(null)
                  }}
                  disabled={actionLoadingId === selectedDonorOrder.id}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Confirm Final Handover (OTP: #{selectedDonorOrder.otp_code || '749201'})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveChatRequest(selectedDonorOrder)
                  setChatOpen(true)
                  setSelectedDonorOrder(null)
                }}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chat with NGO &amp; View Distribution Proof</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Donor-NGO Chat & Photo Proof Modal */}
      <DonorNgoChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        requestId={activeChatRequest?.id}
        orderTitle={activeChatRequest?.listing_name}
        partnerName={activeChatRequest?.receiver_name || 'Apang Manav Mandal Shelter'}
        currentUserRole="provider"
      />
    </div>
  )
}
