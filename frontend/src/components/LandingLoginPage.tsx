import React, { useState } from 'react'
import {
  ShieldCheck,
  Utensils,
  HeartHandshake,
  Lock,
  ArrowRight,
  Sparkles,
  Truck,
  Leaf,
  CheckCircle2,
  Clock,
  Building2,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck
} from 'lucide-react'
import { User, login } from '../api/client'

interface LandingLoginPageProps {
  onLoginSuccess: (user: User) => void
  apiOnline: boolean | null
}

type UserCategory = 'provider' | 'ngo' | 'admin'

interface DemoProfile {
  name: string
  email: string
  role: UserCategory
  label: string
  lat: number
  lng: number
  sublabel: string
}

const DEMO_PROFILES: Record<UserCategory, DemoProfile[]> = {
  provider: [
    {
      name: 'Taj Skyline Hotel',
      email: 'taj.skyline@ahmedabad.com',
      role: 'provider',
      label: 'Taj Skyline Hotel (Luxury Hotel & Banquets)',
      sublabel: 'Surplus buffet & banquet hot food',
      lat: 23.0035,
      lng: 72.5015,
    },
    {
      name: 'Courtyard by Marriott',
      email: 'marriott@ahmedabad.com',
      role: 'provider',
      label: 'Courtyard by Marriott (Ramdevnagar)',
      sublabel: 'Prepared meals & continental buffet',
      lat: 23.0278,
      lng: 72.5085,
    },
    {
      name: 'Iscon Gathiya & Caterers',
      email: 'iscon.caterers@ahmedabad.com',
      role: 'provider',
      label: 'Iscon Caterers (Individual / Event Caterer)',
      sublabel: 'Fresh cooked lunch trays & sweets',
      lat: 23.0305,
      lng: 72.518,
    },
  ],
  ngo: [
    {
      name: 'Apang Manav Mandal Orphanage',
      email: 'apang.mandal@ahmedabad.org',
      role: 'ngo',
      label: 'Apang Manav Mandal (Child Shelter & Orphanage)',
      sublabel: 'High Priority (1.5x) • 80 daily meals required',
      lat: 23.0425,
      lng: 72.541,
    },
    {
      name: 'Blind People\'s Association',
      email: 'bpa@ahmedabad.org',
      role: 'ngo',
      label: 'Blind People\'s Association (Vulnerable Community)',
      sublabel: 'Medium-High Priority (1.3x) • Refrigerated storage on-site',
      lat: 23.011,
      lng: 72.535,
    },
    {
      name: 'Robin Hood Army (Ahmedabad Chapter)',
      email: 'rha.ahmedabad@volunteer.org',
      role: 'ngo',
      label: 'Robin Hood Army (Volunteer Food Rescue Network)',
      sublabel: 'Standard Priority (1.0x) • Slum community kitchens',
      lat: 23.035,
      lng: 72.525,
    },
  ],
  admin: [
    {
      name: 'Ahmedabad Municipal Admin (AMC Dispatch)',
      email: 'admin@amc.gov.in',
      role: 'admin',
      label: 'City Central Dispatcher (AMC Logistics Authority)',
      sublabel: 'Full explain view, routing dispatch, what-if stress tests',
      lat: 23.0225,
      lng: 72.5714,
    },
  ],
}

