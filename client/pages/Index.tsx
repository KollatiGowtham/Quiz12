import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/db";

export default function Index() {
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => { db.seedIfNeeded(); }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") nav("/admin");
    if (user.role === "student") nav("/student");
  }, [user, nav]);

  return (
    <Layout>
      <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <span>Secure · Timed · Online Exams</span>
          </div>
          <h1 className="mb-4 text-5xl font-extrabold tracking-tight lg:text-6xl">QZ-Test</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Create and deliver online exams with multiple question types (MCQ and paragraph-based), configurable time limits and attempts, pass thresholds, automatic scoring, and detailed result tracking.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Question Management</CardTitle>
                <CardDescription>Build exams with MCQ and paragraph-based questions with explanations</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Scheduling & Time Controls</CardTitle>
                <CardDescription>Configure time limits, attempts, and availability windows</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Automated Scoring & Results</CardTitle>
                <CardDescription>Instant scoring with pass thresholds and controlled reviews</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Performance Analytics</CardTitle>
                <CardDescription>Track results and trends across exams and cohorts</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        <Card className="lg:justify-self-end">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Choose an option to continue</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={() => nav("/login")}>Sign in</Button>
              <Button variant="outline" onClick={() => nav("/register")}>Register</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Tip: Try admin@gmail.com / admin123 - as a admin credentials</p>
          </CardContent>
        </Card>
      </section>
    </Layout>
  );
}
