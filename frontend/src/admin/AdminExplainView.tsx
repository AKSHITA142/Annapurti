import { useEffect, useState } from 'react'
import {
  RefreshCw,
  Terminal,
  Truck,
  Zap,
} from 'lucide-react'
import {
  AdminOverview,
  DecisionLog,
  DeliveryJob,
  getAdminOverview,
  getDecisions,
  listAllocations,
  triggerSimEvent,
} from '../api/client'
import { RouteMap } from '../components/RouteMap'
import { SimulatedBadge } from '../components/SimulatedBadge'
import { WhatIfStressTest } from '../components/WhatIfStressTest'

export function AdminExplainView() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [logs, setLogs] = useState<DecisionLog[]>([])
  const [jobs, setJobs] = useState<DeliveryJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedReason, setSelectedReason] = useState('')
  const [selectedStep, setSelectedStep] = useState('')

  // Sim event state
  const [simEventStatus, setSimEventStatus] = useState<string | null>(null)
  const [triggeringSim, setTriggeringSim] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [ovData, logsData, jobsData] = await Promise.all([
        getAdminOverview().catch(() => null),
        getDecisions(
          undefined,
          undefined,
          selectedReason || undefined
        ),
        listAllocations().catch(() => []),
      ])

      setOverview(ovData)
      setLogs(logsData)
      setJobs(jobsData)

      if (jobsData.length > 0 && selectedJobId === null) {
        setSelectedJobId(jobsData[0].id)
      }
    } catch (err: any) {
      console.error('Failed to load admin data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedReason, selectedStep])

  async function handleSimulateEvent(eventType: string, payload: Record<string, any> = {}) {
    setTriggeringSim(true)
    setSimEventStatus(`Triggering simulation event: ${eventType}...`)
    try {
      const res = await triggerSimEvent(eventType, payload)
      setSimEventStatus(`Simulation event '${eventType}' processed! Result: ${JSON.stringify(res)}`)
      await loadData()
    } catch (err: any) {
      setSimEventStatus(`Simulation error: ${err.message}`)
    } finally {
      setTriggeringSim(false)
    }
  }

  // Selected job for the map
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0]

  // Filter logs by step if selected
  const filteredLogs = selectedStep ? logs.filter((l) => l.step === selectedStep) : logs

  // Unique reason codes for filter dropdown
  const uniqueReasons = Array.from(new Set(logs.map((l) => l.reason_code))).filter(Boolean)

  return (
    <div className="space-y-8">
      {/* Top Overview & KPIs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-black text-slate-800">Admin Solver & Explain View</h1>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                Decision Audit Feed
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Full algorithmic transparency: inspect pruned options with reason codes, feedback repair rounds, and routes on the map.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={loadData}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>

        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Total Users</span>
              <span className="text-xl font-bold text-slate-800">{overview.total_users}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Listings</span>
              <span className="text-xl font-bold text-emerald-600">{overview.total_listings}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Requests</span>
              <span className="text-xl font-bold text-purple-600">{overview.total_requests}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Delivery Jobs</span>
              <span className="text-xl font-bold text-blue-600">{overview.total_jobs}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500 block">Fleet Vehicles</span>
              <span className="text-xl font-bold text-slate-700">{overview.total_vehicles}</span>
            </div>
          </div>
        )}
      </div>

      {/* Disruption Simulator Controls */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold">Operational Disruption Event Simulator</h2>
          </div>
          <SimulatedBadge className="bg-white/10 text-slate-300 border-white/20" />
        </div>
        <p className="text-xs text-slate-300 mb-4 max-w-2xl">
          Trigger operational failure scenarios to demonstrate automatic replanning, nogood repair loops, and the 5-step failure ladder.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <button
            disabled={triggeringSim}
            onClick={() => handleSimulateEvent('receiver_no_show', { request_id: 1 })}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            Receiver No-Show
          </button>

          <button
            disabled={triggeringSim}
            onClick={() => handleSimulateEvent('vehicle_cancel_before_pickup', { job_id: selectedJobId || 1 })}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            Vehicle Cancel (Before Pickup)
          </button>

          <button
            disabled={triggeringSim}
            onClick={() => handleSimulateEvent('vehicle_cancel_after_pickup', { job_id: selectedJobId || 1 })}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            Vehicle Breakdown (In Transit)
          </button>

          <button
            disabled={triggeringSim}
            onClick={() => handleSimulateEvent('reservation_expired')}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            Reclaim Expired Reservations
          </button>

          <button
            disabled={triggeringSim}
            onClick={() => handleSimulateEvent('traffic_change', { traffic_level: 'high' })}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
          >
            Traffic Surge (High 1.7x)
          </button>
        </div>

        {simEventStatus && (
          <div className="mt-4 p-3 rounded-xl bg-white/10 text-xs font-mono text-amber-200 border border-white/10">
            {simEventStatus}
          </div>
        )}
      </div>

      {/* Interactive What-If Stress Sweeper */}
      <WhatIfStressTest />

      {/* Main Grid: Leaflet Map & Decision Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Interactive Route Map (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
              <Truck className="w-5 h-5 text-blue-600" />
              <span>Optimised Vehicle Route</span>
            </h2>
            {jobs.length > 1 && (
              <select
                value={selectedJobId || ''}
                onChange={(e) => setSelectedJobId(Number(e.target.value))}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    Job #{j.id} ({j.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          <RouteMap
            stops={selectedJob?.route?.stops || []}
            vehicleName={`Vehicle Job #${selectedJob?.id || 1}`}
            height="460px"
          />

          {selectedJob && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Planned Stops:</span>
                <span className="font-bold text-slate-800">
                  {selectedJob.route?.stops ? selectedJob.route.stops.length : 0} waypoints
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Confirmation OTP:</span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {selectedJob.otp_code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Job Status:</span>
                <span className="capitalize font-semibold text-slate-800">{selectedJob.status}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Decision Audit Timeline Feed (7 cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-800">
                Decision Audit Log ({filteredLogs.length})
              </h2>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">All Reason Codes</option>
                {uniqueReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                value={selectedStep}
                onChange={(e) => setSelectedStep(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
              >
                <option value="">All Steps</option>
                <option value="inventory">Inventory</option>
                <option value="domain_pruning">Domain Pruning</option>
                <option value="repair">Feedback Repair</option>
                <option value="ladder">Failure Ladder</option>
                <option value="routing">Routing</option>
              </select>
            </div>
          </div>

          {/* Timeline Feed */}
          <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No decision logs matching current filters.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isAccept = log.decision === 'accept' || log.decision === 'reserve'
                const isPrune = log.decision === 'prune' || log.decision === 'reject'
                const isRepair = log.step === 'repair' || log.decision === 'reassign'

                return (
                  <div
                    key={log.id}
                    className={`p-3.5 rounded-xl border text-xs transition-colors ${
                      isAccept
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : isPrune
                        ? 'bg-rose-50/40 border-rose-200'
                        : isRepair
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isAccept
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPrune
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {log.decision}
                        </span>
                        <span className="font-mono text-slate-800 font-bold">
                          {log.reason_code}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-slate-700 font-medium my-1">{log.message}</p>

                    <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
                      <span>Step: <strong className="capitalize">{log.step}</strong></span>
                      <span>•</span>
                      <span>Target: <strong className="capitalize">{log.entity_type} #{log.entity_id}</strong></span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
