import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Image,
  X,
  Users,
  CheckCircle2,
  Sparkles,
  HeartHandshake,
  Upload,
} from 'lucide-react'
import { ChatMessage, sendChatMessage, getChatMessages } from '../api/client'

interface DonorNgoChatModalProps {
  isOpen: boolean
  onClose: () => void
  requestId?: number
  orderTitle?: string
  partnerName?: string
  currentUserRole: 'provider' | 'ngo' | 'volunteer' | 'admin'
  defaultFeedbackMode?: boolean
}

const SAMPLE_DISTRIBUTION_PHOTOS = [
  {
    title: 'Children Lunch Distribution',
    url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&auto=format&fit=crop&q=80',
    desc: '40 hot meals served to Apang Manav Mandal children',
  },
  {
    title: 'Community Thali Service',
    url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&auto=format&fit=crop&q=80',
    desc: 'Hot khichdi distributed to pavement dwellers & laborers',
  },
  {
    title: 'Shelter Dinner Trays',
    url: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=600&auto=format&fit=crop&q=80',
    desc: 'Cottage cheese meal packets delivered fresh to elderly shelter',
  },
]

export const DonorNgoChatModal: React.FC<DonorNgoChatModalProps> = ({
  isOpen,
  onClose,
  requestId,
  orderTitle,
  partnerName,
  currentUserRole,
  defaultFeedbackMode = false,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [peopleServed, setPeopleServed] = useState<number>(40)
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(defaultFeedbackMode)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (defaultFeedbackMode) {
      setIsPhotoPickerOpen(true)
    }
  }, [defaultFeedbackMode])

  async function fetchMessages() {
    try {
      const data = await getChatMessages(requestId)
      setMessages(data)
    } catch (err) {
      console.error('Failed to load chat messages', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchMessages()
      const interval = setInterval(fetchMessages, 3000)
      return () => clearInterval(interval)
    }
  }, [isOpen, requestId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoUrl(reader.result)
        setIsPhotoPickerOpen(true)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!inputText.trim() && !photoUrl) return

    setSending(true)
    try {
      await sendChatMessage({
        request_id: requestId,
        message: inputText.trim() || 'Sharing meal distribution photo proof with restaurant donor.',
        photo_url: photoUrl || undefined,
        people_served: photoUrl ? peopleServed : undefined,
        message_type: photoUrl ? 'feedback_photo' : 'text',
      })
      setInputText('')
      setPhotoUrl(null)
      setIsPhotoPickerOpen(false)
      await fetchMessages()
    } catch (err) {
      console.error('Failed to send message', err)
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[650px] max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 to-[#0F382A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
              <MessageSquare className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-base text-white">
                  {currentUserRole === 'provider' ? 'Direct Chat with NGO Partner' : 'Direct Chat with Restaurant'}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  Live
                </span>
              </div>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                {partnerName ? `Connected with: ${partnerName}` : 'Communication & Meal Distribution Photo Proof'}
                {orderTitle ? ` • ${orderTitle}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/70">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <HeartHandshake className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                NGOs can send distribution photos and feedback; donors can coordinate food handover in real time.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe =
                (currentUserRole === 'provider' && m.sender_role === 'provider') ||
                (currentUserRole !== 'provider' && m.sender_role !== 'provider')

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 px-1">
                    <span className="font-bold text-slate-600">{m.sender_name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-black ${
                        m.sender_role === 'provider'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {m.sender_role === 'provider' ? 'Restaurant Donor' : 'NGO Shelter'}
                    </span>
                    <span>•</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 shadow-2xs space-y-2.5 ${
                      isMe
                        ? 'bg-emerald-700 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                    }`}
                  >
                    {/* Distribution Photo Proof Card */}
                    {m.photo_url && (
                      <div className="space-y-2">
                        <div className="relative rounded-xl overflow-hidden border border-slate-200/40 shadow-xs">
                          <img
                            src={m.photo_url}
                            alt="Meal distribution proof"
                            className="w-full h-48 object-cover hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Verified Distribution Proof</span>
                          </div>
                        </div>

                        {m.people_served && (
                          <div
                            className={`flex items-center space-x-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${
                              isMe ? 'bg-emerald-800/80 text-emerald-100' : 'bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>{m.people_served} people served with this surplus batch</span>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Photo Proof Attacher Drawer (For NGOs / Voluntaries sharing meal pictures) */}
        {isPhotoPickerOpen && (
          <div className="p-4 bg-emerald-50 border-t border-emerald-200 space-y-3 shrink-0 animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-emerald-900">
                  Attach Meal Distribution Photo &amp; Beneficiary Count
                </h4>
              </div>
              <button
                onClick={() => {
                  setIsPhotoPickerOpen(false)
                  setPhotoUrl(null)
                }}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Custom Photo URL / Upload option */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border border-dashed border-emerald-300 bg-white hover:bg-emerald-100/50 text-xs font-semibold text-emerald-800 cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Upload Photo from Device</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>

              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-emerald-200">
                <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs text-slate-600 shrink-0">People Fed:</span>
                <input
                  type="number"
                  min="1"
                  value={peopleServed}
                  onChange={(e) => setPeopleServed(Number(e.target.value))}
                  className="w-16 px-2 py-0.5 text-xs font-bold rounded-lg border border-slate-300 bg-slate-50 text-slate-800 text-center"
                />
              </div>
            </div>

            {/* Quick Sample Gallery for Demo/Instant Proof */}
            <div>
              <span className="text-[11px] font-bold text-emerald-800 block mb-1.5">
                Or select verified distribution photo:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {SAMPLE_DISTRIBUTION_PHOTOS.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPhotoUrl(item.url)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                      photoUrl === item.url ? 'border-emerald-600 ring-2 ring-emerald-400' : 'border-slate-200 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={item.url} alt={item.title} className="w-full h-16 object-cover" />
                    <span className="block text-[9px] font-bold text-center py-1 bg-white truncate px-1 text-slate-700">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {photoUrl && (
              <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold bg-white p-2 rounded-xl border border-emerald-200">
                <span>Photo attached! Enter notes below and click Send.</span>
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="text-rose-600 text-[11px] font-bold hover:underline"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsPhotoPickerOpen(!isPhotoPickerOpen)}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              isPhotoPickerOpen
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
            title="Attach distribution photo"
          >
            <Image className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              photoUrl
                ? 'Add notes (e.g., "Meals served hot to 40 children at the shelter")...'
                : 'Type message to coordinate handover or share feedback...'
            }
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
          />

          <button
            type="submit"
            disabled={sending || (!inputText.trim() && !photoUrl)}
            className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  )
}
