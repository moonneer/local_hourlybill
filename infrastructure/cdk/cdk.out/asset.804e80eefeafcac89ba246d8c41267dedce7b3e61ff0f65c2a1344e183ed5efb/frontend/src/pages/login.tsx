import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { AlertCircle, Eye, EyeOff, Loader2, Scale } from "lucide-react";

interface SignupFields {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<SignupFields>({
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  const authMutation = useMutation({
    mutationFn: async (data: SignupFields) => {
      if (mode === "signup") {
        const res = await apiRequest("POST", "/api/signup", {
          email: data.email,
          password: data.password,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
        });
        return res.json();
      }
      const res = await apiRequest("POST", "/api/login", {
        email: data.email,
        password: data.password,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
    },
    onError: (err: Error) => {
      setError(err.message || "Authentication failed.");
    },
  });

  const onSubmit = (data: SignupFields) => {
    setError(null);
    authMutation.mutate(data);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full min-w-0 py-8 sm:py-12 px-3 sm:px-4 bg-slate-50/50 selection:bg-primary/20 selection:text-primary safe-px safe-pb">
      <div className="w-full max-w-[420px] space-y-6 sm:space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center space-y-2 sm:space-y-3">
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <Scale className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground px-1">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground px-1">
            {mode === "login"
              ? "Sign in to Hourly Bill"
              : "Create your Hourly Bill account"}
          </p>
        </div>

        <Card className="border-border/60 shadow-xl bg-white/80 backdrop-blur-sm w-full min-w-0">
          <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-lg">
              {mode === "login" ? "Sign in" : "Sign up"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Use the email and password for your account."
                : "Your name will be saved with your account. Password must be at least 8 characters."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6">
            <form key={mode} onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5">
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      First name
                    </Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      data-testid="input-first-name"
                      className="h-11 w-full bg-white"
                      {...register("firstName", {
                        required: mode === "signup" ? "First name is required" : false,
                        validate: (v) =>
                          mode !== "signup" || (v && v.trim().length > 0) || "First name is required",
                      })}
                    />
                    {errors.firstName && (
                      <p className="text-xs text-destructive font-medium">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Last name
                    </Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      data-testid="input-last-name"
                      className="h-11 w-full bg-white"
                      {...register("lastName", {
                        required: mode === "signup" ? "Last name is required" : false,
                        validate: (v) =>
                          mode !== "signup" || (v && v.trim().length > 0) || "Last name is required",
                      })}
                    />
                    {errors.lastName && (
                      <p className="text-xs text-destructive font-medium">{errors.lastName.message}</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Email
                </Label>
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
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    data-testid="input-password"
                    placeholder={mode === "signup" ? "At least 8 characters" : ""}
                    className="h-11 w-full bg-white pr-10"
                    {...register("password", {
                      required: "Password is required",
                      minLength:
                        mode === "signup"
                          ? { value: 8, message: "Password must be at least 8 characters" }
                          : undefined,
                    })}
                  />
                  <button
                    type="button"
                    data-testid="button-toggle-password-visibility"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
                className="w-full h-11 text-base shadow-sm touch-manipulation"
                data-testid="button-submit-auth"
                disabled={authMutation.isPending}
              >
                {authMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            data-testid="button-toggle-auth-mode"
            className="text-primary hover:text-primary/80 hover:underline transition-colors font-semibold"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setShowPassword(false);
              reset();
            }}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
