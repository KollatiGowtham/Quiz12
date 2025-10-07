import Layout from "@/components/Layout";
import { useEffect, useMemo, useRef, useState } from "react";
import { db, Assignment, Attempt, MCQQuestion, ParagraphQuestion, Question, Set } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { USE_SUPABASE } from "@/lib/supabase";
import * as sdb from "@/lib/db.supabase";

function flattenQuestions(questions: Question[]): MCQQuestion[] {
  const out: MCQQuestion[] = [];
  for (const q of questions) {
    if (q.type === "mcq") out.push(q as MCQQuestion);
    else out.push(...(q as ParagraphQuestion).questions);
  }
  return out;
}

export default function Student() {
  const { user } = useAuth();
  const [_, force] = useState(0);
  const [active, setActive] = useState<{ assignment: Assignment; set: Set } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const [submitted, setSubmitted] = useState<Attempt | null>(null);
  const [endedByTimer, setEndedByTimer] = useState(false);

  useEffect(() => { if (!USE_SUPABASE) db.seedIfNeeded(); }, []);

  const [assignmentsS, setAssignmentsS] = useState<Assignment[]>([]);
  const [setsS, setSetsS] = useState<Set[]>([]);
  const [attemptsS, setAttemptsS] = useState<Attempt[]>([]);

  useEffect(() => {
    if (!USE_SUPABASE || !user) return;
    (async () => {
      const a = await sdb.getAssignmentsForUser(user.id);
      const s = await sdb.getSetsWithQuestionsForUser(user.id);
      const t = await sdb.getAttemptsForUser(user.id);
      setAssignmentsS(a); setSetsS(s); setAttemptsS(t);
    })();
  }, [user?.id]);

  const assignments = useMemo(() => (USE_SUPABASE ? assignmentsS : (user ? db.getAssignmentsForUser(user.id) : [])), [assignmentsS, _, user?.id]);
  const sets = useMemo(() => (USE_SUPABASE ? setsS : db.getSets()), [setsS, _]);
  const attempts = useMemo(() => (USE_SUPABASE ? attemptsS.filter((a) => a.userId === user?.id) : db.getAttempts().filter((a) => a.userId === user?.id)), [attemptsS, _, user?.id]);

  function attemptsUsedFor(userId: string, setId: string) {
    return attempts.filter((t) => t.userId === userId && t.setId === setId).length;
  }
  function attemptsRemainingFor(a: Assignment) {
    return Math.max(0, a.maxAttempts - attemptsUsedFor(a.userId, a.setId));
  }

  const assignedRows = assignments.map((a) => {
    const set = sets.find((s) => s.id === a.setId)!;
    const used = attemptsUsedFor(user!.id, a.setId);
    const remaining = attemptsRemainingFor(a);
    return { a, set, used, remaining };
  });

  function start(a: Assignment, set: Set) {
    if (attemptsRemainingFor(a) <= 0) return;
    setActive({ assignment: a, set });
    setAnswers({});
    setSubmitted(null);
    setStartedAt(Date.now());
    setTimeLeft(a.timeLimitMinutes * 60);
  }

  // Timer
  useEffect(() => {
    if (!active || submitted) return;
    if (timeLeft <= 0 && active) {
      setEndedByTimer(true);
      submit(true);
      return;
    }
    timerRef.current = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [timeLeft, active, submitted]);

  function choose(qid: string, idx: number) {
    setAnswers((prev) => ({ ...prev, [qid]: idx }));
  }

  async function submit(byTimer: boolean = false) {
    if (!active || !user) return;
    const flat = flattenQuestions(active.set.questions);
    let correct = 0;
    const ans = flat.map((q) => {
      const chosen = answers[q.id] ?? null;
      if (chosen !== null && chosen === q.correctIndex) correct += 1;
      return { questionId: q.id, chosenIndex: chosen };
    });
    const percentage = flat.length ? Math.round((correct / flat.length) * 100) : 0;
    const pass = percentage >= active.assignment.passPercent;
    const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;

    let attempt: Attempt;
    if (USE_SUPABASE) {
      attempt = await sdb.recordAttempt({ userId: user.id, setId: active.set.id, score: correct, percentage, pass, durationSeconds: duration, answers: ans });
      setAttemptsS((prev) => [...prev, attempt]);
    } else {
      attempt = db.recordAttempt({ userId: user.id, setId: active.set.id, score: correct, percentage, pass, durationSeconds: duration, answers: ans });
    }

    setSubmitted(attempt);
    setEndedByTimer(byTimer);
    force((x) => x + 1);
  }

  function exitAttempt() {
    setActive(null);
    setSubmitted(null);
  }

  const history = attempts
    .map((a) => ({ ...a, setName: sets.find((s) => s.id === a.setId)?.name || "Set" }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));


  const totalAssigned = assignedRows.length;
  const totalAttempts = attempts.length;
  const passRate = totalAttempts ? Math.round((attempts.filter((a) => a.pass).length / totalAttempts) * 100) : 0;
  const avgScore = totalAttempts ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / totalAttempts) : 0;


  const studentTabs = [
    { to: "/student", label: "Dashboard" },
    { to: "/student/tests", label: "Tests" },
    { to: "/student/history", label: "History" },
    { to: "/student/profile", label: "Profile" },
  ];

  return (
    <Layout tabs={studentTabs}>
      {!active && (
        <>
          <div className="mb-6">
            <div className="rounded-xl border bg-gradient-to-r from-secondary to-muted p-6 shadow-soft">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Welcome back</div>
                  <h2 className="mt-1">{user?.name || "Student"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Track your progress and continue your tests.</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <CardDescription>Assigned Tests</CardDescription>
                  <CardTitle className="text-3xl">{totalAssigned}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <CardDescription>Total Attempts</CardDescription>
                  <CardTitle className="text-3xl">{totalAttempts}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <CardDescription>Pass Rate</CardDescription>
                  <CardTitle className="text-3xl">{passRate}%</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <CardDescription>Avg. Score</CardDescription>
                  <CardTitle className="text-3xl">{avgScore}%</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Your Assigned Tests</CardTitle>
                <CardDescription>Attempt within the time limit. Review unlocks after your final allowed attempt.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Set</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Pass %</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedRows.map(({ a, set, used, remaining }) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{set.name}</TableCell>
                        <TableCell>{a.timeLimitMinutes} min</TableCell>
                        <TableCell>{a.passPercent}%</TableCell>
                        <TableCell>{used}/{a.maxAttempts} ({remaining} left)</TableCell>
                        <TableCell>
                          <Button disabled={remaining <= 0} onClick={() => start(a, set)}>Start Test</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance History</CardTitle>
                <CardDescription>Past attempts with status</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[420px] overflow-auto">
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="rounded border p-3 text-sm">
                      <div className="font-medium">{h.setName}</div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{new Date(h.timestamp).toLocaleString()}</span>
                        <span>{h.percentage}% · {h.pass ? "Pass" : "Fail"}</span>
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="text-sm text-muted-foreground">No attempts yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {active && (
        <Card>
          <CardHeader>
            <CardTitle>{active.set.name}</CardTitle>
            <CardDescription>
              Time left: {Math.max(0, Math.floor(timeLeft / 60))}:{String(Math.max(0, timeLeft % 60)).padStart(2, "0")} · Pass {active.assignment.passPercent}% · Attempts left: {attemptsRemainingFor(active.assignment)}
            </CardDescription>
            {timeLeft > 0 && timeLeft <= 300 && !submitted && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Warning: 5 minutes remaining. The test will auto-submit when time expires.
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!submitted && (
              <div className="space-y-4">
                {active.set.questions.map((q) => (
                  <div key={q.id} className="rounded-md border p-4">
                    {q.type === "mcq" ? (
                      <div>
                        <div className="font-medium">{(q as MCQQuestion).text}</div>
                        { (q as MCQQuestion).media?.kind === 'image' && (
                          <img src={(q as MCQQuestion).media!.dataUrl} alt="question media" className="mt-2 max-h-56 rounded border" />
                        )}
                        { (q as MCQQuestion).media?.kind === 'audio' && (
                          <audio src={(q as MCQQuestion).media!.dataUrl} controls className="mt-2 w-full" />
                        )}
                        { (q as MCQQuestion).media?.kind === 'video' && (
                          <video src={(q as MCQQuestion).media!.dataUrl} controls className="mt-2 w-full max-h-64" />
                        )}
                        <ol className="mt-2 grid gap-2 md:grid-cols-2">
                          {(q as MCQQuestion).options.map((op, i) => (
                            <li key={i}>
                              <label className={cn("flex cursor-pointer items-center gap-2 rounded border p-2", (answers[q.id] ?? -1) === i ? "border-primary" : "") }>
                                <input type="radio" name={q.id} className="sr-only" onChange={() => choose(q.id, i)} />
                                <span className="inline-flex size-3 rounded-full border"></span>
                                <span>{op}</span>
                              </label>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">Read the paragraph</div>
                        <p className="mt-1 text-sm text-muted-foreground">{(q as ParagraphQuestion).paragraph}</p>
                        {(q as ParagraphQuestion).questions.map((qq, idx) => (
                          <div key={qq.id} className="mt-3">
                            <div className="text-sm font-medium">Q{idx + 1}. {qq.text}</div>
                            <ol className="mt-2 grid gap-2 md:grid-cols-2">
                              {qq.options.map((op, i) => (
                                <li key={i}>
                                  <label className={cn("flex cursor-pointer items-center gap-2 rounded border p-2", (answers[qq.id] ?? -1) === i ? "border-primary" : "") }>
                                    <input type="radio" name={qq.id} className="sr-only" onChange={() => choose(qq.id, i)} />
                                    <span className="inline-flex size-3 rounded-full border"></span>
                                    <span>{op}</span>
                                  </label>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button>Submit</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Submit test?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You are about to submit this attempt. The test will count toward your attempt limit. Unanswered questions: {flattenQuestions(active.set.questions).length - Object.values(answers).filter((v) => v !== null && v !== undefined).length}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => submit(false)}>Submit</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button variant="outline" onClick={exitAttempt}>Exit</Button>
                </div>
              </div>
            )}

            {submitted && (
              <div className="space-y-4">
                <div className="rounded-md border p-4">
                  <div className="text-lg font-semibold">Score: {submitted.score}/{flattenQuestions(active.set.questions).length} ({submitted.percentage}%)</div>
                  <div className={cn("mt-1 inline-block rounded px-2 py-1 text-sm", submitted.pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{submitted.pass ? "Pass" : "Fail"}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Attempt #{attemptsUsedFor(user!.id, active.set.id)} of {active.assignment.maxAttempts} · Remaining {attemptsRemainingFor(active.assignment)}
                  </div>
                  {endedByTimer && (
                    <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      Time completed — this attempt has been recorded.
                    </div>
                  )}
                </div>
                { attemptsRemainingFor(active.assignment) <= 0 ? (
                  <div className="space-y-3">
                    <div className="font-medium">Review Mode Unlocked</div>
                    <p className="text-sm text-muted-foreground">You have used all attempts for this set. Open the Review section in Tests to see correct answers and explanations.</p>
                    <div>
                      <a href="/student/tests#review" className="text-primary underline">Go to Review</a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">You can retake the test. Review becomes available after your final allowed attempt.</div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => start(active.assignment, active.set)}>Retake Test ({attemptsRemainingFor(active.assignment)} left)</Button>
                      <Button variant="outline" onClick={exitAttempt}>Close</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}
