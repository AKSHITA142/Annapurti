import { useEffect, useState } from 'react'
import {
  BarChart3,
  Eye,
  HeartHandshake,
  Utensils,
  LogOut,
  ShieldAlert,
  Building2,
  Sparkles,
} from 'lucide-react'
import {
  clearSession,
  fetchHealth,
  getCurrentUser,
  login,
  User,
} from './api/client'
import { DonorDashboard } from './donor/DonorDashboard'
import { NgoDashboard } from './ngo/NgoDashboard'
import { AdminExplainView } from './admin/AdminExplainView'
import { ImpactDashboard } from './components/ImpactDashboard'
import { LandingLoginPage } from './components/LandingLoginPage'
import { ProfileSettingsModal } from './components/ProfileSettingsModal'

type ActiveTab = 'donor' | 'ngo' | 'admin' | 'impact'

export function App() {
  const [user, setUser] = useState<User | null>(getCurrentUser())
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // Determine initial active tab based on role
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const current = getCurrentUser()
    if (current?.role === 'admin') return 'admin'
    if (current?.role === 'ngo' || current?.role === 'volunteer') return 'ngo'
    return 'donor' // Default to donor for provider or dual 'both' role
  })

  useEffect(() => {
    // Check backend health
    fetchHealth()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))

    // Listener for cross-component one-click persona switching (e.g. from NGO card to Donor)
    const handleSwitch = async (e: Event) => {
      const customEvent = e as CustomEvent<{ email: string; role?: string; targetTab?: ActiveTab }>
      if (!customEvent.detail?.email) return
      const { email, role, targetTab } = customEvent.detail
      try {
        const res = await login(email, undefined, role || 'provider')
        handleLoginSuccess(res.user, targetTab)
        window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
      } catch (err) {
        console.error('Failed to switch persona:', err)
      }
    }

    window.addEventListener('foodrescue:switch_persona', handleSwitch)
    return () => window.removeEventListener('foodrescue:switch_persona', handleSwitch)
  }, [])

  async function quickSwitch(email: string, role: string, tab: ActiveTab) {
    try {
      const res = await login(email, undefined, role)
      handleLoginSuccess(res.user, tab)
      window.dispatchEvent(new CustomEvent('foodrescue:sync_listings'))
    } catch (err) {
      console.error('Quick switch failed:', err)
    }
  }

  function handleLoginSuccess(authenticatedUser: User, targetTab?: ActiveTab) {
    setUser(authenticatedUser)
    if (targetTab) {
      setActiveTab(targetTab)
    } else if (authenticatedUser.role === 'admin') {
      setActiveTab('admin')
    } else if (authenticatedUser.role === 'ngo' || authenticatedUser.role === 'volunteer') {
      setActiveTab('ngo')
    } else {
      setActiveTab('donor')
    }
  }

  // Whenever user changes, ensure active tab matches allowed permissions
  useEffect(() => {
    if (!user) return
    if (user.role === 'admin' && activeTab !== 'admin' && activeTab !== 'impact') {
      setActiveTab('admin')
    } else if ((user.role === 'ngo' || user.role === 'volunteer') && activeTab === 'donor') {
      setActiveTab('ngo')
    } else if (user.role === 'provider' && activeTab === 'ngo') {
      setActiveTab('donor')
    }
  }, [user])

  function handleLogout() {
    clearSession()
    setUser(null)
    setIsProfileOpen(false)
    setActiveTab('donor')
  }

  // 1. If not authenticated, render the clean landing page with Auth Modal
  if (!user) {
    return <LandingLoginPage onLoginSuccess={handleLoginSuccess} apiOnline={apiOnline} />
  }

  const isBoth = user.role === 'both'
  const isAdmin = user.role === 'admin'
  const isDonor = user.role === 'provider' || isBoth
  const isNgo = user.role === 'ngo' || user.role === 'volunteer' || isBoth

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header & Navigation Bar */}
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
                  : isBoth
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {isAdmin ? 'Admin Operations' : isBoth ? 'Dual Workspace' : 'FoodRescue-AI'}
            </span>
          </div>

          {/* Navigation Tabs — Strict RBAC isolation */}
          <nav className="hidden md:flex items-center space-x-1 p-1 rounded-xl bg-slate-100">
            {/* Donor Tab: Visible if Donor or Both */}
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

            {/* NGO Tab: Visible if NGO or Both */}
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

            {/* Admin Tab: ONLY visible to Admin */}
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

            {/* Public Impact Tab */}
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

          {/* User Profile Badge, Role Switcher & Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Seamless In-App Role Switcher for 'Both' users */}
            {isBoth && (
              <div className="hidden lg:flex items-center p-0.5 rounded-xl bg-amber-50 border border-amber-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('donor')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === 'donor'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-amber-900 hover:bg-amber-100/60'
                  }`}
                  title="Switch to Donor Workspace"
                >
                  🍲 Donor View
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ngo')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === 'ngo'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'text-amber-900 hover:bg-amber-100/60'
                  }`}
                  title="Switch to NGO Workspace"
                >
                  🤝 NGO View
                </button>
              </div>
            )}

            {/* Persistent Global Test Switcher Bar */}
            <div className="hidden xl:flex items-center gap-1.5 p-1 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs">
              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1 pl-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Test:</span>
              </span>
              <button
                type="button"
                onClick={() => quickSwitch('taj.skyline@ahmedabad.com', 'provider', 'donor')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  user.email === 'taj.skyline@ahmedabad.com'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title="Switch to Taj Skyline Hotel (Donor)"
              >
                🍲 Donor (Taj)
              </button>
              <button
                type="button"
                onClick={() => quickSwitch('apang.mandal@ahmedabad.org', 'ngo', 'ngo')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  user.email === 'apang.mandal@ahmedabad.org'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title="Switch to Apang Manav Mandal (NGO)"
              >
                🤝 NGO (Apang)
              </button>
              <button
                type="button"
                onClick={() => quickSwitch('community.relief@ahmedabad.org', 'both', 'donor')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  user.email === 'community.relief@ahmedabad.org'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title="Switch to Dual Role (Both Donor + NGO in 1 account)"
              >
                🌟 Both
              </button>
              <button
                type="button"
                onClick={() => quickSwitch('admin@amc.gov.in', 'admin', 'admin')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  user.email === 'admin@amc.gov.in'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title="Switch to City Admin"
              >
                🛡️ Admin
              </button>
            </div>

            {/* Authenticated User Profile Button (Opens Profile Settings Modal) */}
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-all cursor-pointer shadow-xs hover:border-slate-300 group"
              title="View Account Profile, Edit GPS Location & Settings"
              aria-label="User Profile and Settings"
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-xs transition-transform group-hover:scale-105 ${
                  isAdmin
                    ? 'bg-blue-600'
                    : isBoth
                    ? 'bg-amber-600'
                    : isDonor
                    ? 'bg-emerald-600'
                    : 'bg-purple-600'
                }`}
              >
                {isAdmin ? (
                  <ShieldAlert className="w-3.5 h-3.5" />
                ) : isBoth ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <Building2 className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="text-left hidden sm:block">
                <span className="block font-bold leading-tight truncate max-w-[130px] text-slate-900 group-hover:text-emerald-700">
                  {user.name}
                </span>
                <span className="block text-[10px] text-slate-500 capitalize">
                  {user.role === 'provider'
                    ? 'Food Donor'
                    : user.role === 'ngo' || user.role === 'volunteer'
                    ? 'NGO Receiver'
                    : user.role === 'both'
                    ? 'Dual Member'
                    : 'City Administrator'}
                </span>
              </div>
            </button>

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
              <span className="hidden md:inline">{apiOnline ? 'Online' : 'Offline'}</span>
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
              Admin
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
        {activeTab === 'donor' && isDonor && <DonorDashboard />}
        {activeTab === 'ngo' && isNgo && <NgoDashboard />}
        {activeTab === 'admin' && isAdmin && <AdminExplainView />}
        {activeTab === 'impact' && <ImpactDashboard />}
      </main>

      {/* Profile Settings Modal */}
      {user && (
        <ProfileSettingsModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          user={user}
          onLogout={handleLogout}
          onUpdateUser={setUser}
        />
      )}

      {/* Footer */}
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
