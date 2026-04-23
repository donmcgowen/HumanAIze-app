import { useEffect, useRef, useState } from "react";

function useCountUp(target: number, duration = 1800, start = false) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!start || !ref.current) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      if (ref.current) ref.current.textContent = Math.floor(progress * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return ref;
}

function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function ServiceCard({ icon, title, desc, tags }: { icon: string; title: string; desc: string; tags: string[] }) {
  return (
    <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-gray-700/60 hover:border-cyan-500/50 rounded-2xl p-7 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-1">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed mb-4">{desc}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map(t => <span key={t} className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{t}</span>)}
      </div>
    </div>
  );
}

function IntegrationBadge({ name, color, icon }: { name: string; color: string; icon: string }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${color} bg-gray-900/60 transition-all duration-200 hover:-translate-y-0.5`}>
      <span className="text-2xl">{icon}</span>
      <span className="font-semibold text-white text-sm">{name}</span>
    </div>
  );
}

function TestimonialCard({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-6">
      <p className="text-gray-300 text-sm leading-relaxed mb-4 italic">"{quote}"</p>
      <p className="text-white font-semibold text-sm">{name}</p>
      <p className="text-gray-500 text-xs">{role}</p>
    </div>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const statsRef = useInView(0.3);
  const c1 = useCountUp(47, 2000, statsRef.inView);
  const c2 = useCountUp(12, 1800, statsRef.inView);
  const c3 = useCountUp(99, 2200, statsRef.inView);

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a href="/" className="flex items-center gap-3">
              <img src="/humanaize-logo.png" alt="HumanAIze" className="h-10 w-10 object-contain" />
              <span className="text-xl font-bold">
                <span className="text-white">Human</span>
                <span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">AIze</span>
              </span>
            </a>
            <div className="hidden md:flex items-center gap-8">
              <a href="#services" className="text-gray-400 hover:text-white text-sm transition-colors">Services</a>
              <a href="#integrations" className="text-gray-400 hover:text-white text-sm transition-colors">Integrations</a>
              <a href="#apps" className="text-gray-400 hover:text-white text-sm transition-colors">Apps</a>
              <a href="#about" className="text-gray-400 hover:text-white text-sm transition-colors">About</a>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <a href="https://app.humanaize.life/login" className="text-sm text-gray-300 hover:text-white transition-colors px-4 py-2">Sign In</a>
              <a href="https://app.humanaize.life" className="text-sm font-semibold bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white px-5 py-2 rounded-lg transition-all shadow-lg shadow-cyan-500/20">Try the App</a>
            </div>
            <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setMenuOpen(!menuOpen)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
          {menuOpen && (
            <div className="md:hidden border-t border-gray-800 py-4 space-y-3">
              <a href="#services" className="block text-gray-400 hover:text-white text-sm py-2" onClick={() => setMenuOpen(false)}>Services</a>
              <a href="#integrations" className="block text-gray-400 hover:text-white text-sm py-2" onClick={() => setMenuOpen(false)}>Integrations</a>
              <a href="#apps" className="block text-gray-400 hover:text-white text-sm py-2" onClick={() => setMenuOpen(false)}>Apps</a>
              <a href="#about" className="block text-gray-400 hover:text-white text-sm py-2" onClick={() => setMenuOpen(false)}>About</a>
              <a href="https://app.humanaize.life" className="block text-sm font-semibold bg-gradient-to-r from-cyan-500 to-purple-600 text-white px-5 py-2 rounded-lg text-center mt-2">Try the App</a>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-purple-500/20 rounded-full blur-2xl scale-150" />
              <img src="/humanaize-logo.png" alt="HumanAIze Logo" className="relative h-32 w-32 object-contain drop-shadow-2xl" />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            AI-Powered Platform &amp; Development Studio
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
            <span className="text-white">Human</span>
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AIze</span>
            <br />
            <span className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold">Your Business</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            We build <strong className="text-white">AI-powered apps</strong>, intelligent <strong className="text-white">chatbots</strong>, and deep <strong className="text-white">AI integrations</strong> with Claude, Microsoft Copilot, and MCP servers — transforming how businesses operate with human + AI workflows.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href="https://app.humanaize.life" className="group flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all shadow-2xl shadow-cyan-500/25 hover:-translate-y-0.5">
              🚀 Demo the HumanAIze App
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
            <a href="#services" className="flex items-center gap-2 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all">
              Explore Services
            </a>
          </div>
          {/* App preview mockup */}
          <div className="relative max-w-2xl mx-auto">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <div className="flex-1 bg-gray-700 rounded-md px-3 py-1 text-xs text-gray-400 text-center">app.humanaize.life</div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <img src="/humanaize-logo.png" alt="" className="h-8 w-8 object-contain" />
                  <span className="font-bold text-white">HumanAIze Health App</span>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Live Demo</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {([["1,840","Calories","text-white"],["142g","Protein","text-cyan-400"],["195g","Carbs","text-yellow-400"],["58g","Fat","text-orange-400"]] as [string,string,string][]).map(([val,label,color]) => (
                    <div key={label} className="bg-gray-800 rounded-xl p-3 text-center">
                      <div className={`text-lg font-bold ${color}`}>{val}</div>
                      <div className="text-xs text-gray-500">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-2xl">✨</span>
                  <div>
                    <p className="text-xs font-semibold text-cyan-400 mb-1">AI Insight</p>
                    <p className="text-xs text-gray-300">You're 85% to your protein goal — add a protein shake or chicken breast to hit your target.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-gray-800/60 bg-gray-900/30">
        <div ref={statsRef.ref} className="max-w-5xl mx-auto px-4 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-extrabold bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent"><span ref={c1}>0</span>+</div>
            <div className="text-gray-400 text-sm mt-1">AI Integrations Built</div>
          </div>
          <div>
            <div className="text-4xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"><span ref={c2}>0</span>+</div>
            <div className="text-gray-400 text-sm mt-1">Apps Deployed</div>
          </div>
          <div>
            <div className="text-4xl font-extrabold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent"><span ref={c3}>0</span>%</div>
            <div className="text-gray-400 text-sm mt-1">Client Satisfaction</div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium mb-4">What We Build</div>
          <h2 className="text-4xl font-extrabold text-white mb-4">Full-Stack AI Development</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">From custom AI-powered applications to enterprise chatbots and deep platform integrations — we build the intelligent systems that move your business forward.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ServiceCard icon="📱" title="AI-Powered Apps" desc="Full-stack web and mobile applications with Gemini, GPT-4, or Claude at the core. Real-time insights, personalized recommendations, and intelligent automation built into every screen." tags={["React","React Native","Expo","Node.js","Azure"]} />
          <ServiceCard icon="🤖" title="Intelligent Chatbots" desc="Custom chatbots that understand your business context, integrate with your data, and provide accurate, helpful responses 24/7. Deployable on web, Teams, Slack, or any platform." tags={["Claude","GPT-4","Gemini","RAG","Vector DB"]} />
          <ServiceCard icon="🔗" title="AI Platform Integrations" desc="Deep integrations with Claude, Microsoft Copilot, and MCP servers. We connect your existing tools and workflows to AI capabilities so your team works smarter, not harder." tags={["Claude API","Copilot","MCP","REST APIs","Webhooks"]} />
          <ServiceCard icon="⚙️" title="Microsoft MCP Servers" desc="Build and deploy Model Context Protocol servers that give AI models secure, structured access to your business data — files, databases, APIs, and enterprise systems." tags={["MCP","Azure","SharePoint","Teams","Graph API"]} />
          <ServiceCard icon="🧠" title="AI Workflow Automation" desc="Design and implement human-AI workflows where AI handles analysis, pattern recognition, and routine tasks while your team focuses on decisions that matter." tags={["n8n","Azure Logic Apps","Power Automate","Custom"]} />
          <ServiceCard icon="📊" title="Data & Analytics AI" desc="Transform raw business data into actionable intelligence. AI-powered dashboards, predictive analytics, anomaly detection, and natural language querying of your data." tags={["Power BI","Azure AI","SQL","Python","Gemini"]} />
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="py-24 bg-gray-900/40 border-y border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-medium mb-4">AI Integrations</div>
            <h2 className="text-4xl font-extrabold text-white mb-4">Powered by the Best AI Platforms</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">We integrate with the leading AI platforms so you get the best model for each use case — not locked into a single vendor.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <IntegrationBadge name="Claude (Anthropic)" color="border-orange-500/40 hover:border-orange-400/60" icon="🟠" />
            <IntegrationBadge name="Microsoft Copilot" color="border-blue-500/40 hover:border-blue-400/60" icon="🔵" />
            <IntegrationBadge name="MCP Servers" color="border-green-500/40 hover:border-green-400/60" icon="🟢" />
            <IntegrationBadge name="Google Gemini" color="border-cyan-500/40 hover:border-cyan-400/60" icon="✨" />
            <IntegrationBadge name="OpenAI GPT-4" color="border-gray-500/40 hover:border-gray-400/60" icon="⚡" />
            <IntegrationBadge name="Azure AI" color="border-blue-400/40 hover:border-blue-300/60" icon="☁️" />
          </div>
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-green-500/20 rounded-2xl p-8 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="text-5xl">🔌</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-3">Microsoft MCP Server Expertise</h3>
                <p className="text-gray-400 leading-relaxed mb-4">The <strong className="text-white">Model Context Protocol (MCP)</strong> is the new standard for giving AI models secure, structured access to your business data. We specialize in building MCP servers that connect Claude, Copilot, and other AI models to your SharePoint, Teams, databases, and internal APIs — enabling AI that truly knows your business.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["SharePoint","Teams","Dynamics 365","Azure DevOps"].map(t => (
                    <div key={t} className="text-center p-3 bg-gray-800/60 rounded-xl border border-gray-700/60">
                      <div className="text-xs text-gray-400">{t}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Apps */}
      <section id="apps" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-sm font-medium mb-4">Live Apps</div>
          <h2 className="text-4xl font-extrabold text-white mb-4">See What We've Built</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">The HumanAIze Health &amp; Fitness App is our flagship platform — a fully working example of what we build for clients.</p>
        </div>
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-cyan-500/20 rounded-3xl overflow-hidden mb-8">
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-10">
              <div className="flex items-center gap-4 mb-6">
                <img src="/humanaize-logo.png" alt="HumanAIze" className="h-14 w-14 object-contain" />
                <div>
                  <h3 className="text-2xl font-bold text-white">HumanAIze Health App</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Live — Try it Free</span>
                </div>
              </div>
              <p className="text-gray-400 leading-relaxed mb-6">A full-stack AI health and fitness platform built on React, React Native, Node.js, and Azure — powered by Google Gemini. Features AI food scanning, voice workout logging, personalized meal planning, body composition analysis, and a 24/7 AI health coach.</p>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {["AI Food Scanner (barcode + photo + voice)","AI Workout Planner & Voice Logger","Body Composition AI Analysis","Personalized Grocery Lists","Progress Photo Tracking","24/7 AI Health Coach"].map(f => (
                  <div key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-cyan-400 mt-0.5 shrink-0">✓</span>{f}
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="https://app.humanaize.life" className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold px-7 py-3 rounded-xl transition-all shadow-lg shadow-cyan-500/20">🚀 Launch Live Demo</a>
                <a href="https://app.humanaize.life/signup" className="flex items-center justify-center gap-2 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold px-7 py-3 rounded-xl transition-all">Create Free Account</a>
              </div>
            </div>
            <div className="lg:w-80 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 p-8 flex items-center justify-center border-t lg:border-t-0 lg:border-l border-gray-700/60">
              <div className="space-y-3 w-full">
                {([["Platform","Web + iOS + Android"],["AI Models","Gemini 2.5 Flash"],["Backend","Node.js + Azure"],["Database","MySQL (Azure)"],["Auth","JWT + Sessions"],["Storage","Azure Blob Storage"]] as [string,string][]).map(([label,value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className="text-gray-300 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/60 to-gray-800/60 border border-dashed border-gray-700/40 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">🚀</div>
          <h3 className="text-xl font-bold text-white mb-2">More Apps Coming</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">Sleep optimization, financial wellness, productivity AI, and more. Contact us to discuss a custom app for your business.</p>
        </div>
      </section>

      {/* How We Work */}
      <section className="py-24 bg-gray-900/40 border-y border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-white mb-4">How We Work</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">A simple, transparent process from idea to deployed AI solution.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {([["01","Discovery","We learn your business, your data, and your goals. We identify where AI can deliver the most impact."],["02","Design","We design the AI architecture — which models, which integrations, which data flows will power your solution."],["03","Build","Full-stack development with AI at the core. Web apps, mobile apps, chatbots, MCP servers, or all of the above."],["04","Deploy & Iterate","We deploy to Azure, monitor performance, and iterate based on real usage data and your feedback."]] as [string,string,string][]).map(([step,title,desc]) => (
              <div key={step} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-lg mb-4">{step}</div>
                <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-white mb-4">What People Are Saying</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <TestimonialCard quote="The AI food scanner found my exact protein powder brand with the right macros. No more guessing or manual entry." name="Mike T." role="Bodybuilder, 3 months on HumanAIze" />
          <TestimonialCard quote="I typed 'bench press 3 sets of 10 at 200 lbs' and it organized my whole workout automatically. That's the future of fitness apps." name="Sarah K." role="Fitness enthusiast" />
          <TestimonialCard quote="The AI assistant told me my calories were too low before my workout and suggested exactly what to eat. It actually knows my data." name="James R." role="Weight loss journey, -22 lbs" />
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-24 bg-gray-900/40 border-y border-gray-800/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-8">
            <img src="/humanaize-logo.png" alt="HumanAIze" className="h-20 w-20 object-contain" />
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-6">The HumanAIze Mission</h2>
          <p className="text-gray-400 text-lg leading-relaxed mb-6">We believe the future isn't AI replacing humans — it's AI <em className="text-white">amplifying</em> humans. HumanAIze is a platform and development studio built on the principle that the best outcomes happen when <strong className="text-white">human judgment and AI precision work together</strong>.</p>
          <p className="text-gray-400 leading-relaxed mb-10">We started with health and fitness because it's personal, measurable, and deeply impactful. But HumanAIze is designed to grow — into productivity, finance, enterprise workflows, and every dimension of a well-run business and well-lived life.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-br from-cyan-500/15 via-purple-500/15 to-transparent rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <div className="flex justify-center mb-6">
            <img src="/humanaize-logo.png" alt="HumanAIze" className="h-16 w-16 object-contain" />
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">Ready to HumanAIze?</h2>
          <p className="text-gray-400 text-lg mb-10">Whether you want to demo our health app, discuss a custom AI project, or explore how MCP servers can connect your enterprise data to AI — let's talk.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://app.humanaize.life" className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all shadow-2xl shadow-cyan-500/25">🚀 Try the Health App Free</a>
            <a href="mailto:hello@humanaize.life" className="flex items-center gap-2 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all">✉️ Contact Us</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/humanaize-logo.png" alt="HumanAIze" className="h-8 w-8 object-contain" />
              <span className="font-bold text-white">Human<span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">AIze</span></span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="https://app.humanaize.life" className="hover:text-white transition-colors">App</a>
              <a href="https://app.humanaize.life/login" className="hover:text-white transition-colors">Sign In</a>
              <a href="https://app.humanaize.life/signup" className="hover:text-white transition-colors">Sign Up</a>
              <a href="mailto:hello@humanaize.life" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-gray-600 text-xs">© 2026 HumanAIze. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
