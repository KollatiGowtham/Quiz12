import { Role, AuthUser } from "@/hooks/useAuth";

export type UUID = string;

export type MediaAttachment = {
  kind: "image" | "audio" | "video";
  dataUrl: string; // stored as Data URL for local preview/persistence
};

export type MCQQuestion = {
  id: UUID;
  type: "mcq";
  text: string;
  options: string[]; // 2..5 options supported
  correctIndex: number; // 0..options.length-1
  justification?: string;
  media?: MediaAttachment; // optional media for image/audio/video MCQs
};

export type ParagraphQuestion = {
  id: UUID;
  type: "paragraph";
  paragraph: string;
  questions: MCQQuestion[]; // linked questions following the paragraph
};

export type Question = MCQQuestion | ParagraphQuestion;

export interface Set {
  id: UUID;
  name: string;
  createdAt: string;
  questions: Question[];
}

export interface Assignment {
  id: UUID;
  userId: UUID;
  setId: UUID;
  timeLimitMinutes: number;
  passPercent: number; // 0..100
  maxAttempts: number;
  availabilityStart?: string; // ISO datetime
  availabilityEnd?: string;   // ISO datetime
}

export interface AttemptAnswer {
  questionId: UUID;
  chosenIndex: number | null; // null if unanswered
  timeSpentSeconds?: number; // optional per-question time for analytics
}

export interface Attempt {
  id: UUID;
  userId: UUID;
  setId: UUID;
  timestamp: string; // ISO
  score: number; // raw score (number of correct)
  percentage: number; // 0..100
  pass: boolean;
  durationSeconds: number;
  answers: AttemptAnswer[];
}

// Platform settings
export interface Settings {
  defaultTimeLimitMinutes: number;
  defaultPassPercent: number;
  defaultMaxAttempts: number;
}

// Audit log record
export interface AuditLog {
  id: UUID;
  timestamp: string; // ISO
  actor?: string; // email or system
  action: string;
  details?: string;
}

// Bookmark record for review mode
export interface Bookmark {
  id: UUID;
  userId: UUID;
  setId: UUID;
  questionId: UUID;
  timestamp: string;
}


