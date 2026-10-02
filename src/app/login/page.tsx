"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/src/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left side: Premium branding */}
      <div className="flex flex-col justify-center border-b border-border bg-background px-6 py-5 sm:p-12 lg:border-b-0 lg:border-r lg:p-16 xl:p-24">
        <div className="mx-auto w-full max-w-md sm:space-y-8">
          <div>
            <span
              className="text-5xl sm:text-6xl tracking-wide text-foreground"
              style={{
                fontFamily: "var(--font-maharlika), var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontWeight: 400,
              }}
            >
              CREST
            </span>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              CREST Capital Management
            </p>
          </div>

          <div className="hidden sm:block space-y-3">
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              Investor Relationship Management
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Manage investor relationships, contacts, and follow-ups in a centralized, secure workspace.
            </p>
          </div>
        </div>
      </div>

      {/* Right side: Login form */}
      <div className="flex items-center justify-center bg-muted/40 px-4 py-8 sm:py-12">
        <Card className="w-full max-w-md border-border/80 shadow-xs">
          <CardHeader className="space-y-1.5 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Welcome back
            </p>
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              Log in to your account
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Access the CREST Investor CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="name@crest.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-hidden"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full flex items-center justify-center gap-2" disabled={isLoading}>
                {isLoading ? (
                  "Logging in..."
                ) : (
                  <>
                    <span>Log In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="relative my-5 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-medium tracking-wider">
                    Secure access
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <p className="leading-relaxed">
                  Your data is protected with industry-standard security and encrypted connections.
                </p>
              </div>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                <Link href="/privacy-policy" className="underline underline-offset-2 transition-colors hover:text-foreground">
                  Privacy Policy
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
