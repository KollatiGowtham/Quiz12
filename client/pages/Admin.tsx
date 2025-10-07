import Layout from "@/components/Layout";
import { useEffect, useMemo, useState } from "react";
import { db, Assignment, Attempt, MCQQuestion, ParagraphQuestion, Question } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";


import { cn } from "@/lib/utils";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";

import { USE_SUPABASE } from "@/lib/supabase";
import * as sdb from "@/lib/db.supabase";
import type { AuthUser } from "@/hooks/useAuth";
import type { Set as QuizSet } from "@/lib/db";

export default function Admin() {
  const { user } = useAuth();
  const [_, forceRerender] = useState(0);
  const [loading, setLoading] = useState(false);

  const [usersS, setUsersS] = useState<AuthUser[]>([]);
  useEffect(() => {
    const load = async () => {
      if (!USE_SUPABASE) return;
      setLoading(true);
      try {
        const [uu, ss, aa, tt, logs] = await Promise.all([
          sdb.getUsers(),
          sdb.getAllSetsWithQuestions(),
          sdb.getAssignmentsAll(),
          sdb.getAttemptsAll(),
          sdb.getAuditLogs(),
        ]);
        setUsersS(uu); setSetsS(ss); setAssignmentsS(aa); setAttemptsS(tt); setAuditLogs(logs);
        const st = await sdb.getSettings();
        setSettings(st);
      } catch (error) {
        console.error('Failed to load admin data:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [_]);

  const [setsS, setSetsS] = useState<QuizSet[]>([]);
  const [assignmentsS, setAssignmentsS] = useState<Assignment[]>([]);
  const [attemptsS, setAttemptsS] = useState<Attempt[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ id: string; timestamp: string; actor?: string; action: string; details?: string }[]>([]);



  useEffect(() => {
    db.seedIfNeeded();
    // Trigger initial load for Supabase mode
    if (USE_SUPABASE) {
      refresh();
    }
  }, []);

  const users = useMemo(() => USE_SUPABASE ? usersS.filter((u) => u.role === "student") : db.getUsers().filter((u) => u.role === "student"), [USE_SUPABASE, usersS, _]);
  const sets = useMemo(() => USE_SUPABASE ? setsS : db.getSets(), [USE_SUPABASE, setsS, _]);
  const assignments = useMemo(() => USE_SUPABASE ? assignmentsS : db.getAssignments(), [USE_SUPABASE, assignmentsS, _]);
  const attempts = useMemo(() => USE_SUPABASE ? attemptsS : db.getAttempts(), [USE_SUPABASE, attemptsS, _]);

  // Simple stat cards
  const totalStudents = users.length;
  const totalSets = sets.length;
  const totalAttempts = attempts.length;

  // Forms state
  const [newSetName, setNewSetName] = useState("");
  const [assignData, setAssignData] = useState<{ setId: string | null; time: number; pass: number; max: number; start?: string; end?: string }>({ setId: null, time: 30, pass: 50, max: 2, start: undefined, end: undefined });
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [setRenames, setSetRenames] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState(() => db.getSettings());
  async function saveSettings() {
    if (USE_SUPABASE) {
      await sdb.saveSettings(settings);
      await sdb.addAuditLog(user?.email, "settings_save", JSON.stringify(settings));
      refresh();
      return;
    }
    db.saveSettings(settings);
    db.addAuditLog(user?.email, "settings_save", JSON.stringify(settings));
    refresh();
  }


  const [mcqDraft, setMcqDraft] = useState<{ setId: string | null; text: string; options: string[]; correctIndex: number; justification: string; media?: { kind: "image" | "audio" | "video"; dataUrl: string } }>({ setId: null, text: "", options: ["", "", "", ""], correctIndex: 0, justification: "" });
  async function toggleStatus(uId: string, next: "active" | "inactive") {
    if (USE_SUPABASE) {
      await sdb.setUserStatus(uId, next);
      await sdb.addAuditLog(user?.email, "user_status", `user=${uId}; status=${next}`);
      refresh();
      return;
    }
    db.setUserStatus(uId, next);
    db.addAuditLog(user?.email, "user_status", `user=${uId}; status=${next}`);
    refresh();
  }

  async function renameSet(setId: string, name: string) {
    const n = name.trim();
    if (!n) return;
    if (USE_SUPABASE) {
      await sdb.updateSetName(setId, n);
      await sdb.addAuditLog(user?.email, "set_rename", `set=${setId}; name=${n}`);
      refresh();
      return;
    }
    db.updateSetName(setId, n);
    db.addAuditLog(user?.email, "set_rename", `set=${setId}; name=${n}`);
    refresh();
  }

  async function deleteSetFn(setId: string) {
    setLoading(true);
    try {
      if (USE_SUPABASE) {
        await sdb.deleteSet(setId);
        await sdb.addAuditLog(user?.email, "set_delete", `set=${setId}`);
        refresh();
        return;
      }
      db.deleteSet(setId);
      db.addAuditLog(user?.email, "set_delete", `set=${setId}`);
      refresh();
    } catch (error) {
      console.error('Failed to delete set:', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportAnalyticsCSV() {
    const rows = scoreboard;
    const header = ["Student","Email","Set","AttemptsUsed","AttemptsRemaining","Percentage","Pass","Timestamp"];
    const body = rows.map(r => [r.name, r.email, r.set, r.used, r.remaining, r.percentage, r.pass ? "Pass" : "Fail", r.timestamp]);
    const csv = [header, ...body].map(arr => arr.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `analytics-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (USE_SUPABASE) await sdb.addAuditLog(user?.email, "export_csv", `rows=${rows.length}`); else db.addAuditLog(user?.email, "export_csv", `rows=${rows.length}`);
  }

  async function deleteQuestionFn(setId: string, qId: string) {
    if (USE_SUPABASE) {
      await sdb.deleteQuestion(setId, qId);
      await sdb.addAuditLog(user?.email, "question_delete", `set=${setId}; q=${qId}`);
      refresh();
      return;
    }
    db.deleteQuestion(setId, qId);
    db.addAuditLog(user?.email, "question_delete", `set=${setId}; q=${qId}`);
    refresh();
  }


  const [paraDraft, setParaDraft] = useState<{ setId: string | null; paragraph: string; questions: { text: string; options: string[]; correctIndex: number; justification: string }[] }>({ setId: null, paragraph: "", questions: [{ text: "", options: ["", "", "", ""], correctIndex: 0, justification: "" }] });
  const [addOpenSetId, setAddOpenSetId] = useState<string | null>(null);
  const [questionTypeMain, setQuestionTypeMain] = useState<"text" | "paragraph" | "image" | "audio" | "video">("text");
  // Bulk selection state per setId
  const [selectedQs, setSelectedQs] = useState<Record<string, string[]>>({});
  const [bulkTarget, setBulkTarget] = useState<Record<string, string>>({}); // target set per source set

  function isSelected(setId: string, qId: string) {
    return (selectedQs[setId] ?? []).includes(qId);
  }
  function toggleSelect(setId: string, qId: string, on?: boolean) {
    setSelectedQs((prev) => {
      const arr = new Set(prev[setId] ?? []);
      const shouldAdd = on ?? !arr.has(qId);
      if (shouldAdd) arr.add(qId); else arr.delete(qId);
      return { ...prev, [setId]: Array.from(arr) };
    });
  }
  function clearSelection(setId: string) {
    setSelectedQs((prev) => ({ ...prev, [setId]: [] }));
  }
  function selectAllInSet(setId: string, on: boolean) {
    if (!on) return clearSelection(setId);
    const s = sets.find((x) => x.id === setId);
    if (!s) return;
    setSelectedQs((prev) => ({ ...prev, [setId]: s.questions.map((q) => q.id) }));
  }

  // Bulk actions: move, duplicate, delete with undo
  async function bulkDuplicate(sourceSetId: string) {
    const ids = selectedQs[sourceSetId] ?? [];
    if (ids.length === 0) return;
    const targetSetId = bulkTarget[sourceSetId] || sourceSetId;
    const src = sets.find((x) => x.id === sourceSetId);
    if (!src) return;

    if (USE_SUPABASE) {
      const addedIds: string[] = [];
      for (const q of src.questions) {
        if (!ids.includes(q.id)) continue;
        if (q.type === "mcq") {
          const r = await sdb.addMCQ(targetSetId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
          addedIds.push(r.id);
        } else {
          const pq = q as ParagraphQuestion;
          const r = await sdb.addParagraph(targetSetId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
          addedIds.push(r.id);
        }
      }
      await sdb.addAuditLog(user?.email, "bulk_duplicate", `from=${sourceSetId}; to=${targetSetId}; count=${ids.length}`);
      refresh();

      toast({
        title: "Questions duplicated",
        description: `${ids.length} item(s) added` ,
        action: (
          <ToastAction altText="Undo" onClick={async () => {
            const tsets = await sdb.getAllSetsWithQuestions();
            const tset = tsets.find((x) => x.id === targetSetId);
            if (!tset) return;
            for (const q of tset.questions) {
              if (addedIds.includes(q.id)) await sdb.deleteQuestion(targetSetId, q.id);
            }
            await sdb.addAuditLog(user?.email, "undo_bulk_duplicate", `to=${targetSetId}; removed=${addedIds.length}`);
            refresh();
          }}>Undo</ToastAction>
        )
      });
      return;
    }

    const addedIds: string[] = [];
    for (const q of src.questions) {
      if (!ids.includes(q.id)) continue;
      if (q.type === "mcq") {
        const r = db.addMCQ(targetSetId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
        addedIds.push(r.id);
      } else {
        const pq = q as ParagraphQuestion;
        const r = db.addParagraph(targetSetId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
        addedIds.push(r.id);
      }
    }
    db.addAuditLog(user?.email, "bulk_duplicate", `from=${sourceSetId}; to=${targetSetId}; count=${ids.length}`);
    refresh();

    toast({
      title: "Questions duplicated",
      description: `${ids.length} item(s) added` ,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          // remove the newly created ones
          const tset = db.getSets().find((x) => x.id === targetSetId);
          if (!tset) return;
          for (const q of tset.questions) {
            if (addedIds.includes(q.id)) db.deleteQuestion(targetSetId, q.id);
          }
          db.addAuditLog(user?.email, "undo_bulk_duplicate", `to=${targetSetId}; removed=${addedIds.length}`);
          refresh();
        }}>Undo</ToastAction>
      )
    });
  }

  async function bulkMove(sourceSetId: string) {
    const ids = selectedQs[sourceSetId] ?? [];
    if (ids.length === 0) return;
    const targetSetId = bulkTarget[sourceSetId];
    if (!targetSetId) return;
    const src = sets.find((x) => x.id === sourceSetId);
    if (!src) return;

    const originals = src.questions.filter((q) => ids.includes(q.id));

    if (USE_SUPABASE) {
      const addedIds: string[] = [];
      for (const q of originals) {
        if (q.type === "mcq") {
          const r = await sdb.addMCQ(targetSetId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
          addedIds.push(r.id);
        } else {
          const pq = q as ParagraphQuestion;
          const r = await sdb.addParagraph(targetSetId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
          addedIds.push(r.id);
        }
      }
      for (const id of ids) await sdb.deleteQuestion(sourceSetId, id);
      await sdb.addAuditLog(user?.email, "bulk_move", `from=${sourceSetId}; to=${targetSetId}; count=${ids.length}`);
      refresh();

      toast({
        title: "Questions moved",
        description: `${ids.length} item(s) moved` ,
        action: (
          <ToastAction altText="Undo" onClick={async () => {
            const tsets = await sdb.getAllSetsWithQuestions();
            const tset = tsets.find((x) => x.id === targetSetId);
            if (tset) for (const q of tset.questions) if (addedIds.includes(q.id)) await sdb.deleteQuestion(targetSetId, q.id);
            for (const q of originals) {
              if (q.type === "mcq") await sdb.addMCQ(sourceSetId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
              else {
                const pq = q as ParagraphQuestion;
                await sdb.addParagraph(sourceSetId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
              }
            }
            await sdb.addAuditLog(user?.email, "undo_bulk_move", `restored=${originals.length}`);
            refresh();
          }}>Undo</ToastAction>
        )
      });
      return;
    }

    const addedIds: string[] = [];
    // duplicate into target
    for (const q of originals) {
      if (q.type === "mcq") {
        const r = db.addMCQ(targetSetId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
        addedIds.push(r.id);
      } else {
        const pq = q as ParagraphQuestion;
        const r = db.addParagraph(targetSetId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
        addedIds.push(r.id);
      }
    }
    // delete from source
    for (const id of ids) db.deleteQuestion(sourceSetId, id);
    db.addAuditLog(user?.email, "bulk_move", `from=${sourceSetId}; to=${targetSetId}; count=${ids.length}`);
    refresh();

    toast({
      title: "Questions moved",
      description: `${ids.length} item(s) moved` ,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          // remove duplicates in target and add back to source
          const tset = db.getSets().find((x) => x.id === targetSetId);
          if (tset) for (const q of tset.questions) if (addedIds.includes(q.id)) db.deleteQuestion(targetSetId, q.id);
          for (const q of originals) {
            if (q.type === "mcq") db.addMCQ(sourceSetId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
            else {
              const pq = q as ParagraphQuestion;
              db.addParagraph(sourceSetId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
            }
          }
          db.addAuditLog(user?.email, "undo_bulk_move", `restored=${originals.length}`);
          refresh();
        }}>Undo</ToastAction>
      )
    });
  }

  async function bulkDelete(setId: string) {
    const ids = selectedQs[setId] ?? [];
    if (ids.length === 0) return;
    const src = sets.find((x) => x.id === setId);
    if (!src) return;
    const originals = src.questions.filter((q) => ids.includes(q.id));

    if (USE_SUPABASE) {
      for (const id of ids) await sdb.deleteQuestion(setId, id);
      await sdb.addAuditLog(user?.email, "bulk_delete", `set=${setId}; count=${ids.length}`);
      refresh();

      toast({
        title: "Questions deleted",
        description: `${ids.length} item(s) removed` ,
        action: (
          <ToastAction altText="Undo" onClick={async () => {
            for (const q of originals) {
              if (q.type === "mcq") await sdb.addMCQ(setId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
              else {
                const pq = q as ParagraphQuestion;
                await sdb.addParagraph(setId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
              }
            }
            await sdb.addAuditLog(user?.email, "undo_bulk_delete", `restored=${originals.length}`);
            refresh();
          }}>Undo</ToastAction>
        )
      });
      return;
    }

    for (const id of ids) db.deleteQuestion(setId, id);
    db.addAuditLog(user?.email, "bulk_delete", `set=${setId}; count=${ids.length}`);
    refresh();

    toast({
      title: "Questions deleted",
      description: `${ids.length} item(s) removed` ,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          for (const q of originals) {
            if (q.type === "mcq") db.addMCQ(setId, { text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: (q as any).media });
            else {
              const pq = q as ParagraphQuestion;
              db.addParagraph(setId, pq.paragraph, pq.questions.map((qq) => ({ text: qq.text, options: qq.options, correctIndex: qq.correctIndex, justification: qq.justification, media: (qq as any).media })));
            }
          }
          db.addAuditLog(user?.email, "undo_bulk_delete", `restored=${originals.length}`);
          refresh();
        }}>Undo</ToastAction>
      )
    });
  }

  const [addQType, setAddQType] = useState<"text" | "paragraph" | "image" | "audio" | "video">("text");

  function refresh() {
    forceRerender((x) => x + 1);
  }

  function attemptsUsedFor(userId: string, setId: string) {
    return attempts.filter((t) => t.userId === userId && t.setId === setId).length;
  }
  function attemptsRemainingFor(userId: string, setId: string) {
    const a = assignments.find((x) => x.userId === userId && x.setId === setId);
    if (!a) return 0;
    return Math.max(0, a.maxAttempts - attemptsUsedFor(userId, setId));
  }

  async function handleCreateSet() {
    const n = newSetName.trim();
    if (!n) return;
    setLoading(true);
    try {
      if (USE_SUPABASE) {
        await sdb.createSet(n);
        await sdb.addAuditLog(user?.email, "set_create", n);
        setNewSetName("");
        refresh();
        toast({
          title: "Set created successfully",
          description: `"${n}" has been added to your sets.`,
        });
        return;
      }
      db.createSet(n);
      db.addAuditLog(user?.email, "set_create", n);
      setNewSetName("");
      refresh();
      toast({
        title: "Set created successfully",
        description: `"${n}" has been added to your sets.`,
      });
    } catch (error) {
      console.error('Failed to create set:', error);
      toast({
        title: "Error creating set",
        description: "Failed to create the set. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMCQ() {
    const { setId, text, options, correctIndex, justification } = mcqDraft;
    const n = Math.min(5, Math.max(2, options.length));
    const opts = options.slice(0, n).map((o) => o ?? "");
    if (!setId || !text.trim() || opts.some((o) => !o.trim())) return;
    const ci = Math.min(Math.max(0, correctIndex), n - 1);
    if (USE_SUPABASE) {
      await sdb.addMCQ(setId, { text: text.trim(), options: opts, correctIndex: ci, justification, media: mcqDraft.media });
      await sdb.addAuditLog(user?.email, "question_add_mcq", `set=${setId}; text=${text.slice(0, 60)}`);
      setMcqDraft({ setId, text: "", options: Array(n).fill("") as string[], correctIndex: 0, justification: "" });
      refresh();
      return;
    }
    db.addMCQ(setId, { text: text.trim(), options: opts, correctIndex: ci, justification, media: mcqDraft.media });
    db.addAuditLog(user?.email, "question_add_mcq", `set=${setId}; text=${text.slice(0, 60)}`);
    setMcqDraft({ setId, text: "", options: Array(n).fill("") as string[], correctIndex: 0, justification: "" });
    refresh();
  }

  async function handleAddParagraph() {
    const { setId, paragraph, questions } = paraDraft;
    if (!setId || !paragraph.trim() || questions.some((q) => !q.text.trim() || q.options.some((o) => !o.trim()))) return;
    if (USE_SUPABASE) {
      await sdb.addParagraph(setId, paragraph.trim(), questions);
      await sdb.addAuditLog(user?.email, "question_add_paragraph", `set=${setId}; len=${paragraph.length}; q=${questions.length}`);
      setParaDraft({ setId, paragraph: "", questions: [{ text: "", options: ["", "", "", ""], correctIndex: 0, justification: "" }] });
      refresh();
      return;
    }
    db.addParagraph(setId, paragraph.trim(), questions);
    db.addAuditLog(user?.email, "question_add_paragraph", `set=${setId}; len=${paragraph.length}; q=${questions.length}`);
    setParaDraft({ setId, paragraph: "", questions: [{ text: "", options: ["", "", "", ""], correctIndex: 0, justification: "" }] });
    refresh();
  }

  async function handleAssign() {
    if (!assignData.setId || selectedStudentIds.length === 0) return;
    const startIso = assignData.start ? new Date(assignData.start).toISOString() : undefined;
    const endIso = assignData.end ? new Date(assignData.end).toISOString() : undefined;

    try {
      if (USE_SUPABASE) {
        for (const id of selectedStudentIds) {
          await sdb.assignSet({ userId: id, setId: assignData.setId, timeLimitMinutes: assignData.time, passPercent: assignData.pass, maxAttempts: assignData.max, availabilityStart: startIso, availabilityEnd: endIso });
        }
        await sdb.addAuditLog(user?.email, "bulk_assign", `set=${assignData.setId}; count=${selectedStudentIds.length}`);
      } else {
        for (const id of selectedStudentIds) {
          db.assignSet({ userId: id, setId: assignData.setId, timeLimitMinutes: assignData.time, passPercent: assignData.pass, maxAttempts: assignData.max, availabilityStart: startIso, availabilityEnd: endIso });
        }
        db.addAuditLog(user?.email, "bulk_assign", `set=${assignData.setId}; count=${selectedStudentIds.length}`);
      }

      const assignedSetName = sets.find((ss) => ss.id === assignData.setId)?.name ?? assignData.setId;
      toast({ title: "Test assigned successfully", description: `${assignedSetName} assigned to ${selectedStudentIds.length} student(s).` });
      setAssignData({ setId: null, time: 30, pass: 50, max: 2, start: undefined, end: undefined });
      setSelectedStudentIds([]);
      refresh();
    } catch (error) {
      console.error('Failed to assign test:', error);
      toast({
        title: "Error assigning test",
        description: "Failed to assign the test. Please try again.",
        variant: "destructive"
      });
    }
  }

  const scoreboard = useMemo(() => {
    return attempts.map((att) => {
      const u = (USE_SUPABASE ? usersS.find((uu) => uu.id === att.userId) : db.getUsers().find((uu) => uu.id === att.userId))!;
      const s = sets.find((ss) => ss.id === att.setId)!;
      const a = assignments.find((aa) => aa.userId === u.id && aa.setId === s.id);
      const used = attemptsUsedFor(u.id, s.id);
      const remaining = a ? Math.max(0, a.maxAttempts - used) : 0;
      return { id: att.id, name: u.name, email: u.email, set: s.name, used, remaining, score: att.score, percentage: att.percentage, pass: att.pass, timestamp: new Date(att.timestamp).toLocaleString() };
    });
  }, [attempts, sets, assignments]);

  const trendData = useMemo(() => {
    // Average percentage per day
    const map = new Map<string, { sum: number; count: number }>();
    for (const a of attempts) {
      const d = a.timestamp.slice(0, 10);
      const e = map.get(d) || { sum: 0, count: 0 };
      e.sum += a.percentage;
      e.count += 1;
      map.set(d, e);
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, avg: Math.round((v.sum / v.count) * 10) / 10 }));
  }, [attempts]);

  return (
    <Layout>
      <div className="mb-6">
        <div className="rounded-xl border bg-gradient-to-r from-secondary to-muted p-6 shadow-soft">
          <div className="text-sm text-muted-foreground">Welcome back</div>
          <h2 className="mt-1">{user?.name || "Admin"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage students, sets and performance.</p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
            <CardDescription>Total registered</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{totalStudents}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Test Sets</CardTitle>
            <CardDescription>Available sets</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{totalSets}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attempts</CardTitle>
            <CardDescription>All time</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{totalAttempts}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="sets">Sets</TabsTrigger>
          <TabsTrigger value="assign">Assign</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>All Students</CardTitle>
              <CardDescription>Details, assigned sets, performance, attempts used/remaining</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Age</TableHead>

                    <TableHead>Registered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const assigned = assignments.filter((a) => a.userId === u.id);
                    const status = u.status ?? "active";
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.age ?? "-"}</TableCell>

                        <TableCell>{new Date(u.registeredAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <span className={cn("rounded px-2 py-1 text-xs", status === "active" ? "bg-green-100 text-green-700" : "bg-zinc-200 text-zinc-700")}>{status}</span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="secondary" size="sm" onClick={() => setSelectedStudentId(u.id)}>View Details</Button>
                          {status === "active" ? (
                            <Button variant="outline" size="sm" onClick={() => toggleStatus(u.id, "inactive")}>Deactivate</Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => toggleStatus(u.id, "active")}>Activate</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {selectedStudentId && (() => {
                const stu = users.find(x => x.id === selectedStudentId);
                if (!stu) return null;
                const assigned = assignments.filter(a => a.userId === stu.id);
                const rows = assigned.map(a => {
                  const set = sets.find(s => s.id === a.setId);
                  const used = attemptsUsedFor(stu.id, a.setId);
                  const rem = Math.max(0, a.maxAttempts - used);
                  const atts = attempts.filter(t => t.userId === stu.id && t.setId === a.setId).sort((x,y) => y.timestamp.localeCompare(x.timestamp));
                  const last = atts[0];
                  return { set: set?.name || "Set", used, total: a.maxAttempts, lastPercent: last?.percentage ?? null, pass: last?.pass ?? null };
                });
                return (
                  <div className="mt-6 rounded-md border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-medium">Student Details: {stu.name}</div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedStudentId(null)}>Close</Button>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div><span className="text-muted-foreground">Email:</span> {stu.email}</div>
                        <div><span className="text-muted-foreground">Registered:</span> {new Date(stu.registeredAt).toLocaleString()}</div>
                        <div><span className="text-muted-foreground">Age:</span> {stu.age ?? "-"}</div>

                        <div><span className="text-muted-foreground">Status:</span> {stu.status ?? "active"}</div>
                      </div>
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                        <div className="text-xs font-medium text-amber-800">Sensitive: Password visible for admin review only</div>
                        <div className="mt-1">Password: <span className="font-mono">{stu.password ? stu.password : "(not set)"}</span></div>
                      </div>
                    </div>

                    <div className="mt-4 border-t pt-3">
                      <div className="mb-2 font-medium">Performance</div>
                      <div className="grid gap-2">
                        {rows.map((r, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div>{r.set}</div>
                            <div className="text-muted-foreground">Attempts {r.used}/{r.total}</div>
                            <div>{r.lastPercent !== null ? `${r.lastPercent}%` : "-"}</div>
                            <div>{r.pass === null ? "-" : (r.pass ? "Pass" : "Fail")}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>

          </Card>
        </TabsContent>

        <TabsContent value="sets" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create Set</CardTitle>
                <CardDescription>Organize tests into folders (Sets)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="setName">Set name</Label>
                <Input id="setName" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="e.g., Set 3: Algebra" />
                <Button onClick={handleCreateSet} disabled={loading || !newSetName.trim()} className="w-fit">
                  {loading ? "Creating..." : "Create"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Question</CardTitle>
                <CardDescription>Choose a type, then fill in the fields</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label>Question Type</Label>
                <Select value={questionTypeMain} onValueChange={(v) => setQuestionTypeMain(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text-based MCQ</SelectItem>
                    <SelectItem value="paragraph">Paragraph-based MCQ</SelectItem>
                    <SelectItem value="image">Image-based MCQ</SelectItem>
                    <SelectItem value="audio">Audio-based MCQ</SelectItem>
                    <SelectItem value="video">Video-based MCQ</SelectItem>
                  </SelectContent>
                </Select>

                {questionTypeMain === 'paragraph' && (
                  <div className="rounded-md border p-3 text-sm text-muted-foreground">
                    Use the Paragraph builder below to add a paragraph with multiple questions.
                  </div>
                )}

                <Label>Target Set</Label>
                <Select value={mcqDraft.setId ?? undefined} onValueChange={(v) => setMcqDraft((d) => ({ ...d, setId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select set" /></SelectTrigger>
                  <SelectContent>
                    {sets.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>

                {questionTypeMain !== 'paragraph' && (
                  <>
                    {['image','audio','video'].includes(questionTypeMain) && (
                      <div className="space-y-2">
                        <Label>Upload {questionTypeMain}</Label>
                        <Input type="file" accept={questionTypeMain==='image'? 'image/*' : questionTypeMain==='audio'? 'audio/*' : 'video/*'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onload = () => setMcqDraft((d) => ({ ...d, media: { kind: questionTypeMain as any, dataUrl: String(reader.result) } }));
                            reader.readAsDataURL(f);
                          }}
                        />
                        {mcqDraft.media?.dataUrl && (
                          <div className="mt-2">
                            {mcqDraft.media?.kind === 'image' && (<img src={mcqDraft.media.dataUrl} alt="preview" className="max-h-40 rounded border" />)}
                            {mcqDraft.media?.kind === 'audio' && (<audio src={mcqDraft.media.dataUrl} controls className="w-full" />)}
                            {mcqDraft.media?.kind === 'video' && (<video src={mcqDraft.media.dataUrl} controls className="w-full max-h-48" />)}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid gap-2 md:grid-cols-3 items-end">
                      <div className="md:col-span-2">
                        <Label>Question</Label>
                        <Input value={mcqDraft.text} onChange={(e) => setMcqDraft((d) => ({ ...d, text: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Number of Options</Label>
                        <Select value={String(mcqDraft.options.length)} onValueChange={(v) => setMcqDraft((d) => {
                          const n = Number(v);
                          const opts = [...d.options];
                          if (opts.length < n) {
                            while (opts.length < n) opts.push("");
                          } else if (opts.length > n) {
                            opts.length = n;
                          }
                          const ci = Math.min(d.correctIndex, n - 1);
                          return { ...d, options: opts, correctIndex: ci };
                        })}>
                          <SelectTrigger><SelectValue placeholder="Options" /></SelectTrigger>
                          <SelectContent>
                            {[2,3,4,5].map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {mcqDraft.options.map((opt, i) => (
                        <Input key={i} value={opt} placeholder={`Option ${i + 1}`} onChange={(e) => setMcqDraft((d) => { const options = [...d.options]; options[i] = e.target.value; return { ...d, options }; })} />
                      ))}
                    </div>
                    <Label>{`Correct Option Index (0-${Math.max(0, mcqDraft.options.length - 1)})`}</Label>
                    <Input type="number" min={0} max={Math.max(0, mcqDraft.options.length - 1)} value={mcqDraft.correctIndex} onChange={(e) => setMcqDraft((d) => ({ ...d, correctIndex: Number(e.target.value) }))} />
                    <Label>Justification</Label>
                    <Input value={mcqDraft.justification} onChange={(e) => setMcqDraft((d) => ({ ...d, justification: e.target.value }))} />
                    <Button onClick={handleAddMCQ} className="w-fit">Add MCQ</Button>
                  </>
                )}
              </CardContent>
            </Card>

            {questionTypeMain === 'paragraph' && (
              <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Add Paragraph-based MCQs</CardTitle>
                <CardDescription>Attach MCQs to a paragraph</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label>Target Set</Label>
                <Select value={paraDraft.setId ?? undefined} onValueChange={(v) => setParaDraft((d) => ({ ...d, setId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select set" /></SelectTrigger>
                  <SelectContent>
                    {sets.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Label>Paragraph</Label>
                <Input value={paraDraft.paragraph} onChange={(e) => setParaDraft((d) => ({ ...d, paragraph: e.target.value }))} />
                {paraDraft.questions.map((q, idx) => (
                  <div key={idx} className="rounded-md border p-3 space-y-2">
                    <Label>Question {idx + 1}</Label>
                    <Input value={q.text} onChange={(e) => setParaDraft((d) => { const qs = [...d.questions]; qs[idx] = { ...qs[idx], text: e.target.value }; return { ...d, questions: qs }; })} />
                    <div className="grid gap-2 md:grid-cols-2">
                      {q.options.map((op, i) => (
                        <Input key={i} value={op} placeholder={`Option ${i + 1}`} onChange={(e) => setParaDraft((d) => { const qs = [...d.questions]; const opts = [...qs[idx].options]; opts[i] = e.target.value; qs[idx] = { ...qs[idx], options: opts }; return { ...d, questions: qs }; })} />
                      ))}
                    </div>
                    <Label>{`Correct Index (0-${Math.max(0, q.options.length - 1)})`}</Label>
                    <Input type="number" min={0} max={Math.max(0, q.options.length - 1)} value={q.correctIndex} onChange={(e) => setParaDraft((d) => { const qs = [...d.questions]; qs[idx] = { ...qs[idx], correctIndex: Number(e.target.value) }; return { ...d, questions: qs }; })} />
                    <Label>Justification</Label>
                    <Input value={q.justification} onChange={(e) => setParaDraft((d) => { const qs = [...d.questions]; qs[idx] = { ...qs[idx], justification: e.target.value }; return { ...d, questions: qs }; })} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setParaDraft((d) => ({ ...d, questions: [...d.questions, { text: "", options: ["", "", "", ""], correctIndex: 0, justification: "" }] }))}>Add Question</Button>
                  <Button onClick={handleAddParagraph}>Add Paragraph Block</Button>
                </div>
              </CardContent>
            </Card>
            )}

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Existing Sets</CardTitle>
                <CardDescription>Browse and review questions</CardDescription>
              </CardHeader>
              <CardContent>
                {sets.length === 0 && <div className="text-sm text-muted-foreground">No sets yet.</div>}
                <Accordion type="single" collapsible className="w-full">
                  {sets.map((s) => (
                    <AccordionItem key={s.id} value={s.id}>
                      <AccordionTrigger className="text-left">
                        <div className="flex w-full items-center justify-between">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()} • {s.questions.length} item(s)</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Input className="max-w-xs" value={setRenames[s.id] ?? s.name} onChange={(e) => setSetRenames((m) => ({ ...m, [s.id]: e.target.value }))} />
                            <Button size="sm" onClick={() => renameSet(s.id, setRenames[s.id] ?? s.name)}>Rename</Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteSetFn(s.id)}>Delete</Button>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              <Checkbox checked={(selectedQs[s.id]?.length ?? 0) === s.questions.length && s.questions.length > 0}
                                onCheckedChange={(v) => selectAllInSet(s.id, !!v)} />
                              <span className="text-sm">Select all</span>
                              <Button size="sm" variant="ghost" onClick={() => clearSelection(s.id)}>Clear</Button>
                              <span className="text-xs text-muted-foreground">{(selectedQs[s.id]?.length ?? 0)} selected</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select value={bulkTarget[s.id] ?? s.id} onValueChange={(v) => setBulkTarget((m) => ({ ...m, [s.id]: v }))}>
                                <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Target set" /></SelectTrigger>
                                <SelectContent>
                                  {sets.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="secondary" disabled={(selectedQs[s.id]?.length ?? 0) === 0} onClick={() => bulkDuplicate(s.id)}>Duplicate</Button>
                              <Button size="sm" disabled={(selectedQs[s.id]?.length ?? 0) === 0 || (bulkTarget[s.id] ?? s.id) === s.id} onClick={() => bulkMove(s.id)}>Move</Button>
                              <Button size="sm" variant="destructive" disabled={(selectedQs[s.id]?.length ?? 0) === 0} onClick={() => bulkDelete(s.id)}>Delete</Button>
                            </div>
                          </div>

                          <div className="space-y-2 max-h-64 overflow-auto">
                            {s.questions.map((q) => (
                              <div key={q.id} className="rounded border p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2">
                                    <Checkbox checked={isSelected(s.id, q.id)} onCheckedChange={(v) => toggleSelect(s.id, q.id, !!v)} />
                                    {q.type === "mcq" ? (
                                      <div>
                                        <div className="font-medium">MCQ: {(q as MCQQuestion).text}</div>
                                        <ol className="list-decimal pl-5 text-sm">
                                          {(q as MCQQuestion).options.map((op, i) => (
                                            <li key={i} className={cn("", i === (q as MCQQuestion).correctIndex ? "text-green-600" : "")}>{op}</li>
                                          ))}
                                        </ol>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="font-medium">Paragraph</div>
                                        <p className="text-sm text-muted-foreground mb-1">{(q as ParagraphQuestion).paragraph}</p>
                                        {(q as ParagraphQuestion).questions.map((qq, j) => (
                                          <div key={qq.id} className="mt-1">
                                            <div className="text-sm">Q{j + 1}. {qq.text}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <Button size="sm" variant="outline" onClick={() => deleteQuestionFn(s.id, q.id)}>Delete</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="pt-2 border-t">
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => { const open = addOpenSetId === s.id ? null : s.id; setAddOpenSetId(open); setMcqDraft((d) => ({ ...d, setId: s.id })); setParaDraft((d) => ({ ...d, setId: s.id })); }}>Add Questions</Button>
                            </div>

                            {addOpenSetId === s.id && (
                              <>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">Type</Label>
                                  <Select value={addQType} onValueChange={(v) => setAddQType(v as any)}>
                                    <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Select type" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Text-based MCQ</SelectItem>
                                      <SelectItem value="paragraph">Paragraph-based MCQ</SelectItem>
                                      <SelectItem value="image">Image-based MCQ</SelectItem>
                                      <SelectItem value="audio">Audio-based MCQ</SelectItem>
                                      <SelectItem value="video">Video-based MCQ</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {addQType !== 'paragraph' && (
                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                      <Label>Question</Label>
                                      <Input value={mcqDraft.text} onChange={(e) => setMcqDraft((d) => ({ ...d, setId: s.id, text: e.target.value }))} />
                                      {['image','audio','video'].includes(addQType) && (
                                        <div className="md:col-span-2 space-y-2">
                                          <Label>Upload {addQType}</Label>
                                          <Input type="file" accept={addQType==='image'? 'image/*' : addQType==='audio'? 'audio/*' : 'video/*'}
                                            onChange={(e) => {
                                              const f = e.target.files?.[0];
                                              if (!f) return;
                                              const reader = new FileReader();
                                              reader.onload = () => setMcqDraft((d) => ({ ...d, setId: s.id, media: { kind: addQType as any, dataUrl: String(reader.result) } }));
                                              reader.readAsDataURL(f);
                                            }}
                                          />
                                          {mcqDraft.media?.dataUrl && (
                                            <div className="mt-1">
                                              {mcqDraft.media?.kind === 'image' && (<img src={mcqDraft.media.dataUrl} alt="preview" className="max-h-40 rounded border" />)}
                                              {mcqDraft.media?.kind === 'audio' && (<audio src={mcqDraft.media.dataUrl} controls className="w-full" />)}
                                              {mcqDraft.media?.kind === 'video' && (<video src={mcqDraft.media.dataUrl} controls className="w-full max-h-48" />)}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <Label>Number of Options</Label>
                                      <Select value={String(mcqDraft.options.length)} onValueChange={(v) => setMcqDraft((d) => {
                                        const n = Number(v);
                                        const opts = [...d.options];
                                        if (opts.length < n) { while (opts.length < n) opts.push(""); }
                                        else if (opts.length > n) { opts.length = n; }
                                        const ci = Math.min(d.correctIndex, n - 1);
                                        return { ...d, setId: s.id, options: opts, correctIndex: ci };
                                      })}>
                                        <SelectTrigger className="h-8"><SelectValue placeholder="Options" /></SelectTrigger>
                                        <SelectContent>
                                          {[2,3,4,5].map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {mcqDraft.options.map((_, i) => (
                                      <Input key={i} placeholder={`Option ${i + 1}`} value={mcqDraft.options[i]} onChange={(e) => setMcqDraft((d) => { const opts = [...d.options]; opts[i] = e.target.value; return { ...d, setId: s.id, options: opts }; })} />
                                    ))}
                                    <div className="grid grid-cols-2 gap-2 md:col-span-2">
                                      <div>
                                        <Label>{`Correct Index (0-${Math.max(0, mcqDraft.options.length - 1)})`}</Label>
                                        <Input type="number" min={0} max={Math.max(0, mcqDraft.options.length - 1)} value={mcqDraft.correctIndex} onChange={(e) => setMcqDraft((d) => ({ ...d, setId: s.id, correctIndex: Number(e.target.value) }))} />
                                      </div>
                                      <div>
                                        <Label>Justification</Label>
                                        <Input value={mcqDraft.justification} onChange={(e) => setMcqDraft((d) => ({ ...d, setId: s.id, justification: e.target.value }))} />
                                      </div>
                                    </div>
                                    <div className="md:col-span-2">
                                      <Button onClick={handleAddMCQ}>Add MCQ to Set</Button>
                                    </div>
                                  </div>
                                )}

                                {addQType === 'paragraph' ? (
                                  <div className="mt-2 grid gap-2">
                                    <Label>Paragraph</Label>
                                    <Input value={paraDraft.paragraph} onChange={(e) => setParaDraft((d) => ({ ...d, setId: s.id, paragraph: e.target.value }))} />
                                    <Label>Q1 Text</Label>
                                    <Input value={paraDraft.questions[0]?.text ?? ''} onChange={(e) => setParaDraft((d) => { const qs = d.questions.length ? [...d.questions] : [{ text: '', options: ['', '', '', ''], correctIndex: 0, justification: '' }]; qs[0] = { ...qs[0], text: e.target.value }; return { ...d, setId: s.id, questions: qs }; })} />
                                    <div>
                                      <Label>Number of Options</Label>
                                      <Select value={String((paraDraft.questions[0]?.options?.length ?? 4))} onValueChange={(v) => setParaDraft((d) => {
                                        const n = Number(v);
                                        const qs = d.questions.length ? [...d.questions] : [{ text: '', options: ['', '', '', ''], correctIndex: 0, justification: '' }];
                                        const opts = [...(qs[0].options ?? [])];
                                        if (opts.length < n) { while (opts.length < n) opts.push(''); }
                                        else if (opts.length > n) { opts.length = n; }
                                        const ci = Math.min(qs[0].correctIndex ?? 0, n - 1);
                                        qs[0] = { ...qs[0], options: opts, correctIndex: ci };
                                        return { ...d, setId: s.id, questions: qs };
                                      })}>
                                        <SelectTrigger className="h-8"><SelectValue placeholder="Options" /></SelectTrigger>
                                        <SelectContent>
                                          {[2,3,4,5].map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                      {(paraDraft.questions[0]?.options ?? ['', '', '', '']).map((op, i) => (
                                        <Input key={i} placeholder={`Option ${i + 1}`} value={op} onChange={(e) => setParaDraft((d) => { const qs = d.questions.length ? [...d.questions] : [{ text: '', options: ['', '', '', ''], correctIndex: 0, justification: '' }]; const opts = [...(qs[0].options ?? [])]; while (opts.length <= i) opts.push(''); opts[i] = e.target.value; qs[0] = { ...qs[0], options: opts }; return { ...d, setId: s.id, questions: qs }; })} />
                                      ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label>{`Correct Index (0-${Math.max(0, (paraDraft.questions[0]?.options?.length ?? 4) - 1)})`}</Label>
                                        <Input type="number" min={0} max={Math.max(0, (paraDraft.questions[0]?.options?.length ?? 4) - 1)} value={paraDraft.questions[0]?.correctIndex ?? 0} onChange={(e) => setParaDraft((d) => { const qs = d.questions.length ? [...d.questions] : [{ text: '', options: ['', '', '', ''], correctIndex: 0, justification: '' }]; qs[0] = { ...qs[0], correctIndex: Number(e.target.value) }; return { ...d, setId: s.id, questions: qs }; })} />
                                      </div>
                                      <div>
                                        <Label>Justification</Label>
                                        <Input value={paraDraft.questions[0]?.justification ?? ''} onChange={(e) => setParaDraft((d) => { const qs = d.questions.length ? [...d.questions] : [{ text: '', options: ['', '', '', ''], correctIndex: 0, justification: '' }]; qs[0] = { ...qs[0], justification: e.target.value }; return { ...d, setId: s.id, questions: qs }; })} />
                                      </div>
                                    </div>
                                    <div>
                                      <Button onClick={handleAddParagraph}>Add Paragraph Block</Button>
                                      <div className="text-xs text-muted-foreground mt-1">Use the advanced builder above for multiple questions.</div>
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assign" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign Sets to Students</CardTitle>
              <CardDescription>Define time limit, pass %, and max attempts</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Students</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {selectedStudentIds.length > 0 ? `Selected ${selectedStudentIds.length} student(s)` : "Select students"}
                      <span className="text-muted-foreground text-xs">▼</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <Button variant="secondary" size="sm" onClick={() => setSelectedStudentIds(users.filter(u => u.role === 'student' && u.status !== 'inactive').map(u => u.id))}>Select All</Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedStudentIds([])}>Clear</Button>
                    </div>
                    <div className="max-h-60 overflow-auto space-y-1">
                      {users.filter(u => u.role === 'student' && u.status !== 'inactive').map((u) => {
                        const checked = selectedStudentIds.includes(u.id);
                        return (
                          <label key={u.id} className="flex items-center gap-2 py-1">
                            <Checkbox checked={checked} onCheckedChange={(v) => {
                              const on = !!v;
                              setSelectedStudentIds((arr) => on ? [...arr, u.id] : arr.filter((x) => x !== u.id));
                            }} />
                            <span className="text-sm">{u.name} <span className="text-muted-foreground">({u.email})</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Set</Label>
                <Select value={assignData.setId ?? undefined} onValueChange={(v) => setAssignData((d) => ({ ...d, setId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select set" /></SelectTrigger>
                  <SelectContent>
                    {sets.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Time (min)</Label>
                  <Input type="number" min={5} value={assignData.time} onChange={(e) => setAssignData((d) => ({ ...d, time: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Pass %</Label>
                  <Input type="number" min={0} max={100} value={assignData.pass} onChange={(e) => setAssignData((d) => ({ ...d, pass: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Max attempts</Label>
                  <Input type="number" min={1} value={assignData.max} onChange={(e) => setAssignData((d) => ({ ...d, max: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Available From</Label>
                  <Input type="datetime-local" value={assignData.start ?? ""} onChange={(e) => setAssignData((d) => ({ ...d, start: e.target.value }))} />
                </div>
                <div>
                  <Label>Available Until</Label>
                  <Input type="datetime-local" value={assignData.end ?? ""} onChange={(e) => setAssignData((d) => ({ ...d, end: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAssign}>Assign to selected</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Analytics</CardTitle>
                  <CardDescription>Performance across students and sets</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={exportAnalyticsCSV}>Export CSV</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Score (%)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scoreboard.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{r.set}</TableCell>
                        <TableCell>{r.used}/{r.used + r.remaining}</TableCell>
                        <TableCell>{r.percentage}%</TableCell>
                        <TableCell>
                          <span className={cn("rounded px-2 py-1 text-xs", r.pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{r.pass ? "Pass" : "Fail"}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.timestamp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trend Analysis</CardTitle>
                <CardDescription>Average percentage over time</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />

                    <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Key Metrics</CardTitle>
                <CardDescription>Overview across all attempts</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                {(() => { const total = attempts.length; const passCount = attempts.filter(a => a.pass).length; const avgScore = total ? Math.round(attempts.reduce((s,a)=>s+a.percentage,0)/total) : 0; const avgDur = total ? Math.round(attempts.reduce((s,a)=>s+a.durationSeconds,0)/total) : 0; return (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Pass rate</div>
                      <div className="text-2xl font-semibold">{total ? Math.round((passCount/total)*100) : 0}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Avg score</div>
                      <div className="text-2xl font-semibold">{avgScore}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Avg duration</div>
                      <div className="text-2xl font-semibold">{avgDur}s</div>
                    </div>
                  </>
                ); })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pass vs Fail</CardTitle>
                <CardDescription>Attempt outcomes</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 260 }}>
                {(() => { const total = attempts.length; const passCount = attempts.filter(a=>a.pass).length; const data = [{ name: 'Pass', value: passCount }, { name: 'Fail', value: Math.max(0, total - passCount) }]; const colors = ['#22c55e', '#ef4444']; return (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {data.map((entry, index) => (<Cell key={`c-${index}`} fill={colors[index % colors.length]} />))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ); })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Score by Set</CardTitle>
                <CardDescription>Compare performance across sets</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 260 }}>
                {(() => { const data = sets.map(s => { const as = attempts.filter(a=>a.setId===s.id); const avg = as.length ? Math.round(as.reduce((p,c)=>p+c.percentage,0)/as.length) : 0; return { name: s.name, avg }; }); return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0,100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="avg" name="Avg %" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                ); })()}
              </CardContent>
            </Card>
          </div>

        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform Settings</CardTitle>
              <CardDescription>Defaults applied when creating assignments</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Default Time (min)</Label>
                <Input type="number" min={5} value={settings.defaultTimeLimitMinutes} onChange={(e) => setSettings((s) => ({ ...s, defaultTimeLimitMinutes: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Default Pass %</Label>
                <Input type="number" min={0} max={100} value={settings.defaultPassPercent} onChange={(e) => setSettings((s) => ({ ...s, defaultPassPercent: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Default Max Attempts</Label>
                <Input type="number" min={1} value={settings.defaultMaxAttempts} onChange={(e) => setSettings((s) => ({ ...s, defaultMaxAttempts: Number(e.target.value) }))} />
              </div>
              <div className="md:col-span-3">
                <Button onClick={saveSettings}>Save Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>Recent administrative actions</CardDescription>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">Clear All</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all audit logs?</AlertDialogTitle>
                    <AlertDialogDescription>This action is permanent and cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { if (USE_SUPABASE) { await sdb.clearAuditLogs(); toast({ title: "Audit logs cleared" }); refresh(); } else { db.clearAuditLogs(); toast({ title: "Audit logs cleared" }); refresh(); } }}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-auto divide-y">
                {(USE_SUPABASE ? auditLogs.length === 0 : db.getAuditLogs().length === 0) && (
                  <div className="text-sm text-muted-foreground">No audit entries yet.</div>
                )}
                {(USE_SUPABASE ? auditLogs : db.getAuditLogs()).map((log) => (
                  <div key={log.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{log.action}</div>
                      <div className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{log.actor || "system"}</div>
                    {log.details && <div className="text-xs whitespace-pre-wrap mt-1">{log.details}</div>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </Layout>
  );
}
