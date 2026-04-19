import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  Bot,
  Cable,
  LayoutDashboard,
  LogOut,
  Mail,
  User,
  Apple,
  Dumbbell,
  HelpCircle,
  TrendingUp,
  Menu,
  X,
  ChevronRight,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { toast } from "sonner";

// Set MVP_ONLY to true to show only the 4 core MVP screens
const MVP_ONLY = false;

const allMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", mvp: true },
  { icon: Cable, label: "Monitoring", path: "/monitoring", mvp: true },
  { icon: Apple, label: "Food Logging", path: "/food-logging", mvp: true },
  { icon: Dumbbell, label: "Workouts", path: "/workouts", mvp: true },
  { icon: TrendingUp, label: "Progress", path: "/progress", mvp: false },
  { icon: Bot, label: "Assistant", path: "/assistant", mvp: false },
  { icon: Mail, label: "Weekly Summaries", path: "/summaries", mvp: false },
  { icon: HelpCircle, label: "Help", path: "/help", mvp: true },
];

const menuItems = MVP_ONLY ? allMenuItems.filter((item) => item.mvp) : allMenuItems;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12 text-foreground">
        <div className="absolute inset-0 blueprint-grid opacity-70" />
        <div className="absolute inset-x-8 top-8 h-px bg-white/15" />
        <div className="absolute inset-y-8 left-8 w-px bg-white/15" />
        <div className="relative z-10 max-w-xl border border-white/20 bg-card/80 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_80px_rgba(2,6,23,0.45)] backdrop-blur">
          <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary/80">
            <Activity className="h-4 w-4" />
            Secure workspace required
          </div>
          <h1 className="text-3xl font-black uppercase tracking-[0.1em] text-white">
            Enter the health intelligence workspace
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">
            Sign in to access your protected dashboard, connected sources, AI health assistant, and weekly metabolic summaries.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Button
              className="h-11 flex-1 rounded-none border border-white/30 bg-white text-slate-950 hover:bg-cyan-100"
              onClick={() => { window.location.href = "/login"; }}
            >
              Sign In
            </Button>
            <Button
              className="h-11 flex-1 rounded-none border border-cyan-400/60 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-100"
              onClick={() => { window.location.href = "/signup"; }}
            >
              Create Account
            </Button>
          </div>
          <p className="mt-4 text-xs text-slate-500 text-center">
            New to HumanAIze? Create a free account to get started.
          </p>
        </div>
      </div>
    );
  }

  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const updateEmailMutation = trpc.auth.updateEmail.useMutation();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(user?.email ?? "");
  const [location, setLocation] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileBladeOpen, setIsProfileBladeOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const profileBladeRef = useRef<HTMLDivElement>(null);

  const normalizedCurrentEmail = (user?.email ?? "").trim().toLowerCase();
  const normalizedDraftEmail = emailDraft.trim().toLowerCase();
  const isEmailChanged = normalizedDraftEmail !== normalizedCurrentEmail;
  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim());
  const emailValidationMessage = !emailDraft.trim()
    ? "Email is required"
    : !isEmailFormatValid
      ? "Enter a valid email address"
      : !isEmailChanged
        ? "Enter a different email address"
        : null;

  // Close drawer when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  // Close profile blade when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileBladeRef.current && !profileBladeRef.current.contains(e.target as Node)) {
        setIsProfileBladeOpen(false);
      }
    }
    if (isProfileBladeOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileBladeOpen]);

  // Close drawer on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  const handleUpdateEmail = async () => {
    const trimmedEmail = emailDraft.trim();
    if (emailValidationMessage) {
      toast.error(emailValidationMessage);
      return;
    }
    try {
      await updateEmailMutation.mutateAsync({ email: trimmedEmail });
      await utils.auth.me.invalidate();
      toast.success("Email updated successfully");
      setIsEmailDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update email");
    }
  };

  const currentPage = menuItems.find((item) => item.path === location);

  const userInitial = user?.name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? "U";

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-background/90 px-4 backdrop-blur md:px-6">

        {/* Left: Menu button */}
        <button
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-none border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white/[0.09] focus:outline-none"
          aria-label="Toggle menu"
        >
          <Menu className="h-4 w-4" />
          <span>Menu</span>
        </button>

        {/* Centre: App name */}
        <button
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-left focus:outline-none"
          onClick={() => setLocation("/dashboard")}
        >
          <div className="h-2.5 w-2.5 rounded-none border border-cyan-300 bg-cyan-200/30" />
          <span className="text-sm font-black uppercase tracking-[0.18em] text-white">HumanAIze</span>
        </button>

        {/* Right: empty spacer to keep centre title truly centred */}
        <div className="w-[72px]" />
      </header>

      {/* ── Menu Blade Drawer (overlay) ── */}
      {/* Backdrop */}
      {(isMenuOpen || isProfileBladeOpen) && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => { setIsMenuOpen(false); setIsProfileBladeOpen(false); }}
        />
      )}

      {/* Nav Drawer panel */}
      <div
        ref={drawerRef}
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-white/10 bg-slate-950/98 shadow-2xl transition-transform duration-300 ease-in-out ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-none border border-cyan-300 bg-cyan-200/30" />
            <span className="text-sm font-black uppercase tracking-[0.18em] text-white">HumanAIze</span>
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="rounded-none border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition hover:bg-white/[0.09] hover:text-white focus:outline-none"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3">
          {menuItems.map((item) => {
            const isActive = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => {
                  setLocation(item.path);
                  setIsMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors ${
                  isActive
                    ? "border-l-2 border-cyan-400 bg-cyan-400/10 text-white"
                    : "border-l-2 border-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                  <span className="text-sm font-medium tracking-[0.04em]">{item.label}</span>
                </div>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-cyan-400" : "text-slate-600"}`} />
              </button>
            );
          })}
        </nav>

        {/* Drawer footer — profile button at bottom-left */}
        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => {
              setIsMenuOpen(false);
              setIsProfileBladeOpen(true);
            }}
            className="flex w-full items-center gap-3 rounded-none border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08] hover:border-white/20 focus:outline-none group"
            aria-label="Open profile settings"
          >
            <Avatar className="h-9 w-9 rounded-none border border-white/20 flex-shrink-0">
              <AvatarFallback className="rounded-none bg-cyan-500/20 text-sm font-bold text-cyan-200">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.name ?? "User"}</p>
              <p className="truncate text-xs text-slate-400">{user?.email ?? ""}</p>
            </div>
            <Settings className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </button>
        </div>
      </div>

      {/* ── Profile Settings Blade (slides in from left, on top of nav drawer) ── */}
      <div
        ref={profileBladeRef}
        className={`fixed left-0 top-0 z-50 flex h-full w-80 flex-col border-r border-white/10 bg-slate-950 shadow-2xl transition-transform duration-300 ease-in-out ${
          isProfileBladeOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Blade header */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 rounded-none border border-white/20">
              <AvatarFallback className="rounded-none bg-cyan-500/20 text-sm font-bold text-cyan-200">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user?.name ?? "User"}</p>
              <p className="truncate text-xs text-slate-400">{user?.email ?? ""}</p>
            </div>
          </div>
          <button
            onClick={() => setIsProfileBladeOpen(false)}
            className="rounded-none border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition hover:bg-white/[0.09] hover:text-white focus:outline-none"
            aria-label="Close profile"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Blade actions */}
        <nav className="flex-1 overflow-y-auto py-3">
          <button
            onClick={() => {
              setIsProfileBladeOpen(false);
              setLocation("/profile");
            }}
            className="flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-3.5 text-left text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <User className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-medium tracking-[0.04em]">Edit Profile</p>
              <p className="text-xs text-slate-500">Height, weight, goals & macro targets</p>
            </div>
          </button>

          <button
            onClick={() => {
              setIsProfileBladeOpen(false);
              setEmailDraft(user?.email ?? "");
              setIsEmailDialogOpen(true);
            }}
            className="flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-3.5 text-left text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <Mail className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-medium tracking-[0.04em]">Update Email</p>
              <p className="text-xs text-slate-500">Change your account email address</p>
            </div>
          </button>

          <div className="my-2 mx-4 border-t border-white/10" />

          <button
            onClick={() => {
              setIsProfileBladeOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-3.5 text-left text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium tracking-[0.04em]">Sign Out</p>
              <p className="text-xs text-red-400/70">End your current session</p>
            </div>
          </button>
        </nav>
      </div>

      {/* ── Email update dialog ── */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="rounded-none border-white/10 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>Update Email Address</DialogTitle>
            <DialogDescription className="text-slate-400">
              Change the email address associated with your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="name@example.com"
              className="rounded-none border-white/10 bg-slate-900 text-white placeholder:text-slate-500"
            />
            {emailValidationMessage && (
              <p className="text-xs text-red-300">{emailValidationMessage}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-none border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => setIsEmailDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-none bg-cyan-500 text-white hover:bg-cyan-600"
              onClick={handleUpdateEmail}
              disabled={updateEmailMutation.isPending || Boolean(emailValidationMessage)}
            >
              {updateEmailMutation.isPending ? "Saving..." : "Save Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main content ── */}
      <main className="min-h-[calc(100vh-4rem)] w-full overflow-x-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
