import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Building2, HandHeart, Heart, Leaf, ShieldCheck, UsersRound, X,
} from 'lucide-react'
import { User, login } from '../api/client'

interface LandingLoginPageProps {
  onLoginSuccess: (user: User) => void
  apiOnline: boolean | null
}

type Role = 'provider' | 'ngo' | 'admin'
type NavItem = 'home' | 'restaurants' | 'ngos' | 'volunteers' | 'impact'
type DemoAccount = { name: string, email: string, lat: number, lng: number }

const accounts: Record<Role, DemoAccount[]> = {
  provider: [
    { name: 'Taj Skyline Hotel (Banquets & Dining)', email: 'taj.skyline@ahmedabad.com', lat: 23.0035, lng: 72.5015 },
    { name: 'Grand Taj Caterers & Banquets', email: 'taj.caterers@ahmedabad.com', lat: 23.0225, lng: 72.5714 },
    { name: 'Iscon Thal Banquets', email: 'iscon.thal@ahmedabad.com', lat: 23.0305, lng: 72.518 },
    { name: 'Courtyard by Marriott', email: 'marriott@ahmedabad.com', lat: 23.0278, lng: 72.5085 },
  ],
  ngo: [
    { name: 'Apang Manav Mandal Shelter', email: 'apang.mandal@ahmedabad.org', lat: 23.0425, lng: 72.541 },
    { name: 'Blind People’s Association', email: 'bpa@ahmedabad.org', lat: 23.011, lng: 72.535 },
    { name: 'Shishu Gruh Child Orphanage', email: 'shishu.gruh@ahmedabad.org', lat: 23.055, lng: 72.585 },
    { name: 'Robin Hood Army Slum Kitchen', email: 'rha.ahmedabad@robinhood.org', lat: 23.035, lng: 72.525 },
  ],
  admin: [
    { name: 'City AMC Operations Admin', email: 'admin@amc.gov.in', lat: 23.0225, lng: 72.5714 },
  ],
}

