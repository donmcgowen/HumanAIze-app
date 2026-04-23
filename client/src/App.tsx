import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const History = lazy(() => import("./pages/History"));
const Sources = lazy(() => import("./pages/Sources"));
const Assistant = lazy(() => import("./pages/Assistant"));
const AppFeedback = lazy(() => import("./pages/AppFeedback").then((m) => ({ default: m.AppFeedback })));
const Summaries = lazy(() => import("./pages/Summaries"));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const FoodLogging = lazy(() => import("./pages/FoodLogging").then((m) => ({ default: m.FoodLogging })));
const Workouts = lazy(() => import("./pages/Workouts").then((m) => ({ default: m.Workouts })));
const Monitoring = lazy(() => import("./pages/Monitoring").then((m) => ({ default: m.Monitoring })));
const Progress = lazy(() => import("./pages/Progress").then((m) => ({ default: m.Progress })));
const Help = lazy(() => import("./pages/Help").then((m) => ({ default: m.Help })));
const Grocery = lazy(() => import("./pages/Grocery").then((m) => ({ default: m.Grocery })));

function RouteLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-slate-300 text-sm">Loading...</div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Switch>
        <Route path={"/landing"} component={Landing} />
        <Route path={"/login"} component={Login} />
        <Route path={"/signup"} component={Signup} />
        <Route path={"/"} component={() => <DashboardLayout><Dashboard /></DashboardLayout>} />
        <Route path={"/dashboard"} component={() => <DashboardLayout><Dashboard /></DashboardLayout>} />
        <Route path={"/history"} component={() => <DashboardLayout><History /></DashboardLayout>} />
        <Route path={"/sources"} component={() => <DashboardLayout><Sources /></DashboardLayout>} />
        <Route path={"/monitoring"} component={() => <DashboardLayout><Monitoring /></DashboardLayout>} />
        <Route path={"/food-logging"} component={() => <DashboardLayout><FoodLogging /></DashboardLayout>} />
        <Route path={"/workouts"} component={() => <DashboardLayout><Workouts /></DashboardLayout>} />
        <Route path={"/profile"} component={() => <DashboardLayout><Profile /></DashboardLayout>} />
        <Route path={"/progress"} component={() => <DashboardLayout><Progress /></DashboardLayout>} />
        <Route path={"/assistant"} component={() => <DashboardLayout><Assistant /></DashboardLayout>} />
        <Route path={"/feedback"} component={() => <DashboardLayout><AppFeedback /></DashboardLayout>} />
        <Route path={"/summaries"} component={() => <DashboardLayout><Summaries /></DashboardLayout>} />
        <Route path={"/help"} component={() => <DashboardLayout><Help /></DashboardLayout>} />
        <Route path={"/grocery"} component={() => <DashboardLayout><Grocery /></DashboardLayout>} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
