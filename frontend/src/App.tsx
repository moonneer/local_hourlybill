import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import TimeEntriesPage from "@/pages/time-entries";
import QueryBuilderPage from "@/pages/query-builder";
import PdfPage from "@/pages/pdf-generator";
import NotFound from "@/pages/not-found";
import { ChevronRight } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={TimeEntriesPage} />
      <Route path="/query" component={QueryBuilderPage} />
      <Route path="/pdf" component={PdfPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Header() {
  const [location] = useLocation();
  let title = "Time Entries";
  if (location.startsWith("/query")) title = "Query Builder";
  else if (location.startsWith("/pdf")) title = "PDF Generator";

  return (
    <header className="flex items-center gap-4 px-6 py-4 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
      <SidebarTrigger data-testid="button-sidebar-toggle" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>HourlyBill</span>
        <ChevronRight className="w-4 h-4" />
        <span className="font-medium text-foreground">{title}</span>
      </div>
    </header>
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