export const LandingLoginPage: React.FC<LandingLoginPageProps> = ({ onLoginSuccess, apiOnline }) => {
  const [loading, setLoading] = useState<Role | null>(null)
  const [flowStarted, setFlowStarted] = useState(false)
  const [activeNav, setActiveNav] = useState<NavItem>('home')
  const [focusedStep, setFocusedStep] = useState<number | null>(null)
  const [navMessage, setNavMessage] = useState('Choose a path to see how AnnaPurti helps.')
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginRole, setLoginRole] = useState<Role>('provider')
  const [accountIndex, setAccountIndex] = useState(0)
  const [customLogin, setCustomLogin] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customEmail, setCustomEmail] = useState('')
  const [loginError, setLoginError] = useState('')
  const flowRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = flowRef.current
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setFlowStarted(true)
        observer.disconnect()
      }
    }, { threshold: 0.25 })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  async function openPortal(role: Role, selectedAccount = 0) {
    const account = accounts[role][selectedAccount] || accounts[role][0]
    setLoading(role)
    try {
      const result = await login(account.email, account.name, role, account.lat, account.lng)
      onLoginSuccess(result.user)
    } catch {
      onLoginSuccess({
        id: role === 'admin' ? 99 : role === 'provider' ? 1 : 2,
        name: account.name, email: account.email, role, verified: true,
        city: 'Ahmedabad', created_at: new Date().toISOString(),
      })
    } finally { setLoading(null) }
  }

  function openLogin(role: Role = 'provider') {
    setLoginRole(role)
    setAccountIndex(0)
    setCustomLogin(false)
    setLoginError('')
    setLoginOpen(true)
  }

  function changeLoginRole(role: Role) {
    setLoginRole(role)
    setAccountIndex(0)
    setCustomLogin(false)
    setLoginError('')
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault()
    if (customLogin && (!customName.trim() || !customEmail.trim())) {
      setLoginError('Enter both your name and email to continue.')
      return
    }
    if (customLogin) {
      const fallback = accounts[loginRole][0]
      setLoading(loginRole)
      try {
        const result = await login(customEmail.trim(), customName.trim(), loginRole, fallback.lat, fallback.lng)
        onLoginSuccess(result.user)
      } catch {
        onLoginSuccess({ id: loginRole === 'admin' ? 99 : loginRole === 'provider' ? 1 : 2, name: customName.trim(), email: customEmail.trim(), role: loginRole, verified: true, city: 'Ahmedabad', created_at: new Date().toISOString() })
      } finally { setLoading(null); setLoginOpen(false) }
      return
    }
    await openPortal(loginRole, accountIndex)
    setLoginOpen(false)
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function handleNavigation(item: NavItem) {
    const details: Record<NavItem, { section: string, step: number | null, message: string }> = {
      home: { section: 'home', step: null, message: 'Back to the AnnaPurti overview.' },
      restaurants: { section: 'how-it-works', step: 0, message: 'For restaurants: share surplus food safely and quickly.' },
      ngos: { section: 'how-it-works', step: 1, message: 'For NGOs: discover nearby food and request what you need.' },
      volunteers: { section: 'how-it-works', step: 2, message: 'For volunteers: collect or deliver food to the community.' },
      impact: { section: 'impact', step: 3, message: 'See the difference every shared meal can make.' },
    }
    const target = details[item]
    setActiveNav(item)
    setFocusedStep(target.step)
    setNavMessage(target.message)
    scrollToSection(target.section)
  }

  return (
    <div className="landing-page min-h-screen overflow-hidden bg-[#fffdf7] text-[#064b35]">
      <div className="landing-blob landing-blob-left" />
      <div className="landing-blob landing-blob-right" />

      <header className="landing-nav">
        <button type="button" className="brand" aria-label="AnnaPurti home" onClick={() => handleNavigation('home')}>
          <span className="brand-mark"><Leaf /><span className="brand-swoosh" /></span>
          <span><strong>Anna<span>Purti</span></strong><small>Helping Good Food Reach More People</small></span>
        </button>
        <nav className="nav-links" aria-label="Main navigation">
          <button type="button" className={activeNav === 'home' ? 'active' : ''} aria-current={activeNav === 'home' ? 'page' : undefined} onClick={() => handleNavigation('home')}>Home</button>
          <button type="button" className={activeNav === 'restaurants' ? 'active' : ''} aria-current={activeNav === 'restaurants' ? 'page' : undefined} onClick={() => handleNavigation('restaurants')}>For Restaurants</button>
          <button type="button" className={activeNav === 'ngos' ? 'active' : ''} aria-current={activeNav === 'ngos' ? 'page' : undefined} onClick={() => handleNavigation('ngos')}>For NGOs</button>
          <button type="button" className={activeNav === 'volunteers' ? 'active' : ''} aria-current={activeNav === 'volunteers' ? 'page' : undefined} onClick={() => handleNavigation('volunteers')}>For Volunteers</button>
          <button type="button" className={activeNav === 'impact' ? 'active' : ''} aria-current={activeNav === 'impact' ? 'page' : undefined} onClick={() => handleNavigation('impact')}>Our Impact</button>
        </nav>
        <button className="get-started" onClick={() => openLogin()}>
          Get Started <ArrowRight size={18} />
        </button>
      </header>
      <p className="nav-feedback" role="status">{navMessage}</p>

      <main id="home">
        <section className="hero-shell">
          <div className="hero-copy">
            <div className="eyebrow"><Leaf size={17} fill="currentColor" /> LET’S REDUCE FOOD WASTE TOGETHER</div>
            <h1>Extra Food Today. <i>♥</i><br /><em>Hope</em> for Someone Tomorrow.</h1>
            <p>AnnaPurti helps restaurants, caterers and event organizers share their extra food with NGOs and people in need — safely, quickly and responsibly.</p>
            <div className="hero-actions">
              <button className="primary-action" onClick={() => openLogin('provider')}><Leaf size={20} fill="currentColor" /> Share Extra Food <ArrowRight size={19} /></button>
              <button className="secondary-action" onClick={() => openLogin('ngo')}><UsersRound size={22} fill="currentColor" /> Find Food Near You</button>
            </div>
            <div className="hero-benefits">
              <Benefit icon={<HandHeart />} title="Support" text="People in Need" />
              <Benefit icon={<Leaf />} title="Reduce" text="Food Waste" />
              <Benefit icon={<ShieldCheck />} title="Safe & Responsible" text="Food Sharing" />
            </div>
          </div>
          <div className="hero-image-wrap">
            <img className="hero-image" src="/images/annapurti-hero-reference.png" alt="A chef sharing prepared meals with an NGO volunteer" />
          </div>
        </section>

        <section id="how-it-works" className="how-section" ref={flowRef}>
          <div className="curve-divider" />
          <h2>How AnnaPurti Helps</h2><div className="heading-stroke" />
          <div className="steps-grid">
            <Step image="/images/flow-share-food.png" title="Share Extra Food" text="Restaurants and event organizers list their surplus food with time and pickup details." animated={flowStarted} focused={focusedStep === 0} delay={0} onClick={() => openLogin('provider')} />
            <FlowConnector animated={flowStarted} delay={280} />
            <Step image="/images/flow-find-food.png" title="Find Nearby Food" text="NGOs and volunteers browse available food in their area and request what they need." animated={flowStarted} focused={focusedStep === 1} delay={440} onClick={() => openLogin('ngo')} />
            <FlowConnector animated={flowStarted} delay={720} />
            <Step image="/images/flow-deliver-food.png" title="Collect or Deliver" text="Food is picked up by volunteers, providers or delivery partners and reaches on time." animated={flowStarted} focused={focusedStep === 2} delay={880} onClick={() => openLogin('ngo')} />
            <FlowConnector animated={flowStarted} delay={1160} />
            <Step image="/images/flow-create-impact.png" title="Help Create Impact" text="Food reaches people in need, and providers receive updates with photos and feedback." animated={flowStarted} focused={focusedStep === 3} delay={1320} onClick={() => openLogin('ngo')} />
          </div>
        </section>

        <section className="join-section" aria-labelledby="join-title">
          <div className="join-copy"><span className="join-kicker">READY TO HELP?</span><h2 id="join-title">Choose your AnnaPurti workspace</h2><p>Whether you have food to share, a community to support, or a network to coordinate, there is a secure space made for you.</p></div>
          <div className="join-roles">
            <LoginChoice icon={<Building2 />} title="Restaurant or individual" text="List available food and manage pickups." action="Sign in as donor" onClick={() => openLogin('provider')} />
            <LoginChoice icon={<UsersRound />} title="NGO or volunteer" text="Find food nearby and help it reach people." action="Sign in as NGO" onClick={() => openLogin('ngo')} />
            <LoginChoice icon={<ShieldCheck />} title="Platform administrator" text="Manage dispatch, safety and impact reporting." action="Admin sign in" admin onClick={() => openLogin('admin')} />
          </div>
        </section>

        <section id="impact" className="impact-strip">
          <Impact icon={<UsersRound />} top="More Meals" bottom="for Communities" />
          <Impact icon={<Leaf />} top="Less Food" bottom="Going to Waste" />
          <Impact icon={<Heart fill="currentColor" />} top="Stronger" bottom="Local Support" />
          <Impact icon={<HandHeart />} top="Cleaner & Greener" bottom="Environment" />
        </section>
      </main>
      <footer className="landing-footer"><span>AnnaPurti • Helping good food reach more people</span><span className="footer-status"><b className={apiOnline ? 'online' : ''} /> {apiOnline ? 'Food network online' : 'Connecting to food network'}</span><button onClick={() => openLogin('admin')}>Admin access</button></footer>
      {loginOpen && <LoginModal role={loginRole} accountIndex={accountIndex} customLogin={customLogin} customName={customName} customEmail={customEmail} loading={loading} error={loginError} onClose={() => setLoginOpen(false)} onRoleChange={changeLoginRole} onAccountChange={setAccountIndex} onCustomToggle={() => { setCustomLogin(!customLogin); setLoginError('') }} onNameChange={setCustomName} onEmailChange={setCustomEmail} onSubmit={submitLogin} />}
    </div>
  )
}

