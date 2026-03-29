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
import { AlertCircle, Loader2 } from "lucide-react";

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

  const authRequired = !meLoading && meData === null;
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-full py-12 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / branding */}
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">H</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to your HourlyBill account"
              : "Set up your HourlyBill account"}
          </p>
        </div>

        {/* Local mode notice */}
        {isLocalMode && (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-2 text-sm text-amber-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Running in Local Mode</p>
                  <p className="text-amber-400/80 mt-0.5">
                    Authentication is not configured. Set{" "}
                    <code className="font-mono text-xs bg-amber-500/20 px-1 rounded">
                      USERS_TABLE
                    </code>{" "}
                    and{" "}
                    <code className="font-mono text-xs bg-amber-500/20 px-1 rounded">
                      SESSIONS_TABLE
                    </code>{" "}
                    environment variables to enable sign-in.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-auto p-0 text-amber-400 hover:text-amber-300 hover:bg-transparent underline"
                    onClick={() => navigate("/")}
                  >
                    Continue without signing in →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auth form — only shown when auth is configured */}
        {!isLocalMode && (
          <Card className="border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">
                {mode === "login" ? "Sign in" : "Sign up"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Enter your email and password."
                  : "Enter your email and choose a password (min 8 characters)."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    data-testid="input-email"
                    placeholder="you@example.com"
                    {...register("email", {
                      required: "Email is required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Enter a valid email address",
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    data-testid="input-password"
                    placeholder={mode === "signup" ? "At least 8 characters" : ""}
                    {...register("password", {
                      required: "Password is required",
                      minLength:
                        mode === "signup"
                          ? { value: 8, message: "Password must be at least 8 characters" }
                          : undefined,
                    })}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
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
              className="text-primary hover:text-primary/80 underline-offset-4 hover:underline transition-colors font-medium"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            onClick={() => navigate("/")}
          >
            ← Back to the app
          </button>
        </p>
      </div>
    </div>
  );
}
