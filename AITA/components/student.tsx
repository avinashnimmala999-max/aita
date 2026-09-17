"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Target,
  XCircle,
} from "lucide-react";
import {
  Dashboard,
  Feedback,
  HomeworkItem,
  Question,
  Recommendation,
  api,
  formatDate,
  useResource,
} from "./api";
import {
  Empty,
  ErrorState,
  Loading,
  MathText,
  PageTitle,
  Panel,
  SubjectBadge,
  useMutation,
} from "./ui";

export function PracticePage() {
  const [filter, setFilter] = useState("pending");
  const data = useResource<{ items: Recommendation[]; total: number }>(
    `/student/practice?status=${filter}&limit=100`,
  );
  const homework = useResource<HomeworkItem[]>("/student/homework");
  return (
    <>
      <PageTitle
        eyebrow="ONE CONCEPT. ONE SMALL WIN."
        title="Make room for a little progress."
        description="Questions connected to your own mistakes, picked by subtopic and difficulty."
      />
      <div className="practice-banner">
        <span className="mini-icon">
          <Target size={26} />
        </span>
        <div>
          <h2>Not more practice. The right practice.</h2>
          <p>
            Take your time. Solutions appear only after you submit your answer.
          </p>
        </div>
        <span className="practice-count">
          <strong>{data.data?.total ?? "—"}</strong>
          {filter === "pending" ? "ready to practice" : "completed"}
        </span>
      </div>
      <Panel
        title="Your practice queue"
        subtitle="Bank-backed follow-ups · no AI or embedding retrieval in local mode"
        action={
          <div className="segmented">
            <button
              className={filter === "pending" ? "selected" : ""}
              onClick={() => setFilter("pending")}
            >
              To practice
            </button>
            <button
              className={filter === "attempted" ? "selected" : ""}
              onClick={() => setFilter("attempted")}
            >
              Completed
            </button>
          </div>
        }
      >
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={data.reload} />
        ) : !data.data?.items.length ? (
          <Empty
            title={
              filter === "pending"
                ? "A little breathing room."
                : "Your first small win is waiting."
            }
            description={
              filter === "pending"
                ? "No pending recommendations. If a concept has too few unseen bank questions, fewer than three follow-ups may be available. You can still work on homework below."
                : "Completed practice questions will appear here."
            }
          />
        ) : (
          <div className="practice-list">
            {data.data.items.map((r, i) => (
              <Link
                className="practice-row"
                key={r.id}
                href={`/student/practice/${r.id}`}
              >
                <span
                  className={`practice-index ${filter === "attempted" ? "complete" : ""}`}
                >
                  {filter === "attempted" ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div className="practice-row-copy">
                  <div>
                    <strong>{r.subtopic_name}</strong>
                    <SubjectBadge
                      subject={r.question.subtopic_id.split(".")[0]}
                    />
                  </div>
                  <p>
                    <MathText text={r.question.stem} />
                  </p>
                  <small>
                    Because of a mistake in {r.test_name} · Follow-up level{" "}
                    {r.depth}/3
                  </small>
                </div>
                <span
                  className="difficulty-dots"
                  title={`Difficulty ${r.question.difficulty} of 5`}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i
                      key={n}
                      className={n <= r.question.difficulty ? "filled" : ""}
                    />
                  ))}
                </span>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        )}
      </Panel>
      {!!homework.data?.filter(
        (h) => (h.attempted_count || 0) < h.question_count,
      ).length && (
        <Panel
          title="From your teacher, for you"
          subtitle="Your assigned work belongs in the same learning routine"
        >
          <div className="homework-queue">
            {homework.data
              .filter((h) => (h.attempted_count || 0) < h.question_count)
              .map((h) => (
                <Link
                  className="homework-queue-row"
                  key={h.id}
                  href={`/student/homework/${h.id}`}
                >
                  <span className="mini-icon green">
                    <BookOpen size={20} />
                  </span>
                  <div>
                    <strong>{h.name}</strong>
                    <small>
                      {h.attempted_count}/{h.question_count} complete ·{" "}
                      {h.teacher_name}
                    </small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              ))}
          </div>
        </Panel>
      )}
    </>
  );
}