const Benefit = ({ icon, title, text }: { icon: React.ReactNode, title: string, text: string }) => <div className="benefit"><span>{icon}</span><p><b>{title}</b><br />{text}</p></div>
const Step = ({ image, title, text, animated, focused, delay, onClick }: { image: string, title: string, text: string, animated: boolean, focused: boolean, delay: number, onClick: () => void }) => <button type="button" className={`journey-step ${animated ? 'is-animated' : ''} ${focused ? 'is-focused' : ''}`} style={{ animationDelay: `${delay}ms` }} onClick={onClick}><img src={image} alt="" /><h3>{title}</h3><p>{text}</p><span className="journey-cta">Explore <ArrowRight size={14} /></span></button>
const FlowConnector = ({ animated, delay }: { animated: boolean, delay: number }) => <div className={`journey-connector ${animated ? 'is-animated' : ''}`} style={{ animationDelay: `${delay}ms` }} aria-hidden="true"><span /></div>
const Impact = ({ icon, top, bottom }: { icon: React.ReactNode, top: string, bottom: string }) => <div className="impact-item"><span>{icon}</span><p><b>{top}</b><br />{bottom}</p></div>
const LoginChoice = ({ icon, title, text, action, admin = false, onClick }: { icon: React.ReactNode, title: string, text: string, action: string, admin?: boolean, onClick: () => void }) => <article className={`login-choice ${admin ? 'admin' : ''}`}><span>{icon}</span><div><h3>{title}</h3><p>{text}</p><button type="button" onClick={onClick}>{action} <ArrowRight size={15} /></button></div></article>

