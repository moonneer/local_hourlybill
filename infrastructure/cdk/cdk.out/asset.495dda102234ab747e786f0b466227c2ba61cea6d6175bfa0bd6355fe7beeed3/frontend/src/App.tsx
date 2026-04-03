import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiUrl } from "@/lib/apiBase";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronRight, Loader2, LogOut, Scale } from "lucide-react";
import { useLocation as useWouterLocation } from "wouter";
import TimeEntriesPage from "@/pages/time-entries";
import QueryBuilderPage from "@/pages/query-builder";
import PdfPage from "@/pages/pdf-generator";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { useCurrentUser, type UserInfo } from "@/hooks/use-auth";

function ProfileMenu() {
  const { data } = useCurrentUser();
  const user = data?.user ?? null;
  const [, navigate] = useWouterLocation();

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await fetch(apiUrl("/api/logout"), { method: "POST", credentials: "include" });
    queryClient.setQueryData(["/api/me"], { user: null });
    queryClient.clear();
    navigate("/login");
  };

  const initials = user.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email[0].toUpperCase();

  const displayName = user.displayName || user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="button-profile-menu"
          type="button"
          className="flex items-center gap-2 sm:gap-3 rounded-full py-2 pl-2 pr-2 sm:py-1.5 sm:pl-1.5 sm:pr-3 text-sm transition-all hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent hover:border-border touch-manipulation min-h-10 min-w-10 sm:min-h-0 sm:min-w-0"
        >
          <Avatar className="h-8 w-8 shadow-sm">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start hidden sm:flex">
            <span className="text-foreground font-semibold leading-none">{displayName}</span>
            <span className="text-xs text-muted-foreground mt-1">Account</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 mt-2">
        <DropdownMenuLabel className="font-normal p-3 bg-muted/30">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-foreground truncate">{displayName}</span>
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="menu-item-sign-out"
          onClick={handleSignOut}
          className="cursor-pointer py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header() {
  const [location] = useLocation();
  let title = "Time entries";
  if (location.startsWith("/query")) title = "Matters";
  else if (location.startsWith("/pdf")) title = "Invoices";
  else if (location.startsWith("/login")) title = "Sign in";

  return (
    <header className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-white/80 backdrop-blur-md sticky top-0 z-30 shrink-0 shadow-sm safe-pt">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        <SidebarTrigger
          data-testid="button-sidebar-toggle"
          className="text-muted-foreground hover:text-foreground shrink-0 h-10 w-10 sm:h-7 sm:w-7 touch-manipulation"
        />
        <div className="h-4 w-px bg-border hidden md:block shrink-0" />
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-primary text-primary-foreground shadow-sm shrink-0">
            <Scale className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm min-w-0 flex-1">
            <span className="font-bold tracking-tight text-foreground truncate hidden sm:inline">
              Hourly Bill
            </span>
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground/50 shrink-0 hidden sm:block" />
            <span className="font-semibold text-foreground tracking-tight truncate capitalize min-w-0">
              {title}
            </span>
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <ProfileMenu />
      </div>
    </header>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data, isLoading, isSuccess } = useQuery<{ user: UserInfo | null }>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50/50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuccess) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50/50 px-6 text-center text-sm text-muted-foreground">
        Unable to reach the server. Check your connection and try again.
      </div>
    );
  }

  const user = data?.user ?? null;
  const onLogin = location.startsWith("/login");
  if (!user && !onLogin) {
    return <Redirect to="/login" />;
  }
  if (user && onLogin) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <AuthGate>
      <Switch>
        <Route path="/" component={TimeEntriesPage} />
        <Route path="/query" component={QueryBuilderPage} />
        <Route path="/pdf" component={PdfPage} />
        <Route path="/login" component={LoginPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthGate>
  );
}

export default function App() {
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-[100dvh] max-h-[100dvh] w-full min-w-0 overflow-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden bg-background">
              <Header />
              <main className="flex flex-1 flex-col min-h-0 overflow-x-auto overflow-y-auto overscroll-y-contain bg-slate-50/50 safe-pb">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
