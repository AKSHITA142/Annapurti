import React, { useState } from 'react'
import {
  X,
  UserRound,
  Mail,
  Phone,
  Building2,
  MapPin,
  RefreshCw,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UsersRound,
  ShieldAlert,
  Navigation,
  Edit3,
  Save,
} from 'lucide-react'
import { User, updateProfileApi } from '../api/client'

interface ProfileSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  user: User
  onLogout: () => void
  onUpdateUser: (updatedUser: User) => void
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
  onUpdateUser,
}) => {
  const [locating, setLocating] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [locationSuccess, setLocationSuccess] = useState('')
  const [locationError, setLocationError] = useState('')

  // Address edit state
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const [editAddress, setEditAddress] = useState<string>(
    user.address || 'Sindhu Bhavan Road, Bodakdev, Ahmedabad, Gujarat 380054'
  )

  // Manual coordinate edit toggle / state
  const [manualEdit, setManualEdit] = useState(false)
  const [editLat, setEditLat] = useState<string>(user.lat?.toString() || '23.0225')
  const [editLng, setEditLng] = useState<string>(user.lng?.toString() || '72.5714')

  if (!isOpen) return null

  const roleLabels: Record<User['role'], { title: string; badge: string; icon: React.ReactNode; color: string }> = {
    provider: {
      title: 'Food Donor Workspace',
      badge: 'Surplus Provider',
      icon: <Building2 className="w-5 h-5 text-emerald-700" />,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    ngo: {
      title: 'NGO / Volunteer Portal',
      badge: 'Community Receiver',
      icon: <UsersRound className="w-5 h-5 text-purple-700" />,
      color: 'bg-purple-50 text-purple-800 border-purple-200',
    },
    volunteer: {
      title: 'Volunteer Portal',
      badge: 'Field Volunteer',
      icon: <UsersRound className="w-5 h-5 text-purple-700" />,
      color: 'bg-purple-50 text-purple-800 border-purple-200',
    },
    both: {
      title: 'Dual Workspace (Donor & NGO)',
      badge: 'Dual Member',
      icon: <Sparkles className="w-5 h-5 text-amber-700" />,
      color: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    admin: {
      title: 'City Admin Operations Console',
      badge: 'Platform Administrator',
      icon: <ShieldAlert className="w-5 h-5 text-blue-700" />,
      color: 'bg-blue-50 text-blue-800 border-blue-200',
    },
  }

  const roleMeta = roleLabels[user.role] || roleLabels.provider

  // Handler for saving physical address to backend database
  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault()
    setLocationError('')
    setLocationSuccess('')

    const trimmed = editAddress.trim()
    if (!trimmed) {
      setLocationError('Physical address cannot be empty.')
      return
    }

    setSavingAddress(true)
    try {
      const updated = await updateProfileApi({
        address: trimmed,
        lat: user.lat,
        lng: user.lng,
      })
      if (updated) {
        onUpdateUser(updated)
        setLocationSuccess('Physical address updated and saved to database successfully!')
        setIsEditingAddress(false)
      }
    } catch {
      setLocationError('Could not save address. Please try again.')
    } finally {
      setSavingAddress(false)
    }
  }

  // Handler for capturing browser device GPS & instant database persistence
  async function handleCaptureGpsLocation() {
    setLocationError('')
    setLocationSuccess('')

    if (!navigator.geolocation) {
      setLocationError('Browser geolocation is not supported on this device.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(4))
        const lng = parseFloat(pos.coords.longitude.toFixed(4))

        setEditLat(lat.toString())
        setEditLng(lng.toString())

        try {
          const updated = await updateProfileApi({ lat, lng, address: user.address || editAddress })
          if (updated) {
            onUpdateUser(updated)
            setLocationSuccess(`GPS re-synced: (${lat}, ${lng}) saved to database!`)
          }
        } catch {
          setLocationError('GPS captured but database update failed.')
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setLocating(false)
        setLocationError(
          err.code === 1
            ? 'Location access was denied. Please allow location permissions in your browser or enter coordinates manually.'
            : 'Unable to retrieve your current location. Please try again or edit manually.'
        )
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }

  // Handler for saving manual coordinates to backend database
  async function handleSaveManualCoordinates(e: React.FormEvent) {
    e.preventDefault()
    setLocationError('')
    setLocationSuccess('')

    const parsedLat = parseFloat(editLat)
    const parsedLng = parseFloat(editLng)

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setLocationError('Please enter a valid latitude between -90 and 90.')
      return
    }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setLocationError('Please enter a valid longitude between -180 and 180.')
      return
    }

    try {
      const updated = await updateProfileApi({
        lat: parsedLat,
        lng: parsedLng,
        address: user.address || editAddress,
      })
      if (updated) {
        onUpdateUser(updated)
        setLocationSuccess(`Coordinates updated to (${parsedLat}, ${parsedLng}) and persisted to database!`)
        setManualEdit(false)
      }
    } catch {
      setLocationError('Failed to save coordinates to database.')
    }
  }

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

        {/* Header Section */}
        <div className="flex items-center gap-3.5 mb-5 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-[#eaf3d8] flex items-center justify-center shrink-0 shadow-xs">
            {roleMeta.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#548a3e]">
              <span>ANNAPURTI ACCOUNT</span>
              <span>•</span>
              <span className={`px-2 py-0.5 rounded-md border text-[9px] font-bold ${roleMeta.color}`}>
                {roleMeta.badge}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#004a33] tracking-tight">
              Profile & Settings
            </h2>
          </div>
        </div>

        {/* User Information Display */}
        <div className="p-4 rounded-2xl bg-[#f2f6e8] border border-[#e2ebd2] mb-4 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-[#e0ebd0]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#005333] text-white flex items-center justify-center text-xs font-bold">
                <UserRound className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-xs font-bold text-[#084b33]">{user.name}</span>
                <span className="block text-[11px] text-[#557868]">{roleMeta.title}</span>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* Email Address */}
            <div className="p-2.5 rounded-xl bg-white border border-[#e0ebd0]">
              <span className="block text-[10px] font-bold uppercase text-[#718d7f] mb-0.5 flex items-center gap-1">
                <Mail className="w-3 h-3 text-[#529339]" /> Registered Email
              </span>
              <span className="block font-semibold text-[#0f3f2d] truncate" title={user.email}>
                {user.email}
              </span>
            </div>

            {/* Mobile Phone */}
            <div className="p-2.5 rounded-xl bg-white border border-[#e0ebd0]">
              <span className="block text-[10px] font-bold uppercase text-[#718d7f] mb-0.5 flex items-center gap-1">
                <Phone className="w-3 h-3 text-[#529339]" /> Mobile Phone
              </span>
              <span className="block font-semibold text-[#0f3f2d]">
                {user.phone || '+91 (Simulated OTP)'}
              </span>
            </div>

            {/* Organization */}
            <div className="p-2.5 rounded-xl bg-white border border-[#e0ebd0] sm:col-span-2">
              <span className="block text-[10px] font-bold uppercase text-[#718d7f] mb-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[#529339]" /> Organization / Facility
              </span>
              <span className="block font-semibold text-[#0f3f2d]">
                {user.organization || user.name}
              </span>
            </div>
          </div>
        </div>

        {/* Physical Address Section (Display & Inline Edit) */}
        <div className="p-4 rounded-2xl bg-white border border-[#d9e2d3] mb-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#084b33] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-700" />
              Physical Operating Address
            </span>
            {!isEditingAddress && (
              <button
                type="button"
                onClick={() => {
                  setEditAddress(user.address || editAddress)
                  setIsEditingAddress(true)
                  setLocationError('')
                  setLocationSuccess('')
                }}
                className="text-xs font-bold text-[#005333] hover:text-[#043322] flex items-center gap-1 cursor-pointer bg-[#eef5e4] px-2.5 py-1 rounded-lg border border-[#d2e2c0] transition-all"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit Address</span>
              </button>
            )}
          </div>

          {!isEditingAddress ? (
            <div className="p-3 rounded-xl bg-[#f7faf0] border border-[#e5edd7] text-xs">
              <span className="block text-[10px] font-bold uppercase text-[#718d7f] mb-0.5">
                Saved Street Address / Facility Landmark
              </span>
              <p className="font-semibold text-[#0c432f] leading-relaxed">
                {user.address || 'Sindhu Bhavan Road, Bodakdev, Ahmedabad, Gujarat 380054'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveAddress} className="space-y-2 pt-1">
              <textarea
                rows={2}
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                placeholder="Enter street, building, area, landmark, pin code..."
                className="w-full p-2.5 text-xs bg-white border border-emerald-400 rounded-xl text-[#183f30] outline-none focus:ring-2 focus:ring-emerald-200 resize-none font-medium"
                required
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingAddress}
                  className="flex-1 h-9 bg-[#005333] hover:bg-[#023e2a] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {savingAddress ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Saving to Database...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Address</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingAddress(false)}
                  className="h-9 px-3 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* GPS Coordinates & Re-sync Section */}
        <div className="p-4 rounded-2xl bg-white border border-[#d9e2d3] mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#084b33] flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-emerald-700" />
              GPS Coordinates & Logistics Node
            </span>
            <span className="text-[10px] font-mono text-[#527d6a] bg-[#f1f6ea] px-2 py-0.5 rounded-md">
              {user.lat?.toFixed(4) || '23.0225'}, {user.lng?.toFixed(4) || '72.5714'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f7faf0] border border-[#e5edd7] text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#557868]">Dispatched Area:</span>
              <span className="font-bold text-[#0c432f]">Ahmedabad City, Gujarat</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#557868]">Latitude:</span>
              <span className="font-mono font-bold text-[#0c432f]">{user.lat ?? 23.0225}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#557868]">Longitude:</span>
              <span className="font-mono font-bold text-[#0c432f]">{user.lng ?? 72.5714}</span>
            </div>
          </div>

          {/* Feedback Banners */}
          {locationSuccess && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{locationSuccess}</span>
            </div>
          )}

          {locationError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{locationError}</span>
            </div>
          )}

          {/* GPS Actions: Refresh GPS & Manual Edit Toggle */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              disabled={locating}
              onClick={handleCaptureGpsLocation}
              className="flex-1 h-10 px-3 rounded-xl bg-[#005333] hover:bg-[#023e2a] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-60"
            >
              {locating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Re-syncing GPS...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh GPS (Device Location)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setManualEdit(!manualEdit)
                setLocationError('')
                setLocationSuccess('')
              }}
              className="h-10 px-3 rounded-xl border border-[#d9e2d3] bg-[#f8fbf3] hover:bg-[#eef5e4] text-[#075039] text-xs font-bold transition-all cursor-pointer"
            >
              {manualEdit ? 'Cancel Manual Edit' : 'Edit Coordinates'}
            </button>
          </div>

          {/* Optional Manual Coordinates Input */}
          {manualEdit && (
            <form onSubmit={handleSaveManualCoordinates} className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 mt-2 space-y-2">
              <span className="block text-[11px] font-bold text-amber-900">
                Manual Coordinate Override (Testing or Custom Dispatch Node):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-amber-800 mb-0.5">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    className="w-full h-8 px-2 text-xs bg-white border border-amber-300 rounded-lg outline-none font-mono text-amber-950"
                    placeholder="23.0225"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-800 mb-0.5">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={editLng}
                    onChange={(e) => setEditLng(e.target.value)}
                    className="w-full h-8 px-2 text-xs bg-white border border-amber-300 rounded-lg outline-none font-mono text-amber-950"
                    placeholder="72.5714"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full h-8 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Save Custom Coordinates to Database
              </button>
            </form>
          )}
        </div>

        {/* Modal Action Buttons: Logout & Close */}
        <div className="pt-2 border-t border-[#e8ecd9] flex items-center justify-between gap-3">
          {/* Logout Button placed clearly at bottom */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out of Account</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#f1f5e7] hover:bg-[#e3efd1] text-[#285b42] transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
