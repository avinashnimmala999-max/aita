"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Database,
  History,
  Pin,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Report, api, formatDate, useResource } from "./api";
import {
  Empty,
  ErrorState,
  Loading,
  PageTitle,
  Panel,
  SearchInput,
  useApp,
  useMutation,
} from "./ui";

const suggestions = [
  "How many students are weak in Organic?",
  "Which topic has the highest mistake rate?",
  "Which students are underperforming recently?",
];
type HistoryItem = {
  id: string;
  question_text: string;
  answer_text: string | null;
  was_blocked: boolean;
  block_reason: string | null;
  created_at: string;
};

export function NLQPage() {
  const { notify } = useApp();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Report | null>(null);
  const [asked, setAsked] = useState("");
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(false);
  const history = useResource<HistoryItem[]>("/mgmt/nlq/history");
  const { busy, error, run } = useMutation();
  const ask = (text: string) =>
    run(async () => {
      setResult(null);
      setQuestion(text);
      setAsked(text);
      setPinned(false);
      try {
        setResult(await api<Report>("/mgmt/nlq", { question: text }));
      } finally {
        history.reload();
      }
    });
  return (
    <>
      <PageTitle
        eyebrow="LESS DIGGING. MORE UNDERSTANDING."
        title="Good questions move us forward."
        description="Explore the numbers behind your campus, with a clear trail from question to answer."
      />
      <div className="nlq-layout">
        <div>
          <section className="nlq-composer">
            <div className="nlq-heading">
              <span className="mini-icon">
                <Sparkles size={22} />
              </span>
              <div>
                <h2>Ask Pragati</h2>
                <p>Your academic intelligence workspace</p>
              </div>
              <span className="badge neutral">Local reports</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <textarea
                aria-label="Management question"
                placeholder="What would you like to understand about your students?"
                value={question}
                maxLength={500}
                minLength={3}
                required
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
              />
              <div className="composer-footer">
                <span>
                  <ShieldCheck size={14} />
                  Read-only, parameterized reports
                </span>
                <button
                  className="button primary"
                  disabled={busy || question.trim().length < 3}
                >
                  {busy ? "Reading your data…" : "Ask question"}
                  <Send size={15} />
                </button>
              </div>
            </form>
            <div className="suggested-questions">
              <span>START WITH A QUESTION</span>
              {suggestions.map((s, i) => (
                <button key={s} disabled={busy} onClick={() => ask(s)}>
                  <span>0{i + 1}</span>
                  {s}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </section>
          <div className="info-strip">
            <Database size={18} />
            <p>
              This local build supports the three suggested reports exactly.
              Custom natural-language queries need the production AI
              integration. No generated SQL is executed here.
            </p>
          </div>
          {error && <ErrorState error={error} />}
          {result && (
            <section className="nlq-result">
              <div className="result-eyebrow">
                <span>
                  <Sparkles size={15} />
                  HERE’S WHAT THE DATA SAYS
                </span>
                <button
                  className="button secondary small"
                  disabled={pinned || busy}
                  onClick={() =>
                    run(async () => {
                      await api(`/mgmt/nlq/${result.nlq_query_id}/pin`, {});
                      setPinned(true);
                      notify(
                        "Pinned to your overview. Numbers refresh when the page loads.",
                      );
                    })
                  }
                >
                  {pinned ? <Check size={14} /> : <Pin size={14} />}
                  {pinned ? "Pinned" : "Pin to overview"}
                </button>
              </div>
              <h3>{asked}</h3>
              <p className="answer-text">{result.answer_text}</p>
              <div className="result-meta">
                <Check size={13} />
                Saved to audit history
                <span>4 completed ISO weeks · Asia/Kolkata</span>
              </div>
              <details open>
                <summary>
                  <Database size={15} />
                  Underlying data<span>{result.rows.length} rows</span>
                </summary>
                {result.rows.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {Object.keys(result.rows[0]).map((key) => (
                            <th key={key}>{key.replaceAll("_", " ")}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i}>
                            {Object.entries(row).map(([key, val]) => (
                              <td key={key}>{String(val)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No matching records.</p>
                )}
              </details>
              <details>
                <summary>
                  <Code2 size={16} />
                  Executed SQL & parameters
                </summary>
                <div className="sql-toolbar">
                  <span>SQLite · read-only report</span>
                  <button
                    className="text-link"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${result.sql}\nParameters: ${JSON.stringify(result.parameters)}`,
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        notify(
                          "Clipboard unavailable. Select and copy the SQL below.",
                        );
                      }
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre>{result.sql}</pre>
                <div className="sql-params">
                  <strong>Bound parameters</strong>
                  <code>{JSON.stringify(result.parameters)}</code>
                </div>
              </details>
            </section>
          )}
        </div>
        <aside className="history-panel">
          <div className="history-title">
            <History size={18} />
            <h2>Your recent questions</h2>
          </div>
          <p>Every request leaves a trace, including blocked questions.</p>
          {history.loading ? (
            <Loading />
          ) : history.error ? (
            <ErrorState error={history.error} retry={history.reload} />
          ) : !history.data?.length ? (
            <Empty
              title="Start a conversation with your data"
              description="Your query history will appear here."
            />
          ) : (
            <div className="history-list">
              {history.data.map((h) => (
                <button
                  key={h.id}
                  disabled={busy}
                  onClick={() => {
                    setQuestion(h.question_text);
                    if (!h.was_blocked) ask(h.question_text);
                  }}
                >
                  <div>
                    <span
                      className={`history-status ${h.was_blocked ? "blocked" : ""}`}
                    />
                    {formatDate(h.created_at)}
                  </div>
                  <strong>{h.question_text}</strong>
                  {h.was_blocked ? (
                    <small>Blocked · unsupported local report</small>
                  ) : (
                    <small>{h.answer_text}</small>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

type ReteachLog = {
  id: string;
  teacher_name: string;
  batch_name: string;
  subtopic_name: string;
  note: string;
  created_at: string;
};

export function ReteachPage() {
  const data = useResource<ReteachLog[]>("/mgmt/reteach-log");
  const [search, setSearch] = useState("");
  const [teacher, setTeacher] = useState("all");
  const filtered =
    data.data?.filter(
      (r) =>
        (teacher === "all" || r.teacher_name === teacher) &&
        `${r.subtopic_name} ${r.batch_name} ${r.note}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <PageTitle
        eyebrow="THE WORK BEHIND THE PROGRESS"
        title="Teaching that meets the moment."
        description="A record of the concepts your teachers are revisiting, and the students they’re supporting."
      />
      <Panel
        title="Reteach activity"
        subtitle="An event log, not a teacher performance ranking"
      >
        <div className="table-toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search subtopic, batch, or note…"
          />
          <select
            className="compact-select"
            aria-label="Filter by teacher"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="all">All teachers</option>
            {Array.from(new Set(data.data?.map((r) => r.teacher_name))).map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </div>
        {data.loading ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={data.reload} />
        ) : !filtered.length ? (
          <Empty
            title="No matching activity"
            description="Try another filter. New teacher reteach logs appear here when saved."
          />
        ) : (
          <div className="table-scroll">
            <table className="reteach-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Teacher & batch</th>
                  <th>Subtopic</th>
                  <th>What was revisited</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{formatDate(r.created_at)}</td>
                    <td>
                      <strong>{r.teacher_name}</strong>
                      <small className="cell-sub">{r.batch_name}</small>
                    </td>
                    <td>
                      <span className="badge subject-chem">
                        {r.subtopic_name}
                      </span>
                    </td>
                    <td>
                      {r.note || <span className="muted">No note added</span>}
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
