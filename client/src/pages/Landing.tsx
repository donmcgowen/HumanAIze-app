import { useEffect, useRef } from "react";

// ─── Animated counter hook ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, start = false) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!start || !ref.current) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const value = Math.floor(progress * target);
      if (ref.current) ref.current.textContent = value.toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return ref;
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="group relative bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 hover:border-cyan-500/50 rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── App card ─────────────────────────────────────────────────────────────────
function AppCard({
  icon, title, desc, badge, href,
}: { icon: string; title: string; desc: string; badge?: string; href: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="group flex flex-col bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 hover:border-cyan-400/60 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-1 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="text-4xl">{icon}</div>
        {badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed flex-1">{desc}</p>
      <div className="mt-4 flex items-center text-cyan-400 text-sm font-medium">
        <span>Learn more</span>
        <svg className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
}

// ─── Testimonial card ─────────────────────────────────────────────────────────
function TestimonialCard({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-6">
      <div className="text-cyan-400 text-3xl mb-3">"</div>
      <p className="text-gray-300 text-sm leading-relaxed mb-4">{quote}</p>
      <div>
        <p className="text-white font-semibold text-sm">{name}</p>
        <p className="text-gray-500 text-xs">{role}</p>
      </div>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function Landing() {
  // Intersection observer for scroll animations
  const heroVisible = useRef(true);
  const statsRef = useRef<HTMLDivElement>(null);
  const statsVisible = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-in");
            statsVisible.current = true;
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".scroll-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans overflow-x-hidden">
      {/* ── Global styles injected inline ── */}
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 0 20px rgba(6,182,212,0.3); } 50% { box-shadow: 0 0 40px rgba(6,182,212,0.6); } }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        .hero-title { animation: fadeInUp 0.8s ease both; }
        .hero-sub   { animation: fadeInUp 0.8s 0.15s ease both; }
        .hero-cta   { animation: fadeInUp 0.8s 0.3s ease both; }
        .hero-badge { animation: fadeIn 1s 0.5s ease both; }
        .float-card { animation: float 4s ease-in-out infinite; }
        .glow-btn   { animation: pulse-glow 3s ease-in-out infinite; }
        .scroll-reveal { opacity:0; transform:translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .scroll-reveal.animate-in { opacity:1; transform:translateY(0); }
        .gradient-text { background: linear-gradient(135deg, #06b6d4, #8b5cf6, #06b6d4); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation: gradient-shift 4s linear infinite; }
        @keyframes gradient-shift { 0%{background-position:0%} 100%{background-position:200%} }
        .grid-bg { background-image: linear-gradient(rgba(6,182,212,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.05) 1px, transparent 1px); background-size:40px 40px; }
      `}</style>

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-sm font-black text-white">H</div>
            <span className="text-xl font-black tracking-tight">
              Human<span className="text-cyan-400">AI</span>ze
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#platform" className="hover:text-white transition-colors">Platform</a>
            <a href="#apps" className="hover:text-white transition-colors">Apps</a>
            <a href="#about" className="hover:text-white transition-colors">About</a>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://app.humanaize.life/login"
              className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block"
            >
              Sign In
            </a>
            <a
              href="https://app.humanaize.life"
              className="glow-btn text-sm font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-gray-950 hover:from-cyan-400 hover:to-cyan-300 transition-all"
            >
              Launch App →
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 grid-bg">
        {/* Radial glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="hero-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            AI-Powered Human Optimization Platform
          </div>
          <h1 className="hero-title text-5xl md:text-7xl font-black leading-tight mb-6">
            <span className="gradient-text">Humanaize</span>
            <br />
            <span className="text-white">Your Life</span>
          </h1>
          <p className="hero-sub text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed mb-10">
            Where <strong className="text-white">Human intelligence</strong> meets <strong className="text-cyan-400">AI precision</strong> — building personalized workflows and apps that help you optimize your health, fitness, and daily life.
          </p>
          <div className="hero-cta flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://app.humanaize.life"
              className="glow-btn inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-gray-950 font-bold text-lg hover:from-cyan-400 hover:to-cyan-300 transition-all shadow-lg shadow-cyan-500/25"
            >
              <span>Launch HumanAIze App</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a
              href="#platform"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-gray-700 text-gray-300 font-semibold text-lg hover:border-gray-500 hover:text-white transition-all"
            >
              Explore Platform
            </a>
          </div>

          {/* Floating app preview card */}
          <div className="float-card mt-16 mx-auto max-w-2xl bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 bg-gray-800 rounded-md px-3 py-1 text-xs text-gray-500">app.humanaize.life</div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Calories", value: "1,840", color: "text-cyan-400" },
                { label: "Protein", value: "142g", color: "text-green-400" },
                { label: "Carbs", value: "195g", color: "text-yellow-400" },
                { label: "Fat", value: "58g", color: "text-purple-400" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 bg-gray-800/60 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-lg">✨</div>
              <div className="flex-1">
                <p className="text-xs text-gray-300 font-medium">AI Insight</p>
                <p className="text-xs text-gray-500">You're 85% to your protein goal — add a protein shake to hit your target.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 border-y border-gray-800/50 bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "AI-First", label: "Architecture" },
              { value: "5+", label: "Core Apps" },
              { value: "Real-Time", label: "Insights" },
              { value: "100%", label: "Personalized" },
            ].map((s) => (
              <div key={s.label} className="scroll-reveal">
                <p className="text-3xl md:text-4xl font-black text-cyan-400 mb-1">{s.value}</p>
                <p className="text-gray-500 text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform section ── */}
      <section id="platform" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16 scroll-reveal">
          <p className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3">The Platform</p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Human + AI, <span className="gradient-text">Working Together</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            HumanAIze is a platform for building intelligent workflows and applications that augment human capability — starting with health and fitness, expanding to every dimension of life.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: "🧠",
              title: "AI-Powered Intelligence",
              desc: "Every feature is powered by Gemini AI — from food recognition and macro calculation to personalized workout plans and health insights tailored to your unique profile.",
            },
            {
              icon: "🔄",
              title: "Human-AI Workflows",
              desc: "We build workflows where AI handles the analysis and pattern recognition while you stay in control of the decisions. The best of both worlds, seamlessly integrated.",
            },
            {
              icon: "📊",
              title: "Data-Driven Personalization",
              desc: "Your age, weight, height, health conditions, activity level, and goals all feed into a personalized AI model that gives you advice no generic app can match.",
            },
            {
              icon: "📱",
              title: "Cross-Platform Apps",
              desc: "Available on web and mobile (iOS/Android via Expo). Your data syncs across all devices so you're always connected to your health journey.",
            },
            {
              icon: "🔒",
              title: "Private & Secure",
              desc: "Your health data is yours. We use enterprise-grade security with encrypted storage and never sell your personal information to third parties.",
            },
            {
              icon: "⚡",
              title: "Real-Time Insights",
              desc: "Instant feedback as you log food, complete workouts, or update your metrics. AI insights update in real time so you always know where you stand.",
            },
          ].map((f) => (
            <div key={f.title} className="scroll-reveal">
              <FeatureCard {...f} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Apps section ── */}
      <section id="apps" className="py-24 bg-gray-900/30 border-y border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 scroll-reveal">
            <p className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3">Platform Apps</p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Everything You Need,<br /><span className="gradient-text">All in One Place</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              The HumanAIze platform starts with a comprehensive health and fitness suite — and grows with you.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: "🍎",
                title: "AI Food Logger",
                desc: "Scan barcodes, photograph meals, or type naturally. Gemini AI identifies your food and calculates exact macros. Brand-specific search finds Oberweis, not Hershey.",
                badge: "Live",
                href: "https://app.humanaize.life/food-logging",
              },
              {
                icon: "💪",
                title: "AI Workout Planner",
                desc: "Get fully personalized workout plans based on your goal (fat loss, muscle gain), fitness level, and today's nutrition. Type your workout in plain English and AI organizes it.",
                badge: "Live",
                href: "https://app.humanaize.life/workouts",
              },
              {
                icon: "📈",
                title: "Health Monitor",
                desc: "Track weight, body measurements (chest, waist, hips), and progress photos. AI calculates your weekly loss rate and estimates your goal completion date.",
                badge: "Live",
                href: "https://app.humanaize.life/monitoring",
              },
              {
                icon: "✨",
                title: "AI Assistant",
                desc: "Your personal AI health coach powered by Gemini. Ask anything about nutrition, fitness, or your progress. It knows your full profile, food log, and workout history.",
                badge: "Live",
                href: "https://app.humanaize.life/assistant",
              },
              {
                icon: "👤",
                title: "Smart Profile",
                desc: "Your profile drives everything. Age, height, weight, health conditions, activity level, and goals are used by every AI feature to give you personalized recommendations.",
                badge: "Live",
                href: "https://app.humanaize.life/profile",
              },
              {
                icon: "🚀",
                title: "More Apps Coming",
                desc: "The HumanAIze platform is expanding. Sleep optimization, stress management, financial wellness, and productivity tools — all powered by the same Human+AI philosophy.",
                badge: "Soon",
                href: "#",
              },
            ].map((app) => (
              <div key={app.title} className="scroll-reveal">
                <AppCard {...app} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 scroll-reveal">
          <p className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Start in <span className="gradient-text">3 Simple Steps</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Build Your Profile",
              desc: "Enter your age, height, weight, health conditions, and fitness goal. This data powers every AI recommendation you receive.",
            },
            {
              step: "02",
              title: "Log Your Day",
              desc: "Scan food barcodes, photograph meals, or type naturally. Log workouts in plain English. AI handles all the analysis.",
            },
            {
              step: "03",
              title: "Get AI Insights",
              desc: "Receive personalized nutrition targets, workout plans, and health insights — all tailored to your unique profile and daily activity.",
            },
          ].map((s, i) => (
            <div key={s.step} className="scroll-reveal relative">
              {i < 2 && (
                <div className="hidden md:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-cyan-500/30 to-transparent z-10" />
              )}
              <div className="text-5xl font-black text-cyan-500/20 mb-4">{s.step}</div>
              <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
              <p className="text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 bg-gray-900/30 border-y border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 scroll-reveal">
            <p className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3">Early Users</p>
            <h2 className="text-4xl font-black text-white mb-4">
              Real People, <span className="gradient-text">Real Results</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: "The AI food scanner actually found my exact protein powder brand with the right macros. No more guessing.",
                name: "Mike T.",
                role: "Bodybuilder, 3 months on HumanAIze",
              },
              {
                quote: "I typed 'bench press 3 sets of 10 at 200 lbs' and it organized my whole workout automatically. That's the future.",
                name: "Sarah K.",
                role: "Fitness enthusiast",
              },
              {
                quote: "The AI assistant told me my calories were too low before my workout and suggested what to eat. It actually knows my data.",
                name: "James R.",
                role: "Weight loss journey, -22 lbs",
              },
            ].map((t) => (
              <div key={t.name} className="scroll-reveal">
                <TestimonialCard {...t} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="py-24 max-w-4xl mx-auto px-6 text-center">
        <div className="scroll-reveal">
          <p className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3">About</p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
            The <span className="gradient-text">HumanAIze</span> Mission
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed mb-6">
            We believe the future isn't AI replacing humans — it's AI <em>amplifying</em> humans. HumanAIze is a platform built on the principle that the best outcomes happen when human judgment and AI precision work together.
          </p>
          <p className="text-gray-400 text-lg leading-relaxed mb-6">
            We started with health and fitness because it's personal, measurable, and deeply impactful. But the HumanAIze platform is designed to grow — into productivity, finance, relationships, learning, and every other dimension of a well-lived life.
          </p>
          <p className="text-gray-300 text-lg font-medium">
            Our goal: help every person <span className="text-cyan-400">Humanaize their life</span> — living more intentionally, more effectively, and more fully with AI as their partner.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-gray-950 to-purple-900/20" />
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative max-w-3xl mx-auto px-6 text-center scroll-reveal">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
            Ready to <span className="gradient-text">Humanaize</span> Your Life?
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Join HumanAIze today and experience the power of AI-personalized health and fitness — free to start.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://app.humanaize.life/signup"
              className="glow-btn inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-gray-950 font-bold text-xl hover:from-cyan-400 hover:to-cyan-300 transition-all shadow-2xl shadow-cyan-500/30"
            >
              Get Started Free
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a
              href="https://app.humanaize.life"
              className="inline-flex items-center gap-2 px-10 py-5 rounded-xl border border-gray-700 text-gray-300 font-semibold text-xl hover:border-cyan-500/50 hover:text-white transition-all"
            >
              Launch App
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800/50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-xs font-black text-white">H</div>
              <span className="text-lg font-black">Human<span className="text-cyan-400">AI</span>ze</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="https://app.humanaize.life" className="hover:text-white transition-colors">App</a>
              <a href="https://app.humanaize.life/login" className="hover:text-white transition-colors">Sign In</a>
              <a href="https://app.humanaize.life/signup" className="hover:text-white transition-colors">Sign Up</a>
              <a href="mailto:support@humanaize.life" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-gray-600 text-sm">© 2026 HumanAIze. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
