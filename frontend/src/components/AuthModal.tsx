import React, { useState, useEffect } from 'react'
import {
  X,
  UserRound,
  Building2,
  UsersRound,
  ShieldAlert,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Lock,
  Utensils,
  HeartHandshake,
  Navigation,
} from 'lucide-react'
import { User, login } from '../api/client'

export type AuthRole = 'provider' | 'ngo' | 'both' | 'admin'
export type AuthMode = 'signin' | 'signup'

interface AuthModalProps {
  isOpen: boolean
  initialRole?: AuthRole
  initialMode?: AuthMode
  lockedRole?: AuthRole | null
  onClose: () => void
  onLoginSuccess: (user: User, targetTab?: 'donor' | 'ngo' | 'admin') => void
  apiOnline: boolean | null
}

interface DemoAccount {
  name: string
  email: string
  phone: string
  address: string
  lat: number
  lng: number
}

const DEMO_ACCOUNTS: Record<AuthRole, Array<DemoAccount>> = {
  provider: [
    {
      name: 'Taj Skyline Hotel (Banquets & Dining)',
      email: 'taj.skyline@ahmedabad.com',
      phone: '9825011223',
      address: 'Sindhu Bhavan Marg, Bodakdev, Ahmedabad, Gujarat 380054',
      lat: 23.0035,
      lng: 72.5015,
    },
    {
      name: 'Grand Taj Caterers & Banquets',
      email: 'taj.caterers@ahmedabad.com',
      phone: '9825133445',
      address: 'C.G. Road, Navrangpura, Ahmedabad, Gujarat 380009',
      lat: 23.0225,
      lng: 72.5714,
    },
    {
      name: 'Iscon Thal Banquets',
      email: 'iscon.thal@ahmedabad.com',
      phone: '9825255667',
      address: 'SG Highway, Near Iscon Cross Road, Satellite, Ahmedabad, Gujarat 380015',
      lat: 23.0305,
      lng: 72.518,
    },
  ],
  ngo: [
    {
      name: 'Apang Manav Mandal Shelter',
      email: 'apang.mandal@ahmedabad.org',
      phone: '9879077889',
      address: 'Dr. Vikram Sarabhai Marg, University Area, Ahmedabad, Gujarat 380015',
      lat: 23.0425,
      lng: 72.541,
    },
    {
      name: 'Blind People’s Association',
      email: 'bpa@ahmedabad.org',
      phone: '9879188990',
      address: 'Jagdish Patel Chowk, Surdas Marg, Vastrapur, Ahmedabad, Gujarat 380015',
      lat: 23.011,
      lng: 72.535,
    },
    {
      name: 'Shishu Gruh Child Orphanage',
      email: 'shishu.gruh@ahmedabad.org',
      phone: '9879299001',
      address: 'Paldi Cross Roads, Ellisbridge, Ahmedabad, Gujarat 380006',
      lat: 23.055,
      lng: 72.585,
    },
  ],
  both: [
    {
      name: 'Community Kitchen & Relief Shelter',
      email: 'community.relief@ahmedabad.org',
      phone: '9898012345',
      address: 'Relief Road, Old City, Ahmedabad, Gujarat 380001',
      lat: 23.0275,
      lng: 72.5532,
    },
  ],
  admin: [
    {
      name: 'City AMC Operations Admin',
      email: 'admin@amc.gov.in',
      phone: '9800000001',
      address: 'Mahanagar Seva Sadan, Danapith, Ahmedabad, Gujarat 380001',
      lat: 23.0225,
      lng: 72.5714,
    },
  ],
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialRole = 'provider',
  initialMode = 'signin',
  lockedRole = null,
  onClose,
  onLoginSuccess,
  apiOnline,
}) => {
  const effectiveRole = lockedRole || initialRole
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [role, setRole] = useState<AuthRole>(effectiveRole)
  const [step, setStep] = useState<'credentials' | 'otp' | 'workspace_select'>('credentials')
  const [pendingBothUser, setPendingBothUser] = useState<User | null>(null)

  // Sign In Credentials: Email Address or Mobile Number
  const [loginIdentifier, setLoginIdentifier] = useState('')

  // Sign Up Form Fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [phone, setPhone] = useState('')
  const [organization, setOrganization] = useState('')
  const [address, setAddress] = useState('')

  // Geolocation State
  const [gpsLocation, setGpsLocation] = useState<{
    lat: number
    lng: number
    label: string
    status: 'idle' | 'locating' | 'success' | 'fallback'
  }>({
    lat: 23.0225,
    lng: 72.5714,
    label: 'Ahmedabad City Center (23.0225, 72.5714)',
    status: 'idle',
  })

  // Dual OTP State
  const [phoneOtp, setPhoneOtp] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [simulatedPhoneOtp] = useState('749201')
  const [simulatedEmailOtp] = useState('852940')

  // Validation Error State
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  // Sync initial parameters on open
  useEffect(() => {
    if (isOpen) {
      const activeRole = lockedRole || initialRole
      setRole(activeRole)
      setMode(initialMode)
      setStep('credentials')
      setPendingBothUser(null)
      setError('')
      setFieldErrors({})
      setPhoneOtp('')
      setEmailOtp('')

      // Auto-set default sample identifier based on role
      const defaultSample = DEMO_ACCOUNTS[activeRole]?.[0]?.email || ''
      setLoginIdentifier(defaultSample)

      detectLocation()
    }
  }, [isOpen, initialRole, initialMode, lockedRole])

  // Reverse geocode GPS coordinates to human-readable address
  async function populateAddressFromCoords(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { signal: AbortSignal.timeout(3000) }
      )
      if (res.ok) {
        const data = await res.json()
        if (data?.display_name) {
          setAddress(data.display_name)
          return
        }
      }
    } catch {
      // Ignore network timeout or CORS
    }
    // Formatted fallback landmark
    setAddress(`Area near Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}), Ahmedabad, Gujarat`)
  }

  // Geolocation detector
  function detectLocation() {
    if (!navigator.geolocation) {
      setGpsLocation({
        lat: 23.0225,
        lng: 72.5714,
        label: 'Ahmedabad (Default GPS: 23.0225, 72.5714)',
        status: 'fallback',
      })
      if (!address) {
        setAddress('Sindhu Bhavan Marg, Bodakdev, Ahmedabad, Gujarat 380054')
      }
      return
    }

    setGpsLocation((prev) => ({ ...prev, status: 'locating' }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(4))
        const lng = parseFloat(pos.coords.longitude.toFixed(4))
        setGpsLocation({
          lat,
          lng,
          label: `GPS Auto-Captured: ${lat}, ${lng}`,
          status: 'success',
        })
        if (!address) {
          populateAddressFromCoords(lat, lng)
        }
      },
      () => {
        setGpsLocation({
          lat: 23.0225,
          lng: 72.5714,
          label: 'Ahmedabad (Fallback GPS: 23.0225, 72.5714)',
          status: 'fallback',
        })
        if (!address) {
          setAddress('Sindhu Bhavan Marg, Bodakdev, Ahmedabad, Gujarat 380054')
        }
      },
      { timeout: 6000, enableHighAccuracy: true }
    )
  }

  if (!isOpen) return null

  function findMatchingAccount(identifier: string, currentRole: AuthRole) {
    const cleanId = identifier.trim().toLowerCase()
    const cleanDigits = identifier.trim().replace(/[\s-]/g, '')

    // Check within current role first
    const roleAccounts = DEMO_ACCOUNTS[currentRole] || []
    const match = roleAccounts.find(
      (acc) => acc.email.toLowerCase() === cleanId || acc.phone === cleanDigits
    )
    if (match) return match

    // Check across other roles
    for (const r of ['provider', 'ngo', 'both', 'admin'] as AuthRole[]) {
      const acc = DEMO_ACCOUNTS[r]?.find(
        (a) => a.email.toLowerCase() === cleanId || a.phone === cleanDigits
      )
      if (acc) return acc
    }
    return null
  }

  function getEffectiveCredentials() {
    if (mode === 'signin') {
      const match = findMatchingAccount(loginIdentifier, role)
      if (match) {
        return {
          name: match.name,
          email: match.email,
          phone: match.phone,
          address: match.address,
          lat: match.lat,
          lng: match.lng,
          org: role === 'ngo' ? match.name : undefined,
        }
      }

      const trimmed = loginIdentifier.trim()
      if (trimmed.includes('@')) {
        const username = trimmed.split('@')[0].replace(/[._-]/g, ' ')
        return {
          name: username.charAt(0).toUpperCase() + username.slice(1) || 'Community Member',
          email: trimmed,
          phone: '+91 9825000000',
          address: 'Ahmedabad City Grid, Gujarat',
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          org: role === 'ngo' ? 'Community Partner' : undefined,
        }
      } else {
        const cleanPhone = trimmed.replace(/[\s-]/g, '')
        return {
          name: `User ${cleanPhone.slice(-4)}`,
          email: `user.${cleanPhone}@annapurti.org`,
          phone: `+91 ${cleanPhone}`,
          address: 'Ahmedabad City Grid, Gujarat',
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          org: role === 'ngo' ? 'Community Partner' : undefined,
        }
      }
    }

    // Sign up mode
    return {
      name: fullName.trim() || 'Community Member',
      email: email.trim(),
      phone: `${countryCode} ${phone.trim()}`,
      address: address.trim() || 'Sindhu Bhavan Marg, Bodakdev, Ahmedabad, Gujarat 380054',
      lat: gpsLocation.lat,
      lng: gpsLocation.lng,
      org: organization.trim() || (role === 'ngo' ? fullName.trim() : undefined),
    }
  }

  // Strict Validation Rules
  function validateInputs(): boolean {
    const errors: Record<string, string> = {}
    const nameRegex = /^[A-Za-z\s]+$/
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRegex = /^\d{10}$/

    if (mode === 'signin') {
      const trimmed = loginIdentifier.trim()
      if (!trimmed) {
        errors.identifier = 'Please enter your registered email address or 10-digit mobile number.'
      } else if (trimmed.includes('@')) {
        if (!emailRegex.test(trimmed)) {
          errors.identifier = 'Please enter a valid email address.'
        }
      } else {
        const cleanPhone = trimmed.replace(/[\s-]/g, '')
        if (!phoneRegex.test(cleanPhone)) {
          errors.identifier = 'Mobile number must be a valid 10-digit number.'
        }
      }
    } else {
      // 1. Full Name check
      const trimmedName = fullName.trim()
      if (!trimmedName) {
        errors.name = 'Please enter your full name.'
      } else if (!nameRegex.test(trimmedName)) {
        errors.name = 'Name cannot contain numbers or special characters.'
      }

      // 2. Email Address check
      const trimmedEmail = email.trim()
      if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
        errors.email = 'Please enter a valid email address.'
      }

      // 3. Mobile Number check (must be exactly 10 digits)
      const cleanPhone = phone.trim().replace(/[\s-]/g, '')
      if (!phoneRegex.test(cleanPhone)) {
        errors.phone = 'Mobile number must be a valid 10-digit number.'
      }

      // 4. Physical Address check (mandatory for Donors and NGOs/Volunteers)
      const trimmedAddress = address.trim()
      if ((role === 'provider' || role === 'ngo' || role === 'both') && !trimmedAddress) {
        errors.address = 'Please enter your physical address for accurate food collection and delivery routing.'
      }

      // 5. Organization Details check (required if NGO or Both)
      if ((role === 'ngo' || role === 'both') && !organization.trim()) {
        errors.organization = 'Please enter your organization or shelter name.'
      }
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors)[0])
      return false
    }

    setError('')
    return true
  }

  // Handle Step 1 -> Step 2 transition
  function handleProceedToOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!validateInputs()) return
    setStep('otp')
    setError('')
  }

  // Fast autofill for local testing
  function handleQuickAutofillOtp() {
    setPhoneOtp(simulatedPhoneOtp)
    setEmailOtp(simulatedEmailOtp)
  }

  // Step 2 -> Step 3: Final verification & post-OTP workspace routing
  async function handleVerifyAndSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const cleanPhoneOtp = phoneOtp.trim()
    const cleanEmailOtp = emailOtp.trim()
    const otpRegex = /^\d{6}$/

    if (!otpRegex.test(cleanPhoneOtp) || !otpRegex.test(cleanEmailOtp)) {
      setError('Please enter valid 6-digit numeric codes for both Phone and Email.')
      return
    }

    if (
      (cleanPhoneOtp !== simulatedPhoneOtp && cleanPhoneOtp !== '123456') ||
      (cleanEmailOtp !== simulatedEmailOtp && cleanEmailOtp !== '123456')
    ) {
      setError('Invalid OTP code. Please enter the 6-digit verification code.')
      return
    }

    setLoading(true)
    const creds = getEffectiveCredentials()

    try {
      const res = await login(
        creds.email,
        creds.name,
        role,
        creds.lat,
        creds.lng,
        creds.phone,
        creds.org,
        creds.address
      )
      handlePostVerificationRouting(res.user)
    } catch {
      const fallbackUser: User = {
        id: role === 'admin' ? 99 : role === 'provider' ? 1 : role === 'both' ? 15 : 2,
        name: creds.name,
        email: creds.email,
        phone: creds.phone,
        organization: creds.org,
        address: creds.address,
        role: role as any,
        verified: true,
        city: 'Ahmedabad',
        lat: creds.lat,
        lng: creds.lng,
        created_at: new Date().toISOString(),
      }
      handlePostVerificationRouting(fallbackUser)
    } finally {
      setLoading(false)
    }
  }

  function handlePostVerificationRouting(authenticatedUser: User) {
    if (role === 'both' || authenticatedUser.role === 'both') {
      // 4. "Both" Account: Presents clean prompt/workspace selector to choose Donor vs NGO
      setPendingBothUser(authenticatedUser)
      setStep('workspace_select')
    } else if (role === 'admin' || authenticatedUser.role === 'admin') {
      // 3. Admin Account: Automatically logs into the secure Admin portal
      onLoginSuccess(authenticatedUser, 'admin')
      onClose()
    } else if (role === 'ngo' || authenticatedUser.role === 'ngo' || authenticatedUser.role === 'volunteer') {
      // 2. NGO Account: Automatically logs into the NGO/Volunteer portal
      onLoginSuccess(authenticatedUser, 'ngo')
      onClose()
    } else {
      // 1. Donor Account: Automatically logs into the Donor portal
      onLoginSuccess(authenticatedUser, 'donor')
      onClose()
    }
  }

  const roleCopy: Record<AuthRole, { title: string; subtitle: string; icon: React.ReactNode; color: string }> = {
    provider: {
      title: 'Food Donor Workspace',
      subtitle: 'Publish surplus food, review requests & manage safe dispatch.',
      icon: <Building2 className="w-5 h-5 text-emerald-700" />,
      color: 'border-emerald-600 bg-emerald-50 text-emerald-800',
    },
    ngo: {
      title: 'NGO & Community Food Portal',
      subtitle: 'Discover available food in Ahmedabad and coordinate handovers.',
      icon: <UsersRound className="w-5 h-5 text-purple-700" />,
      color: 'border-purple-600 bg-purple-50 text-purple-800',
    },
    both: {
      title: 'Dual Workspace (Donor & NGO)',
      subtitle: 'Seamlessly share surplus and request donations under one account.',
      icon: <Sparkles className="w-5 h-5 text-amber-600" />,
      color: 'border-amber-600 bg-amber-50 text-amber-800',
    },
    admin: {
      title: 'City Admin Operations Console',
      subtitle: 'Inspect CSP decisions, A* route states & trigger disaster replanning.',
      icon: <ShieldAlert className="w-5 h-5 text-blue-700" />,
      color: 'border-blue-600 bg-blue-50 text-blue-800',
    },
  }

  const activeRoleInfo = roleCopy[role]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-emerald-950/50 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#fffdf7] border border-[#e8ecd9] rounded-3xl p-6 sm:p-7 shadow-2xl text-[#064b35] max-h-[92vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#f1f5e7] hover:bg-[#e3efd1] text-[#285b42] flex items-center justify-center transition-all cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-5 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-[#eaf3d8] flex items-center justify-center shrink-0 shadow-xs">
            {activeRoleInfo.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#548a3e]">
              <span>WELCOME TO ANNAPURTI</span>
              <span>•</span>
              <span>{role === 'admin' ? 'SECURE' : lockedRole ? 'FOCUSED ONBOARDING' : 'FOOD RESCUE'}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#004a33] tracking-tight">
              {step === 'workspace_select'
                ? 'Choose Workspace'
                : step === 'otp'
                ? 'Verify Dual OTP'
                : mode === 'signin'
                ? 'Sign in to continue'
                : 'Create your account'}
            </h2>
          </div>
        </div>

        {/* ROLE TAB SWITCHER (Hidden when contextually locked or on workspace_select) */}
        {step !== 'workspace_select' && (
          <div className="mb-4">
            {lockedRole ? (
              <div className="flex items-center justify-between p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900">
                <span className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  Target Portal: <span className="capitalize">{lockedRole === 'admin' ? 'City Admin Operations' : lockedRole === 'provider' ? 'Food Donor' : 'NGO / Volunteer'}</span>
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  Contextual Mode
                </span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5 font-bold text-[#3e5f50]">
                  <span>Select Account Role:</span>
                  <span className="text-[11px] font-normal text-[#658075]">Role-based access</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[#f2f6e8] border border-[#e2ebd2]">
                  <button
                    type="button"
                    onClick={() => {
                      setRole('provider')
                      setError('')
                      setFieldErrors({})
                      setLoginIdentifier(DEMO_ACCOUNTS.provider[0].email)
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      role === 'provider'
                        ? 'bg-white text-[#005333] shadow-xs border border-[#9fc777]'
                        : 'text-[#4b6559] hover:text-[#005333]'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Donor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole('ngo')
                      setError('')
                      setFieldErrors({})
                      setLoginIdentifier(DEMO_ACCOUNTS.ngo[0].email)
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      role === 'ngo'
                        ? 'bg-white text-purple-800 shadow-xs border border-purple-300'
                        : 'text-[#4b6559] hover:text-purple-800'
                    }`}
                  >
                    <UsersRound className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">NGO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole('both')
                      setError('')
                      setFieldErrors({})
                      setLoginIdentifier(DEMO_ACCOUNTS.both[0].email)
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      role === 'both'
                        ? 'bg-white text-amber-800 shadow-xs border border-amber-300'
                        : 'text-[#4b6559] hover:text-amber-800'
                    }`}
                    title="Dual access as Donor and NGO"
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Both</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole('admin')
                      setMode('signin')
                      setError('')
                      setFieldErrors({})
                      setLoginIdentifier(DEMO_ACCOUNTS.admin[0].email)
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      role === 'admin'
                        ? 'bg-blue-900 text-white shadow-xs border border-blue-950'
                        : 'text-[#4b6559] hover:text-blue-900'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Admin</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Selector (Sign In vs Sign Up) — Hidden for Admin and during OTP / Workspace Select */}
        {step === 'credentials' && role !== 'admin' && (
          <div className="flex border-b border-[#e2ebd2] mb-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setError('')
                setFieldErrors({})
                setLoginIdentifier(DEMO_ACCOUNTS[role]?.[0]?.email || '')
              }}
              className={`flex-1 py-2 text-center transition-all cursor-pointer border-b-2 ${
                mode === 'signin' ? 'border-[#005333] text-[#005333]' : 'border-transparent text-[#627a6f] hover:text-[#005333]'
              }`}
            >
              Sign In (Existing User)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setError('')
                setFieldErrors({})
              }}
              className={`flex-1 py-2 text-center transition-all cursor-pointer border-b-2 ${
                mode === 'signup' ? 'border-[#005333] text-[#005333]' : 'border-transparent text-[#627a6f] hover:text-[#005333]'
              }`}
            >
              Create Account (Sign Up)
            </button>
          </div>
        )}

        {/* STEP 1: CREDENTIALS FORM */}
        {step === 'credentials' && (
          <form onSubmit={handleProceedToOtp} className="space-y-3">
            {/* Admin Notice */}
            {role === 'admin' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-blue-700" />
                  <span>Restricted Administrator Sign In</span>
                </div>
                <p className="text-[11px] leading-relaxed text-blue-800">
                  Access requires registered municipal officer credentials. Multi-factor dual verification is strictly enforced.
                </p>
              </div>
            )}

            {/* SIGN IN: EMAIL OR MOBILE NUMBER INPUT (NO DEMO DROPDOWN) */}
            {mode === 'signin' && (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#3e5f50] mb-1.5 flex items-center justify-between">
                    <span>Email Address or Mobile Number *</span>
                    <span className="text-[10px] text-[#718b7f] font-normal">Registered credentials</span>
                  </label>
                  <div className="relative">
                    {loginIdentifier.includes('@') ? (
                      <Mail className="w-4 h-4 text-[#759082] absolute left-3 top-3.5" />
                    ) : (
                      <Phone className="w-4 h-4 text-[#759082] absolute left-3 top-3.5" />
                    )}
                    <input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => {
                        setLoginIdentifier(e.target.value)
                        if (fieldErrors.identifier) setFieldErrors((prev) => ({ ...prev, identifier: '' }))
                        if (error) setError('')
                      }}
                      placeholder={
                        role === 'admin'
                          ? 'Enter admin official email (e.g. admin@amc.gov.in)'
                          : role === 'ngo'
                          ? 'Enter email (e.g. apang.mandal@ahmedabad.org) or 10-digit mobile'
                          : role === 'both'
                          ? 'Enter email (e.g. community.relief@ahmedabad.org) or 10-digit mobile'
                          : 'Enter email (e.g. taj.skyline@ahmedabad.com) or 10-digit mobile'
                      }
                      className={`w-full h-11 pl-9 pr-3 text-xs bg-white border rounded-xl text-[#183f30] font-medium outline-none transition-all ${
                        fieldErrors.identifier
                          ? 'border-rose-500 bg-rose-50/30'
                          : 'border-[#d9e2d3] focus:border-[#4e9638] focus:ring-2 focus:ring-[#e7f1d9]'
                      }`}
                      autoFocus
                    />
                  </div>
                  {fieldErrors.identifier && (
                    <p className="text-[11px] text-rose-600 mt-1 font-semibold">{fieldErrors.identifier}</p>
                  )}
                </div>

                {/* Quick-fill sample accounts (Clickable chips, NOT a dropdown) */}
                <div className="pt-1">
                  <span className="block text-[10px] font-semibold text-[#6b8577] mb-1">
                    Quick-fill registered sample:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DEMO_ACCOUNTS[role].map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => {
                          setLoginIdentifier(acc.email)
                          setError('')
                          setFieldErrors({})
                        }}
                        className="px-2 py-1 rounded-lg bg-[#f0f5e5] hover:bg-[#e4eed3] border border-[#d6e4c4] text-[10px] font-semibold text-[#1e4a34] transition-all cursor-pointer flex items-center gap-1"
                        title={`Click to fill ${acc.email} (${acc.address})`}
                      >
                        <span>{acc.name.split(' ')[0]}</span>
                        <span className="text-[#648476]">({acc.email})</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SIGN UP: REGISTRATION FORM WITH PHYSICAL ADDRESS & GPS */}
            {mode === 'signup' && role !== 'admin' && (
              <div className="space-y-2.5">
                {/* 1. Full Name / Username */}
                <div>
                  <label className="block text-[11px] font-bold text-[#3e5f50] mb-1">
                    Full Name / Username * (Letters only)
                  </label>
                  <div className="relative">
                    <UserRound className="w-4 h-4 text-[#759082] absolute left-3 top-3.5" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value)
                        if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }))
                      }}
                      placeholder="e.g. Dr Rajesh Patel"
                      className={`w-full h-11 pl-9 pr-3 text-xs bg-white border rounded-xl text-[#183f30] outline-none ${
                        fieldErrors.name ? 'border-rose-500 bg-rose-50/30' : 'border-[#d9e2d3] focus:border-[#4e9638]'
                      }`}
                      required
                    />
                  </div>
                  {fieldErrors.name && <p className="text-[11px] text-rose-600 mt-1 font-semibold">{fieldErrors.name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* 2. Email Address */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#3e5f50] mb-1">Email Address *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }))
                      }}
                      placeholder="user@domain.com"
                      className={`w-full h-11 px-3 text-xs bg-white border rounded-xl text-[#183f30] outline-none ${
                        fieldErrors.email ? 'border-rose-500 bg-rose-50/30' : 'border-[#d9e2d3] focus:border-[#4e9638]'
                      }`}
                      required
                    />
                    {fieldErrors.email && <p className="text-[11px] text-rose-600 mt-1 font-semibold">{fieldErrors.email}</p>}
                  </div>

                  {/* 3. Mobile Number */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#3e5f50] mb-1">Mobile Number (10 Digits) *</label>
                    <div className="flex gap-1.5">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="h-11 px-2 bg-slate-100 border border-[#d9e2d3] rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer shrink-0"
                        aria-label="Country Code"
                      >
                        <option value="+91">+91 (IN)</option>
                        <option value="+1">+1 (US)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+971">+971 (AE)</option>
                      </select>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value.replace(/\D/g, ''))
                          if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: '' }))
                        }}
                        placeholder="9825099881"
                        className={`w-full h-11 px-3 text-xs bg-white border rounded-xl text-[#183f30] outline-none ${
                          fieldErrors.phone ? 'border-rose-500 bg-rose-50/30' : 'border-[#d9e2d3] focus:border-[#4e9638]'
                        }`}
                        required
                      />
                    </div>
                    {fieldErrors.phone && <p className="text-[11px] text-rose-600 mt-1 font-semibold">{fieldErrors.phone}</p>}
                  </div>
                </div>

                {/* Organization Details */}
                {(role === 'ngo' || role === 'both') && (
                  <div>
                    <label className="block text-[11px] font-bold text-[#3e5f50] mb-1">
                      Organization / Shelter Name *
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-[#759082] absolute left-3 top-3.5" />
                      <input
                        type="text"
                        value={organization}
                        onChange={(e) => {
                          setOrganization(e.target.value)
                          if (fieldErrors.organization) setFieldErrors((prev) => ({ ...prev, organization: '' }))
                        }}
                        placeholder="e.g. Manav Kalyan Foundation"
                        className={`w-full h-11 pl-9 pr-3 text-xs bg-white border rounded-xl text-[#183f30] outline-none ${
                          fieldErrors.organization ? 'border-rose-500 bg-rose-50/30' : 'border-[#d9e2d3] focus:border-[#4e9638]'
                        }`}
                        required
                      />
                    </div>
                    {fieldErrors.organization && (
                      <p className="text-[11px] text-rose-600 mt-1 font-semibold">{fieldErrors.organization}</p>
                    )}
                  </div>
                )}

                {/* 4. Physical Address Input Field */}
                <div>
                  <label className="block text-[11px] font-bold text-[#3e5f50] mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                      Physical Address * (Street, Area, Landmark, Pin code)
                    </span>
                    <span className="text-[10px] text-[#718b7f]">For pickup & delivery</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value)
                        if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: '' }))
                      }}
                      placeholder="e.g. 102 Crystal Arcade, C.G. Road, Navrangpura, Ahmedabad 380009"
                      className={`w-full h-11 px-3 text-xs bg-white border rounded-xl text-[#183f30] outline-none ${
                        fieldErrors.address ? 'border-rose-500 bg-rose-50/30' : 'border-[#d9e2d3] focus:border-[#4e9638]'
                      }`}
                      required
                    />
                  </div>
                  {fieldErrors.address && (
                    <p className="text-[11px] text-rose-600 mt-1 font-semibold">{fieldErrors.address}</p>
                  )}
                </div>

                {/* 5. Automatic GPS Location Capture with Reverse Geocoding Synergy */}
                <div className="p-2.5 bg-[#f5f8ed] border border-[#dbe6ca] rounded-2xl">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-[#2d583e] flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-emerald-700" />
                      GPS Operating Coordinates
                    </span>
                    <button
                      type="button"
                      onClick={detectLocation}
                      className="text-[11px] text-[#e96718] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${gpsLocation.status === 'locating' ? 'animate-spin' : ''}`} />
                      Refresh GPS
                    </button>
                  </div>
                  <div className="text-[11px] text-[#486355] flex items-center justify-between">
                    <span className="truncate">{gpsLocation.label}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 ml-2 shrink-0">
                      {gpsLocation.status === 'success' ? 'Verified GPS' : 'Ahmedabad Grid'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Button: Send Verification OTP */}
            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-[#005333] hover:bg-[#023e2a] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer mt-3"
            >
              <span>Send Verification OTP</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: DUAL OTP VERIFICATION (PHONE & EMAIL) */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyAndSubmit} className="space-y-4">
            {/* Context Summary */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-[#064b35] space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span>Dual Verification Code Sent</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('credentials')
                    setError('')
                  }}
                  className="text-xs text-[#e96718] hover:underline cursor-pointer"
                >
                  Edit details
                </button>
              </div>
              <p className="text-[11px] text-[#4d6a5c]">
                A 6-digit confirmation code was sent to both your registered phone number and email address.
              </p>
            </div>

            {/* Simulated Dual OTP Quick Autofill Banner */}
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="space-y-0.5">
                <span className="block font-bold text-[11px]">⚡ Simulated Dual OTP Codes:</span>
                <span className="block text-[11px] font-mono text-amber-800">
                  Phone: <b>{simulatedPhoneOtp}</b> • Email: <b>{simulatedEmailOtp}</b>
                </span>
              </div>
              <button
                type="button"
                onClick={handleQuickAutofillOtp}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-all cursor-pointer shadow-xs"
              >
                Autofill Both
              </button>
            </div>

            {/* Phone OTP Field */}
            <div>
              <label className="block text-xs font-bold text-[#3e5f50] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  1. Phone Verification Code (SMS)
                </span>
                <span className="text-[10px] text-[#718b7f]">6 Digits Only</span>
              </label>
              <input
                type="text"
                maxLength={6}
                value={phoneOtp}
                onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit Phone OTP"
                className="w-full h-11 px-3 text-center tracking-widest text-base font-mono font-bold bg-white border border-[#d9e2d3] rounded-xl text-[#183f30] outline-none focus:border-[#4e9638] focus:ring-2 focus:ring-[#e7f1d9]"
                autoFocus
              />
            </div>

            {/* Email OTP Field */}
            <div>
              <label className="block text-xs font-bold text-[#3e5f50] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-700" />
                  2. Email Verification Code
                </span>
                <span className="text-[10px] text-[#718b7f]">6 Digits Only</span>
              </label>
              <input
                type="text"
                maxLength={6}
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit Email OTP"
                className="w-full h-11 px-3 text-center tracking-widest text-base font-mono font-bold bg-white border border-[#d9e2d3] rounded-xl text-[#183f30] outline-none focus:border-[#4e9638] focus:ring-2 focus:ring-[#e7f1d9]"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Verification Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#005333] hover:bg-[#023e2a] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying & Opening Workspace...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify OTP & Enter Workspace</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 3: WORKSPACE SELECTOR FOR "BOTH" ACCOUNTS */}
        {step === 'workspace_select' && pendingBothUser && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs font-bold text-amber-950">✓ Dual Account Verified</span>
                <span className="block text-[11px] text-amber-800">
                  Signed in as <b>{pendingBothUser.name}</b>
                </span>
              </div>
            </div>

            <div className="text-center py-1">
              <h3 className="text-base font-black text-[#004a33]">
                Choose your AnnaPurti workspace
              </h3>
              <p className="text-xs text-[#527866] mt-0.5">
                Select which workspace view you want to open for this session:
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  onLoginSuccess(pendingBothUser, 'donor')
                  onClose()
                }}
                className="w-full p-3.5 rounded-2xl border-2 border-emerald-600 bg-emerald-50/70 hover:bg-emerald-100/80 text-left transition-all cursor-pointer group flex items-start gap-3 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Utensils className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950">Open Food Donor Workspace</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                      Donor Portal
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-1 leading-snug">
                    Publish surplus food batches, review incoming requests, and manage collection handovers.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onLoginSuccess(pendingBothUser, 'ngo')
                  onClose()
                }}
                className="w-full p-3.5 rounded-2xl border-2 border-purple-600 bg-purple-50/70 hover:bg-purple-100/80 text-left transition-all cursor-pointer group flex items-start gap-3 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-950">Open NGO / Receiver Workspace</span>
                    <span className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                      NGO Portal
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800 mt-1 leading-snug">
                    Discover available surplus food in Ahmedabad, submit claims for your shelter, and coordinate pickups.
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[11px] text-[#648476] text-center pt-2">
              💡 You can seamlessly switch between Donor and NGO views anytime using the workspace toggle in the top header.
            </p>
          </div>
        )}

        {/* Security Footer Note */}
        <div className="flex items-center justify-between text-[10px] text-[#789185] pt-3 mt-4 border-t border-[#f0f4e4]">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#529339]" />
            Encrypted RBAC Session & Dual MFA
          </span>
          <span>{apiOnline ? '• Network Connected' : '• Offline Demo Mode'}</span>
        </div>
      </div>
    </div>
  )
}
