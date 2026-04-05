import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Sparkles, FileText, Shield, Zap, Check, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasCustomer?: boolean;
}

const features = [
  { icon: FileText, text: "Unlimited PDF invoice exports" },
  { icon: Zap, text: "Professional branded documents" },
  { icon: Shield, text: "Secure, always available" },
];

export function SubscribeModal({ open, onOpenChange, hasCustomer }: SubscribeModalProps) {
  const queryClient = useQueryClient();
  const [redirecting, setRedirecting] = useState(false);

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
      toast({
        title: "Unable to start checkout",
        description: err.message,
        variant: "destructive",
      });
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
      toast({
        title: "Unable to open billing portal",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = checkoutMutation.isPending || portalMutation.isPending || redirecting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 pt-8 pb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(168,85,247,0.1),transparent_60%)]" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
                <Sparkles className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Pro Plan
              </span>
            </div>
            <DialogTitle className="text-2xl font-bold text-white mb-2 leading-tight">
              Export professional invoices
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm leading-relaxed">
              Subscribe to unlock PDF exports and deliver polished invoices directly to your clients.
            </DialogDescription>
          </div>
        </div>

        {/* Body */}
        <div className="bg-white px-8 py-6">
          {/* Price */}
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-4xl font-bold text-slate-900 tracking-tight">$100</span>
            <span className="text-slate-500 text-sm font-medium">/month</span>
          </div>

          {/* Features */}
          <ul className="space-y-3 mb-7">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 shrink-0">
                  <Check className="w-3.5 h-3.5 text-primary font-bold" />
                </div>
                <span className="text-sm text-slate-700 font-medium">{text}</span>
              </li>
            ))}
          </ul>

          {/* CTAs */}
          <div className="space-y-3">
            <Button
              className="w-full h-11 text-sm font-semibold shadow-sm bg-slate-900 hover:bg-slate-800 text-white gap-2"
              onClick={() => checkoutMutation.mutate()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              {redirecting ? "Redirecting…" : "Subscribe — $100/mo"}
            </Button>

            {hasCustomer && (
              <Button
                variant="outline"
                className="w-full h-10 text-sm font-medium border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => portalMutation.mutate()}
                disabled={isLoading}
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                ) : null}
                Manage billing
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            Secured by Stripe · Cancel anytime
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
