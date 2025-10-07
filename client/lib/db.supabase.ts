import { supabase } from "@/lib/supabase";
import type { UUID, MCQQuestion, ParagraphQuestion, Question, Set, Attempt, AttemptAnswer, Assignment } from "@/lib/db";

// Helpers to map DB rows into existing local types used by the app

type QRow = {
  id: UUID;
  set_id: UUID | null;
  parent_id: UUID | null;
  type: "mcq" | "paragraph";
  text: string | null;
  paragraph: string | null;
  justification: string | null;
  media_kind: "image" | "audio" | "video" | null;
  media_url: string | null;
  correct_index: number | null;
};

type OptionRow = { id: UUID; question_id: UUID; idx: number; text: string };

export async function getAssignmentsForUser(userId: UUID): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from("quiz_assignments")
    .select("id,user_id,set_id,time_limit_minutes,pass_percent,max_attempts,availability_start,availability_end")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    setId: r.set_id,
    timeLimitMinutes: r.time_limit_minutes,
    passPercent: r.pass_percent,
    maxAttempts: r.max_attempts,
    availabilityStart: r.availability_start ?? undefined,
    availabilityEnd: r.availability_end ?? undefined,
  }));
}

export async function getSetsWithQuestionsForUser(userId: UUID): Promise<Set[]> {
  // 1) Get assigned sets for the user
  const { data: assigns, error: aerr } = await supabase
    .from("quiz_assignments")
    .select("set_id")
    .eq("user_id", userId);
  if (aerr) throw aerr;
  const setIds = Array.from(new Set((assigns ?? []).map(a => a.set_id)));
  if (setIds.length === 0) return [];

  // 2) Load sets
  const { data: sets, error: serr } = await supabase
    .from("quiz_sets")
    .select("id,name,created_at")
    .in("id", setIds);
  if (serr) throw serr;

  // 3) Load questions for these sets
  const { data: qrows, error: qerr } = await supabase
    .from("quiz_questions")
    .select("id,set_id,parent_id,type,text,paragraph,justification,media_kind,media_url,correct_index")
    .in("set_id", setIds);
  if (qerr) throw qerr;

  const allQ = (qrows ?? []) as QRow[];
  const mcqIds = allQ.filter(q => q.type === "mcq").map(q => q.id);

  // 4) Load options for MCQs
  const { data: orows, error: oerr } = await supabase
    .from("quiz_mcq_options")
    .select("id,question_id,idx,text")
    .in("question_id", mcqIds.length ? mcqIds : ["00000000-0000-0000-0000-000000000000"]);
  if (oerr) throw oerr;
  const optionsByQ = new Map<UUID, OptionRow[]>();
  (orows ?? []).forEach((o: any) => {
    const list = optionsByQ.get(o.question_id) ?? [];
    list.push(o);
    optionsByQ.set(o.question_id, list);
  });

  // 5) Build nested questions per set
  const setsMap = new Map<UUID, Set>();
  (sets ?? []).forEach((s: any) => {
    setsMap.set(s.id, { id: s.id, name: s.name, createdAt: s.created_at, questions: [] });
  });

  const byId = new Map<UUID, QRow>();
  allQ.forEach(q => byId.set(q.id, q));

  function toMCQ(q: QRow): MCQQuestion {
    const ops = (optionsByQ.get(q.id) ?? []).sort((a,b) => a.idx - b.idx).map(o => o.text);
    const media = q.media_url && q.media_kind ? { kind: q.media_kind, dataUrl: q.media_url } as const : undefined;
    return {
      id: q.id,
      type: "mcq",
      text: q.text ?? "",
      options: ops,
      correctIndex: typeof q.correct_index === "number" ? q.correct_index : 0,
      justification: q.justification ?? undefined,
      media,
    };
  }

  // Group children under paragraph parents
  const childrenByParent = new Map<UUID, QRow[]>();
  allQ.filter(q => q.parent_id).forEach(q => {
    const list = childrenByParent.get(q.parent_id as UUID) ?? [];
    list.push(q);
    childrenByParent.set(q.parent_id as UUID, list);
  });

  for (const q of allQ.filter(q => !q.parent_id)) {
    const setId = q.set_id as UUID;
    const set = setsMap.get(setId);
    if (!set) continue;
    if (q.type === "paragraph") {
      const kids = (childrenByParent.get(q.id) ?? []).filter(k => k.type === "mcq").map(toMCQ);
      const para: ParagraphQuestion = {
        id: q.id,
        type: "paragraph",
        paragraph: q.paragraph ?? "",
        questions: kids,
      };
      set.questions.push(para);
    } else {
      set.questions.push(toMCQ(q));
    }
  }

  return Array.from(setsMap.values());
}

