import Layout from "@/components/Layout";
import { useEffect, useMemo } from "react";
import { useState } from "react";
import { USE_SUPABASE } from "@/lib/supabase";
import * as sdb from "@/lib/db.supabase";

import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const studentTabs = [
  { to: "/student", label: "Dashboard" },
  { to: "/student/tests", label: "Tests" },
  { to: "/student/history", label: "History" },
  { to: "/student/profile", label: "Profile" },
];

export default function StudentProfile() {
  const { user, logout } = useAuth();

  useEffect(() => { if (!USE_SUPABASE) db.seedIfNeeded(); }, []);

  const [attemptsS, setAttemptsS] = useState<ReturnType<typeof db.getAttempts>>([] as any);
  const [assignmentsS, setAssignmentsS] = useState<ReturnType<typeof db.getAssignmentsForUser>>([] as any);

  useEffect(() => {
    if (!USE_SUPABASE || !user) return;
    (async () => {
      const [t, a] = await Promise.all([
        sdb.getAttemptsForUser(user.id),
        sdb.getAssignmentsForUser(user.id),
      ]);
      setAttemptsS(t); setAssignmentsS(a);
    })();
  }, [user?.id]);

  const attempts = useMemo(() => (USE_SUPABASE ? attemptsS : db.getAttempts()).filter((a) => a.userId === user?.id), [USE_SUPABASE, attemptsS, user?.id]);
  const assigned = useMemo(() => (USE_SUPABASE ? assignmentsS : (user ? db.getAssignmentsForUser(user.id) : [])), [USE_SUPABASE, assignmentsS, user?.id]);

  const totalAssigned = assigned.length;
  const totalAttempts = attempts.length;
  const passRate = totalAttempts ? Math.round((attempts.filter((a) => a.pass).length / totalAttempts) * 100) : 0;
  const avgScore = totalAttempts ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / totalAttempts) : 0;

  return (
    <Layout tabs={studentTabs}>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{user?.name}</span></div>
            <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{user?.email}</span></div>
            <div><span className="text-muted-foreground">Role:</span> <span className="font-medium uppercase">{user?.role}</span></div>
            <div><span className="text-muted-foreground">Registered:</span> <span className="font-medium">{user ? new Date(user.registeredAt).toLocaleString() : "-"}</span></div>
            <div className="pt-2"><Button variant="outline" onClick={logout}>Sign out</Button></div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Assigned Tests</CardDescription>
              <CardTitle className="text-3xl">{totalAssigned}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Attempts</CardDescription>
              <CardTitle className="text-3xl">{totalAttempts}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pass Rate</CardDescription>
              <CardTitle className="text-3xl">{passRate}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg. Score</CardDescription>
              <CardTitle className="text-3xl">{avgScore}%</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

