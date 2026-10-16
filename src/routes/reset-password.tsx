import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

/**
 * Where the "forgot password" email lands.
 *
 * This has to live OUTSIDE _authenticated. Somebody arriving here has, by
 * definition, no session they can sign in with — putting it behind the login
 * wall would be a door that only opens from inside.
 *
 * Supabase puts a recovery token in the URL fragment and the client library
 * exchanges it for a short-lived session as the page loads. That session can
 * do exactly one useful thing: set a new password. So the page waits for it
 * to appear rather than assuming, and says plainly when the link has expired
 * instead of showing a form that cannot work.
 */
function ResetPasswordPage() {
  const [ready, setReady] = useState<"waiting" | "ok" | "no-session">("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The library may still be parsing the fragment when this first runs, so
    // listen as well as look. Without the listener the page can decide "no
    // session" a few milliseconds before the token is exchanged.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady("ok");
    });
    supabase.auth.getSession().then(({ data }) => {
      setReady(data.session ? "ok" : "no-session");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Use at least 8 characters"); return; }
    if (/^\d+$/.test(password)) { toast.error("Use more than just numbers"); return; }
    if (password !== confirm) { toast.error("The two passwords do not match"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // Sign out so the new password is actually used to get back in, rather
      // than leaving them on a session minted by a link that is now spent.
      await supabase.auth.signOut().catch(() => {});
    } catch (e: any) {
      toast.error(e?.message ?? "Could not set the new password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-secondary/40 p-4">
      <Link to="/" className="mb-6"><Logo /></Link>
      <Card className="w-full max-w-md p-6">
        {done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h2 className="text-xl font-bold">Password changed</h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your new password.
            </p>
            <Link to="/auth"><Button className="w-full">Go to sign in</Button></Link>
          </div>
        ) : ready === "no-session" ? (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-bold">This link has expired</h2>
            <p className="text-sm text-muted-foreground">
              Reset links are single use and time limited. Ask for a new one and open it from
              the same device, without forwarding it.
            </p>
            <Link to="/auth"><Button variant="outline" className="w-full">Back to sign in</Button></Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="text-center">
              <KeyRound className="mx-auto mb-2 h-8 w-8 text-primary" />
              <h2 className="text-xl font-bold">Set a new password</h2>
              <p className="text-sm text-muted-foreground">
                At least 8 characters, and not only digits.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="np">New password</Label>
              <Input id="np" type="password" value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp">Repeat it</Label>
              <Input id="cp" type="password" value={confirm} autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={saving || ready !== "ok"}>
              {saving ? "Saving…" : "Change password"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
