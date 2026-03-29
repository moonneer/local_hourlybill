import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
    await fetch("/api/logout", { method: "POST", credentials: "include" });
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
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Avatar className="h-7 w-7">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-foreground font-medium hidden sm:block">{displayName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
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
            className="cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
        )}
        {!user && (
          <DropdownMenuItem
            data-testid="menu-item-sign-in"
            onClick={() => navigate("/login")}
            className="cursor-pointer"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign in
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="menu-item-sign-out"
          onClick={handleSignOut}
          className="cursor-pointer text-destructive focus:text-destructive"
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
  if (location.startsWith("/query")) title = "Matter Setup";
  else if (location.startsWith("/pdf")) title = "Invoice Generator";
  else if (location.startsWith("/login")) title = "Sign In";

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>HourlyBill</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-medium text-foreground">{title}</span>
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
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <Header />
              <main className="flex-1 overflow-auto">
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
