"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ClipboardCheck,
  Download,
  FilePlus2,
  FileSpreadsheet,
  Flame,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  api,
  Dashboard,
  HomeworkItem,
  Learner,
  Question,
  Topic,
  formatDate,
  initials,
  useResource,
} from "./api";
import {
  Empty,
  ErrorState,
  Loading,
  MathText,
  Modal,
  PageTitle,
  Panel,
  SearchInput,
  SubjectBadge,
  SubmitButton,
  useApp,
  useMutation,
} from "./ui";
import { TopicTable } from "./overview";

export function Intervention({
  topic,
  learner,
  mode: initialMode,
  onClose,
  onSaved,
}: {
  topic?: Topic;
  learner?: Learner;
  mode?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, batch, taxonomy, notify } = useApp();
  const [mode, setMode] = useState(
    initialMode || (learner ? "remedial" : "reteach"),
  );
  const [selectedBatch, setSelectedBatch] = useState(
    batch === "all" ? user.batches[0]?.id : batch,
  );
  const [subtopic, setSubtopic] = useState(
    learner?.weakest?.id || topic?.subtopics[0]?.id || "chem.org.carbonyls",
  );
  const [studentId, setStudentId] = useState(learner?.id || "");
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useMutation();
  const students = useResource<Dashboard>(
    mode === "remedial"
      ? `/teacher/batches/${selectedBatch}/dashboard?weeks=8`
      : null,
  );
  return (
    <Modal
      title={
        learner
          ? `A next step for ${learner.full_name.split(" ")[0]}`
          : "Turn an insight into action"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api(
              mode === "reteach"
                ? "/teacher/reteach"
                : `/teacher/homework/${mode === "remedial" ? "remedial" : "class"}`,
              mode === "reteach"
                ? { batch_id: selectedBatch, subtopic_id: subtopic, note }
                : {
                    batch_id: selectedBatch,
                    student_id: mode === "remedial" ? studentId : null,
                    subtopic_id: subtopic,
                    count,
                    difficulty,
                    due_date: due || null,
                  },
            );
            notify(
              mode === "reteach"
                ? "Reteach activity recorded. Every intervention counts."
                : "Homework assigned. It’s now in the student workspace.",
            );
            onSaved();
          });
        }}
      >
        <div className="modal-body">
          <div className="segmented mode-tabs">
            {[
              { key: "reteach", label: "Log reteach", icon: Flame },
              { key: "class", label: "Class homework", icon: Users },
              { key: "remedial", label: "Remedial", icon: TargetIcon },
            ].map((m) => (
              <button
                type="button"
                key={m.key}
                className={mode === m.key ? "selected" : ""}
                onClick={() => setMode(m.key)}
              >
                <m.icon size={15} />
                {m.label}
              </button>
            ))}
          </div>
          <label className="field">
            Batch
            <select
              value={selectedBatch}
              onChange={(e) => {
                setSelectedBatch(e.target.value);
                setStudentId("");
              }}
            >
              {user.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {mode === "remedial" && (
            <label className="field">
              Student
              <select
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">Choose a student</option>
                {students.data?.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Focus subtopic
            <select
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
            >
              {taxonomy?.subtopics.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.topic_name} / {s.name} ({s.bank_count} in bank)
                </option>
              ))}
            </select>
          </label>
          {mode === "reteach" ? (
            <label className="field">
              What did you revisit?
              <textarea
                rows={4}
                maxLength={1000}
                placeholder="A quick note about the concept, approach, or classroom discussion…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <small>This records an activity, not a scheduled reminder.</small>
            </label>
          ) : (
            <>
              <div className="form-grid">
                <label className="field">
                  Questions
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  Difficulty
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                Due date <span className="muted">(optional)</span>
                <input
                  type="date"
                  min={user.today}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <div className="info-box">
                <BookOpen size={18} />
                <p>
                  Local mode uses the sample question bank. AI generation is
                  off; insufficient stock will be reported before anything is
                  saved.
                </p>
              </div>
            </>
          )}
          {students.error && mode === "remedial" && (
            <ErrorState error={students.error} retry={students.reload} />
          )}
          {error && <ErrorState error={error} />}
        </div>
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton
            busy={busy}
            disabled={!taxonomy || (mode === "remedial" && !studentId)}
          >
            {mode === "reteach" ? "Save reteach activity" : "Assign homework"}
            <ArrowRight size={16} />
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function TargetIcon({ size }: { size?: number }) {
  return <ClipboardCheck size={size} />;
}

type WeeklyRow = {
  student_id: string;
  full_name: string;
  total_wrong: number;
  uncategorized_count: number;
  joined_this_week: boolean;
  categories: {
    category_id: string;
    subtopic_name: string;
    topic_name: string;
    count: number;
  }[];
};

export function WeeklyPage() {
  const { batch, user } = useApp();
  const [week, setWeek] = useState(user.default_week);
  const [search, setSearch] = useState("");
  const [learner, setLearner] = useState<Learner | null>(null);
  const close = useCallback(() => setLearner(null), []);
  const [year, number] = week.split("-W");
  const data = useResource<{ rows: WeeklyRow[] }>(
    week
      ? `/teacher/batches/${batch}/weekly-mistakes?iso_year=${year}&iso_week=${number}`
      : null,
  );
  return (
    <>
      <PageTitle
        eyebrow="UNDERSTAND THE PATTERNS"
        title="Behind every wrong answer."
        description="A student-by-student view of the concepts that need another look."
      />
      <Panel
        title="Weekly mistake breakdown"
        subtitle="Test mistakes only · grouped by subtopic"
        action={
          <label className="week-picker">
            <CalendarDays size={16} />
            <input
              aria-label="ISO week"
              type="week"
              required
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
          </label>
        }
      >
        <div className="table-toolbar">
          <SearchInput value={search} onChange={setSearch} />
          <span className="muted small-text">
            {data.data?.rows.length || 0} students with mistakes
          </span>
        </div>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={data.reload} />
        ) : !data.data?.rows.length ? (
          <Empty
            title="No mistakes recorded for this week"
            description="Choose a different week, or import a test to start seeing patterns."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Concept breakdown</th>
                  <th>Wrong</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {data.data.rows
                  .filter((s) =>
                    s.full_name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((s, i) => (
                    <tr key={s.student_id}>
                      <td>
                        <div className="person-cell">
                          <span className={`avatar avatar-${i % 4}`}>
                            {initials(s.full_name)}
                          </span>
                          <div>
                            <strong>{s.full_name}</strong>
                            <small>
                              {s.student_id.toUpperCase()}
                              {s.joined_this_week ? " · Joined this week" : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="chip-wrap">
                          {s.categories.map((c) => (
                            <span
                              className={`badge subject-${c.category_id.split(".")[0]}`}
                              title={c.topic_name}
                              key={c.category_id}
                            >
                              {c.subtopic_name}
                              <strong>×{c.count}</strong>
                            </span>
                          ))}
                          {!!s.uncategorized_count && (
                            <Link
                              className="badge neutral"
                              href="/teacher/uncategorized"
                              title="Excluded from topic breakdown until manually categorized"
                            >
                              Uncategorized ×{s.uncategorized_count}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{s.total_wrong}</strong>
                      </td>
                      <td>
                        <button
                          className="button secondary small"
                          onClick={() =>
                            setLearner({
                              id: s.student_id,
                              full_name: s.full_name,
                              attempts: 0,
                              wrong: s.total_wrong,
                              accuracy: 0,
                              weakest: s.categories[0]
                                ? {
                                    id: s.categories[0].category_id,
                                    name: s.categories[0].subtopic_name,
                                    topic_name: s.categories[0].topic_name,
                                    wrong: s.categories[0].count,
                                  }
                                : null,
                            })
                          }
                        >
                          <Plus size={14} />
                          Assign remedial
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.data.rows.some((s) =>
              s.full_name.toLowerCase().includes(search.toLowerCase()),
            ) && (
              <Empty
                title="No students match"
                description="Try a different name."
              />
            )}
          </div>
        )}
      </Panel>
      {learner && (
        <Intervention learner={learner} onClose={close} onSaved={close} />
      )}
    </>
  );
}

export function TopicsPage() {
  const { batch, weeks } = useApp();
  const data = useResource<{ rows: Topic[] }>(
    `/teacher/batches/${batch}/topic-mistake-rates?weeks=${weeks}`,
  );
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState("rate");
  const [topic, setTopic] = useState<Topic | null>(null);
  const close = useCallback(() => setTopic(null), []);
  const topics = (data.data?.rows || [])
    .filter((t) => subject === "all" || t.subject_id === subject)
    .sort((a, b) =>
      sort === "rate"
        ? b.avg_mistake_rate - a.avg_mistake_rate
        : b.attempts - a.attempts,
    );
  return (
    <>
      <PageTitle
        eyebrow="SEE THE SIGNAL"
        title="Know what to revisit."
        description="Find the topics where a focused recap could make the biggest difference."
      />
      <div className="info-strip">
        <ShieldCheck size={18} />
        <p>
          Rates use answered test questions, not an average of student
          percentages. Fewer than 20 answers? We flag it as a low sample.
        </p>
      </div>
      <Panel
        title="Topic insights"
        subtitle="Click a topic to plan a reteach or assign targeted homework"
      >
        <div className="table-toolbar">
          <div className="segmented">
            {["all", "phy", "chem", "math"].map((s, i) => (
              <button
                key={s}
                className={subject === s ? "selected" : ""}
                onClick={() => setSubject(s)}
              >
                {["All subjects", "Physics", "Chemistry", "Mathematics"][i]}
              </button>
            ))}
          </div>
          <select
            aria-label="Sort topics"
            className="compact-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="rate">Highest mistake rate</option>
            <option value="volume">Most answers</option>
          </select>
        </div>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={data.reload} />
        ) : (
          <TopicTable topics={topics} onSelect={setTopic} />
        )}
      </Panel>
      {topic && <Intervention topic={topic} onClose={close} onSaved={close} />}
    </>
  );
}

export function HomeworkPage() {
  const { batch } = useApp();
  const data = useResource<HomeworkItem[]>(
    `/teacher/homework?batch_id=${batch}`,
  );
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <PageTitle
        eyebrow="FOCUSED WORK. FORWARD MOTION."
        title="Practice with a purpose."
        description="A shared place for class assignments and individual support."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Plus size={16} />
          Assign homework
        </button>
      </PageTitle>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={data.reload} />
      ) : !data.data?.length ? (
        <Empty
          title="Room for a new assignment"
          description="Choose a subtopic and give your students a focused set of questions."
        />
      ) : (
        <div className="assignment-grid">
          {data.data.map((h) => (
            <section className="assignment-card" key={h.id}>
              <div className="assignment-top">
                <span className="mini-icon">
                  <BookOpen size={21} />
                </span>
                <span
                  className={`badge ${h.student_id ? "orange" : "neutral"}`}
                >
                  {h.student_id ? "Individual remedial" : "Class homework"}
                </span>
              </div>
              <h2>{h.name}</h2>
              <p>
                <Users size={14} />
                {h.student_name || h.batch_name}
              </p>
              <div className="assignment-stats">
                <span>
                  <strong>{h.question_count}</strong> questions
                </span>
                <span>
                  <strong>{h.answers_submitted}</strong> answers submitted
                </span>
              </div>
              <div className="assignment-footer">
                <CalendarDays size={14} />
                {h.due_date ? `Due ${formatDate(h.due_date)}` : "No due date"}
                <span>Bank-backed</span>
              </div>
            </section>
          ))}
        </div>
      )}
      {open && (
        <Intervention
          mode="class"
          onClose={close}
          onSaved={() => {
            close();
            data.reload();
          }}
        />
      )}
    </>
  );
}

