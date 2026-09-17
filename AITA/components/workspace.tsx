"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FilePlus2,
  Flame,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Shapes,
  Sparkles,
  Target,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  Role,
  Taxonomy,
  User,
  initials,
  useResource,
} from "./api";
import { AppContext, Empty, ErrorState, Loading, Modal } from "./ui";
import { Overview } from "./overview";
import {
  HomeworkPage,
  ImportPage,
  PaperBuilder,
  PaperDetail,
  PapersPage,
  TopicsPage,
  UncategorizedPage,
  WeeklyPage,
} from "./teacher";
import {
  HomeworkDetail,
  PracticeAttempt,
  PracticePage,
  StudentHomework,
  WeaknessesPage,
} from "./student";
import { NLQPage, ReteachPage } from "./management";

const navigation = {
  teacher: [
    { label: "Overview", href: "/teacher", icon: LayoutDashboard },
    { label: "Weekly mistakes", href: "/teacher/weekly", icon: ClipboardList },
    {
      label: "Topic insights",
      href: "/teacher/topics",
      icon: ChartNoAxesCombined,
    },
    { label: "Homework", href: "/teacher/homework", icon: BookOpen },
    { label: "Question papers", href: "/teacher/papers", icon: FilePlus2 },
    { label: "Import results", href: "/teacher/import", icon: Upload },
    { label: "Uncategorized", href: "/teacher/uncategorized", icon: Shapes },
  ],
  student: [
    { label: "Overview", href: "/student", icon: LayoutDashboard },
    { label: "Practice queue", href: "/student/practice", icon: Target },
    { label: "My homework", href: "/student/homework", icon: BookOpen },
    {
      label: "My weak areas",
      href: "/student/weaknesses",
      icon: ChartNoAxesCombined,
    },
  ],
  management: [
    { label: "Overview", href: "/mgmt", icon: LayoutDashboard },
    { label: "Ask Pragati", href: "/mgmt/nlq", icon: MessageSquareText },
    { label: "Reteach activity", href: "/mgmt/reteach", icon: Activity },
  ],
};
const home: Record<Role, string> = {
  teacher: "/teacher",
  student: "/student",
  management: "/mgmt",
};

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <ChartNoAxesCombined size={23} strokeWidth={2.8} />
      </span>
      <span>
        pragati<span className="brand-dot">.</span>
        <small>JEE PREP INTELLIGENCE</small>
      </span>
    </div>
  );
}

function Welcome({
  onLogin,
  busy,
  error,
}: {
  onLogin: (role: Role) => void;
  busy: boolean;
  error: Error | null;
}) {
  return (
    <main className="welcome">
      <div className="welcome-nav">
        <Brand />
        <span className="badge neutral">
          <span className="status-dot" />
          Local demo workspace
        </span>
      </div>
      <div className="welcome-layout">
        <section className="welcome-copy">
          <div className="eyebrow">
            <span className="short-line" /> SMALL STEPS. MEANINGFUL PROGRESS.
          </div>
          <h1>
            Every mistake.
            <br />A better <span>next step.</span>
          </h1>
          <p>
            See the patterns behind the marks. Turn everyday test results into
            focused practice, thoughtful teaching, and real progress.
          </p>
          <div className="welcome-proof">
            <span>
              <Target size={17} />
              Personalized practice
            </span>
            <span>
              <ChartNoAxesCombined size={17} />
              Actionable insights
            </span>
          </div>
          <div className="welcome-visual">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="visual-card">
              <span className="mini-icon green">
                <CheckCircle2 size={19} />
              </span>
              <div>
                <strong>Small wins add up.</strong>
                <p>Understand. Practice. Improve.</p>
              </div>
              <svg viewBox="0 0 120 50" aria-hidden="true">
                <path
                  d="M2 46L20 34L37 39L56 21L76 27L96 8L118 2"
                  fill="none"
                  stroke="#178b6a"
                  strokeWidth="3"
                />
              </svg>
            </div>
            <div className="floating-label">
              <Sparkles size={15} /> Made for the way you learn
            </div>
          </div>
        </section>
        <section className="welcome-card">
          <span className="eyebrow">YOUR WORKSPACE, YOUR PERSPECTIVE</span>
          <h2>Let’s move learning forward.</h2>
          <p>Choose a demo profile to explore.</p>
          {(["teacher", "student", "management"] as Role[]).map((role) => {
            const Icon =
              role === "teacher"
                ? GraduationCap
                : role === "student"
                  ? BookOpen
                  : Users;
            return (
              <button
                className={`profile-card ${role}`}
                disabled={busy}
                onClick={() => onLogin(role)}
                key={role}
              >
                <span className="profile-icon">
                  <Icon size={22} />
                </span>
                <span>
                  <strong>
                    {role === "teacher"
                      ? "Priya · Teacher"
                      : role === "student"
                        ? "Aarav · Student"
                        : "Raj · Academic head"}
                  </strong>
                  <small>
                    {role === "teacher"
                      ? "Understand your batch. Shape their next step."
                      : role === "student"
                        ? "Build confidence, one question at a time."
                        : "A clearer view of your college’s progress."}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            );
          })}
          {error && <ErrorState error={error} />}
          <div className="demo-disclosure">
            <CircleHelp size={17} />
            <p>
              Sample data, real workflows. Changes are saved locally. No live
              AI, external sign-in, or real student records.
            </p>
          </div>
        </section>
      </div>
      <footer className="welcome-footer">
        A little more clarity. A lot more possibility.
        <span>Built for focused JEE preparation</span>
      </footer>
    </main>
  );
}

