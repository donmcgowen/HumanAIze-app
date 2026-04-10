import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Sources from "./pages/Sources";
import Assistant from "./pages/Assistant";
import Summaries from "./pages/Summaries";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={() => <DashboardLayout><Dashboard /></DashboardLayout>} />
      <Route path={"/dashboard"} component={() => <DashboardLayout><Dashboard /></DashboardLayout>} />
      <Route path={"/history"} component={() => <DashboardLayout><History /></DashboardLayout>} />
      <Route path={"/sources"} component={() => <DashboardLayout><Sources /></DashboardLayout>} />
      <Route path={"/assistant"} component={() => <DashboardLayout><Assistant /></DashboardLayout>} />
      <Route path={"/summaries"} component={() => <DashboardLayout><Summaries /></DashboardLayout>} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
