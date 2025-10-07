import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();

  useEffect(() => { db.seedIfNeeded(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    const pw = password.trim();
    if (!em || !pw) {
      toast.error("Please enter your email and password");
      return;
    }
    try {
      const u = await login(em, pw);
      nav(u.role === "admin" ? "/admin" : "/student");
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Access your dashboard with your email</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit">Sign in</Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Don't have an account? <Link to="/register" className="underline">Register</Link>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Tip: Try admin@gmail.com / admin123 - as a admin credentials</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