export default function Workspace() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [batch, setBatch] = useState("b1");
  const [weeks, setWeeks] = useState(4);
  const [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const taxonomy = useResource<Taxonomy>(user ? "/taxonomy" : null);
  const notify = useCallback((message: string) => setToast(message), []);
  const closeHelp = useCallback(() => setHelp(false), []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) setError(e);
      })
      .finally(() => setInitializing(false));
  }, []);
  useEffect(() => {
    if (user && (path === "/" || !path.startsWith(home[user.role])))
      router.replace(home[user.role]);
  }, [path, user, router]);
  useEffect(() => setMobile(false), [path]);
  const login = async (role: Role) => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/demo", { profile: role });
      const me = await api<User>("/me");
      setBatch(me.batches[0]?.id || "all");
      setUser(me);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    try {
      await api("/auth/logout", {});
      setUser(null);
      router.push("/");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (initializing || (user && !path.startsWith(home[user.role])))
    return (
      <main className="initial-loading">
        <Brand />
        <Loading />
      </main>
    );
  if (!user) return <Welcome onLogin={login} busy={busy} error={error} />;
  const nav = navigation[user.role];
  const active =
    [...nav]
      .reverse()
      .find((n) => path === n.href || path.startsWith(`${n.href}/`)) || nav[0];
  const student = user.role === "student";
  const title =
    user.role === "teacher"
      ? "Teacher workspace"
      : student
        ? "Student workspace"
        : "Academic workspace";
  let content: React.ReactNode;
  if (["/", "/teacher", "/student", "/mgmt"].includes(path))
    content = <Overview />;
  else if (path === "/teacher/weekly") content = <WeeklyPage />;
  else if (path === "/teacher/topics") content = <TopicsPage />;
  else if (path === "/teacher/homework") content = <HomeworkPage />;
  else if (path === "/teacher/import") content = <ImportPage />;
  else if (path === "/teacher/uncategorized") content = <UncategorizedPage />;
  else if (path === "/teacher/papers/new") content = <PaperBuilder />;
  else if (path === "/teacher/papers") content = <PapersPage />;
  else if (path.startsWith("/teacher/papers/"))
    content = <PaperDetail id={path.split("/")[3]} />;
  else if (path === "/student/practice") content = <PracticePage />;
  else if (path.startsWith("/student/practice/"))
    content = <PracticeAttempt id={path.split("/")[3]} />;
  else if (path === "/student/homework") content = <StudentHomework />;
  else if (path.startsWith("/student/homework/"))
    content = <HomeworkDetail id={path.split("/")[3]} />;
  else if (path === "/student/weaknesses") content = <WeaknessesPage />;
  else if (path === "/mgmt/nlq") content = <NLQPage />;
  else if (path === "/mgmt/reteach") content = <ReteachPage />;
  else
    content = (
      <Empty
        title="This page doesn’t exist"
        description="Let’s get you back to your workspace."
        href={home[user.role]}
      />
    );
  return (
    <AppContext.Provider
      value={{ user, batch, weeks, taxonomy: taxonomy.data, notify }}
    >
      <div className="workspace">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {mobile && (
          <div className="sidebar-scrim" onClick={() => setMobile(false)} />
        )}
        <aside className={`sidebar ${mobile ? "open" : ""}`}>
          <Link
            href={home[user.role]}
            className="brand-link"
            aria-label="Pragati home"
          >
            <Brand />
          </Link>
          <div className="college-card">
            <span className="college-icon">
              <GraduationCap size={20} />
            </span>
            <span>
              <strong>Pragati Junior College</strong>
              <small>Hyderabad · Demo campus</small>
            </span>
          </div>
          <span className="nav-label">
            {student ? "MY LEARNING" : "WORKSPACE"}
          </span>
          <nav>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active.href === item.href ? "active" : ""}`}
                aria-current={active.href === item.href ? "page" : undefined}
              >
                <item.icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {active.href === item.href && <span className="active-dot" />}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <span className="mini-icon">
                <Sparkles size={18} />
              </span>
              <strong>Progress, not just scores.</strong>
              <p>Small, focused interventions make a big difference.</p>
              <Link
                href={
                  student
                    ? "/student/practice"
                    : user.role === "teacher"
                      ? "/teacher/topics"
                      : "/mgmt/nlq"
                }
              >
                Find your next step
                <ArrowRight size={14} />
              </Link>
            </div>
            <button
              className="nav-item help-button"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
              <span>About this workspace</span>
            </button>
            <div className="profile-footer">
              <span className="avatar">{initials(user.full_name)}</span>
              <span>
                <strong>{user.full_name}</strong>
                <small>
                  {user.role === "management"
                    ? "Academic head"
                    : student
                      ? "JEE aspirant"
                      : "Subject teacher"}
                </small>
              </span>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-toggle"
                onClick={() => setMobile(true)}
                aria-label="Open navigation"
              >
                <Menu size={21} />
              </button>
              <span>{title}</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{active.label}</strong>
            </div>
            <div className="topbar-right">
              <span className="demo-label">
                <span className="status-dot" />
                Local demo
              </span>
              <label className="role-switch">
                <ArrowDownUp size={14} />
                <select
                  aria-label="Switch demo profile"
                  value={user.role}
                  disabled={busy}
                  onChange={(e) => login(e.target.value as Role)}
                >
                  <option value="teacher">Teacher view</option>
                  <option value="student">Student view</option>
                  <option value="management">Management view</option>
                </select>
                <ChevronDown size={13} />
              </label>
              <span className="avatar small">{initials(user.full_name)}</span>
            </div>
          </header>
          <main id="main-content" className="main-content">
            <div className="context-bar">
              <div className="context-label">
                <span className="status-dot" />
                {student
                  ? "YOUR PERSONAL LEARNING SPACE"
                  : "A LITTLE CLARITY GOES A LONG WAY"}
              </div>
              <div className="context-controls">
                {user.role === "teacher" && (
                  <label className="control">
                    <Users size={14} />
                    <select
                      aria-label="Batch"
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                    >
                      {user.batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                      <option value="all">All my batches</option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                )}
                {user.role === "teacher" && (
                  <label className="control">
                    <CalendarDays size={14} />
                    <select
                      aria-label="Analysis window"
                      value={weeks}
                      onChange={(e) => setWeeks(Number(e.target.value))}
                    >
                      {[2, 4, 8].map((w) => (
                        <option key={w} value={w}>
                          Last {w} full weeks
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                )}
              </div>
            </div>
            <div key={`${user.id}-${path}`}>{content}</div>
            <footer className="page-footer">
              <span>
                <span className="brand-dot">pragati.</span> Every learner, a
                little further.
              </span>
              <span>Sample dataset · Asia/Kolkata · Local-first</span>
            </footer>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={19} />
            {toast}
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {help && (
          <Modal title="A workspace built around progress" onClose={closeHelp}>
            <div className="modal-body">
              <p>
                Pragati connects test results with practice, teacher
                interventions, and academic reporting.
              </p>
              <div className="info-box">
                <Flame size={20} />
                <div>
                  <strong>You’re exploring a local demo</strong>
                  <p>
                    24 fictional students, 3 batches, 192 template-authored
                    sample questions, and eight weeks of sample tests. The
                    listed taxonomy contains 16 topics and 88 subtopics.
                  </p>
                </div>
              </div>
              <h3>What’s real?</h3>
              <p>
                Import validation, server-side grading, saved practice,
                homework, reteach logs, paper quotas, role access checks, and
                report audit history.
              </p>
              <h3>What isn’t connected?</h3>
              <p>
                Clerk, Anthropic, Voyage, PostgreSQL, and Redis. Retrieval uses
                topic and difficulty, not embeddings. Management questions run
                three fixed reports. The question bank is not a teacher-reviewed
                JEE corpus.
              </p>
              <h3>How are numbers calculated?</h3>
              <p>
                Analytics use completed Monday–Sunday ISO weeks in India time.
                Skipped questions are shown separately and excluded from
                accuracy. Practice and homework do not inflate test statistics.
                A low sample means fewer than 20 answers.
              </p>
            </div>
          </Modal>
        )}
      </div>
    </AppContext.Provider>
  );
}
