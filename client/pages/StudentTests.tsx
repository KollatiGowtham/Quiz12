import Layout from "@/components/Layout";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { Assignment, Set as QuizSet, MCQQuestion, ParagraphQuestion, Question, Attempt } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { USE_SUPABASE } from "@/lib/supabase";
import * as sdb from "@/lib/db.supabase";


const studentTabs = [
  { to: "/student", label: "Dashboard" },
  { to: "/student/tests", label: "Tests" },
  { to: "/student/history", label: "History" },
  { to: "/student/profile", label: "Profile" },
];

export default function StudentTests() {
  const { user } = useAuth();

  useEffect(() => { if (!USE_SUPABASE) db.seedIfNeeded(); }, []);

  const [assignmentsS, setAssignmentsS] = useState<Assignment[]>([]);
  const [setsS, setSetsS] = useState<QuizSet[]>([]);
  const [attemptsS, setAttemptsS] = useState<Attempt[]>([]);
  const [attemptsAllS, setAttemptsAllS] = useState<Attempt[]>([]);
  const [bookmarks, setBookmarks] = useState<{ questionIds: Set<string> }>({ questionIds: new Set() });

  useEffect(() => {
    if (!USE_SUPABASE || !user) return;
    (async () => {
      const [a, s, t, ta, b] = await Promise.all([
        sdb.getAssignmentsForUser(user.id),
        sdb.getSetsWithQuestionsForUser(user.id),
        sdb.getAttemptsForUser(user.id),
        sdb.getAttemptsAll(),
        sdb.getBookmarks(user.id),
      ]);

      setAssignmentsS(a); setSetsS(s); setAttemptsS(t); setAttemptsAllS(ta);
      setBookmarks({ questionIds: new Set(b.map((x: any) => x.question_id)) });
    })();
  }, [user?.id]);

  const sets = useMemo(() => (USE_SUPABASE ? setsS : db.getSets()), [setsS]);
  const assignments = useMemo(() => (USE_SUPABASE ? assignmentsS : (user ? db.getAssignmentsForUser(user.id) : [])), [assignmentsS, user?.id]);
  const attemptsUser = useMemo(() => (USE_SUPABASE ? attemptsS.filter((a) => a.userId === user?.id) : db.getAttempts().filter((a) => a.userId === user?.id)), [USE_SUPABASE, attemptsS, user?.id]);
  function attemptsUsedFor(setId: string): number {
    return attemptsUser.filter((t) => t.setId === setId).length;
  }
  function attemptsRemainingFor(a: Assignment): number {
    return Math.max(0, a.maxAttempts - attemptsUsedFor(a.setId));
  }


  const assignedRows = (assignments as Assignment[]).map((a) => {
    const set = sets.find((s) => s.id === a.setId)! as QuizSet;
    const used = attemptsUsedFor(a.setId);
    const remaining = attemptsRemainingFor(a);
    return { a, set, used, remaining };
  });

  // helpers
  function flattenQuestions(questions: Question[]): MCQQuestion[] {
    const out: MCQQuestion[] = [];
    for (const q of questions) {
      if (q.type === "mcq") out.push(q as MCQQuestion);
      else out.push(...(q as ParagraphQuestion).questions);
    }
    return out;
  }

  const unlocked = useMemo(() => {
    if (!user) return [] as { set: QuizSet; assignment: Assignment }[];
    return (assignments as Assignment[])
      .filter((a) => attemptsUsedFor(a.setId) >= a.maxAttempts && attemptsUsedFor(a.setId) > 0)
      .map((a) => ({ a, set: sets.find((s) => s.id === a.setId)! }))
      .map(({ a, set }) => ({ set, assignment: a }));
  }, [assignments, sets, attemptsUser]);

  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [showIncorrectOnly, setShowIncorrectOnly] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => sets.find((s) => s.id === selectedSetId) || null, [selectedSetId, sets]);
  const lastAttempt = useMemo(() => {
    if (!user || !selectedSetId) return undefined;
    const list = (USE_SUPABASE ? attemptsS : db.getAttempts()).filter((t) => t.userId === user.id && t.setId === selectedSetId);
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [user?.id, selectedSetId, attemptsS]);

  function correctRate(setId: string, qid: string): number {
    const all = (USE_SUPABASE ? attemptsAllS : db.getAttempts()).filter((t) => t.setId === setId);
    const set = sets.find((s) => s.id === setId);
    if (!set) return 0;
    const mcq = flattenQuestions(set.questions).find((qq) => qq.id === qid);
    if (!mcq) return 0;
    let answered = 0, correct = 0;
    for (const att of all) {
      const ans = att.answers.find((x) => x.questionId === qid);
      if (ans && ans.chosenIndex !== null) {
        answered += 1;
        if (ans.chosenIndex === mcq.correctIndex) correct += 1;
      }
    }
    return answered ? Math.round((correct / answered) * 100) : 0;
  }

  const reviewQuestions = useMemo(() => {
    if (!selectedSet || !lastAttempt) return [] as MCQQuestion[];
    const all = flattenQuestions(selectedSet.questions);
    let list = all;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((mcq) => mcq.text.toLowerCase().includes(q) || mcq.justification?.toLowerCase().includes(q));
    }
    if (showIncorrectOnly) {
      list = list.filter((mcq) => {
        const ans = lastAttempt.answers.find((a) => a.questionId === mcq.id);
        return ans && ans.chosenIndex !== null && ans.chosenIndex !== mcq.correctIndex;
      });
    }
    return list;
  }, [selectedSet, lastAttempt, showIncorrectOnly, query]);

  const approxPerQ = useMemo(() => {
    if (!selectedSet || !lastAttempt) return 0;
    const count = flattenQuestions(selectedSet.questions).length || 1;
    return Math.round((lastAttempt.durationSeconds || 0) / count);
  }, [selectedSet, lastAttempt]);

  return (
    <Layout tabs={studentTabs}>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Your Assigned Tests</CardTitle>
            <CardDescription>Go to Dashboard to start and attempt tests.</CardDescription>
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
                    <TableCell>
                      {used}/{a.maxAttempts} ({remaining} left)
                    </TableCell>
                    <TableCell>
                      <Link to="/student" className="text-primary">Open Dashboard</Link>
                    </TableCell>
                  </TableRow>
                ))}
                {assignedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No assigned tests yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card id="review" className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              Review is unlocked after final allowed attempt. Select a set below to enter Review Mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {unlocked.map(({ set }) => (
                <Button key={set.id} variant={selectedSetId === set.id ? "default" : "outline"} size="sm" onClick={() => setSelectedSetId(set.id)}>
                  {set.name}
                </Button>
              ))}
              {unlocked.length === 0 && (
                <div className="text-sm text-muted-foreground">No sets available for review yet.</div>
              )}
            </div>

            {selectedSet && lastAttempt && (
              <div className="space-y-4">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem><BreadcrumbLink href="/student/tests">Tests</BreadcrumbLink></BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbPage>Review</BreadcrumbPage></BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbPage>{selectedSet.name}</BreadcrumbPage></BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>

                <div className="flex flex-wrap items-center gap-3">
                  <Input placeholder="Search keyword" className="w-56" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={showIncorrectOnly} onCheckedChange={(v) => setShowIncorrectOnly(Boolean(v))} />
                    Show incorrect only
                  </label>
                  <div className="ml-auto flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Score: {lastAttempt.score}/{flattenQuestions(selectedSet.questions).length}</Badge>
                    <Badge variant={lastAttempt.pass ? "default" : "destructive"}>{lastAttempt.pass ? "Pass" : "Fail"}</Badge>
                    <Badge variant="outline">Time ~{approxPerQ}s per question</Badge>
                    <Button variant="ghost" size="sm" onClick={() => window.print()}>Print / Export PDF</Button>
                  </div>
                </div>

                <Accordion type="multiple" className="divide-y rounded-md border">
                  {reviewQuestions.map((mcq, idx) => {
                    const ans = lastAttempt.answers.find((a) => a.questionId === mcq.id);
                    const isCorrect = ans?.chosenIndex === mcq.correctIndex;
                    const rate = correctRate(selectedSet.id, mcq.id);
                    return (
                      <AccordionItem key={mcq.id} value={mcq.id}>
                        <AccordionTrigger>
                          <div className="flex w-full items-center justify-between pr-4">
                            <div className="flex items-center gap-2">
                              <span className={isCorrect ? "text-green-600" : "text-red-600"}>{isCorrect ? "✔" : "✖"}</span>
                              <span className="text-left">Q{idx + 1}. {mcq.text}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{rate}% correct overall</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 p-4 pt-0">
                            {mcq.media?.kind === 'image' && (
                              <img src={mcq.media.dataUrl} alt="question media" className="mb-2 max-h-56 rounded border" />
                            )}
                            {mcq.media?.kind === 'audio' && (
                              <audio src={mcq.media.dataUrl} controls className="mb-2 w-full" />
                            )}
                            {mcq.media?.kind === 'video' && (
                              <video src={mcq.media.dataUrl} controls className="mb-2 w-full max-h-64" />
                            )}
                            <ol className="grid gap-2 md:grid-cols-2">
                              {mcq.options.map((op, i) => {
                                const isCorrect = i === mcq.correctIndex;
                                const isChosen = ans?.chosenIndex === i;
                                const isIncorrectChosen = isChosen && !isCorrect;
                                return (
                                  <li
                                    key={i}
                                    className={cn(
                                      "rounded border p-2",
                                      isCorrect && "border-green-500 bg-green-50",
                                      isIncorrectChosen && "border-red-500 bg-red-50"
                                    )}
                                  >
                                    {op}
                                  </li>
                                );
                              })}
                            </ol>
                            {mcq.justification && (
                              <p className="text-sm text-muted-foreground">Explanation: {mcq.justification}</p>
                            )}
                            <div className="pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  if (!user) return;
                                  if (USE_SUPABASE) {
                                    await sdb.toggleBookmark(user.id, selectedSet.id, mcq.id);
                                    const list = await sdb.getBookmarks(user.id);
                                    setBookmarks({ questionIds: new Set(list.map((x: any) => x.question_id)) });
                                  } else {
                                    db.toggleBookmark(user.id, selectedSet.id, mcq.id);
                                  }
                                }}
                              >
                                {USE_SUPABASE
                                  ? (bookmarks.questionIds.has(mcq.id) ? "★ Bookmarked" : "☆ Bookmark")
                                  : (user && db.isBookmarked(user.id, mcq.id) ? "★ Bookmarked" : "☆ Bookmark")}
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