export function QuestionSolver({
  question,
  endpoint,
  initialFeedback,
  onAnswered,
  next,
}: {
  question: Question;
  endpoint: string;
  initialFeedback?: Feedback | null;
  onAnswered?: (f: Feedback) => void;
  next?: React.ReactNode;
}) {
  const [choice, setChoice] = useState<string[]>([]);
  const [numeric, setNumeric] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(
    initialFeedback || null,
  );
  const [started] = useState(Date.now());
  const { busy, error, run } = useMutation();
  const multi = question.question_type === "mcq_multi";
  const isNumeric = question.question_type === "numeric";
  const manual = question.question_type === "subjective";
  const submit = () =>
    run(async () => {
      const result = await api<Feedback>(endpoint, {
        student_answer: isNumeric
          ? { value: Number(numeric) }
          : multi
            ? { option_labels: choice }
            : { option_label: choice[0] },
        time_taken_seconds: Math.min(
          86400,
          Math.max(0, Math.round((Date.now() - started) / 1000)),
        ),
      });
      setFeedback(result);
      onAnswered?.(result);
    });
  return (
    <div className="solver">
      <div className="solver-meta">
        <SubjectBadge subject={question.subtopic_id.split(".")[0]} />
        <span className="badge neutral">
          Difficulty {question.difficulty}/5
        </span>
        <span className="solver-time">
          <Clock3 size={14} />
          Go at your own pace
        </span>
      </div>
      <h2 className="question-stem">
        <MathText text={question.stem} />
      </h2>
      <span className="answer-instruction">
        {isNumeric
          ? "Enter your numerical answer"
          : multi
            ? "Select all correct options"
            : manual
              ? "Teacher-reviewed answer required"
              : "Choose one answer"}
      </span>
      {isNumeric ? (
        <input
          aria-label="Numeric answer"
          className="numeric-answer"
          type="number"
          step="any"
          disabled={!!feedback}
          value={numeric}
          onChange={(e) => setNumeric(e.target.value)}
        />
      ) : manual ? (
        <p>
          Subjective grading is not available in this build. Ask your teacher to
          review this question.
        </p>
      ) : (
        <div
          className="answer-options"
          role={multi ? "group" : "radiogroup"}
          aria-label="Answer options"
        >
          {question.options.map((o) => {
            const selected = choice.includes(o.label);
            const correct =
              feedback &&
              (feedback.correct_answer.option_label === o.label ||
                (Array.isArray(feedback.correct_answer.option_labels) &&
                  feedback.correct_answer.option_labels.includes(o.label)));
            return (
              <label
                key={o.label}
                className={`answer-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${feedback && selected && !correct ? "incorrect" : ""}`}
              >
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={`answer-${question.id}`}
                  checked={selected}
                  disabled={!!feedback || busy}
                  onChange={() =>
                    setChoice((c) =>
                      multi
                        ? c.includes(o.label)
                          ? c.filter((x) => x !== o.label)
                          : [...c, o.label]
                        : [o.label],
                    )
                  }
                />
                <span className="option-letter">{o.label}</span>
                <span>
                  <MathText text={o.body} />
                </span>
                {correct && <CheckCircle2 size={19} />}
                {!correct && selected && !feedback && (
                  <span className="selected-radio" />
                )}
              </label>
            );
          })}
        </div>
      )}
      {error && <ErrorState error={error} />}
      {!feedback ? (
        <div className="solver-footer">
          <span>
            <Lightbulb size={15} />
            Try it first. Learn from the solution.
          </span>
          <button
            className="button primary"
            disabled={
              busy ||
              manual ||
              (isNumeric
                ? numeric === "" || !Number.isFinite(Number(numeric))
                : choice.length === 0)
            }
            onClick={submit}
          >
            {busy ? "Checking your answer…" : "Submit answer"}
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="feedback-area">
          <div
            className={`feedback-banner ${feedback.is_correct ? "correct" : "incorrect"}`}
          >
            {feedback.is_correct ? (
              <CheckCircle2 size={24} />
            ) : (
              <XCircle size={24} />
            )}
            <div>
              <strong>
                {feedback.is_correct
                  ? "That’s a step in the right direction."
                  : "Not quite. Let’s work through it."}
              </strong>
              <p>
                {feedback.is_correct
                  ? "Well done. Take a look at the reasoning to make the concept stick."
                  : `Correct answer: ${Object.values(feedback.correct_answer)
                      .map((v) => (Array.isArray(v) ? v.join(", ") : String(v)))
                      .join(" · ")}`}
              </p>
            </div>
          </div>
          <div className="worked-solution">
            <span className="eyebrow">THE THINKING BEHIND IT</span>
            <p>
              <MathText text={feedback.solution} />
            </p>
          </div>
          {feedback.followup_count !== undefined && !feedback.is_correct && (
            <p className="muted small-text">
              {feedback.depth_limit_reached
                ? "You’ve reached the three-level practice limit. Ask your teacher for a fresh explanation."
                : feedback.followup_count
                  ? `${feedback.followup_count} new follow-ups have been added to your queue.`
                  : "No more unseen questions are available in this concept’s difficulty band."}
            </p>
          )}
          <div className="solver-next">
            {next ||
              (feedback.next_recommendation_id ? (
                <Link
                  className="button primary"
                  href={`/student/practice/${feedback.next_recommendation_id}`}
                >
                  Next question
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link className="button primary" href="/student/practice">
                  Back to practice
                  <ArrowRight size={16} />
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PracticeAttempt({ id }: { id: string }) {
  const data = useResource<Recommendation>(`/student/recommendations/${id}`);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} retry={data.reload} />;
  if (!data.data) return null;
  return (
    <>
      <Link className="back-link" href="/student/practice">
        <ArrowLeft size={15} />
        Back to practice queue
      </Link>
      <PageTitle
        eyebrow="STAY CURIOUS. KEEP GOING."
        title={data.data.subtopic_name}
        description={`A focused follow-up · Level ${data.data.depth} of 3`}
      />
      <QuestionSolver
        key={id}
        question={data.data.question}
        endpoint={`/student/recommendations/${id}/attempt`}
        initialFeedback={data.data.feedback}
      />
    </>
  );
}

export function StudentHomework() {
  const data = useResource<HomeworkItem[]>("/student/homework");
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE CONSISTENCY GOES A LONG WAY"
        title="Your work, all in one place."
        description="Focused assignments from your teacher. Made to help the concepts stick."
      />
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={data.reload} />
      ) : !data.data?.length ? (
        <Empty
          title="You’re all caught up"
          description="No homework has been assigned yet. Try your personal practice queue instead."
          href="/student/practice"
          action="Go to practice"
        />
      ) : (
        <div className="assignment-grid">
          {data.data.map((h) => {
            const complete = h.attempted_count === h.question_count;
            return (
              <section className="assignment-card" key={h.id}>
                <div className="assignment-top">
                  <span className="mini-icon">
                    <BookOpen size={21} />
                  </span>
                  <span
                    className={`badge ${complete ? "green" : h.student_id ? "orange" : "neutral"}`}
                  >
                    {complete
                      ? "Completed"
                      : h.student_id
                        ? "Just for you"
                        : "Class homework"}
                  </span>
                </div>
                <h2>{h.name}</h2>
                <p>Assigned by {h.teacher_name}</p>
                <div className="homework-progress">
                  <span>
                    {h.attempted_count} of {h.question_count} questions complete
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${((h.attempted_count || 0) / h.question_count) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="assignment-footer">
                  <CalendarDays size={14} />
                  {h.due_date
                    ? `Due ${formatDate(h.due_date)}`
                    : "Work at your own pace"}
                </div>
                <Link
                  className="button secondary"
                  href={`/student/homework/${h.id}`}
                >
                  {complete
                    ? "Review your answers"
                    : h.attempted_count
                      ? "Continue homework"
                      : "Start homework"}
                  <ArrowRight size={16} />
                </Link>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export function HomeworkDetail({ id }: { id: string }) {
  const data = useResource<HomeworkItem>(`/student/homework/${id}`);
  const [index, setIndex] = useState(0);
  const [feedbacks, setFeedbacks] = useState<Record<string, Feedback>>({});
  useEffect(() => {
    if (data.data?.items) {
      const first = data.data.items.findIndex((i) => !i.feedback);
      setIndex(first < 0 ? 0 : first);
    }
  }, [data.data]);
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} retry={data.reload} />;
  if (!data.data?.items?.length)
    return (
      <Empty
        title="No questions in this assignment"
        description="Please ask your teacher to review the homework."
        href="/student/homework"
      />
    );
  const h = data.data,
    items = h.items!,
    item = items[index];
  return (
    <>
      <Link className="back-link" href="/student/homework">
        <ArrowLeft size={15} />
        My homework
      </Link>
      <PageTitle
        title={h.name}
        description={`Question ${index + 1} of ${h.question_count} · Assigned by ${h.teacher_name}`}
      />
      <div
        className="question-stepper"
        aria-label="Homework question navigation"
      >
        {items.map((it, i) => (
          <button
            key={it.question.id}
            className={`${i === index ? "current" : ""} ${it.feedback || feedbacks[it.question.id] ? "done" : ""}`}
            onClick={() => setIndex(i)}
            aria-label={`Question ${i + 1}`}
          >
            {i + 1}
            {(it.feedback || feedbacks[it.question.id]) && (
              <CheckCircle2 size={12} />
            )}
          </button>
        ))}
      </div>
      <QuestionSolver
        key={item.question.id}
        question={item.question}
        endpoint={`/student/homework/${id}/questions/${item.question.id}/attempt`}
        initialFeedback={feedbacks[item.question.id] || item.feedback}
        onAnswered={(f) =>
          setFeedbacks((old) => ({ ...old, [item.question.id]: f }))
        }
        next={
          index < items.length - 1 ? (
            <button
              className="button primary"
              onClick={() => setIndex((i) => i + 1)}
            >
              Next question
              <ArrowRight size={16} />
            </button>
          ) : (
            <Link className="button primary" href="/student/homework">
              Back to homework
              <CheckCircle2 size={16} />
            </Link>
          )
        }
      />
    </>
  );
}

export function WeaknessesPage() {
  const data = useResource<
    Dashboard & {
      answers: {
        id: string;
        stem: string;
        outcome: string;
        topic_id: string;
        test_name: string;
      }[];
    }
  >("/student/weaknesses");
  const [topic, setTopic] = useState<string | null>(null);
  return (
    <>
      <PageTitle
        eyebrow="KNOW YOUR STARTING POINT"
        title="Weak areas aren’t permanent."
        description="They’re a useful map of where to spend your next practice session."
      />
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={data.reload} />
      ) : !data.data?.topics.length ? (
        <Empty
          title="Your map is taking shape"
          description="Once test results are added, your focus areas will appear here."
        />
      ) : (
        <>
          <Panel
            title="Your focus areas"
            subtitle="Wrong answers by topic · last 4 completed ISO weeks · click to explore"
          >
            <div className="weakness-chart">
              {data.data.topics.map((t) => (
                <button
                  className={`weakness-bar-row ${topic === t.topic_id ? "selected" : ""}`}
                  key={t.topic_id}
                  onClick={() => setTopic(t.topic_id)}
                >
                  <span>{t.topic_name}</span>
                  <div>
                    <i
                      className={`subject-fill-${t.subject_id}`}
                      style={{
                        width: `${(t.wrong / Math.max(...data.data!.topics.map((t) => t.wrong), 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{t.wrong}</strong>
                  <small>{Math.round(t.avg_mistake_rate * 100)}% wrong</small>
                </button>
              ))}
            </div>
          </Panel>
          {topic && (
            <Panel
              title={
                data.data.topics.find((t) => t.topic_id === topic)
                  ?.topic_name || "Topic detail"
              }
              subtitle="Your original test answers, not practice attempts"
            >
              <div className="answer-history">
                {data.data.answers
                  .filter((a) => a.topic_id === topic)
                  .map((a) => (
                    <div key={a.id}>
                      <span
                        className={`badge ${a.outcome === "correct" ? "green" : a.outcome === "wrong" ? "orange" : "neutral"}`}
                      >
                        {a.outcome}
                      </span>
                      <p>
                        <MathText text={a.stem} />
                        <small>{a.test_name}</small>
                      </p>
                    </div>
                  ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