export async function getAttemptsForUser(userId: UUID): Promise<Attempt[]> {
  const { data, error } = await supabase
.from("quiz_attempts")
    .select("id,user_id,set_id,timestamp,score,percentage,pass,duration_seconds")
    .eq("user_id", userId);
  if (error) throw error;

  // Answers
  const attemptIds = (data ?? []).map((a: any) => a.id);
  if (attemptIds.length === 0) return [];
  const { data: answers, error: aerr } = await supabase
    .from("quiz_attempt_answers")
    .select("attempt_id,question_id,chosen_index,time_spent_seconds")
    .in("attempt_id", attemptIds);
  if (aerr) throw aerr;
  const answersByAttempt = new Map<UUID, AttemptAnswer[]>();
  (answers ?? []).forEach((r: any) => {
    const list = answersByAttempt.get(r.attempt_id) ?? [];
    list.push({ questionId: r.question_id, chosenIndex: r.chosen_index, timeSpentSeconds: r.time_spent_seconds ?? undefined });
    answersByAttempt.set(r.attempt_id, list);
  });

  return (data ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    setId: r.set_id,
    timestamp: r.timestamp,
    score: r.score,
    percentage: r.percentage,
    pass: r.pass,
    durationSeconds: r.duration_seconds ?? 0,
    answers: answersByAttempt.get(r.id) ?? [],
  }));
}

export async function recordAttempt(input: Omit<Attempt, "id" | "timestamp">): Promise<Attempt> {
  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({
      user_id: input.userId,
      set_id: input.setId,
      score: input.score,
      percentage: input.percentage,
      pass: input.pass,
      duration_seconds: input.durationSeconds,
    })
    .select("*")
    .single();
  if (error) throw error;

  if (input.answers?.length) {
    const rows = input.answers.map(a => ({
      attempt_id: attempt.id,
      question_id: a.questionId,
      chosen_index: a.chosenIndex,
      time_spent_seconds: a.timeSpentSeconds ?? null,
    }));
    const { error: aerr } = await supabase.from("quiz_attempt_answers").insert(rows);
    if (aerr) throw aerr;
  }

  return {
    id: attempt.id,
    userId: attempt.user_id,
    setId: attempt.set_id,
    timestamp: attempt.timestamp,
    score: attempt.score,
    percentage: attempt.percentage,
    pass: attempt.pass,
    durationSeconds: attempt.duration_seconds ?? 0,
    answers: input.answers ?? [],
  };
}

export async function getBookmarks(userId: UUID) {
  const { data, error } = await supabase
    .from("quiz_bookmarks")
    .select("id,user_id,set_id,question_id,timestamp")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((b: any) => ({ id: b.id, userId: b.user_id, setId: b.set_id, questionId: b.question_id, timestamp: b.timestamp }));
}

export async function toggleBookmark(userId: UUID, setId: UUID, questionId: UUID) {
  // Try delete first
  const { data: existing } = await supabase
    .from("quiz_bookmarks")
    .select("id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (existing) {
    await supabase.from("quiz_bookmarks").delete().eq("id", existing.id);
    return false;
  }
  await supabase.from("quiz_bookmarks").insert({ user_id: userId, set_id: setId, question_id: questionId });
  return true;
}



