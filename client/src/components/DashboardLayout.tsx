import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Activity, Bot, Cable, LayoutDashboard, LineChart, LogOut, Mail, User, Apple, Dumbbell, HelpCircle, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { toast } from "sonner";

// Set MVP_ONLY to true to show only the 4 core MVP screens in the sidebar
const MVP_ONLY = false;

const allMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", mvp: true },
  { icon: Cable, label: "Monitoring", path: "/monitoring", mvp: true },
  { icon: Apple, label: "Food Logging", path: "/food-logging", mvp: true },
  { icon: Dumbbell, label: "Workouts", path: "/workouts", mvp: true },
  { icon: TrendingUp, label: "Progress", path: "/progress", mvp: false },
  { icon: LineChart, label: "History", path: "/history", mvp: false },
  { icon: Bot, label: "Assistant", path: "/assistant", mvp: false },
  { icon: Mail, label: "Weekly Summaries", path: "/summaries", mvp: false },
  { icon: HelpCircle, label: "Help", path: "/help", mvp: true },
];

const menuItems = MVP_ONLY ? allMenuItems.filter(item => item.mvp) : allMenuItems;

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
          <h1 className="text-3xl font-black uppercase tracking-[0.1em] text-white">Enter the health intelligence workspace</h1>
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

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const updateEmailMutation = trpc.auth.updateEmail.useMutation();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(user?.email ?? "");
  const [location, setLocation] = useLocation();
  const { setOpen, isMobile } = useSidebar();
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

  // Auto-collapse sidebar when location changes on desktop
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 768 && !isMobile) {
      setOpen(false);
    }
  }, [location, isMobile, setOpen]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar/95 backdrop-blur">
        <SidebarHeader className="border-b border-white/10 px-4 py-5">
          <button className="flex w-full items-start gap-3 text-left" onClick={() => setLocation("/dashboard")}>
            <div className="mt-1 h-3 w-3 rounded-none border border-cyan-300 bg-cyan-200/30 flex-shrink-0" />
            <div className="group-data-[collapsible=icon]:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-cyan-200/70">HumanAIze</p>
              <h2 className="mt-2 text-base font-black uppercase tracking-[0.12em] text-white">Personalized health AI</h2>
            </div>
          </button>
        </SidebarHeader>

        <SidebarContent className="px-3 py-4">
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = location === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={isActive}
                    className="h-11 rounded-none border border-transparent px-3 data-[active=true]:border-cyan-300/40 data-[active=true]:bg-cyan-300/10 data-[active=true]:text-white"
                    onClick={() => {
                      setLocation(item.path);
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-medium tracking-[0.04em]">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t border-white/10 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 border border-white/10 bg-white/[0.03] p-3 text-left transition hover:bg-white/[0.06]">
                <Avatar className="h-10 w-10 rounded-none border border-white/15">
                  <AvatarFallback className="rounded-none bg-primary/10 text-primary">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">User Profile</p>
                  <p className="truncate text-xs text-slate-400">{user?.email ?? "Authenticated account"}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-none border-white/10 bg-slate-950 text-white">
              <DropdownMenuItem className="cursor-pointer rounded-none" onClick={() => setLocation("/profile")}>
                <User className="mr-2 h-4 w-4" />
                Update profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-none"
                onClick={() => {
                  setEmailDraft(user?.email ?? "");
                  setIsEmailDialogOpen(true);
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Update email address
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="cursor-pointer rounded-none text-red-300 focus:bg-red-500/10 focus:text-red-200" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

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

      <SidebarInset className="bg-transparent">
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-background/85 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="rounded-none border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Protected dashboard</p>
              <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">HumanAIze Life</h1>
            </div>
          </div>
          <div className="hidden border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-100 md:block">
            HumanAIze Life
          </div>
        </div>
        <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 w-full overflow-x-auto">{children}</main>
      </SidebarInset>
    </div>
  );
}
