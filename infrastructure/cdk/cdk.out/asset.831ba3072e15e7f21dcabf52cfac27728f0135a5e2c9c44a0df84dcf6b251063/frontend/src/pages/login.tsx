import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { AlertCircle, Loader2, Scale } from "lucide-react";

interface AuthFormData {
  email: string;
  password: string;
}

interface UserInfo {
  userId: string;
  email: string;
  displayName?: string;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);

  // Check if auth is actually configured (if /api/me returns 401, auth is required)
  const { data: meData, isLoading: meLoading } = useQuery<{ user: UserInfo | null }>({
    queryKey: ["/api/me"],
    retry: false,
  });

  const isLocalMode = !meLoading && meData !== null && meData.user === null;

  const { register, handleSubmit, formState: { errors } } = useForm<AuthFormData>();

  const authMutation = useMutation({
    mutationFn: async (data: AuthFormData) => {
      const url = mode === "signup" ? "/api/signup" : "/api/login";
      const res = await apiRequest("POST", url, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      navigate("/");
    },
    onError: (err: Error) => {
      setError(err.message || "Authentication failed.");
    },
  });

  const onSubmit = (data: AuthFormData) => {
    setError(null);
    authMutation.mutate(data);
  };

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50/50 p-4 selection:bg-primary/20 selection:text-primary">
      <div className="w-full max-w-[420px] space-y-8 animate-in fade-in zoom-in-95 duration-500">
        {/* Logo / branding */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <Scale className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-base text-muted-foreground">
            {mode === "login"
              ? "Sign in to your HourlyBill professional account"
              : "Set up your HourlyBill professional account"}
          </p>
        </div>

        {/* Local mode notice */}
        {isLocalMode && (
          <Card className="border-amber-200 bg-amber-50 shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex gap-3 text-sm text-amber-800">
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">Running in Local Mode</p>
                  <p className="text-amber-800/80 mt-1 leading-relaxed">
                    Authentication is not configured. Set{" "}
                    <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                      USERS_TABLE
                    </code>{" "}
                    and{" "}
                    <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                      SESSIONS_TABLE
                    </code>{" "}
                    environment variables to enable sign-in.
                  </p>
                  <Button
                    variant="default"
                    className="mt-4 w-full bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                    onClick={() => navigate("/")}
                  >
                    Continue to Dashboard
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auth form — only shown when auth is configured */}
        {!isLocalMode && (
          <Card className="border-border/60 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-6">
              <CardTitle className="text-lg">
                {mode === "login" ? "Sign in" : "Sign up"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Enter your email and password to access your account."
                  : "Enter your email and choose a password (min 8 characters)."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    data-testid="input-email"
                    placeholder="you@example.com"
                    className="h-11 bg-white"
                    {...register("email", {
                      required: "Email is required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Enter a valid email address",
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive font-medium">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Password</Label>
                    {mode === "login" && (
                      <a href="#" className="text-xs text-primary hover:underline font-medium">Forgot password?</a>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    data-testid="input-password"
                    placeholder={mode === "signup" ? "At least 8 characters" : ""}
                    className="h-11 bg-white"
                    {...register("password", {
                      required: "Password is required",
                      minLength:
                        mode === "signup"
                          ? { value: 8, message: "Password must be at least 8 characters" }
                          : undefined,
                    })}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive font-medium">{errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-3 border border-destructive/20">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-base shadow-sm"
                  data-testid="button-submit-auth"
                  disabled={authMutation.isPending}
                >
                  {authMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Toggle login / signup */}
        {!isLocalMode && (
          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              data-testid="button-toggle-auth-mode"
              className="text-primary hover:text-primary/80 hover:underline transition-colors font-semibold"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