// =============== Admin functions (Supabase mode) ===============
import type { AuthUser } from "@/hooks/useAuth";

export async function getUsers(): Promise<AuthUser[]> {
  const { data, error } = await supabase
    .from("quiz_profiles")
    .select("id,name,email,role,registered_at,age,status");
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name ?? p.email?.split("@")[0] ?? "User",
    email: p.email,
    role: p.role,
    registeredAt: p.registered_at ?? new Date().toISOString(),
    age: p.age ?? undefined,
    status: p.status ?? "active",
  }));
}

export async function setUserStatus(userId: UUID, status: "active" | "inactive") {
  const { error } = await supabase.from("quiz_profiles").update({ status }).eq("id", userId);
  if (error) throw error;
}

export async function getAllSetsWithQuestions(): Promise<Set[]> {
  const { data: sets, error: serr } = await supabase
    .from("quiz_sets").select("id,name,created_at");
  if (serr) throw serr;
  const setIds = (sets ?? []).map((s: any) => s.id);
  if (setIds.length === 0) return [];

  const { data: qrows, error: qerr } = await supabase
    .from("quiz_questions")
    .select("id,set_id,parent_id,type,text,paragraph,justification,media_kind,media_url,correct_index")
    .in("set_id", setIds);
  if (qerr) throw qerr;

  const allQ = (qrows ?? []) as QRow[];
  const mcqIds = allQ.filter(q => q.type === "mcq").map(q => q.id);
  const { data: orows, error: oerr } = await supabase
    .from("quiz_mcq_options").select("id,question_id,idx,text")
    .in("question_id", mcqIds.length ? mcqIds : ["00000000-0000-0000-0000-000000000000"]);
  if (oerr) throw oerr;

  const optionsByQ = new Map<UUID, OptionRow[]>();
  (orows ?? []).forEach((o: any) => {
    const list = optionsByQ.get(o.question_id) ?? [];
    list.push(o);
    optionsByQ.set(o.question_id, list);
  });

  const setsMap = new Map<UUID, Set>();
  (sets ?? []).forEach((s: any) => {
    setsMap.set(s.id, { id: s.id, name: s.name, createdAt: s.created_at, questions: [] });
  });

  function toMCQ(q: QRow): MCQQuestion {
    const ops = (optionsByQ.get(q.id) ?? []).sort((a,b) => a.idx - b.idx).map(o => o.text);
    const media = q.media_url && q.media_kind ? { kind: q.media_kind, dataUrl: q.media_url } as const : undefined;
    return { id: q.id, type: "mcq", text: q.text ?? "", options: ops, correctIndex: q.correct_index ?? 0, justification: q.justification ?? undefined, media };
  }

  const childrenByParent = new Map<UUID, QRow[]>();
  allQ.filter(q => q.parent_id).forEach(q => {
    const list = childrenByParent.get(q.parent_id as UUID) ?? [];
    list.push(q); childrenByParent.set(q.parent_id as UUID, list);
  });

  for (const q of allQ.filter(q => !q.parent_id)) {
    const set = setsMap.get(q.set_id as UUID);
    if (!set) continue;
    if (q.type === "paragraph") {
      const kids = (childrenByParent.get(q.id) ?? []).filter(k => k.type === "mcq").map(toMCQ);
      set.questions.push({ id: q.id, type: "paragraph", paragraph: q.paragraph ?? "", questions: kids });
    } else {
      set.questions.push(toMCQ(q));
    }
  }
  return Array.from(setsMap.values());
}

export async function createSet(name: string) {
  const { error } = await supabase.from("quiz_sets").insert({ name });
  if (error) throw error;
}
export async function updateSetName(id: UUID, name: string) {
  const { error } = await supabase.from("quiz_sets").update({ name }).eq("id", id);
  if (error) throw error;
}
export async function deleteSet(id: UUID) {
  // Delete questions (and options) first, then the set
  const { data: qrows } = await supabase.from("quiz_questions").select("id").eq("set_id", id);
  const qids = (qrows ?? []).map((q: any) => q.id);
  if (qids.length) await supabase.from("quiz_mcq_options").delete().in("question_id", qids);
  await supabase.from("quiz_questions").delete().eq("set_id", id);
  const { error } = await supabase.from("quiz_sets").delete().eq("id", id);
  if (error) throw error;
}

