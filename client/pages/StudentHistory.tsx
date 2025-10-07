import Layout from "@/components/Layout";
import { useEffect, useMemo } from "react";
import { useState } from "react";
import { USE_SUPABASE } from "@/lib/supabase";
import * as sdb from "@/lib/db.supabase";

import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const studentTabs = [
  { to: "/student", label: "Dashboard" },
  { to: "/student/tests", label: "Tests" },
  { to: "/student/history", label: "History" },
  { to: "/student/profile", label: "Profile" },
];

export default function StudentHistory() {
  const { user } = useAuth();

  useEffect(() => { if (!USE_SUPABASE) db.seedIfNeeded(); }, []);

  const [setsS, setSetsS] = useState<ReturnType<typeof db.getSets>>([] as any);
  const [attemptsS, setAttemptsS] = useState<ReturnType<typeof db.getAttempts>>([] as any);

  useEffect(() => {
    if (!USE_SUPABASE || !user) return;
    (async () => {
      const [s, t] = await Promise.all([
        sdb.getSetsWithQuestionsForUser(user.id),
        sdb.getAttemptsForUser(user.id),
      ]);
      setSetsS(s); setAttemptsS(t);
    })();
  }, [user?.id]);

  const sets = useMemo(() => (USE_SUPABASE ? setsS : db.getSets()), [setsS]);
  const attempts = useMemo(() => (USE_SUPABASE ? attemptsS : db.getAttempts()).filter((a) => a.userId === user?.id), [USE_SUPABASE, attemptsS, user?.id]);

  const history = attempts
    .map((a) => ({ ...a, setName: sets.find((s) => s.id === a.setId)?.name || "Set" }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <Layout tabs={studentTabs}>
      <Card>
        <CardHeader>
          <CardTitle>Performance History</CardTitle>
          <CardDescription>Past attempts with status</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[480px] overflow-auto">
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="rounded border p-3 text-sm">
                <div className="font-medium">{h.setName}</div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{new Date(h.timestamp).toLocaleString()}</span>
                  <span>
                    {h.percentage}% · {h.pass ? "Pass" : "Fail"}
                  </span>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-sm text-muted-foreground">No attempts yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}

