"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleArrowUp,
  ClipboardCheck,
  Lightbulb,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  Dashboard,
  Learner,
  Topic,
  initials,
  subjects,
  useResource,
} from "./api";
import {
  Empty,
  ErrorState,
  Loading,
  PageTitle,
  Panel,
  SubjectBadge,
  ViewLink,
  useApp,
} from "./ui";
import { Intervention } from "./teacher";

export function TrendChart({ data }: { data: Dashboard["trend"] }) {
  return (
    <div
      className="trend-chart"
      role="img"
      aria-label="Subject accuracy across completed ISO weeks"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 0, left: -24 }}
        >
          <CartesianGrid
            strokeDasharray="4 5"
            vertical={false}
            stroke="#edf0f2"
          />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: "#92969f" }}
            axisLine={false}
            tickLine={false}
            dy={10}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: "#92969f" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #e8e8ee",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(v: number, n: string) => [`${v}%`, subjects[n] || n]}
            labelFormatter={(_, values) => values[0]?.payload?.label || ""}
          />
          <Line
            type="monotone"
            dataKey="phy"
            stroke="#859cea"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="chem"
            stroke="#6d58cf"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="math"
            stroke="#58b8a0"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopicTable({
  topics,
  onSelect,
  compact = false,
}: {
  topics: Topic[];
  onSelect?: (t: Topic) => void;
  compact?: boolean;
}) {
  if (!topics.length)
    return (
      <Empty
        title="No topic data yet"
        description="Import test results to discover which concepts need attention."
      />
    );
  return (
    <div className="table-scroll">
      <table className="topic-table">
        <thead>
          <tr>
            <th>Topic</th>
            {!compact && <th>Subject</th>}
            <th>Mistake rate</th>
            <th>Answers</th>
            <th>{compact ? "" : "Students"}</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic, i) => (
            <tr
              key={topic.topic_id}
              className={topic.low_volume ? "low-sample" : ""}
            >
              <td>
                <div className="topic-name">
                  <span className={`topic-number ${i === 0 ? "first" : ""}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    {onSelect ? (
                      <button
                        className="plain-button"
                        onClick={() => onSelect(topic)}
                      >
                        {topic.topic_name}
                      </button>
                    ) : (
                      <strong>{topic.topic_name}</strong>
                    )}
                    {compact && <small>{subjects[topic.subject_id]}</small>}
                    {topic.low_volume && (
                      <span className="badge neutral">Low sample</span>
                    )}
                  </div>
                </div>
              </td>
              {!compact && (
                <td>
                  <SubjectBadge subject={topic.subject_id} />
                </td>
              )}
              <td>
                <div className="rate-cell">
                  <div className="rate-track">
                    <span
                      style={{ width: `${topic.avg_mistake_rate * 100}%` }}
                      className={
                        topic.avg_mistake_rate >= 0.5 ? "high" : "medium"
                      }
                    />
                  </div>
                  <strong>
                    {Math.round(topic.avg_mistake_rate * 100)}
                    <span>%</span>
                  </strong>
                </div>
              </td>
              <td className="muted">{topic.attempts.toLocaleString()}</td>
              <td>
                {compact
                  ? onSelect && (
                      <button
                        className="icon-button"
                        aria-label={`Explore ${topic.topic_name}`}
                        onClick={() => onSelect(topic)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    )
                  : topic.student_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Overview() {
  const { user, batch, weeks, notify } = useApp();
  const isStudent = user.role === "student",
    isManagement = user.role === "management";
  const resource = useResource<Dashboard>(
    isStudent
      ? "/student/dashboard"
      : isManagement
        ? "/mgmt/overview"
        : `/teacher/batches/${batch}/dashboard?weeks=${weeks}`,
  );
  const [target, setTarget] = useState<{
    topic?: Topic;
    learner?: Learner;
  } | null>(null);
  const close = useCallback(() => setTarget(null), []);
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <ErrorState error={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const d = resource.data,
    top = d.topics[0];
  const stats = isStudent
    ? [
        {
          label: "Ready to practice",
          value: d.pending_recommendations || 0,
          icon: Target,
          tone: "purple",
          detail: "Questions picked for your weak areas",
          href: "/student/practice",
        },
        {
          label: "Homework to complete",
          value: d.pending_homework || 0,
          icon: BookOpen,
          tone: "blue",
          detail: "One focused session at a time",
          href: "/student/homework",
        },
        {
          label: "Your accuracy",
          value: `${d.stats.accuracy}%`,
          icon: TrendingUp,
          tone: "green",
          detail: "Across answered test questions",
          href: "/student/weaknesses",
        },
        {
          label: "Questions answered",
          value: d.stats.answers,
          icon: ClipboardCheck,
          tone: "orange",
          detail: "In the last 4 completed weeks",
          href: "/student/weaknesses",
        },
      ]
    : [
        {
          label: "Active students",
          value: d.stats.active_students,
          icon: Users,
          tone: "purple",
          detail: isManagement
            ? "Across all campus batches"
            : "In your selected batch scope",
        },
        {
          label: "Average accuracy",
          value: `${d.stats.accuracy}%`,
          icon: Target,
          tone: "green",
          detail: `${d.stats.answers.toLocaleString()} answered questions`,
        },
        {
          label: "Need a little support",
          value: d.stats.needs_attention,
          icon: BookOpen,
          tone: "orange",
          detail: "Below 40% · at least 20 answers",
        },
        {
          label: "Reteach actions",
          value: d.stats.reteach_actions,
          icon: ClipboardCheck,
          tone: "blue",
          detail: "Small interventions, real intent",
        },
      ];
  return (
    <>
      <PageTitle
        title={
          isStudent
            ? `Your next step, ${user.full_name.split(" ")[0]}.`
            : isManagement
              ? "See the bigger picture."
              : `A clearer picture, ${user.full_name.split(" ")[0]}.`
        }
        description={
          isStudent
            ? "A little focused practice today. A little more confidence tomorrow."
            : isManagement
              ? "Your campus at a glance. The signals that deserve your attention."
              : "Here’s where your students are, and how you can help them move forward."
        }
      >
        {isStudent ? (
          <Link className="button primary" href="/student/practice">
            <Target size={16} />
            Start practicing
          </Link>
        ) : isManagement ? (
          <Link className="button primary" href="/mgmt/nlq">
            <Sparkles size={16} />
            Ask a question
          </Link>
        ) : (
          <Link className="button primary" href="/teacher/import">
            <Plus size={17} />
            Import test results
          </Link>
        )}
      </PageTitle>
      <div className="metrics-grid">
        {stats.map((stat) => (
          <div className="metric-card" key={stat.label}>
            <div className="metric-top">
              <span>{stat.label}</span>
              <span className={`metric-icon ${stat.tone}`}>
                <stat.icon size={18} />
              </span>
            </div>
            <div className="metric-value">{stat.value}</div>
            <div className="metric-detail">
              {"href" in stat ? (
                <Link href={stat.href!}>
                  {stat.detail}
                  <ArrowRight size={12} />
                </Link>
              ) : (
                <>
                  <span className={`tiny-dot ${stat.tone}`} />
                  {stat.detail}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="overview-middle">
        <Panel
          title={
            isStudent
              ? "Your progress, in perspective"
              : "Learning is moving forward"
          }
          subtitle="Subject-wise accuracy across completed weeks"
          action={<span className="badge neutral">Test performance</span>}
        >
          <div className="chart-legend">
            <span>
              <i className="phy" />
              Physics
            </span>
            <span>
              <i className="chem" />
              Chemistry
            </span>
            <span>
              <i className="math" />
              Mathematics
            </span>
          </div>
          {d.trend.length ? (
            <TrendChart data={d.trend} />
          ) : (
            <Empty
              title="Your story starts here"
              description="Test results will bring this chart to life."
            />
          )}
          <div className="chart-footer">
            <CircleArrowUp size={14} />
            Focus on the pattern, not a single test score.
            <span>{d.window.weeks} completed weeks</span>
          </div>
        </Panel>
        <aside className="insight-card">
          <div className="insight-label">
            <Sparkles size={16} />
            THE NEXT BEST STEP
          </div>
          <div className="insight-illustration">
            <div className="illustration-ring" />
            <Lightbulb size={43} strokeWidth={1.3} />
            <span className="sparkle-one">+</span>
            <span className="sparkle-two">+</span>
            <span className="small-orbit" />
          </div>
          <h2>
            {top
              ? `${top.topic_name} needs a little attention.`
              : "Good progress starts with a clear view."}
          </h2>
          <p>
            {top ? (
              <>
                <strong>
                  {Math.round(top.avg_mistake_rate * 100)}% of answers
                </strong>{" "}
                in this topic were incorrect.{" "}
                {isStudent
                  ? "A few targeted questions can help you find your footing."
                  : "A focused recap could help turn things around."}
              </>
            ) : (
              "Import your first test to find opportunities for targeted support."
            )}
          </p>
          {top && (
            <div className="insight-evidence">
              <span>{top.attempts} answers</span>
              <span className="separator-dot" />
              <span>{top.student_count} students</span>
            </div>
          )}
          {isStudent ? (
            <Link href="/student/practice" className="button insight-button">
              Build some confidence
              <ArrowRight size={16} />
            </Link>
          ) : isManagement ? (
            <Link href="/mgmt/nlq" className="button insight-button">
              Explore the numbers
              <ArrowRight size={16} />
            </Link>
          ) : (
            <button
              className="button insight-button"
              onClick={() => top && setTarget({ topic: top })}
              disabled={!top}
            >
              Plan an intervention
              <ArrowRight size={16} />
            </button>
          )}
          <small className="insight-footnote">
            Based on your test data, not an AI prediction
          </small>
        </aside>
      </div>
      <div className="overview-bottom">
        <Panel
          title={
            isStudent
              ? "Where to focus your energy"
              : "Topics worth a second look"
          }
          subtitle="Ranked by mistake rate · highest first"
          action={
            <ViewLink
              href={
                isStudent
                  ? "/student/weaknesses"
                  : isManagement
                    ? "/mgmt/nlq"
                    : "/teacher/topics"
              }
            >
              Explore topics
            </ViewLink>
          }
        >
          <TopicTable
            topics={d.topics.slice(0, 5)}
            compact
            onSelect={
              user.role === "teacher"
                ? (t) => setTarget({ topic: t })
                : undefined
            }
          />
        </Panel>
        {isStudent ? (
          <Panel title="Keep your momentum" subtitle="Your learning checklist">
            <div className="student-checklist">
              <Link href="/student/practice">
                <span className="mini-icon">
                  <Target size={21} />
                </span>
                <div>
                  <strong>Practice your weak concepts</strong>
                  <small>
                    {d.pending_recommendations} questions waiting for you
                  </small>
                </div>
                <ArrowRight size={17} />
              </Link>
              <Link href="/student/homework">
                <span className="mini-icon green">
                  <BookOpen size={21} />
                </span>
                <div>
                  <strong>Make room for homework</strong>
                  <small>{d.pending_homework} assignments to work on</small>
                </div>
                <ArrowRight size={17} />
              </Link>
              <div className="last-test">
                <span className="eyebrow">YOUR LAST TEST</span>
                <h3>{d.last_test?.name || "No tests yet"}</h3>
                {d.last_test && (
                  <>
                    <strong>
                      {d.last_test.correct}
                      <small> / {d.last_test.total} correct</small>
                    </strong>
                    <p>Each mistake is a useful starting point.</p>
                  </>
                )}
              </div>
            </div>
          </Panel>
        ) : (
          <Panel
            title="A little support can go a long way"
            subtitle="Lowest accuracy first · answered test questions"
            action={<span className="badge orange">Student focus</span>}
          >
            <div className="student-list">
              {d.students.slice(0, 4).map((s, i) => (
                <div className="student-list-row" key={s.id}>
                  <span className={`avatar avatar-${i}`}>
                    {initials(s.full_name)}
                  </span>
                  <div className="student-list-name">
                    <strong>{s.full_name}</strong>
                    <small>{s.weakest?.name || "No weak area recorded"}</small>
                  </div>
                  <span
                    className={`accuracy-tag ${s.accuracy < 40 ? "low" : ""}`}
                  >
                    {s.accuracy}%
                  </span>
                  {!isManagement && (
                    <button
                      className="icon-button"
                      aria-label={`Assign remedial to ${s.full_name}`}
                      onClick={() => setTarget({ learner: s })}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="panel-bottom">
              <span>
                <CheckCircle2 size={14} />
                Small steps make a difference.
              </span>
              <ViewLink href={isManagement ? "/mgmt/nlq" : "/teacher/weekly"}>
                {isManagement ? "Ask about students" : "View weekly mistakes"}
              </ViewLink>
            </div>
          </Panel>
        )}
      </div>
      {isManagement && !!d.pinned?.length && (
        <Panel
          title="Your pinned questions"
          subtitle="Recalculated from current data whenever this overview loads"
        >
          <div className="pinned-grid">
            {d.pinned.map((p) => (
              <div className="pinned-card" key={p.id}>
                <h3>{p.question_text}</h3>
                <p>{p.answer_text}</p>
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      await api(`/mgmt/nlq/${p.id}/pin`, undefined, "DELETE");
                      resource.reload();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Unpin
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {target && (
        <Intervention
          topic={target.topic}
          learner={target.learner}
          onClose={close}
          onSaved={() => {
            close();
            resource.reload();
          }}
        />
      )}
    </>
  );
}
