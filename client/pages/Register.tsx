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

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [age, setAge] = useState("");

  const { register } = useAuth();
  const nav = useNavigate();

  useEffect(() => { db.seedIfNeeded(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    const pw = password.trim();
    const cf = confirm.trim();
    const ageNum = Number(age);

    if (!n || !em || !pw || !cf || !age) {
      toast.error("Please fill all fields");
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum <= 0) {
      toast.error("Please enter a valid age");
      return;
    }
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (pw !== cf) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      const u = await register(n, em, pw, ageNum);
      nav(u.role === "admin" ? "/admin" : "/student");
    } catch (err: any) {
      toast.error(err?.message || "Registration failed");
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>Enter your details to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" placeholder="e.g., Aisha Khan" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" placeholder="" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" min={1} placeholder="18" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>

              <Button type="submit">Register</Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Already have an account? <Link to="/login" className="underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

