import { Scale } from "lucide-react";
import { useLocation } from "wouter";

export function AppFooter() {
  const [location] = useLocation();

  if (location.startsWith("/login")) return null;

  return (
    <footer className="mt-auto shrink-0 border-t border-border/40 bg-white/60 backdrop-blur-sm">
      <div className="max-w-[1400px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Scale className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-semibold text-foreground">Hourly Bill</span>
          <span className="text-border mx-1">·</span>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>

        {/* Contact & links */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <a
            href="tel:8888888888"
            className="hover:text-foreground transition-colors"
          >
            (888) 888-8888
          </a>
          <a
            href="mailto:support@hourlybill.com"
            className="hover:text-foreground transition-colors"
          >
            support@hourlybill.com
          </a>
          <span className="text-border">·</span>
          <button
            type="button"
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Terms of Service
          </button>
        </div>
      </div>
    </footer>
  );
}