type AddMCQInput = { text: string; options: string[]; correctIndex: number; justification?: string; media?: { kind: "image"|"audio"|"video"; dataUrl: string } };

function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const [head, b64] = dataUrl.split(",", 2);
  const m = head.match(/^data:([^;]+);base64$/);
  const contentType = m?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return { blob: new Blob([arr], { type: contentType }), contentType };
}
function extFromContentType(ct: string): string {
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg")) return ".jpg";
  if (ct.includes("jpg")) return ".jpg";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("mp3")) return ".mp3";
  if (ct.includes("wav")) return ".wav";
  if (ct.includes("mp4")) return ".mp4";
  if (ct.includes("mpeg")) return ".mpg";
  return "";
}
async function maybeUploadMedia(setId: UUID, media?: { kind: "image"|"audio"|"video"; dataUrl: string } | undefined) {
  if (!media?.dataUrl || !media.dataUrl.startsWith("data:")) return { media_kind: media?.kind ?? null, media_url: media?.dataUrl ?? null };
  const { blob, contentType } = dataUrlToBlob(media.dataUrl);
  const id = (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${setId}/${id}${extFromContentType(contentType)}`;
  const { error: uerr } = await supabase.storage.from("quiz-media").upload(path, blob, { contentType });
  if (uerr) throw uerr;
  const { data } = supabase.storage.from("quiz-media").getPublicUrl(path);
  return { media_kind: media.kind, media_url: data.publicUrl as string };
}

export async function addMCQ(setId: UUID, q: AddMCQInput): Promise<MCQQuestion> {
  const uploaded = await maybeUploadMedia(setId, q.media);
  const { data: ins, error } = await supabase.from("quiz_questions").insert({
    set_id: setId, parent_id: null, type: "mcq", text: q.text, justification: q.justification ?? null,
    media_kind: uploaded.media_kind, media_url: uploaded.media_url, correct_index: q.correctIndex,
  }).select("*").single();
  if (error) throw error;
  const opts = q.options.map((t, i) => ({ question_id: ins.id, idx: i, text: t }));
  if (opts.length) await supabase.from("quiz_mcq_options").insert(opts);
  return { id: ins.id, type: "mcq", text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: uploaded.media_url ? { kind: q.media?.kind!, dataUrl: uploaded.media_url } : undefined };
}

export async function addParagraph(setId: UUID, paragraph: string, questions: AddMCQInput[]): Promise<ParagraphQuestion> {
  const { data: parent, error: perr } = await supabase.from("quiz_questions").insert({
    set_id: setId, parent_id: null, type: "paragraph", paragraph,
  }).select("*").single();
  if (perr) throw perr;
  for (const q of questions) {
    const uploaded = await maybeUploadMedia(setId, q.media);
    const { data: ins, error } = await supabase.from("quiz_questions").insert({
      set_id: setId, parent_id: parent.id, type: "mcq", text: q.text, justification: q.justification ?? null,
      media_kind: uploaded.media_kind, media_url: uploaded.media_url, correct_index: q.correctIndex,
    }).select("*").single();
    if (error) throw error;
    const opts = q.options.map((t, i) => ({ question_id: ins.id, idx: i, text: t }));
    if (opts.length) await supabase.from("quiz_mcq_options").insert(opts);
  }
  return { id: parent.id, type: "paragraph", paragraph, questions: questions.map((q, i) => ({ id: `${parent.id}-mcq-${i}` as UUID, type: "mcq", text: q.text, options: q.options, correctIndex: q.correctIndex, justification: q.justification, media: q.media })) };
}

export async function deleteQuestion(setId: UUID, qId: UUID) {
  // Remove options for this question and any children
  const ids: UUID[] = [qId];
  const { data: kids } = await supabase.from("quiz_questions").select("id").eq("parent_id", qId);
  (kids ?? []).forEach((k: any) => ids.push(k.id));
  if (ids.length) await supabase.from("quiz_mcq_options").delete().in("question_id", ids);
  await supabase.from("quiz_questions").delete().in("id", ids);
}

export async function getAssignmentsAll(): Promise<Assignment[]> {
  const { data, error } = await supabase.from("quiz_assignments").select("id,user_id,set_id,time_limit_minutes,pass_percent,max_attempts,availability_start,availability_end");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, userId: r.user_id, setId: r.set_id, timeLimitMinutes: r.time_limit_minutes, passPercent: r.pass_percent, maxAttempts: r.max_attempts, availabilityStart: r.availability_start ?? undefined, availabilityEnd: r.availability_end ?? undefined }));
}
export async function assignSet(a: { userId: UUID; setId: UUID; timeLimitMinutes: number; passPercent: number; maxAttempts: number; availabilityStart?: string; availabilityEnd?: string; }) {
  const { error } = await supabase.from("quiz_assignments").insert({
    user_id: a.userId, set_id: a.setId, time_limit_minutes: a.timeLimitMinutes,
    pass_percent: a.passPercent, max_attempts: a.maxAttempts,
    availability_start: a.availabilityStart ?? null, availability_end: a.availabilityEnd ?? null,
  });
  if (error) throw error;
}

export async function getAttemptsAll(): Promise<Attempt[]> {
  const { data, error } = await supabase.from("quiz_attempts").select("id,user_id,set_id,timestamp,score,percentage,pass,duration_seconds");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, userId: r.user_id, setId: r.set_id, timestamp: r.timestamp, score: r.score, percentage: r.percentage, pass: r.pass, durationSeconds: r.duration_seconds ?? 0, answers: [] }));
}

export async function getSettings(): Promise<{ defaultTimeLimitMinutes: number; defaultPassPercent: number; defaultMaxAttempts: number; }> {
  const { data } = await supabase.from("quiz_settings").select("id,default_time_limit_minutes,default_pass_percent,default_max_attempts").limit(1).maybeSingle();
  if (!data) return { defaultTimeLimitMinutes: 30, defaultPassPercent: 50, defaultMaxAttempts: 2 };
  return { defaultTimeLimitMinutes: data.default_time_limit_minutes ?? 30, defaultPassPercent: data.default_pass_percent ?? 50, defaultMaxAttempts: data.default_max_attempts ?? 2 };
}
export async function saveSettings(s: { defaultTimeLimitMinutes: number; defaultPassPercent: number; defaultMaxAttempts: number; }) {
  // Upsert single row; if exists update, else insert
  const { data } = await supabase.from("quiz_settings").select("id").limit(1).maybeSingle();
  if (data?.id) {
    const { error } = await supabase.from("quiz_settings").update({ default_time_limit_minutes: s.defaultTimeLimitMinutes, default_pass_percent: s.defaultPassPercent, default_max_attempts: s.defaultMaxAttempts }).eq("id", data.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("quiz_settings").insert({ default_time_limit_minutes: s.defaultTimeLimitMinutes, default_pass_percent: s.defaultPassPercent, default_max_attempts: s.defaultMaxAttempts });
    if (error) throw error;
  }
}

export async function addAuditLog(actor: string | undefined, action: string, details?: string) {
  const { error } = await supabase.from("quiz_audit_logs").insert({ actor_email: actor ?? null, action, details: details ?? null });
  if (error) throw error;
}
export async function getAuditLogs() {
  const { data, error } = await supabase.from("quiz_audit_logs").select("id,timestamp,actor_email,action,details").order("timestamp", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, timestamp: r.timestamp, actor: r.actor_email ?? undefined, action: r.action, details: r.details ?? undefined }));
}
export async function clearAuditLogs() {
  const { error } = await supabase.from("quiz_audit_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}
