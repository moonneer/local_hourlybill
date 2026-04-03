import { Switch, Route, useLocation } from "wouter";
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
import { ChevronRight, LogOut, User, LogIn } from "lucide-react";
import { useLocation as useWouterLocation } from "wouter";
import TimeEntriesPage from "@/pages/time-entries";
import QueryBuilderPage from "@/pages/query-builder";
import PdfPage from "@/pages/pdf-generator";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

interface UserInfo {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

function useCurrentUser() {
  return useQuery<{ user: UserInfo | null }>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

function ProfileMenu() {
  const { data } = useCurrentUser();
  const user = data?.user ?? null;
  const [, navigate] = useWouterLocation();

  const handleSignOut = async () => {
    await fetch(apiUrl("/api/logout"), { method: "POST", credentials: "include" });
    queryClient.clear();
    navigate("/login");
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email
    ? user.email[0].toUpperCase()
    : "L";

  const displayName = user?.displayName || user?.email || "Local User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="button-profile-menu"
          className="flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-3 text-sm transition-all hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent hover:border-border"
        >
          <Avatar className="h-8 w-8 shadow-sm">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start hidden sm:flex">
            <span className="text-foreground font-semibold leading-none">{displayName}</span>
            <span className="text-xs text-muted-foreground mt-1">Legal Professional</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 mt-2">
        <DropdownMenuLabel className="font-normal p-3 bg-muted/30">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-foreground truncate">{displayName}</span>
            {user?.email && (
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            )}
            {!user && (
              <span className="text-xs text-muted-foreground">No auth configured</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user && (
          <DropdownMenuItem
            data-testid="menu-item-profile"
            onClick={() => navigate("/login")}
            className="cursor-pointer py-2"
          >
            <User className="mr-2 h-4 w-4" />
            Profile Settings
          </DropdownMenuItem>
        )}
        {!user && (
          <DropdownMenuItem
            data-testid="menu-item-sign-in"
            onClick={() => navigate("/login")}
            className="cursor-pointer py-2"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign in
          </DropdownMenuItem>
        )}
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
  let title = "Time Entries";
  if (location.startsWith("/query")) title = "Matters";
  else if (location.startsWith("/pdf")) title = "Invoices";
  else if (location.startsWith("/login")) title = "Sign In";

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-white/80 backdrop-blur-md sticky top-0 z-30 shrink-0 shadow-sm">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground hover:text-foreground" />
        <div className="h-4 w-px bg-border hidden sm:block"></div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground font-medium">Workspace</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          <span className="font-semibold text-foreground tracking-tight">{title}</span>
        </div>
      </div>
      <ProfileMenu />
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={TimeEntriesPage} />
      <Route path="/query" component={QueryBuilderPage} />
      <Route path="/pdf" component={PdfPage} />
      <Route path="/login" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
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
          <div className="flex h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-background">
              <Header />
              <main className="flex-1 overflow-auto bg-slate-50/50">
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
