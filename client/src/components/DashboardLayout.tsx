import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Activity, Bot, Cable, LayoutDashboard, LineChart, LogOut, Mail, User, Apple, Dumbbell, HelpCircle, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Command Center", path: "/dashboard" },
  { icon: LineChart, label: "History", path: "/history" },
  { icon: Cable, label: "Monitoring", path: "/monitoring" },
  { icon: Apple, label: "Food Logging", path: "/food-logging" },
  { icon: Dumbbell, label: "Workouts", path: "/workouts" },
  { icon: TrendingUp, label: "Progress", path: "/progress" },
  { icon: User, label: "Profile", path: "/profile" },
  { icon: Bot, label: "Assistant", path: "/assistant" },
  { icon: Mail, label: "Weekly Summaries", path: "/summaries" },
  { icon: HelpCircle, label: "Help", path: "/help" },
];

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
          <Button
            className="mt-8 h-11 rounded-none border border-white/30 bg-white text-slate-950 hover:bg-cyan-100"
            onClick={() => {
              window.location.href = "/login";
            }}
          >
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar className="border-r border-sidebar-border bg-sidebar/95 backdrop-blur">
        <SidebarHeader className="border-b border-white/10 px-4 py-5">
          <button className="flex w-full items-start gap-3 text-left" onClick={() => setLocation("/dashboard")}>
            <div className="mt-1 h-3 w-3 rounded-none border border-cyan-300 bg-cyan-200/30" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-cyan-200/70">HumanAIze</p>
              <h2 className="mt-2 text-base font-black uppercase tracking-[0.12em] text-white">Personalized health AI</h2>
            </div>
          </button>
        </SidebarHeader>

        <SidebarContent className="px-3 py-4">
          <div className="mb-4 border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Live mode</p>
            <p className="mt-2 text-sm font-semibold text-white">Unified glucose, activity, nutrition, and sleep analytics</p>
          </div>
          <SidebarMenu>
            {menuItems.map((item) => {
              const isActive = location === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={isActive}
                    className="h-11 rounded-none border border-transparent px-3 data-[active=true]:border-cyan-300/40 data-[active=true]:bg-cyan-300/10 data-[active=true]:text-white"
                    onClick={() => setLocation(item.path)}
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
                  <p className="truncate text-sm font-semibold text-white">{user?.name ?? "User"}</p>
                  <p className="truncate text-xs text-slate-400">{user?.email ?? "Authenticated account"}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-none border-white/10 bg-slate-950 text-white">
              <DropdownMenuItem className="cursor-pointer rounded-none text-red-300 focus:bg-red-500/10 focus:text-red-200" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-transparent">
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-background/85 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="rounded-none border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Protected dashboard</p>
              <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">Personal health intelligence</h1>
            </div>
          </div>
          <div className="hidden border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-100 md:block">
            Engineering-style unified analytics workspace
          </div>
        </div>
        <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 w-full overflow-x-auto">{children}</main>
      </SidebarInset>
    </div>
  );
}