type PaperSummary = {
  id: string;
  name: string;
  batch_name: string;
  total_questions: number;
  llm_question_count: number;
  status: string;
  created_at: string;
};
type Plan = {
  total_questions: number;
  bank_question_count: number;
  llm_question_count: number;
  llm_budget: number;
  over_budget: boolean;
  can_create: boolean;
  rows: {
    subtopic_id: string;
    name: string;
    requested: number;
    available: number;
    bank_count: number;
    llm_needed: number;
  }[];
};

export function PapersPage() {
  const data = useResource<PaperSummary[]>("/teacher/question-papers");
  return (
    <>
      <PageTitle
        eyebrow="ASSESS WITH INTENTION"
        title="Better questions. Clearer insights."
        description="Build focused papers from your bank, with a hard ceiling of 30% AI-generated questions."
      >
        <Link href="/teacher/papers/new" className="button primary">
          <Plus size={16} />
          Build a paper
        </Link>
      </PageTitle>
      <div className="info-strip">
        <ShieldCheck size={18} />
        <p>
          Bank first, always. Local papers use 100% sample-bank questions. The
          30% maximum is not a requirement to use AI.
        </p>
      </div>
      <Panel
        title="Your question papers"
        subtitle="Draft, review, and publish to make a paper available for result import"
      >
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={data.reload} />
        ) : !data.data?.length ? (
          <Empty
            title="Your next assessment starts here"
            description="Pick your focus areas. We’ll check the bank and keep the composition balanced."
            href="/teacher/papers/new"
            action="Build your first paper"
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Batch</th>
                  <th>Questions</th>
                  <th>Source mix</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small className="cell-sub">
                        {formatDate(p.created_at)}
                      </small>
                    </td>
                    <td>{p.batch_name}</td>
                    <td>{p.total_questions}</td>
                    <td>
                      {p.total_questions - p.llm_question_count} bank ·{" "}
                      {p.llm_question_count} AI
                    </td>
                    <td>
                      <span
                        className={`badge ${p.status === "published" ? "green" : "neutral"}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/teacher/papers/${p.id}`}
                      >
                        Review
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export function PaperBuilder() {
  const { batch, user, taxonomy, notify } = useApp();
  const router = useRouter();
  const [selectedBatch, setSelectedBatch] = useState(
    batch === "all" ? user.batches[0]?.id : batch,
  );
  const [name, setName] = useState("Weekly focus · Targeted practice");
  const [composition, setComposition] = useState([
    { subtopic_id: "chem.org.carbonyls", count: 8, difficulty: 3 },
    { subtopic_id: "phy.mech.rotational", count: 10, difficulty: 3 },
    { subtopic_id: "math.calculus.aod", count: 12, difficulty: 3 },
  ]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const { busy, error, run } = useMutation();
  const total = composition.reduce((sum, c) => sum + c.count, 0);
  const update = (index: number, change: Partial<(typeof composition)[0]>) => {
    setComposition((c) =>
      c.map((r, i) => (i === index ? { ...r, ...change } : r)),
    );
    setPlan(null);
  };
  const payload = {
    batch_id: selectedBatch,
    name,
    total_questions: total,
    composition,
    allow_llm: false,
  };
  return (
    <>
      <Link className="back-link" href="/teacher/papers">
        <ArrowLeft size={15} />
        Question papers
      </Link>
      <PageTitle
        title="Build with a clear purpose."
        description="Choose the concepts. Set the challenge. Check the composition before creating."
      />
      <form
        className="builder-layout"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () =>
            setPlan(
              await api<Plan>("/teacher/question-papers/dry-run", payload),
            ),
          );
        }}
      >
        <div>
          <Panel
            title="Paper details"
            subtitle="Give this assessment a name and a home"
          >
            <div className="panel-body">
              <label className="field">
                Paper name
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setPlan(null);
                  }}
                />
              </label>
              <label className="field">
                Batch
                <select
                  value={selectedBatch}
                  onChange={(e) => {
                    setSelectedBatch(e.target.value);
                    setPlan(null);
                  }}
                >
                  {user.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>
          <Panel
            title="Your focus areas"
            subtitle="One row per subtopic · difficulty band ±1"
          >
            <div className="composition-list">
              {composition.map((c, i) => (
                <div className="composition-row" key={i}>
                  <span className="composition-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <label className="field">
                    Subtopic
                    <select
                      aria-label={`Subtopic ${i + 1}`}
                      value={c.subtopic_id}
                      onChange={(e) =>
                        update(i, { subtopic_id: e.target.value })
                      }
                    >
                      {taxonomy?.subtopics.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.topic_name} / {s.name} · {s.bank_count} bank
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field count-field">
                    Count
                    <input
                      aria-label={`Question count ${i + 1}`}
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={c.count}
                      onChange={(e) =>
                        update(i, { count: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field difficulty-field">
                    Difficulty
                    <select
                      aria-label={`Difficulty ${i + 1}`}
                      value={c.difficulty}
                      onChange={(e) =>
                        update(i, { difficulty: Number(e.target.value) })
                      }
                    >
                      {[1, 2, 3, 4, 5].map((d) => (
                        <option value={d} key={d}>
                          {d} / 5
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="icon-button danger"
                    type="button"
                    aria-label={`Remove focus area ${i + 1}`}
                    disabled={composition.length <= 1}
                    onClick={() => {
                      setComposition((c) =>
                        c.filter((_, index) => index !== i),
                      );
                      setPlan(null);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="panel-body">
              <button
                type="button"
                className="button secondary small"
                disabled={composition.length >= 20 || !taxonomy}
                onClick={() => {
                  const next = taxonomy?.subtopics.find(
                    (s) =>
                      s.bank_count &&
                      !composition.some((c) => c.subtopic_id === s.id),
                  );
                  if (next) {
                    setComposition((c) => [
                      ...c,
                      { subtopic_id: next.id, count: 3, difficulty: 3 },
                    ]);
                    setPlan(null);
                  } else notify("All stocked subtopics have been added.");
                }}
              >
                <Plus size={15} />
                Add focus area
              </button>
            </div>
          </Panel>
          {error && <ErrorState error={error} />}
          {plan && (
            <Panel
              title="Bank availability"
              subtitle="Verified by the server; checked again when you create the paper"
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Subtopic</th>
                      <th>Requested</th>
                      <th>Available</th>
                      <th>AI needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.subtopic_id}>
                        <td>{r.name}</td>
                        <td>{r.requested}</td>
                        <td>{r.available}</td>
                        <td>
                          <span
                            className={`badge ${r.llm_needed ? "orange" : "green"}`}
                          >
                            {r.llm_needed}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
        <aside className="paper-budget">
          <span className="mini-icon">
            <ShieldCheck size={25} />
          </span>
          <h2>A thoughtful balance.</h2>
          <p>
            At least 70% from the bank.
            <br />
            No more than 30% generated.
          </p>
          <div className="budget-total">
            <strong>{total}</strong>
            <span>total questions</span>
          </div>
          <div className="source-bar">
            <span
              style={{
                width: `${plan ? (plan.bank_question_count / total) * 100 : 70}%`,
              }}
            />
            <i />
          </div>
          <div className="budget-row">
            <span>
              <i className="legend-dot bank" />
              Bank questions
            </span>
            <strong>{plan ? plan.bank_question_count : "Check stock"}</strong>
          </div>
          <div className="budget-row">
            <span>
              <i className="legend-dot ai" />
              AI allowance
            </span>
            <strong>≤ {Math.floor(total * 0.3)}</strong>
          </div>
          <div className="budget-note">
            <ShieldCheck size={16} />
            <p>
              Enforced on the server and against the actual sources in the
              database.
            </p>
          </div>
          {total > 100 && (
            <p className="error-text">
              A paper can contain at most 100 questions.
            </p>
          )}
          {plan && !plan.can_create && (
            <p className="error-text">
              {plan.over_budget
                ? `Composition needs ${plan.llm_question_count} AI questions; the limit is ${plan.llm_budget}.`
                : "Some questions require AI generation, which is disabled locally."}{" "}
              Reduce counts or choose stocked subtopics.
            </p>
          )}
          <SubmitButton
            busy={busy}
            disabled={!taxonomy || total > 100 || total < 1}
          >
            Check availability
            <Search size={16} />
          </SubmitButton>
          <button
            className="button primary"
            type="button"
            disabled={busy || !plan?.can_create}
            onClick={() =>
              run(async () => {
                const paper = await api<{ paper_id: string }>(
                  "/teacher/question-papers",
                  payload,
                );
                notify("Your paper is ready for review.");
                router.push(`/teacher/papers/${paper.paper_id}`);
              })
            }
          >
            <FilePlus2 size={16} />
            Create paper
          </button>
          <small>AI generation is off in this local build.</small>
        </aside>
      </form>
    </>
  );
}

export function PaperDetail({ id }: { id: string }) {
  const data = useResource<
    PaperSummary & {
      items: (Question & {
        position: number;
        correct_answer: { option_label: string };
        solution: string;
      })[];
    }
  >(`/teacher/question-papers/${id}`);
  const [solutions, setSolutions] = useState(false);
  const { busy, error, run } = useMutation();
  const { notify } = useApp();
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} retry={data.reload} />;
  if (!data.data) return null;
  const paper = data.data;
  return (
    <>
      <Link className="back-link no-print" href="/teacher/papers">
        <ArrowLeft size={15} />
        Question papers
      </Link>
      <PageTitle
        title={paper.name}
        description={`${paper.total_questions} questions · ${paper.total_questions - paper.llm_question_count} bank / ${paper.llm_question_count} AI · ${paper.status}`}
      >
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Print paper
        </button>
        {paper.status === "draft" && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(`/teacher/question-papers/${id}/publish`, {});
                notify("Paper published. You can now import its test results.");
                data.reload();
              })
            }
          >
            <Check size={16} />
            Publish as test
          </button>
        )}
      </PageTitle>
      <label className="checkbox-field no-print">
        <input
          type="checkbox"
          checked={solutions}
          onChange={(e) => setSolutions(e.target.checked)}
        />
        Include answer key and worked solutions
      </label>
      {error && <ErrorState error={error} />}
      <div className="paper-content">
        {paper.items.map((q) => (
          <article className="paper-question" key={q.id}>
            <div className="question-label">
              <strong>Question {q.position}</strong>
              <span className="badge neutral">Difficulty {q.difficulty}/5</span>
            </div>
            <h3>
              <MathText text={q.stem} />
            </h3>
            <div className="paper-options">
              {q.options.map((o) => (
                <div key={o.label}>
                  <strong>{o.label}.</strong>
                  <MathText text={o.body} />
                </div>
              ))}
            </div>
            {solutions && (
              <div className="solution">
                <strong>Answer: {q.correct_answer.option_label}</strong>
                <p>
                  <MathText text={q.solution} />
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

type TestItem = {
  id: string;
  name: string;
  scheduled_for: string;
  submissions: number;
};
type Template = {
  questions: { id: string; stem: string }[];
  students: { id: string; full_name: string; email: string }[];
};
type ImportResult = {
  row_count: number;
  correct: number;
  wrong: number;
  skipped: number;
  preview: boolean;
  rows: { student_id: string; question_id: string; outcome: string }[];
};

export function ImportPage() {
  const { user, batch, notify } = useApp();
  const [selectedBatch, setSelectedBatch] = useState(
    batch === "all" ? user.batches[0]?.id : batch,
  );
  const tests = useResource<TestItem[]>(
    `/teacher/tests?batch_id=${selectedBatch}`,
  );
  const [testId, setTestId] = useState("");
  const template = useResource<Template>(
    testId ? `/teacher/tests/${testId}/template` : null,
  );
  const [mode, setMode] = useState("csv");
  const [file, setFile] = useState<File | null>(null);
  const [manualStudent, setManualStudent] = useState("");
  const [manualQuestion, setManualQuestion] = useState("");
  const [manualAnswer, setManualAnswer] = useState("A");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const { busy, error, run } = useMutation();
  useEffect(() => {
    if (tests.data) {
      setTestId(tests.data[0]?.id || "");
      setPreview(null);
    }
  }, [tests.data]);
  const upload = async (isPreview: boolean) => {
    if (!testId) return;
    let result: ImportResult;
    if (mode === "csv") {
      if (!file) return;
      const body = new FormData();
      body.append("file", file);
      body.append("test_id", testId);
      body.append("preview", String(isPreview));
      result = await api<ImportResult>("/teacher/attempts/import", body);
    } else
      result = await api<ImportResult>("/teacher/attempts/manual", {
        test_id: testId,
        preview: isPreview,
        records: [
          {
            student_email: manualStudent,
            question_id: manualQuestion,
            student_answer:
              manualAnswer === "skip" ? null : { option_label: manualAnswer },
            time_taken_seconds: 0,
          },
        ],
      });
    setPreview(result);
    if (!isPreview)
      notify(
        `${result.row_count} answers imported. Recommendations are ready where bank stock permits.`,
      );
  };
  const download = () => {
    if (!template.data) return;
    const text =
      "student_email,question_id,student_answer,is_correct,time_taken_seconds\n" +
      template.data.questions
        .map((q) => `${template.data!.students[0]?.email || ""},${q.id},A,,45`)
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pragati-results-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageTitle
        eyebrow="GOOD DATA. BETTER NEXT STEPS."
        title="Bring the results together."
        description="Import a CSV or enter an answer. We validate every row before saving anything."
      />
      <div className="import-layout">
        <Panel
          title="Import test results"
          subtitle="Up to 5,000 rows · UTF-8 CSV · maximum 2 MB"
        >
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                Batch
                <select
                  value={selectedBatch}
                  onChange={(e) => {
                    setSelectedBatch(e.target.value);
                    setPreview(null);
                    setTestId("");
                  }}
                >
                  {user.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Test
                <select
                  aria-label="Test"
                  value={testId}
                  onChange={(e) => {
                    setTestId(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Choose a test</option>
                  {tests.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.submissions} submissions)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="segmented">
              <button
                className={mode === "csv" ? "selected" : ""}
                onClick={() => {
                  setMode("csv");
                  setPreview(null);
                }}
              >
                <FileSpreadsheet size={15} />
                CSV upload
              </button>
              <button
                className={mode === "manual" ? "selected" : ""}
                onClick={() => {
                  setMode("manual");
                  setPreview(null);
                }}
              >
                Manual entry
              </button>
            </div>
            {mode === "csv" ? (
              <>
                <label
                  className="upload-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setFile(e.dataTransfer.files[0] || null);
                    setPreview(null);
                  }}
                >
                  <span className="upload-icon">
                    <Upload size={27} />
                  </span>
                  <strong>
                    {file ? file.name : "Drop your results right here"}
                  </strong>
                  <span>
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB · Click to choose a different file`
                      : "or click to browse files on your computer"}
                  </span>
                  <small>CSV files up to 2 MB</small>
                  <input
                    aria-label="Upload results CSV"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setPreview(null);
                    }}
                  />
                </label>
                <button
                  className="text-link"
                  disabled={!template.data}
                  onClick={download}
                >
                  <Download size={15} />
                  Download a template for this test
                </button>
              </>
            ) : (
              <div className="manual-form">
                <label className="field">
                  Student
                  <select
                    required
                    value={manualStudent}
                    onChange={(e) => {
                      setManualStudent(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="">Choose a student</option>
                    {template.data?.students.map((s) => (
                      <option key={s.id} value={s.email}>
                        {s.full_name} · {s.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Question
                  <select
                    value={manualQuestion}
                    onChange={(e) => {
                      setManualQuestion(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="">Choose a question</option>
                    {template.data?.questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.id} · {q.stem.slice(0, 75)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Student answer
                  <select
                    value={manualAnswer}
                    onChange={(e) => {
                      setManualAnswer(e.target.value);
                      setPreview(null);
                    }}
                  >
                    {["A", "B", "C", "D", "skip"].map((a) => (
                      <option key={a} value={a}>
                        {a === "skip" ? "Not answered / skipped" : a}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {tests.error && (
              <ErrorState error={tests.error} retry={tests.reload} />
            )}
            {template.error && (
              <ErrorState error={template.error} retry={template.reload} />
            )}
            {error && <ErrorState error={error} />}
            <div className="import-actions">
              <button
                className="button primary"
                disabled={
                  busy ||
                  !testId ||
                  (mode === "csv" ? !file : !manualStudent || !manualQuestion)
                }
                onClick={() => {
                  setPreview(null);
                  run(() => upload(true));
                }}
              >
                <Search size={16} />
                Validate & preview
              </button>
              {preview?.preview && (
                <button
                  className="button primary green-button"
                  disabled={busy}
                  onClick={() => run(() => upload(false))}
                >
                  <Check size={16} />
                  Confirm import · {preview.row_count} rows
                </button>
              )}
            </div>
          </div>
        </Panel>
        <aside className="import-guide">
          <span className="mini-icon green">
            <ShieldCheck size={23} />
          </span>
          <h2>A clean start for every row.</h2>
          <p>Nothing is saved until every row passes validation.</p>
          <ol>
            <li>
              <strong>Match the right test</strong>
              <span>Questions must belong to the selected test.</span>
            </li>
            <li>
              <strong>Keep students in scope</strong>
              <span>Only active students from this batch are accepted.</span>
            </li>
            <li>
              <strong>Let the server grade</strong>
              <span>
                Answers are checked against the bank. Supplied grades must
                agree.
              </span>
            </li>
            <li>
              <strong>Keep history intact</strong>
              <span>
                Duplicate answers are rejected, never silently overwritten.
              </span>
            </li>
          </ol>
          <div className="info-box">
            <p>
              Imported answers use the test’s scheduled date. Current-week tests
              appear in the weekly view immediately; full-week analytics include
              them after Sunday.
            </p>
          </div>
        </aside>
      </div>
      {preview && (
        <Panel
          title={
            preview.preview
              ? "Looking good. Ready to import?"
              : "Results saved successfully"
          }
          subtitle={`${preview.row_count} rows · ${preview.correct} correct · ${preview.wrong} wrong · ${preview.skipped} skipped${preview.row_count > 20 ? " · Showing first 20 rows" : ""}`}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Question</th>
                  <th>Server grade</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.student_id}</td>
                    <td>
                      <code>{r.question_id}</code>
                    </td>
                    <td>
                      <span
                        className={`badge ${r.outcome === "correct" ? "green" : r.outcome === "wrong" ? "orange" : "neutral"}`}
                      >
                        {r.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

export function UncategorizedPage() {
  const { batch, taxonomy, notify } = useApp();
  const data = useResource<
    {
      id: string;
      stem: string;
      full_name: string;
      subtopic_id: string;
      test_name: string;
    }[]
  >(`/teacher/batches/${batch}/uncategorized`);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const { busy, error, run } = useMutation();
  return (
    <>
      <PageTitle
        title="A little human judgment helps."
        description="Review uncategorized mistakes and connect them to the right concept."
      />
      {error && <ErrorState error={error} />}
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={data.reload} />
      ) : !data.data?.length ? (
        <Empty
          title="Everything has a place"
          description="There are no uncategorized mistakes in this batch."
        />
      ) : (
        <div className="review-list">
          {data.data.map((item) => (
            <section className="panel review-card" key={item.id}>
              <div className="review-meta">
                <span className="badge orange">Needs review</span>
                <span>
                  {item.full_name} · {item.test_name}
                </span>
              </div>
              <h3>
                <MathText text={item.stem} />
              </h3>
              <div className="review-action">
                <label className="field">
                  Assign a subtopic
                  <select
                    value={selected[item.id] || item.subtopic_id}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [item.id]: e.target.value }))
                    }
                  >
                    {taxonomy?.subtopics.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.topic_name} / {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={busy || !taxonomy}
                  onClick={() =>
                    run(async () => {
                      const result = await api<{
                        recommendations_created: number;
                      }>(`/teacher/answers/${item.id}/categorize`, {
                        subtopic_id: selected[item.id] || item.subtopic_id,
                      });
                      notify(
                        `Categorized. ${result.recommendations_created} follow-up questions added.`,
                      );
                      data.reload();
                    })
                  }
                >
                  <Check size={16} />
                  Save category
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
