import { useEffect, useState } from 'react'
import { fetchHealth, HealthResponse } from './api/client'

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        setHealth(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to connect to backend API')
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              AnnaPurti
            </span>
            <span className="text-xs uppercase font-semibold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
              FoodRescue-AI MVP
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-slate-600">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    health?.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    health?.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                ></span>
              </span>
              <span>
                {loading ? 'Connecting...' : health ? 'API Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-emerald-700 via-teal-800 to-slate-900 rounded-2xl text-white p-8 sm:p-10 shadow-lg mb-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
              Intelligent Surplus Food Redistribution
            </h1>
            <p className="text-emerald-100 text-base sm:text-lg mb-6 leading-relaxed">
              Constraint Satisfaction Problem (CSP) allocation solver & A* / heuristic routing engine with strict food safety guarantees for perishable urban food rescue.
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-medium">
              <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
                🚀 Hand-written CSP Solver
              </span>
              <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
                📍 Graph & Route-State A*
              </span>
              <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
                🛡️ Hard Safety Deadlines
              </span>
              <span className="px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
                🔒 PostgreSQL Row-Locking Concurrency
              </span>
            </div>
          </div>
        </div>

        {/* System Health Check Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Status Box */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">
              Backend Health
            </h2>
            {loading && <p className="text-sm text-slate-500">Checking health...</p>}
            {error && (
              <div className="text-sm text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-200">
                {error}
              </div>
            )}
            {health && (
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {health.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>Service: {health.app} (v{health.version})</p>
                  <p>Env: {health.environment}</p>
                </div>
              </div>
            )}
          </div>

          {/* Database Box */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">
              Database Connection
            </h2>
            {loading && <p className="text-sm text-slate-500">Connecting to DB...</p>}
            {health && (
              <div>
                <span
                  className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-md ${
                    health.database === 'connected'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  PostgreSQL 16: {health.database}
                </span>
                <p className="text-xs text-slate-500 mt-2">
                  Session pool managed via SQLAlchemy 2.x & Alembic
                </p>
              </div>
            )}
          </div>

          {/* Current Phase */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">
              Active Milestone
            </h2>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold text-lg">Phase 0</span>
              <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                Scaffolding & Setup
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Branch: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">phase-0</code>
            </p>
          </div>
        </div>

        {/* Phase Plan Overview */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            Implementation Roadmap
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { num: 'Phase 0', title: 'Project Setup & Scaffolding', status: 'In Progress' },
              { num: 'Phase 1', title: 'Data Model & Row-Locked Inventory', status: 'Pending' },
              { num: 'Phase 2', title: 'Food Safety Rules & Travel Matrix', status: 'Pending' },
              { num: 'Phase 3', title: 'CSP Allocation Engine (MRV+AC3)', status: 'Pending' },
              { num: 'Phase 4', title: 'Routing Engine (A* + Heuristics)', status: 'Pending' },
              { num: 'Phase 5', title: 'Feedback Loop & Failure Ladder', status: 'Pending' },
              { num: 'Phase 6', title: 'Simulation & Evaluation Baselines', status: 'Pending' },
              { num: 'Phase 7', title: 'REST API Layer & Badges', status: 'Pending' },
              { num: 'Phase 8', title: 'Frontend Dashboards & Explain View', status: 'Pending' },
              { num: 'Phase 9', title: 'Agreed Extras (QR, Intake, What-If)', status: 'Pending' },
              { num: 'Phase 10', title: 'Docker, Benchmark Report & Demo', status: 'Pending' },
            ].map((phase, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border text-sm ${
                  phase.status === 'In Progress'
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800">{phase.num}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      phase.status === 'In Progress'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {phase.status}
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{phase.title}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
          FoodRescue-AI (AnnaPurti) • Perishable Urban Food Rescue MVP
        </div>
      </footer>
    </div>
  )
}

export default App

