import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Building2,
  HandHeart,
  Heart,
  Leaf,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { User } from '../api/client'
import { AuthModal, AuthRole, AuthMode } from './AuthModal'

interface LandingLoginPageProps {
  onLoginSuccess: (user: User, targetTab?: 'donor' | 'ngo' | 'admin' | 'impact') => void
  apiOnline: boolean | null
}

type NavItem = 'home' | 'restaurants' | 'ngos' | 'volunteers' | 'impact'

export const LandingLoginPage: React.FC<LandingLoginPageProps> = ({ onLoginSuccess, apiOnline }) => {
  const [flowStarted, setFlowStarted] = useState(false)
  const [activeNav, setActiveNav] = useState<NavItem>('home')
  const [focusedStep, setFocusedStep] = useState<number | null>(null)
  const [navMessage, setNavMessage] = useState('Choose a path to see how AnnaPurti helps.')

  // Auth Modal State with Contextual Role Locking
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authRole, setAuthRole] = useState<AuthRole>('provider')
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [lockedRole, setLockedRole] = useState<AuthRole | null>(null)

  const flowRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = flowRef.current
    if (!section) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setFlowStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  function openLogin(
    role: AuthRole = 'provider',
    mode: AuthMode = 'signin',
    locked: AuthRole | null = null
  ) {
    setAuthRole(role)
    setAuthMode(mode)
    setLockedRole(locked)
    setAuthModalOpen(true)
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function handleNavigation(item: NavItem) {
    const details: Record<NavItem, { section: string; step: number | null; message: string }> = {
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

      {/* Navigation Header */}
      <header className="landing-nav">
        <button type="button" className="brand" aria-label="AnnaPurti home" onClick={() => handleNavigation('home')}>
          <img src="/images/annapurti-logo.png" alt="AnnaPurti — Helping Good Food Reach More People" />
        </button>
        <nav className="nav-links" aria-label="Main navigation">
          <button
            type="button"
            className={activeNav === 'home' ? 'active' : ''}
            aria-current={activeNav === 'home' ? 'page' : undefined}
            onClick={() => handleNavigation('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={activeNav === 'restaurants' ? 'active' : ''}
            aria-current={activeNav === 'restaurants' ? 'page' : undefined}
            onClick={() => handleNavigation('restaurants')}
          >
            For Restaurants
          </button>
          <button
            type="button"
            className={activeNav === 'ngos' ? 'active' : ''}
            aria-current={activeNav === 'ngos' ? 'page' : undefined}
            onClick={() => handleNavigation('ngos')}
          >
            For NGOs
          </button>
          <button
            type="button"
            className={activeNav === 'volunteers' ? 'active' : ''}
            aria-current={activeNav === 'volunteers' ? 'page' : undefined}
            onClick={() => handleNavigation('volunteers')}
          >
            For Volunteers
          </button>
          <button
            type="button"
            className={activeNav === 'impact' ? 'active' : ''}
            aria-current={activeNav === 'impact' ? 'page' : undefined}
            onClick={() => handleNavigation('impact')}
          >
            Our Impact
          </button>
        </nav>

        {/* Account Logo / Profile Icon Button: Opens standard modal where all workspace options are available */}
        <button
          type="button"
          className="account-nav-btn flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#005333]/25 bg-[#005333]/5 hover:bg-[#005333]/15 text-[#005333] transition-all cursor-pointer shadow-xs"
          onClick={() => openLogin('provider', 'signin', null)}
          aria-label="Account Login and Register"
          title="Account Login / Sign Up"
        >
          <div className="w-7 h-7 rounded-full bg-[#005333] text-white flex items-center justify-center shadow-xs">
            <UserRound size={15} />
          </div>
          <span className="text-xs font-bold text-[#064b35] hidden sm:inline">Account</span>
        </button>
      </header>

      <p className="nav-feedback" role="status">
        {navMessage}
      </p>

      <main id="home">
        {/* Hero Section */}
        <section className="hero-shell">
          <div className="hero-copy">
            <div className="eyebrow">
              <Leaf size={17} fill="currentColor" /> LET’S REDUCE FOOD WASTE TOGETHER
            </div>
            <h1>
              Extra Food Today. <i>♥</i>
              <br />
              <em>Hope</em> for Someone Tomorrow.
            </h1>
            <p>
              AnnaPurti helps restaurants, caterers and event organizers share their extra food with NGOs and people in need —
              safely, quickly and responsibly.
            </p>
            <div className="hero-actions">
              {/* Contextual Trigger: Locked to Donor role */}
              <button
                className="primary-action cursor-pointer"
                onClick={() => openLogin('provider', 'signin', 'provider')}
              >
                <Leaf size={20} fill="currentColor" /> Share Extra Food <ArrowRight size={19} />
              </button>
              {/* Contextual Trigger: Locked to NGO role */}
              <button
                className="secondary-action cursor-pointer"
                onClick={() => openLogin('ngo', 'signin', 'ngo')}
              >
                <UsersRound size={22} fill="currentColor" /> Find Food Near You
              </button>
            </div>
            <div className="hero-benefits">
              <Benefit icon={<HandHeart />} title="Support" text="People in Need" />
              <Benefit icon={<Leaf />} title="Reduce" text="Food Waste" />
              <Benefit icon={<ShieldCheck />} title="Safe & Responsible" text="Food Sharing" />
            </div>
          </div>
          <div className="hero-image-wrap">
            <img
              className="hero-image"
              src="/images/annapurti-hero-reference.png"
              alt="A chef sharing prepared meals with an NGO volunteer"
            />
          </div>
        </section>

        {/* How AnnaPurti Helps Section */}
        <section id="how-it-works" className="how-section" ref={flowRef}>
          <div className="curve-divider" />
          <h2>How AnnaPurti Helps</h2>
          <div className="heading-stroke" />
          <div className="steps-grid">
            <Step
              image="/images/flow-share-food.png"
              title="Share Extra Food"
              text="Restaurants and event organizers list their surplus food with time and pickup details."
              animated={flowStarted}
              focused={focusedStep === 0}
              delay={0}
              onClick={() => openLogin('provider', 'signin', 'provider')}
            />
            <FlowConnector animated={flowStarted} delay={280} />
            <Step
              image="/images/flow-find-food.png"
              title="Find Nearby Food"
              text="NGOs and volunteers browse available food in their area and request what they need."
              animated={flowStarted}
              focused={focusedStep === 1}
              delay={440}
              onClick={() => openLogin('ngo', 'signin', 'ngo')}
            />
            <FlowConnector animated={flowStarted} delay={720} />
            <Step
              image="/images/flow-deliver-food.png"
              title="Collect or Deliver"
              text="Food is picked up by volunteers, providers or delivery partners and reaches on time."
              animated={flowStarted}
              focused={focusedStep === 2}
              delay={880}
              onClick={() => openLogin('ngo', 'signin', 'ngo')}
            />
            <FlowConnector animated={flowStarted} delay={1160} />
            <Step
              image="/images/flow-create-impact.png"
              title="Help Create Impact"
              text="Food reaches people in need, and providers receive updates with photos and feedback."
              animated={flowStarted}
              focused={focusedStep === 3}
              delay={1320}
              onClick={() => openLogin('ngo', 'signin', 'ngo')}
            />
          </div>
        </section>

        {/* Join Section */}
        <section className="join-section" aria-labelledby="join-title">
          <div className="join-copy">
            <span className="join-kicker">READY TO HELP?</span>
            <h2 id="join-title">Choose your AnnaPurti workspace</h2>
            <p>
              Whether you have food to share, a community to support, or a network to coordinate, there is a secure space made for
              you.
            </p>
          </div>
          <div className="join-roles">
            <LoginChoice
              icon={<Building2 />}
              title="Restaurant or individual"
              text="List available food and manage pickups."
              action="Sign in as donor"
              onClick={() => openLogin('provider', 'signin', 'provider')}
            />
            <LoginChoice
              icon={<UsersRound />}
              title="NGO or volunteer"
              text="Find food nearby and help it reach people."
              action="Sign in as NGO"
              onClick={() => openLogin('ngo', 'signin', 'ngo')}
            />
            <LoginChoice
              icon={<ShieldCheck />}
              title="Platform administrator"
              text="Manage dispatch, safety and impact reporting."
              action="Admin sign in"
              admin
              onClick={() => openLogin('admin', 'signin', 'admin')}
            />
          </div>
        </section>

        {/* Impact Highlights */}
        <section id="impact" className="impact-strip">
          <Impact icon={<UsersRound />} top="More Meals" bottom="for Communities" />
          <Impact icon={<Leaf />} top="Less Food" bottom="Going to Waste" />
          <Impact icon={<Heart fill="currentColor" />} top="Stronger" bottom="Local Support" />
          <Impact icon={<HandHeart />} top="Cleaner & Greener" bottom="Environment" />
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <span>AnnaPurti • Helping good food reach more people</span>
        <span className="footer-status">
          <b className={apiOnline ? 'online' : ''} /> {apiOnline ? 'Food network online' : 'Connecting to food network'}
        </span>
        <button type="button" onClick={() => openLogin('admin', 'signin', 'admin')}>
          Admin access
        </button>
      </footer>

      {/* Clean Modal with Dual OTP, 4 Roles, Geolocation, and Contextual Filtering */}
      <AuthModal
        isOpen={authModalOpen}
        initialRole={authRole}
        initialMode={authMode}
        lockedRole={lockedRole}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={onLoginSuccess}
        apiOnline={apiOnline}
      />
    </div>
  )
}

const Benefit = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <div className="benefit">
    <span>{icon}</span>
    <p>
      <b>{title}</b>
      <br />
      {text}
    </p>
  </div>
)

const Step = ({
  image,
  title,
  text,
  animated,
  focused,
  delay,
  onClick,
}: {
  image: string
  title: string
  text: string
  animated: boolean
  focused: boolean
  delay: number
  onClick: () => void
}) => (
  <button
    type="button"
    className={`journey-step ${animated ? 'is-animated' : ''} ${focused ? 'is-focused' : ''}`}
    style={{ animationDelay: `${delay}ms` }}
    onClick={onClick}
  >
    <img src={image} alt="" />
    <h3>{title}</h3>
    <p>{text}</p>
    <span className="journey-cta">
      Explore <ArrowRight size={14} />
    </span>
  </button>
)

const FlowConnector = ({ animated, delay }: { animated: boolean; delay: number }) => (
  <div className={`journey-connector ${animated ? 'is-animated' : ''}`} style={{ animationDelay: `${delay}ms` }} aria-hidden="true">
    <span />
  </div>
)

const Impact = ({ icon, top, bottom }: { icon: React.ReactNode; top: string; bottom: string }) => (
  <div className="impact-item">
    <span>{icon}</span>
    <p>
      <b>{top}</b>
      <br />
      {bottom}
    </p>
  </div>
)

const LoginChoice = ({
  icon,
  title,
  text,
  action,
  admin = false,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  text: string
  action: string
  admin?: boolean
  onClick: () => void
}) => (
  <article className={`login-choice ${admin ? 'admin' : ''}`}>
    <span>{icon}</span>
    <div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" onClick={onClick}>
        {action} <ArrowRight size={15} />
      </button>
    </div>
  </article>
)