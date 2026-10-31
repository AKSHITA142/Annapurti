import { useEffect, useState } from 'react'
import {
  BarChart3,
  Eye,
  HeartHandshake,
  Utensils,
} from 'lucide-react'
import {
  fetchHealth,
  getCurrentUser,
  login,
  User,
} from './api/client'
import { DonorDashboard } from './donor/DonorDashboard'
import { NgoDashboard } from './ngo/NgoDashboard'
import { AdminExplainView } from './admin/AdminExplainView'
import { ImpactDashboard } from './components/ImpactDashboard'

type ActiveTab = 'donor' | 'ngo' | 'admin' | 'impact'

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('donor')
  const [user, setUser] = useState<User | null>(getCurrentUser())
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)

  useEffect(() => {
    // Check backend health
    fetchHealth()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))

    // Default demo login if no active session
    if (!user) {
      login('taj.hotel@ahmedabad.com', 'Grand Taj Restaurant', 'provider')
        .then((res) => setUser(res.user))
        .catch(() => {})
    }
  }, [])

  async function switchPersona(role: 'provider' | 'ngo' | 'admin') {
    let email = 'taj.hotel@ahmedabad.com'
    let name = 'Grand Taj Restaurant'

    if (role === 'ngo') {
      email = 'akshaya.shelter@ahmedabad.org'
      name = 'Akshaya Community Shelter'
      setActiveTab('ngo')
    } else if (role === 'admin') {
      email = 'admin@amc.gov.in'
      name = 'City AMC Admin'
      setActiveTab('admin')
    } else {
      setActiveTab('donor')
    }

    try {
      const res = await login(email, name, role)
      setUser(res.user)
    } catch (err: any) {
      console.error('Failed to switch persona', err)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header & Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Platform Name */}
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 bg-clip-text text-transparent">
              AnnaPurti
            </span>
            <span className="text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
              FoodRescue-AI
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('donor')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'donor'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Donor Portal</span>
            </button>

            <button
              onClick={() => setActiveTab('ngo')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ngo'
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>NGO Receiver</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'admin'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Admin Explain View</span>
            </button>

            <button
              onClick={() => setActiveTab('impact')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'impact'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Impact</span>
            </button>
          </nav>

          {/* User Persona Switcher & API Status */}
          <div className="flex items-center space-x-3">
            {/* Quick Demo Switcher */}
            <div className="hidden sm:flex items-center space-x-1 text-xs">
              <span className="text-slate-400 mr-1 text-[11px]">Role:</span>
              <button
                onClick={() => switchPersona('provider')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  user?.role === 'provider'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Donor
              </button>
              <button
                onClick={() => switchPersona('ngo')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  user?.role === 'ngo'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                NGO
              </button>
              <button
                onClick={() => switchPersona('admin')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  user?.role === 'admin'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Admin
              </button>
            </div>

            {/* Health Pulse */}
            <div
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-600"
              title={apiOnline ? 'FastAPI Backend Connected' : 'Connecting to API'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  apiOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              <span className="hidden sm:inline">
                {apiOnline ? 'API 8000' : 'Connecting'}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex border-t border-slate-200 bg-slate-50 px-2 py-1 overflow-x-auto justify-around text-xs">
          <button
            onClick={() => setActiveTab('donor')}
            className={`px-3 py-1.5 rounded-lg font-bold ${
              activeTab === 'donor' ? 'bg-emerald-600 text-white' : 'text-slate-600'
            }`}
          >
            Donor
          </button>
          <button
            onClick={() => setActiveTab('ngo')}
            className={`px-3 py-1.5 rounded-lg font-bold ${
              activeTab === 'ngo' ? 'bg-purple-600 text-white' : 'text-slate-600'
            }`}
          >
            NGO
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-lg font-bold ${
              activeTab === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            Explain View
          </button>
          <button
            onClick={() => setActiveTab('impact')}
            className={`px-3 py-1.5 rounded-lg font-bold ${
              activeTab === 'impact' ? 'bg-teal-600 text-white' : 'text-slate-600'
            }`}
          >
            Impact
          </button>
        </div>
      </header>

      {/* Main Tab View */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'donor' && <DonorDashboard />}
        {activeTab === 'ngo' && <NgoDashboard />}
        {activeTab === 'admin' && <AdminExplainView />}
        {activeTab === 'impact' && <ImpactDashboard />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700">FoodRescue-AI (AnnaPurti)</span>
            <span>•</span>
            <span>Constraint Satisfaction Allocation & A* Vehicle Routing Engine</span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-[11px] text-slate-400">
              Ahmedabad Pilot • Strict Food Safety Constraints
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
