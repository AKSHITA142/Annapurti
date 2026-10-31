import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Play, Sliders, Sparkles } from 'lucide-react'
import { SimulatedBadge } from './SimulatedBadge'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

interface WhatIfResult {
  method: string
  food_saved_lots: number
  deadline_violations: number
  lots_allocated_pct: number
  solve_time_ms: number
  valid: boolean
}

export function WhatIfStressTest() {
  const [trafficLevel, setTrafficLevel] = useState<'low' | 'medium' | 'high'>('high')
  const [vehicleCount, setVehicleCount] = useState<number>(3)
  const [deadlineTightness, setDeadlineTightness] = useState<'tight' | 'medium' | 'relaxed'>('tight')
  const [loading, setLoading] = useState<boolean>(false)
  const [results, setResults] = useState<WhatIfResult[]>([
    {
      method: 'FoodRescue-AI (Ours)',
      food_saved_lots: 109,
      deadline_violations: 0,
      lots_allocated_pct: 90.8,
      solve_time_ms: 18.2,
      valid: true,
    },
    {
      method: 'B1: Nearest-First',
      food_saved_lots: 15,
      deadline_violations: 30,
      lots_allocated_pct: 12.5,
      solve_time_ms: 3.1,
      valid: false,
    },
    {
      method: 'B2: FCFS',
      food_saved_lots: 13,
      deadline_violations: 31,
      lots_allocated_pct: 10.8,
      solve_time_ms: 2.8,
      valid: false,
    },
  ])
  const [summaryText, setSummaryText] = useState<string>(
    'Under high traffic with 3 vehicles and tight deadlines: FoodRescue-AI delivers over 7x more food with exactly 0 deadline violations.'
  )

  async function runSimulation() {
    setLoading(true)
    try {
      const token = localStorage.getItem('foodrescue_token')
      const res = await fetch(`${API_BASE_URL}/admin/sim/what-if`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          traffic_level: trafficLevel,
          vehicle_count: vehicleCount,
          deadline_tightness: deadlineTightness,
          seed: 42,
        }),
      })

      if (!res.ok) {
        throw new Error(`Simulation failed: ${res.statusText}`)
      }

      const data = await res.json()
      setResults(data.results)
      setSummaryText(data.summary)
    } catch (err: any) {
      console.error(err)
      alert(`Simulation error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const chartData = results.map((r) => ({
    name: r.method.split(':')[0],
    'Food Saved (Lots)': r.food_saved_lots,
    'Deadline Violations': r.deadline_violations,
  }))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-800">What-If Stress Test Sweeper</h2>
            <SimulatedBadge />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Sweep traffic congestion, vehicle scarcity, and perishable deadline tightness to observe solver resilience.
          </p>
        </div>

        <button
          onClick={runSimulation}
          disabled={loading}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
        >
          <Play className={`w-3.5 h-3.5 fill-current ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Evaluating...' : 'Run Stress Sweep'}</span>
        </button>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
        {/* Slider 1: Traffic Congestion */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
            <span>Simulated Traffic Level</span>
            <span className="capitalize text-indigo-600 font-bold">{trafficLevel} ({trafficLevel === 'low' ? '1.0x' : trafficLevel === 'medium' ? '1.3x' : '1.7x'})</span>
          </div>
          <div className="grid grid-cols-3 gap-1 pt-1">
            {(['low', 'medium', 'high'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTrafficLevel(t)}
                className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  trafficLevel === t
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Slider 2: Vehicle Fleet Count */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
            <span>Available Vehicles</span>
            <span className="text-indigo-600 font-bold">{vehicleCount} vans</span>
          </div>
          <input
            type="range"
            min="1"
            max="12"
            value={vehicleCount}
            onChange={(e) => setVehicleCount(Number(e.target.value))}
            className="w-full accent-indigo-600 cursor-pointer mt-2"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>1 (Scarcity)</span>
            <span>6 (Normal)</span>
            <span>12 (Surplus)</span>
          </div>
        </div>

        {/* Slider 3: Deadline Tightness */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
            <span>Perishable Deadline Tightness</span>
            <span className="capitalize text-indigo-600 font-bold">{deadlineTightness}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 pt-1">
            {(['tight', 'medium', 'relaxed'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDeadlineTightness(d)}
                className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  deadlineTightness === d
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Callout */}
      <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs flex items-center space-x-2">
        <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
        <span className="font-medium">{summaryText}</span>
      </div>

      {/* Comparison Chart & KPI Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recharts Comparison Chart */}
        <div className="h-64 w-full bg-slate-50/50 p-3 rounded-xl border border-slate-100">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
              <Bar dataKey="Food Saved (Lots)" fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Deadline Violations" fill="#e11d48" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table breakdown */}
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-4 font-bold text-slate-500 pb-2 border-b border-slate-200 text-[11px] uppercase tracking-wider">
            <span>Algorithm</span>
            <span className="text-center">Food Saved</span>
            <span className="text-center">Violations</span>
            <span className="text-right">Solve Time</span>
          </div>

          {results.map((r) => (
            <div
              key={r.method}
              className={`grid grid-cols-4 items-center p-2.5 rounded-xl border ${
                r.method.includes('Ours')
                  ? 'bg-emerald-50/60 border-emerald-200 font-bold text-emerald-950'
                  : 'bg-white border-slate-100 text-slate-700'
              }`}
            >
              <div className="truncate font-semibold">{r.method}</div>
              <div className="text-center text-emerald-700 font-bold">
                {r.food_saved_lots} lots
              </div>
              <div className="text-center">
                {r.deadline_violations === 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    0 Misses ✓
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    {r.deadline_violations} Misses ✗
                  </span>
                )}
              </div>
              <div className="text-right font-mono text-[11px] text-slate-500">
                {r.solve_time_ms} ms
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