const LoginModal = ({ role, accountIndex, customLogin, customName, customEmail, loading, error, onClose, onRoleChange, onAccountChange, onCustomToggle, onNameChange, onEmailChange, onSubmit }: {
  role: Role, accountIndex: number, customLogin: boolean, customName: string, customEmail: string, loading: Role | null, error: string,
  onClose: () => void, onRoleChange: (role: Role) => void, onAccountChange: (index: number) => void, onCustomToggle: () => void,
  onNameChange: (value: string) => void, onEmailChange: (value: string) => void, onSubmit: (event: React.FormEvent) => void,
}) => {
  const roleCopy: Record<Role, { title: string, detail: string, icon: React.ReactNode, action: string }> = {
    provider: { title: 'Restaurant or individual donor', detail: 'List surplus food and manage safe pickups.', icon: <Building2 />, action: 'Open donor portal' },
    ngo: { title: 'NGO or volunteer', detail: 'Find nearby food and coordinate community delivery.', icon: <UsersRound />, action: 'Open NGO portal' },
    admin: { title: 'Administrator', detail: 'Access dispatch, safety controls and platform insights.', icon: <ShieldCheck />, action: 'Open admin console' },
  }
  const active = roleCopy[role]
  return <div className="login-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="login-close" aria-label="Close sign in" onClick={onClose}><X size={20} /></button>
      <div className="login-heading"><span className="login-icon">{active.icon}</span><div><p>WELCOME TO ANNAPURTI</p><h2 id="login-title">Sign in to continue</h2><span>{active.detail}</span></div></div>
      <div className="login-roles" aria-label="Choose account type">
        <button type="button" className={role === 'provider' ? 'selected' : ''} onClick={() => onRoleChange('provider')}><Building2 size={18} /> Donor</button>
        <button type="button" className={role === 'ngo' ? 'selected' : ''} onClick={() => onRoleChange('ngo')}><UsersRound size={19} /> NGO / Volunteer</button>
        <button type="button" className={role === 'admin' ? 'selected admin' : ''} onClick={() => onRoleChange('admin')}><ShieldCheck size={18} /> Admin</button>
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <div className="login-form-label"><label>{customLogin ? 'Your details' : 'Demo account'}</label><button type="button" onClick={onCustomToggle}>{customLogin ? 'Use a demo account' : 'Use a different account'}</button></div>
        {customLogin ? <><input value={customName} onChange={(event) => onNameChange(event.target.value)} placeholder="Organisation or your name" autoComplete="name" /><input value={customEmail} onChange={(event) => onEmailChange(event.target.value)} placeholder="Email address" type="email" autoComplete="email" /></> : <select value={accountIndex} onChange={(event) => onAccountChange(Number(event.target.value))}>{accounts[role].map((account, index) => <option key={account.email} value={index}>{account.name}</option>)}</select>}
        {error && <p className="login-error">{error}</p>}
        <button className="login-submit" type="submit" disabled={!!loading}>{loading === role ? 'Opening your workspace...' : <>{active.action} <ArrowRight size={18} /></>}</button>
      </form>
      <div className="login-panel-note"><ShieldCheck size={15} /> {role === 'admin' ? 'Admin tools are isolated from donor and NGO workspaces.' : 'Your workspace is tailored to your role and kept separate from admin controls.'}</div>
    </section>
  </div>
}