function uid(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const KEYS = {
  users: "db.users",
  sets: "db.sets",
  assignments: "db.assignments",
  attempts: "db.attempts",
  seeded: "db.seeded",
  settings: "db.settings",
  audit: "db.audit",
  bookmarks: "db.bookmarks",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const db = {
  // Users
  getUsers(): AuthUser[] {
    return read<AuthUser[]>(KEYS.users, []);
  },
  upsertUser(user: AuthUser): void {
    const users = db.getUsers();
    const idx = users.findIndex((u) => u.id === user.id || u.email === user.email);
    if (idx >= 0) users[idx] = user;
    else users.push(user);
    write(KEYS.users, users);
  },
  // Registration via UI always creates a student account
  registerUser(name: string, email: string, password: string, age?: number): AuthUser {
    const user: AuthUser = {
      id: uid(),
      name,
      email,
      role: "student",
      registeredAt: new Date().toISOString(),
      password,
      age,
      status: "active",
    };
    const users = db.getUsers();
    users.push(user);
    write(KEYS.users, users);
    return user;
  },
  findUserByEmail(email: string): AuthUser | undefined {
    return db.getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
  },

  // User helpers
  getStudents(): AuthUser[] {
    return db.getUsers().filter((u) => u.role === "student");
  },
  setUserStatus(userId: UUID, status: "active" | "inactive"): void {
    const users = db.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      users[idx] = { ...users[idx], status } as AuthUser;
      write(KEYS.users, users);
    }
  },

  // Set management helpers
  updateSetName(setId: UUID, name: string): void {
    const sets = db.getSets();
    const s = sets.find((x) => x.id === setId);
    if (!s) return;
    s.name = name;
    write(KEYS.sets, sets);
  },
  deleteSet(setId: UUID): void {
    const sets = db.getSets().filter((s) => s.id !== setId);
    write(KEYS.sets, sets);
    // also remove assignments for this set
    const assignments = db.getAssignments().filter((a) => a.setId !== setId);
    write(KEYS.assignments, assignments);
  },
  deleteQuestion(setId: UUID, questionId: UUID): void {
    const sets = db.getSets();
    const s = sets.find((x) => x.id === setId);
    if (!s) return;
    s.questions = s.questions.filter((q) => q.id !== questionId);
    write(KEYS.sets, sets);
  },

  // Settings
  getSettings(): Settings {
    return read<Settings>(KEYS.settings, { defaultTimeLimitMinutes: 30, defaultPassPercent: 50, defaultMaxAttempts: 2 });
  },
  saveSettings(s: Settings): void {
    write(KEYS.settings, s);
  },

  // Bookmarks
  getBookmarksAll(): Bookmark[] {
    return read<Bookmark[]>(KEYS.bookmarks, []);
  },
  getBookmarks(userId: UUID): Bookmark[] {
    return db.getBookmarksAll().filter(b => b.userId === userId);
  },
  isBookmarked(userId: UUID, questionId: UUID): boolean {
    return db.getBookmarks(userId).some(b => b.questionId === questionId);
  },
  toggleBookmark(userId: UUID, setId: UUID, questionId: UUID): void {
    const all = db.getBookmarksAll();
    const idx = all.findIndex(b => b.userId === userId && b.questionId === questionId);
    if (idx >= 0) {
      all.splice(idx, 1);
    } else {
      all.push({ id: uid(), userId, setId, questionId, timestamp: new Date().toISOString() });
    }
    write(KEYS.bookmarks, all);
  },

  // Audit logs
  getAuditLogs(): AuditLog[] {
    return read<AuditLog[]>(KEYS.audit, []);
  },
  addAuditLog(actor: string | undefined, action: string, details?: string): void {
    const logs = db.getAuditLogs();
    logs.unshift({ id: uid(), timestamp: new Date().toISOString(), actor, action, details });
    write(KEYS.audit, logs.slice(0, 500));
  },
  clearAuditLogs(): void {
    write(KEYS.audit, []);
  },


  // Sets & Questions
  getSets(): Set[] {
    return read<Set[]>(KEYS.sets, []);
  },
  createSet(name: string): Set {
    const set: Set = { id: uid(), name, createdAt: new Date().toISOString(), questions: [] };
    const sets = db.getSets();
    sets.push(set);
    write(KEYS.sets, sets);
    return set;
  },
  addMCQ(setId: UUID, q: Omit<MCQQuestion, "id" | "type">): MCQQuestion {
    const sets = db.getSets();
    const s = sets.find((x) => x.id === setId);
    if (!s) throw new Error("Set not found");
    const qq: MCQQuestion = { id: uid(), type: "mcq", ...q };
    s.questions.push(qq);
    write(KEYS.sets, sets);
    return qq;
  },
  addParagraph(setId: UUID, paragraph: string, questions: Omit<MCQQuestion, "id" | "type">[]): ParagraphQuestion {
    const sets = db.getSets();
    const s = sets.find((x) => x.id === setId);
    if (!s) throw new Error("Set not found");
    const qqs: MCQQuestion[] = questions.map((q) => ({ id: uid(), type: "mcq", ...q }));
    const p: ParagraphQuestion = { id: uid(), type: "paragraph", paragraph, questions: qqs };
    s.questions.push(p);
    write(KEYS.sets, sets);
    return p;
  },

  // Assignments
  getAssignments(): Assignment[] {
    return read<Assignment[]>(KEYS.assignments, []);
  },
  assignSet(input: Omit<Assignment, "id">): Assignment {
    const a: Assignment = { id: uid(), ...input };
    const list = db.getAssignments();
    list.push(a);
    write(KEYS.assignments, list);
    return a;
  },
  getAssignmentsForUser(userId: UUID): Assignment[] {
    return db.getAssignments().filter((a) => a.userId === userId);
  },

  // Attempts
  getAttempts(): Attempt[] {
    return read<Attempt[]>(KEYS.attempts, []);
  },
  getAttemptsFor(userId: UUID, setId: UUID): Attempt[] {
    return db.getAttempts().filter((t) => t.userId === userId && t.setId === setId);
  },
  recordAttempt(input: Omit<Attempt, "id" | "timestamp">): Attempt {
    const attempt: Attempt = { id: uid(), timestamp: new Date().toISOString(), ...input };
    const all = db.getAttempts();
    all.push(attempt);
    write(KEYS.attempts, all);
    return attempt;
  },

  // Util
  getAttemptsUsed(userId: UUID, setId: UUID): number {
    return db.getAttemptsFor(userId, setId).length;
  },
  getAttemptsRemaining(assignment: Assignment): number {
    const used = db.getAttemptsUsed(assignment.userId, assignment.setId);
    return Math.max(0, assignment.maxAttempts - used);
  },
  getAssignment(userId: UUID, setId: UUID): Assignment | undefined {
    return db.getAssignments().find((a) => a.userId === userId && a.setId === setId);
  },
  isReviewUnlocked(userId: UUID, setId: UUID): boolean {
    const a = db.getAssignment(userId, setId);
    if (!a) return false;
    return db.getAttemptsUsed(userId, setId) >= a.maxAttempts;
  },
  getLastAttemptFor(userId: UUID, setId: UUID): Attempt | undefined {
    const list = db.getAttemptsFor(userId, setId).sort((a,b) => a.timestamp.localeCompare(b.timestamp));
    return list[list.length - 1];
  },
  clearAll() {
    write(KEYS.users, []);
    write(KEYS.sets, []);
    write(KEYS.assignments, []);
    write(KEYS.attempts, []);
    localStorage.removeItem(KEYS.seeded);
  },
  seedIfNeeded() {
    const seeded = read<boolean>(KEYS.seeded, false);
    const existingUsers = read<AuthUser[]>(KEYS.users, []);
    const needsSeed = !seeded || existingUsers.length === 0 || !existingUsers.some((u) => u.role === "admin");
    if (!needsSeed) return;
    // Seed single admin (hardcoded) + two students (demo passwords)
    const admin: AuthUser = { id: uid(), name: "Admin", email: "admin@example.com", role: "admin", registeredAt: new Date().toISOString(), password: "admin123", age: 35, status: "active" };
    const s1: AuthUser = { id: uid(), name: "Aisha Khan", email: "aisha@student.com", role: "student", registeredAt: new Date().toISOString(), password: "student123", age: 19, status: "active" };
    const s2: AuthUser = { id: uid(), name: "Liam Chen", email: "liam@student.com", role: "student", registeredAt: new Date().toISOString(), password: "student123", age: 20, status: "active" };
    write(KEYS.users, [admin, s1, s2]);

    // Seed sets
    const set1: Set = { id: uid(), name: "Set 1: Fundamentals", createdAt: new Date().toISOString(), questions: [] };
    const set2: Set = { id: uid(), name: "Set 2: Reading Comprehension", createdAt: new Date().toISOString(), questions: [] };
    write(KEYS.sets, [set1, set2]);

    // Add questions to set1
    const sets1 = db.getSets();
    const s1ref = sets1.find((x) => x.id === set1.id)!;
    s1ref.questions.push(
      { id: uid(), type: "mcq", text: "What is 2 + 2?", options: ["3", "4", "5", "22"], correctIndex: 1, justification: "2+2 equals 4." },
      { id: uid(), type: "mcq", text: "Capital of France?", options: ["Berlin", "Paris", "Rome", "Madrid"], correctIndex: 1, justification: "Paris is the capital." },
    );
    write(KEYS.sets, sets1);

    // Add paragraph to set2
    const sets2 = db.getSets();
    const s2ref = sets2.find((x) => x.id === set2.id)!;
    const paraQs: MCQQuestion[] = [
      { id: uid(), type: "mcq", text: "Main idea of the passage?", options: ["A", "B", "C", "D"], correctIndex: 2, justification: "Paragraph discusses option C primarily." },
      { id: uid(), type: "mcq", text: "Tone of the author?", options: ["Neutral", "Critical", "Humorous", "Optimistic"], correctIndex: 0, justification: "Tone appears neutral." },
    ];
    s2ref.questions.push({ id: uid(), type: "paragraph", paragraph: "Sustainability requires balancing economic growth with environmental stewardship...", questions: paraQs });
    write(KEYS.sets, sets2);

    // Assign sets
    const assignments: Assignment[] = [
      { id: uid(), userId: s1.id, setId: set1.id, timeLimitMinutes: 20, passPercent: 50, maxAttempts: 2 },
      { id: uid(), userId: s1.id, setId: set2.id, timeLimitMinutes: 25, passPercent: 60, maxAttempts: 3 },
      { id: uid(), userId: s2.id, setId: set1.id, timeLimitMinutes: 15, passPercent: 40, maxAttempts: 2 },
    ];
    write(KEYS.assignments, assignments);

    // No attempts initially
    write(KEYS.attempts, []);

    write(KEYS.seeded, true);
  },
};
