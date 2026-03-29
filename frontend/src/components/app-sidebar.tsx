import { Briefcase, Clock, FileText, ChevronRight, Scale } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Matters", url: "/query", icon: Briefcase },
  { title: "Time Entries", url: "/", icon: Clock },
  { title: "Invoices", url: "/pdf", icon: FileText },
];

function LocalModeBadge() {
  const { data } = useQuery<{ user: unknown | null }>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const isLocalMode = data !== undefined && data.user === null;
  if (!isLocalMode) return null;

  return (
    <div className="flex justify-center p-2">
      <Badge
        variant="secondary"
        className="w-full justify-center bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-0 py-1.5"
      >
        Local Mode
      </Badge>
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarHeader className="px-6 py-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Scale className="w-4 h-4" />
          </div>
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
            HourlyBill
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
            Workflow
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navItems.map((item, index) => {
                const isActive =
                  location === item.url ||
                  (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`h-10 px-3 rounded-md transition-all duration-200 group relative ${
                        isActive
                          ? "bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Link href={item.url} className="flex items-center w-full">
                        <item.icon
                          className={`w-4 h-4 mr-3 ${isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`}
                        />
                        <span>{item.title}</span>
                        {index < navItems.length - 1 && (
                          <ChevronRight className={`w-3 h-3 ml-auto opacity-0 -translate-x-2 transition-all duration-200 ${isActive ? 'opacity-100 translate-x-0' : 'group-hover:opacity-100 group-hover:translate-x-0'}`} />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border/40 p-2">
        <LocalModeBadge />
      </SidebarFooter>
    </Sidebar>
  );
}
