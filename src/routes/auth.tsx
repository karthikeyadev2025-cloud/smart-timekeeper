import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { z } from "zod";
import { Phone, Mail, Eye, EyeOff } from "lucide-react";
import { phoneToStaffEmail, isValidPhone } from "@/lib/phone-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Punchly" },
      { name: "description", content: "Sign in or create a Punchly account to manage attendance, shifts and payroll." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email").max(255);
const passwordSchema = z.string().min(4, "At least 4 characters").max(72);

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app" });
    });
  }, [navigate]);

  const signInWithEmail = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e.message ?? "Sign in failed. Check phone/password.");
    } finally {
      setLoading(false);
    }
  };

  const handleStaffPhoneSignIn = async (phone: string, password: string) => {
    if (!isValidPhone(phone)) { toast.error("Enter a valid phone number"); return; }
    if (password.length < 4) { toast.error("Password too short"); return; }
    await signInWithEmail(phoneToStaffEmail(phone), password);
  };

  const handleEmailAuth = async (mode: "signin" | "signup", email: string, password: string, fullName?: string) => {
    try { emailSchema.parse(email); passwordSchema.parse(password); }
    catch (e) { if (e instanceof z.ZodError) { toast.error(e.errors[0].message); return; } }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName ?? "" } },
        });
        if (error) throw error;
        toast.success("Account created!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/app" });
    if (result.error) { toast.error(result.error.message); setLoading(false); return; }
    if (result.redirected) return;
    navigate({ to: "/app" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-secondary/40 p-4">
      <Link to="/" className="mb-6"><Logo /></Link>
      <Card className="w-full max-w-md p-6">
        <Tabs defaultValue="staff">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="staff" className="gap-1.5"><Phone className="h-4 w-4" /> Staff</TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5"><Mail className="h-4 w-4" /> Admin</TabsTrigger>
            <TabsTrigger value="signup">New</TabsTrigger>
          </TabsList>

          <TabsContent value="staff" className="space-y-4 pt-4">
            <div className="text-center">
              <h2 className="text-xl font-bold">Welcome 👋</h2>
              <p className="text-sm text-muted-foreground">Sign in with your phone & password</p>
            </div>
            <StaffPhoneForm loading={loading} onSubmit={handleStaffPhoneSignIn} />
            <p className="text-center text-xs text-muted-foreground">
              Don't have a password? Ask your manager.
            </p>
          </TabsContent>

          <TabsContent value="admin" className="space-y-4 pt-4">
            <SignInForm loading={loading} onSubmit={(e, p) => handleEmailAuth("signin", e, p)} />
            <GoogleButton onClick={handleGoogle} loading={loading} />
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 pt-4">
            <SignUpForm loading={loading} onSubmit={(name, e, p) => handleEmailAuth("signup", e, p, name)} />
            <GoogleButton onClick={handleGoogle} loading={loading} />
            <p className="text-center text-xs text-muted-foreground">
              The first account created becomes the Super Admin.
            </p>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function StaffPhoneForm({ loading, onSubmit }: { loading: boolean; onSubmit: (phone: string, password: string) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(phone, password); }}>
      <div className="space-y-2">
        <Label htmlFor="ph" className="text-base">Phone number</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ph"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
            className="h-14 pl-11 text-lg tracking-wider"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw" className="text-base">Password</Label>
        <div className="relative">
          <Input
            id="pw"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-14 pr-12 text-lg"
            required
            minLength={4}
          />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Show password">
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full h-14 text-base" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function Divider() {
  return (
    <div className="relative my-2 flex items-center">
      <div className="flex-1 border-t border-border" />
      <span className="px-3 text-xs text-muted-foreground">OR</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function GoogleButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <>
      <Divider />
      <Button type="button" variant="outline" className="w-full gap-2" onClick={onClick} disabled={loading}>
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.972 32.91 29.418 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.155 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.155 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.397 0-9.965-3.073-11.297-7.531l-6.51 5.014C9.5 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C39.846 35.523 44 30.197 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
        Continue with Google
      </Button>
    </>
  );
}

function SignInForm({ loading, onSubmit }: { loading: boolean; onSubmit: (e: string, p: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
      <div className="space-y-1"><Label htmlFor="si-email">Email</Label><Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
      <div className="space-y-1"><Label htmlFor="si-pass">Password</Label><Input id="si-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

function SignUpForm({ loading, onSubmit }: { loading: boolean; onSubmit: (name: string, e: string, p: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(name, email, password); }}>
      <div className="space-y-1"><Label htmlFor="su-name">Full name</Label><Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
      <div className="space-y-1"><Label htmlFor="su-email">Email</Label><Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
      <div className="space-y-1"><Label htmlFor="su-pass">Password</Label><Input id="su-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={6} /></div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
    </form>
  );
}
