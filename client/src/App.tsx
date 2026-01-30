import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import CallDetails from "./pages/CallDetails";
import ScriptOptimizer from "./pages/ScriptOptimizer";
import TrainingManual from "./pages/TrainingManual";
import OutboundAnalytics from "./pages/OutboundAnalytics";
import Login from "./pages/Login";
import { useEffect } from "react";
import { useLocation } from "wouter";

// Protected Route Component
function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={() => <ProtectedRoute component={Home} />} />
      <Route path={"/calls/:callId"} component={() => <ProtectedRoute component={CallDetails} />} />
      <Route path={"/script-optimizer"} component={() => <ProtectedRoute component={ScriptOptimizer} />} />
      <Route path={"/training-manual"} component={() => <ProtectedRoute component={TrainingManual} />} />
      <Route path={"/outbound-analytics"} component={() => <ProtectedRoute component={OutboundAnalytics} />} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
