import { useEffect, useState } from 'react'
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
import {
  Globe2,
  Leaf,
  RefreshCw,
  TrendingUp,
  Users,
  Utensils,
} from 'lucide-react'
import { getImpactSummary, ImpactSummary } from '../api/client'
import { SimulatedBadge } from './SimulatedBadge'

export function ImpactDashboard() {
  const [impact, setImpact] = useState<ImpactSummary | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const data = await getImpactSummary()
      setImpact(data)
    } catch (err: any) {
      console.error('Failed to load impact summary', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Funnel comparison chart data
  const funnelData = [
    {
      stage: 'Published',
      lots: impact?.published_lots || 0,
      meals: impact?.published_meals || 0,
      fill: '#059669', // Emerald
    },
    {
      stage: 'Reserved',
      lots: impact?.reserved_lots || 0,
      meals: (impact?.reserved_lots || 0) * 10,
      fill: '#2563eb', // Blue
    },
    {
      stage: 'Delivered',
      lots: impact?.delivered_lots || 0,
      meals: impact?.delivered_meals || 0,
      fill: '#7c3aed', // Purple
    },
    {
      stage: 'Distributed',
      lots: impact?.reported_distributed_lots || 0,
      meals: impact?.reported_distributed_meals || 0,
      fill: '#d97706', // Amber
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-slate-800">Impact & Sustainability Dashboard</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
              Verified Metrics
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time tracking of food saved, hunger relieved, and carbon emissions avoided in Ahmedabad.
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Impact</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Meals Rescued */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Meals Delivered
            </span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Utensils className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">
              {impact?.delivered_meals || 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              From {impact?.delivered_lots || 0} rescued food lots
            </div>
          </div>
        </div>

        {/* Card 2: People Fed */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Estimated People Served
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">
              {impact?.estimated_people_served || 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Documented via NGO utilisation reports
            </div>
          </div>
        </div>

        {/* Card 3: Utilisation Rate */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Utilisation Rate
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">
              {impact?.utilisation_percentage || 0}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Distributed vs delivered ratio
            </div>
          </div>
        </div>

        {/* Card 4: CO2 Saved */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              CO₂ Emissions Saved
            </span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <Leaf className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-emerald-700">
              {impact?.co2_saved_kg || 0} <span className="text-lg font-bold">kg</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Carbon footprint avoided
            </div>
          </div>
        </div>
      </div>

      {/* UNEP/FAO Carbon Assumption Text Callout */}
      <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 flex items-start space-x-3">
        <Globe2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold block text-emerald-900 mb-0.5">
            Scientific Carbon Offset Methodology:
          </strong>
          <span>
            {impact?.co2_assumption ||
              'Based on UNEP/FAO benchmarks: 1 meal rescued avoids approx 1.0 kg of CO2e emissions (2.5 kg CO2e per kg of food).'}
          </span>
        </div>
      </div>

      {/* Food Rescue Funnel Visualisation */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Redistribution Pipeline Funnel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks surplus lots from initial donor publication to verified NGO distribution.
            </p>
          </div>
          <SimulatedBadge />
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="stage" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="lots" name="Lots" radius={[6, 6, 0, 0]} />
              <Bar dataKey="meals" name="Meals" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
