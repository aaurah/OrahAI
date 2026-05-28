import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/Toaster";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import WorkspacePage from "@/pages/WorkspacePage";
import DeploymentsPage from "@/pages/DeploymentsPage";
import SettingsPage from "@/pages/SettingsPage";
import AiModelsPage from "@/pages/AiModelsPage";
import StaticPage from "@/pages/StaticPage";
import ExplorePage from "@/pages/ExplorePage";
import VisionPage from "@/pages/VisionPage";
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/vision" component={VisionPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/explore" component={ExplorePage} />
      <Route path="/workspace/:id" component={WorkspacePage} />
      <Route path="/deployments" component={DeploymentsPage} />
      <Route path="/settings/profile" component={SettingsPage} />
      <Route path="/settings/workspace" component={SettingsPage} />
      <Route path="/settings/password" component={SettingsPage} />
      <Route path="/settings/api-keys"   component={SettingsPage} />
      <Route path="/settings/mcp-server" component={SettingsPage} />
      <Route path="/ai-models" component={AiModelsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/privacy">{() => <StaticPage page="privacy" />}</Route>
      <Route path="/terms">{() => <StaticPage page="terms" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
      <Toaster />
    </WouterRouter>
  );
}

export default App;
