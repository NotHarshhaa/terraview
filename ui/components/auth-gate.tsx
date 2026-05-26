/**
 * AuthGate — login form shown when the API requires authentication.
 */

"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthGateProps {
  onSignIn: (username: string, password: string) => Promise<void>;
  error?: string | null;
}

export function AuthGate({ onSignIn, error }: AuthGateProps) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSignIn(username, password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const message = localError ?? error;

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col justify-center px-4 py-12">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Sign in to Terraview</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Enter the credentials configured in <code className="text-xs">.terraview.yaml</code>.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tv-user">Username</Label>
            <Input
              id="tv-user"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tv-pass">Password</Label>
            <Input
              id="tv-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {message ? (
            <p className="text-sm text-destructive" role="alert">
              {message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
