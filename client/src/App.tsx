import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import SiteLayout from "./components/SiteLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PublicPageviewTracker } from "./hooks/useAnalytics";
import Home from "./pages/Home";
import CategoryPage from "./pages/CategoryPage";
import ArticlePage from "./pages/ArticlePage";
import VaultPage from "./pages/VaultPage";
import AdminPage from "./pages/AdminPage";
import AdminOperationsPage from "./pages/AdminOperationsPage";
import SearchPage from "./pages/SearchPage";
import DigestPreferencesPage from "./pages/DigestPreferencesPage";
import NotFound from "./pages/NotFound";
import { LoginPage } from "./pages/LoginPage";

function PublicRoutes() {
  return <SiteLayout><Switch>
    <Route path="/" component={Home} />
    <Route path="/category/:category" component={CategoryPage} />
    <Route path="/article/:slug" component={ArticlePage} />
    <Route path="/vault" component={VaultPage} />
    <Route path="/search" component={SearchPage} />
    <Route path="/digest" component={DigestPreferencesPage} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch></SiteLayout>;
}

import AdminSettings from "./pages/AdminSettings";

function Router() {
  return <Switch>
    <Route path="/admin/login" component={LoginPage} />
    <Route path="/admin/settings" component={AdminSettings} />
    <Route path="/admin" component={AdminPage} />
    <Route path="/admin/articles" component={AdminPage} />
    <Route path="/admin/queue" component={AdminPage} />
    <Route path="/admin/:section" component={AdminOperationsPage} />
    <Route component={PublicRoutes} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark" switchable><TooltipProvider><Toaster /><PublicPageviewTracker /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
