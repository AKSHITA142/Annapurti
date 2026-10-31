import { useEffect, useState } from 'react'
import {
  BarChart3,
  Eye,
  HeartHandshake,
  Utensils,
  LogOut,
  ShieldAlert,
  Building2,
} from 'lucide-react'
import {
  clearSession,
  fetchHealth,
  getCurrentUser,
  User,
} from './api/client'
import { DonorDashboard } from './donor/DonorDashboard'
import { NgoDashboard } from './ngo/NgoDashboard'
import { AdminExplainView } from './admin/AdminExplainView'
import { ImpactDashboard } from './components/ImpactDashboard'
import { LandingLoginPage } from './components/LandingLoginPage'

type ActiveTab = 'donor' | 'ngo' | 'admin' | 'impact'

export function App() {
  const [user, setUser] = useState<User | null>(getCurrentUser())
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)

  // Determine initial active tab based on role
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const current = getCurrentUser()
    if (current?.role === 'admin') return 'admin'
    if (current?.role === 'ngo' || current?.role === 'volunteer') return 'ngo'
    return 'donor'
  })

  useEffect(() => {
    // Check backend health
    fetchHealth()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))
  }, [])

  // Whenever user changes, ensure active tab matches their allowed permissions
  useEffect(() => {
    if (user?.role === 'admin') {
      setActiveTab('admin')
    } else if (user?.role === 'ngo' || user?.role === 'volunteer') {
      setActiveTab('ngo')
    } else if (user?.role === 'provider') {
      setActiveTab('donor')
    }
  }, [user])

  function handleLogout() {
    clearSession()
    setUser(null)
    setActiveTab('donor')
  }

  // 1. If not authenticated, render the clean light-mode Landing & Login Page
  if (!user) {
    return <LandingLoginPage onLoginSuccess={setUser} apiOnline={apiOnline} />
  }

  const isAdmin = user.role === 'admin'
  const isDonor = user.role === 'provider'
  const isNgo = user.role === 'ngo' || user.role === 'volunteer'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header & Navigation Bar (Clean Light Mode) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Platform Name */}
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-black tracking-tight text-slate-900">
              Anna<span className="text-emerald-600">Purti</span>
            </span>
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                isAdmin
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {isAdmin ? 'Admin Operations' : 'FoodRescue-AI'}
            </span>
          </div>

          {/* Navigation Tabs — STRICT ROLE ISOLATION:
              Users can NEVER see the Admin Explain View tab! */}
          <nav className="hidden md:flex items-center space-x-1 p-1 rounded-xl bg-slate-100">
            {/* Donor Tab: ONLY visible if user is a Donor */}
            {isDonor && (
              <button
                onClick={() => setActiveTab('donor')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'donor'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Donor Intake & Listings</span>
              </button>
            )}

            {/* NGO Tab: ONLY visible if user is an NGO */}
            {isNgo && (
              <button
                onClick={() => setActiveTab('ngo')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'ngo'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HeartHandshake className="w-3.5 h-3.5" />
                <span>NGO Food Discovery & Claims</span>
              </button>
            )}

            {/* Admin Tab: ONLY visible if user is an Admin.
                Normal users CANNOT see or access this tab. */}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Admin Operations & Explain View</span>
              </button>
            )}

            {/* Impact Tab: Visible to everyone */}
            <button
              onClick={() => setActiveTab('impact')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'impact'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Public Impact</span>
            </button>
          </nav>

          {/* User Profile Badge & Logout Control */}
          <div className="flex items-center space-x-3">
            {/* Authenticated User Info */}
            <div className="flex items-center space-x-2 px-3 py-1 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-700">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${
                  isAdmin
                    ? 'bg-blue-600'
                    : isDonor
                    ? 'bg-emerald-600'
                    : 'bg-purple-600'
                }`}
              >
                {isAdmin ? <ShieldAlert className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
              </div>
              <div className="text-left hidden sm:block">
                <span className="block font-bold leading-tight truncate max-w-[150px] text-slate-900">
                  {user.name}
                </span>
                <span className="block text-[10px] text-slate-500 capitalize">
                  {user.role === 'provider' ? 'Individual Donor' : user.role === 'ngo' ? 'NGO Receiver' : 'City Administrator'}
                </span>
              </div>
            </div>

            {/* Health Pulse */}
            <div
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-slate-50 border-slate-200 text-slate-600"
              title={apiOnline ? 'FastAPI Backend Connected' : 'Connecting to API'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  apiOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              />
              <span className="hidden md:inline">{apiOnline ? 'API 8000' : 'Offline'}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 cursor-pointer"
              title="Sign Out of Portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex border-t border-slate-200 bg-slate-50 px-2 py-1 overflow-x-auto justify-around text-xs">
          {isDonor && (
            <button
              onClick={() => setActiveTab('donor')}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                activeTab === 'donor' ? 'bg-emerald-600 text-white' : 'text-slate-600'
              }`}
            >
              Donor
            </button>
          )}

          {isNgo && (
            <button
              onClick={() => setActiveTab('ngo')}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                activeTab === 'ngo' ? 'bg-purple-600 text-white' : 'text-slate-600'
              }`}
            >
              NGO
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                activeTab === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              Admin Explain
            </button>
          )}

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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Render Only Allowed Views */}
        {activeTab === 'donor' && isDonor && <DonorDashboard />}
        {activeTab === 'ngo' && isNgo && <NgoDashboard />}
        {activeTab === 'admin' && isAdmin && <AdminExplainView />}
        {activeTab === 'impact' && <ImpactDashboard />}
      </main>

      {/* Clean Light Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
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
