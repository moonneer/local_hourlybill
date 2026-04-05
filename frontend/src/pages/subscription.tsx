import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser, isSubscriptionActive } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Sparkles,
  FileText,
  Shield,
  Zap,
  CreditCard,
  Check,
  RefreshCw,
  ReceiptText,
  Ban,
} from "lucide-react";

type SubscriptionStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const configs: Record<SubscriptionStatus, { label: string; className: string; icon: React.ReactNode }> = {
    active:             { label: "Active",      className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    trialing:           { label: "Trial",       className: "bg-violet-50  text-violet-700  border-violet-200",  icon: <Sparkles     className="w-3 h-3" /> },
    past_due:           { label: "Past Due",    className: "bg-amber-50   text-amber-700   border-amber-200",   icon: <AlertTriangle className="w-3 h-3" /> },
    canceled:           { label: "Canceled",    className: "bg-slate-100  text-slate-600   border-slate-200",   icon: <XCircle      className="w-3 h-3" /> },
    incomplete:         { label: "Incomplete",  className: "bg-amber-50   text-amber-700   border-amber-200",   icon: <Clock        className="w-3 h-3" /> },
    incomplete_expired: { label: "Expired",     className: "bg-red-50     text-red-700     border-red-200",     icon: <XCircle      className="w-3 h-3" /> },
    unpaid:             { label: "Unpaid",      className: "bg-red-50     text-red-700     border-red-200",     icon: <AlertTriangle className="w-3 h-3" /> },
    paused:             { label: "Paused",      className: "bg-slate-100  text-slate-600   border-slate-200",   icon: <Clock        className="w-3 h-3" /> },
    none:               { label: "—",           className: "bg-slate-100  text-slate-500   border-slate-200",   icon: null },
  };
  const cfg = configs[status] ?? configs.none;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const FREE_FEATURES = [
  "Time entry management",
  "Matter & client organization",
  "Invoice preview",
  "Query builder",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited PDF invoice exports",
  "Professional branded documents",
  "Priority support",
];

export default function SubscriptionPage() {
  const { data, isLoading, refetch } = useCurrentUser();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [redirecting, setRedirecting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const user = data?.user ?? null;
  const sub = user?.subscription;
  const isActive = isSubscriptionActive(sub);
  const hasAnySubscription = sub?.status && sub.status !== "none";

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
    onSuccess: (d) => {
      if (d.url) { setRedirecting(true); window.location.href = d.url; }
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
    onSuccess: (d) => {
      if (d.url) { setRedirecting(true); window.location.href = d.url; }
    },
    onError: (err: Error) => {
      toast({ title: "Could not open billing portal", description: err.message, variant: "destructive" });
    },
  });

  const isWorking = checkoutMutation.isPending || portalMutation.isPending || redirecting;

  const periodEndDate = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full p-6 lg:p-10 space-y-10 animate-in fade-in duration-500">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Subscription</h1>
        <p className="text-sm text-muted-foreground">
          Choose the plan that works for your firm.
        </p>
      </div>

      {/* ── Plan cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Free card */}
        <div className={`relative flex flex-col rounded-2xl border bg-white shadow-sm p-7 transition-all ${
          !isActive ? "border-primary ring-2 ring-primary/20" : "border-border/60"
        }`}>
          {!isActive && (
            <div className="absolute -top-3 left-6">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm">
                <CheckCircle2 className="w-3 h-3" /> Current plan
              </span>
            </div>
          )}

          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Free</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-foreground">$0</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              All the essentials to manage your time and billing.
            </p>
          </div>

          <ul className="space-y-3 mb-8 flex-1">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                <Check className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>

          <Button
            variant="outline"
            disabled
            className="w-full border-slate-200 text-slate-500 cursor-default"
          >
            {!isActive ? "Your current plan" : "Free plan"}
          </Button>
        </div>

        {/* Pro card */}
        <div className={`relative flex flex-col rounded-2xl border shadow-sm p-7 transition-all ${
          isActive
            ? "border-primary ring-2 ring-primary/20 bg-white"
            : "border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white"
        }`}>
          {isActive && (
            <div className="absolute -top-3 left-6">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm">
                <CheckCircle2 className="w-3 h-3" /> Current plan
              </span>
            </div>
          )}

          {/* Decorative blob when not active */}
          {!isActive && (
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/5 -translate-y-1/3 translate-x-1/3 pointer-events-none" />
          )}

          <div className="mb-6 relative">
            <div className="flex items-center gap-2 mb-2">
              <p className={`text-xs font-bold uppercase tracking-widest ${isActive ? "text-muted-foreground" : "text-slate-400"}`}>
                Pro
              </p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isActive ? "bg-primary/10 text-primary" : "bg-white/10 text-white"
              }`}>
                <Sparkles className="w-2.5 h-2.5" /> Recommended
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold ${isActive ? "text-foreground" : "text-white"}`}>$100</span>
              <span className={`text-sm ${isActive ? "text-muted-foreground" : "text-slate-400"}`}>/month</span>
            </div>
            <p className={`text-sm mt-2 ${isActive ? "text-muted-foreground" : "text-slate-400"}`}>
              Unlock PDF exports and professional invoicing.
            </p>
          </div>

          <ul className="space-y-3 mb-8 flex-1 relative">
            {PRO_FEATURES.map((f) => (
              <li key={f} className={`flex items-start gap-2.5 text-sm ${isActive ? "text-slate-700" : "text-slate-300"}`}>
                <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isActive ? "text-primary" : "text-emerald-400"}`} />
                {f}
              </li>
            ))}
          </ul>

          {isActive ? (
            <Button
              variant="outline"
              disabled
              className="w-full border-slate-200 text-slate-500 cursor-default"
            >
              Your current plan
            </Button>
          ) : (
            <Button
              className="w-full bg-white text-slate-900 hover:bg-slate-100 font-semibold shadow-sm gap-2 relative"
              onClick={() => checkoutMutation.mutate()}
              disabled={isWorking}
            >
              {isWorking && checkoutMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              {redirecting ? "Redirecting…" : "Subscribe — $100/mo"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Billing management ──────────────────────────────────────── */}
      {hasAnySubscription && (
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-muted-foreground" />
              Billing details
            </h2>
            <button
              onClick={() => refetch()}
              className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1"
              title="Refresh status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Status row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Status</p>
                <StatusBadge status={(sub?.status ?? "none") as SubscriptionStatus} />
              </div>
              {isActive && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Amount</p>
                  <p className="text-sm font-semibold text-foreground">$100 / month</p>
                </div>
              )}
              {periodEndDate && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {sub?.status === "canceled" ? "Access until" : "Next renewal"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{periodEndDate}</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => portalMutation.mutate()}
                disabled={isWorking}
                className="gap-2 h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CreditCard className="w-3.5 h-3.5" />
                )}
                Manage billing
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/pdf")}
                className="gap-2 h-9 text-slate-600 hover:bg-slate-50"
              >
                <FileText className="w-3.5 h-3.5" />
                Go to Invoices
              </Button>

              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  className="gap-2 h-9 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Cancel subscription
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel confirmation dialog ───────────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-500" />
              Cancel subscription?
            </DialogTitle>
            <DialogDescription className="pt-1 leading-relaxed">
              You'll keep access to Pro features until the end of your current billing period
              {periodEndDate ? ` (${periodEndDate})` : ""}. After that, PDF exports will be
              disabled. You can re-subscribe at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} className="flex-1">
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              disabled={isWorking}
              onClick={() => {
                setCancelOpen(false);
                portalMutation.mutate();
              }}
            >
              {portalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Continue to cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