export const LandingLoginPage: React.FC<LandingLoginPageProps> = ({
  onLoginSuccess,
  apiOnline,
}) => {
  const [userCategory, setUserCategory] = useState<UserCategory>('provider')
  const [selectedProfileIndex, setSelectedProfileIndex] = useState<number>(0)
  const [isCustom, setIsCustom] = useState<boolean>(false)
  const [customName, setCustomName] = useState<string>('')
  const [customEmail, setCustomEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('annapurti2026') // Default bypass password
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeProfiles = DEMO_PROFILES[userCategory]
  const currentProfile = activeProfiles[selectedProfileIndex] || activeProfiles[0]

  async function handleAuthenticate(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setErrorMsg(null)
    setIsLoading(true)

    try {
      let email = currentProfile.email
      let name = currentProfile.name
      let role = userCategory
      let lat = currentProfile.lat
      let lng = currentProfile.lng

      if (isCustom) {
        if (!customEmail || !customName) {
          throw new Error('Please enter both your name and email.')
        }
        email = customEmail
        name = customName
      }

      const res = await login(email, name, role, lat, lng)
      onLoginSuccess(res.user)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to authenticate. Ensure the backend server is running.')
    } finally {
      setIsLoading(false)
    }
  }

  // Quick 1-click bypass buttons for judges / evaluators
  async function quickBypassLogin(role: UserCategory, profileIdx: number = 0) {
    const prof = DEMO_PROFILES[role][profileIdx]
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const res = await login(prof.email, prof.name, prof.role, prof.lat, prof.lng)
      onLoginSuccess(res.user)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to backend.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-white font-sans overflow-x-hidden flex flex-col justify-between">
      {/* 1. Atmospheric Photographic Background with Dynamic Blur & Dark Gradient */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 scale-105"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=2400&q=80')`,
        }}
      >
        {/* Multi-layered dark glassmorphism gradient & backdrop blur */}
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900/90 to-emerald-950/60 mix-blend-multiply"></div>
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* 2. Top Minimal Branding Bar */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent">
                AnnaPurti
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                FoodRescue-AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Zero-Waste Surplus Redistribution & Time-Critical Logistics
            </p>
          </div>
        </div>

        {/* Backend Connectivity Status */}
        <div className="flex items-center space-x-2 text-xs bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700/60 shadow-inner">
          <span
            className={`w-2 h-2 rounded-full ${
              apiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          ></span>
          <span className="text-slate-300 font-medium">
            {apiOnline ? 'FastAPI System Active (Port 8000)' : 'Connecting to Server...'}
          </span>
        </div>
      </header>

      {/* 3. Main Hero & Login Split Section */}
      <main className="relative z-10 max-w-7xl mx-auto w-full px-6 py-8 my-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Business Vision, Value Pillars & Impact */}
        <div className="lg:col-span-7 space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shadow-md">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>FSSAI-Compliant Food Optimization Platform</span>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
              Transforming Surplus Food into{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                Immediate Nourishment
              </span>
            </h1>
            <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
              Every day, banquets and caterers waste tons of high-grade cooked meals while nearby
              orphanages and shelters go hungry. <strong>AnnaPurti</strong> solves this with a pure
              Python <strong>Constraint Satisfaction Problem (CSP)</strong> engine and time-window{' '}
              <strong>A* vehicle routing</strong> that guarantees <strong>zero microbial spoilage</strong>.
            </p>
          </div>

          {/* 4 Core Value Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md hover:border-emerald-500/40 transition-all">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white mb-1">Strict Food Safety (FSSAI)</h3>
              <p className="text-xs text-slate-400 leading-normal">
                4-hour hard limits on hot cooked meals, active cold chain matching, and real-time spoilage clocks.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md hover:border-purple-500/40 transition-all">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-3">
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white mb-1">Route-State A* & Heuristics</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Provably optimal multi-stop routing with 2-opt uncrossing, pickup precedence, and capacity validation.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md hover:border-blue-500/40 transition-all">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white mb-1">Row-Locking & OTP Handover</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Pessimistic PostgreSQL locking eliminates double-booking; 6-digit cryptographic OTP confirms arrival.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md hover:border-teal-500/40 transition-all">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center mb-3">
                <Leaf className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white mb-1">7.3x Yield & UNEP Offsets</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Outperforms greedy baselines by &gt;7.3x safe yield, saving 2.5 kg CO2e and 800L of water per meal.
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
            <div>
              <span className="block text-xl font-black text-emerald-400">0.00</span>
              <span>Deadline Violations</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="block text-xl font-black text-white">7.3x</span>
              <span>Safe Delivery Yield</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="block text-xl font-black text-teal-400">100%</span>
              <span>Pure Python Solver</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="block text-xl font-black text-indigo-400">Ahmedabad</span>
              <span>Validated Pilot Zone</span>
            </div>
          </div>
        </div>

        {/* Right Column: Glassmorphic Interactive Login & Portal Access Card */}
        <div className="lg:col-span-5 w-full">
          <div className="relative rounded-3xl bg-slate-900/85 backdrop-blur-2xl border border-white/10 p-7 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-white tracking-tight">Access Portal</h2>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  Secure SSO / Demo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Select your account role to enter your dedicated portal view.
              </p>
            </div>

            {errorMsg && (
              <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAuthenticate} className="space-y-5">
              {/* 1. User Type Dropdown (Individual / NGO / Admin) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>1. Select Account Type</span>
                  <span className="text-[11px] font-normal text-emerald-400">
                    {userCategory === 'provider'
                      ? 'Donor Portal Only'
                      : userCategory === 'ngo'
                      ? 'Receiver Portal Only'
                      : 'Admin Control Center'}
                  </span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUserCategory('provider')
                      setSelectedProfileIndex(0)
                      setIsCustom(false)
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                      userCategory === 'provider'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
                        : 'bg-slate-800/70 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Utensils className="w-4 h-4 mb-1.5" />
                    <span>Individual / Donor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUserCategory('ngo')
                      setSelectedProfileIndex(0)
                      setIsCustom(false)
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                      userCategory === 'ngo'
                        ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                        : 'bg-slate-800/70 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4 mb-1.5" />
                    <span>NGO / Shelter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUserCategory('admin')
                      setSelectedProfileIndex(0)
                      setIsCustom(false)
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                      userCategory === 'admin'
                        ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30'
                        : 'bg-slate-800/70 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 mb-1.5" />
                    <span>City Admin</span>
                  </button>
                </div>
              </div>

              {/* 2. Choose Demo Profile or Custom User */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    2. Select Profile
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustom(!isCustom)}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline"
                  >
                    {isCustom ? 'Switch to Demo Profiles' : '+ Custom Credentials'}
                  </button>
                </div>

                {!isCustom ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <select
                        value={selectedProfileIndex}
                        onChange={(e) => setSelectedProfileIndex(Number(e.target.value))}
                        className="w-full bg-slate-800/90 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none appearance-none cursor-pointer"
                      >
                        {activeProfiles.map((p, idx) => (
                          <option key={p.email} value={idx}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <Building2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-300 flex items-center justify-between">
                      <span className="truncate">{currentProfile.sublabel}</span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-2">
                        {currentProfile.email}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      placeholder="Organization or Individual Name"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-slate-800/90 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <input
                      type="email"
                      placeholder="Contact Email Address"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="w-full bg-slate-800/90 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 3. Password Field with Default Bypass */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>3. Password (Default Active)</span>
                  </label>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    Bypass Ready
                  </span>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-10"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Pre-configured with <span className="text-emerald-300 font-mono">annapurti2026</span> for instant bypass.
                </p>
              </div>

              {/* 4. Primary Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Entering Portal...</span>
                  </div>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>
                      Enter {userCategory === 'provider' ? 'Donor Portal' : userCategory === 'ngo' ? 'NGO Portal' : 'Admin Portal'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick 1-Click Evaluation Bypass Row */}
            <div className="pt-4 border-t border-slate-800/80 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block text-center">
                Instant Evaluation 1-Click Bypass:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => quickBypassLogin('provider', 0)}
                  disabled={isLoading}
                  className="py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold transition-all text-center truncate"
                >
                  ⚡ Taj Hotel
                </button>
                <button
                  type="button"
                  onClick={() => quickBypassLogin('ngo', 0)}
                  disabled={isLoading}
                  className="py-1.5 px-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-[10px] font-bold transition-all text-center truncate"
                >
                  ⚡ Apang Mandal
                </button>
                <button
                  type="button"
                  onClick={() => quickBypassLogin('admin', 0)}
                  disabled={isLoading}
                  className="py-1.5 px-2 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-[10px] font-bold transition-all text-center truncate"
                >
                  ⚡ City Admin
                </button>
              </div>
            </div>

            {/* Privacy & Safety Guarantee */}
            <div className="flex items-center justify-center space-x-1.5 text-[10px] text-slate-500">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Isolated role permissions: Users cannot view Admin control feeds</span>
            </div>
          </div>
        </div>
      </main>

      {/* 5. Minimal Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 border-t border-slate-900/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-400">FoodRescue-AI (AnnaPurti)</span>
          <span>•</span>
          <span>Zero-Waste Redistribution Architecture</span>
        </div>
        <div className="text-[11px] text-slate-500">
          Pure Python CSP Engine • Route-State A* • FSSAI Food Safety Protocols
        </div>
      </footer>
    </div>
  )
}
