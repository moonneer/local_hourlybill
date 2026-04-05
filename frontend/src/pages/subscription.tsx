import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser, isSubscriptionActive } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowRight,
  FileText,
  Shield,
  Zap,
  RefreshCw,
} from "lucide-react";

type SubscriptionStatus = "none" | "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" | "paused";

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const configs: Record<SubscriptionStatus, { label: string; className: string; icon: React.ReactNode }> = {
    active: {
      label: "Active",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    trialing: {
      label: "Trial",
      className: "bg-violet-50 text-violet-700 border-violet-200 ring-1 ring-violet-200",
      icon: <Sparkles className="w-3.5 h-3.5" />,
    },
    past_due: {
      label: "Past Due",
      className: "bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    canceled: {
      label: "Canceled",
      className: "bg-slate-100 text-slate-600 border-slate-200 ring-1 ring-slate-200",
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    incomplete: {
      label: "Incomplete",
      className: "bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200",
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    incomplete_expired: {
      label: "Expired",
      className: "bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200",
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    unpaid: {
      label: "Unpaid",
      className: "bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    paused: {
      label: "Paused",
      className: "bg-slate-100 text-slate-600 border-slate-200 ring-1 ring-slate-200",
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    none: {
      label: "No subscription",
      className: "bg-slate-100 text-slate-500 border-slate-200 ring-1 ring-slate-200",
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  };

  const cfg = configs[status] ?? configs.none;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const featureRows = [
  { icon: FileText, title: "Unlimited PDF exports", desc: "Generate professional invoices for every client, every time." },
  { icon: Zap, title: "Instant generation", desc: "PDFs render in seconds from your existing time entries." },
  { icon: Shield, title: "Secure & private", desc: "Your billing data is encrypted and never shared." },
];

export default function SubscriptionPage() {
  const { data, isLoading, refetch } = useCurrentUser();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [redirecting, setRedirecting] = useState(false);

  const user = data?.user ?? null;
  const sub = user?.subscription;
  const isActive = isSubscriptionActive(sub);

  // Handle returning from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast({
        title: "Subscription activated!",
        description: "Welcome to Hourly Bill Pro. You can now export PDFs.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      window.history.replaceState({}, "", "/subscription");
    }
  }, [queryClient]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/checkout-session");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        setRedirecting(true);
        window.location.href = data.url;
      }
    },
    onError: (err: Error) => {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal-session");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        setRedirecting(true);
        window.location.href = data.url;
      }
    },
    onError: (err: Error) => {
      toast({ title: "Could not open billing portal", description: err.message, variant: "destructive" });
    },
  });

  const isLoadingAction = checkoutMutation.isPending || portalMutation.isPending || redirecting;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const periodEndDate = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-3xl mx-auto w-full p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Page header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your Hourly Bill Pro plan and billing.</p>
      </div>

      {/* Status card */}
      <div className="relative rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
        {/* Decorative gradient */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Current plan
                  </p>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {isActive ? "Hourly Bill Pro" : "Free"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={(sub?.status ?? "none") as SubscriptionStatus} />
              <button
                onClick={() => refetch()}
                className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isActive && periodEndDate && (
            <div className="mt-5 pt-5 border-t border-border/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Billing amount
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    $100
                    <span className="text-sm font-normal text-muted-foreground ml-1">/month</span>
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {sub?.status === "canceled" ? "Access until" : "Next renewal"}
                  </p>
                  <p className="text-base font-semibold text-foreground mt-1">{periodEndDate}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 mt-6">
            {!isActive && (
              <Button
                onClick={() => checkoutMutation.mutate()}
                disabled={isLoadingAction}
                className="gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-sm h-10"
              >
                {isLoadingAction && checkoutMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {redirecting && checkoutMutation.isSuccess ? "Redirecting…" : "Subscribe — $100/mo"}
              </Button>
            )}

            {sub?.status && sub.status !== "none" && (
              <Button
                variant="outline"
                onClick={() => portalMutation.mutate()}
                disabled={isLoadingAction}
                className="gap-2 h-10 border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {isLoadingAction && portalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Manage billing
              </Button>
            )}

            {isActive && (
              <Button
                variant="ghost"
                onClick={() => navigate("/pdf")}
                className="gap-2 h-10 text-slate-600"
              >
                <FileText className="w-4 h-4" />
                Go to Invoices
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Features section — shown when not subscribed */}
      {!isActive && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">What you get with Pro</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {featureRows.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-border/60 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="rounded-xl bg-slate-50 border border-border/40 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">Need help?</span> Contact support or manage your payment
        method, invoices, and cancellation through the billing portal above. Subscriptions renew monthly and can
        be canceled at any time.
      </div>
    </div>
  );
}
