import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = os.environ.get(
    "JPI_DATABASE", str(Path(__file__).with_name("pragati.sqlite3"))
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('student','teacher','management')), is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_exam TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (
 batch_id TEXT REFERENCES batches(id), user_id TEXT REFERENCES users(id), joined_at TEXT NOT NULL,
 PRIMARY KEY(batch_id,user_id)
);
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, subject_id TEXT REFERENCES subjects(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subtopics (id TEXT PRIMARY KEY, topic_id TEXT REFERENCES topics(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS questions (
 id TEXT PRIMARY KEY, subtopic_id TEXT NOT NULL REFERENCES subtopics(id), stem TEXT NOT NULL,
 question_type TEXT NOT NULL CHECK(question_type IN ('mcq_single','mcq_multi','numeric','subjective')),
 options TEXT NOT NULL DEFAULT '[]', correct_answer TEXT NOT NULL, solution TEXT NOT NULL,
 difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
 source TEXT NOT NULL CHECK(source IN ('curated','llm_generated')), provenance TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tests (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id), name TEXT NOT NULL,
 test_type TEXT NOT NULL, scheduled_for TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_questions (
 test_id TEXT REFERENCES tests(id), question_id TEXT REFERENCES questions(id),
 position INTEGER NOT NULL, PRIMARY KEY(test_id,question_id), UNIQUE(test_id,position)
);
CREATE TABLE IF NOT EXISTS attempts (
 id TEXT PRIMARY KEY, test_id TEXT NOT NULL REFERENCES tests(id), student_id TEXT NOT NULL REFERENCES users(id),
 submitted_at TEXT NOT NULL, iso_year INTEGER NOT NULL, iso_week INTEGER NOT NULL CHECK(iso_week BETWEEN 1 AND 53),
 UNIQUE(test_id,student_id)
);
CREATE TABLE IF NOT EXISTS attempt_answers (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), question_id TEXT NOT NULL REFERENCES questions(id),
 student_answer TEXT, outcome TEXT NOT NULL CHECK(outcome IN ('correct','wrong','skipped')),
 time_taken_seconds INTEGER CHECK(time_taken_seconds >= 0), category_id TEXT REFERENCES subtopics(id),
 UNIQUE(attempt_id,question_id)
);
CREATE TABLE IF NOT EXISTS recommendations (
 id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id), root_answer_id TEXT NOT NULL REFERENCES attempt_answers(id),
 parent_id TEXT REFERENCES recommendations(id), depth INTEGER NOT NULL CHECK(depth BETWEEN 1 AND 3),
 question_id TEXT NOT NULL REFERENCES questions(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','attempted','skipped')),
 student_answer TEXT, was_correct INTEGER, time_taken_seconds INTEGER CHECK(time_taken_seconds >= 0),
 created_at TEXT NOT NULL, attempted_at TEXT,
 UNIQUE(student_id,question_id), UNIQUE(root_answer_id,question_id)
);
CREATE TRIGGER IF NOT EXISTS recommendation_depth BEFORE INSERT ON recommendations
WHEN (NEW.parent_id IS NULL AND NEW.depth != 1) OR (NEW.parent_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM recommendations p WHERE p.id=NEW.parent_id AND p.depth+1=NEW.depth
 AND p.root_answer_id=NEW.root_answer_id AND p.student_id=NEW.student_id
)) BEGIN SELECT RAISE(ABORT,'Invalid recommendation ancestry'); END;
CREATE TABLE IF NOT EXISTS homework (
 id TEXT PRIMARY KEY, assigner_id TEXT NOT NULL REFERENCES users(id), batch_id TEXT NOT NULL REFERENCES batches(id),
 student_id TEXT REFERENCES users(id), subtopic_id TEXT NOT NULL REFERENCES subtopics(id), name TEXT NOT NULL,
 due_date TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS homework_questions (
 homework_id TEXT REFERENCES homework(id), question_id TEXT REFERENCES questions(id), position INTEGER NOT NULL,
 PRIMARY KEY(homework_id,question_id), UNIQUE(homework_id,position)
);
CREATE TABLE IF NOT EXISTS homework_answers (
 homework_id TEXT NOT NULL, question_id TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES users(id),
 student_answer TEXT NOT NULL, was_correct INTEGER NOT NULL, time_taken_seconds INTEGER CHECK(time_taken_seconds >= 0),
 attempted_at TEXT NOT NULL, PRIMARY KEY(homework_id,question_id,student_id),
 FOREIGN KEY(homework_id,question_id) REFERENCES homework_questions(homework_id,question_id)
);
CREATE TABLE IF NOT EXISTS reteach_logs (
 id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id), batch_id TEXT NOT NULL REFERENCES batches(id),
 subtopic_id TEXT NOT NULL REFERENCES subtopics(id), note TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS papers (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id), created_by TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, total_questions INTEGER NOT NULL CHECK(total_questions BETWEEN 1 AND 100),
 llm_question_count INTEGER NOT NULL DEFAULT 0 CHECK(llm_question_count >= 0 AND llm_question_count*10 <= total_questions*3),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paper_items (
 paper_id TEXT REFERENCES papers(id), question_id TEXT REFERENCES questions(id), position INTEGER NOT NULL,
 PRIMARY KEY(paper_id,question_id), UNIQUE(paper_id,position)
);
CREATE TRIGGER IF NOT EXISTS paper_quota BEFORE INSERT ON paper_items
WHEN (SELECT COUNT(*) FROM paper_items WHERE paper_id=NEW.paper_id) >= (SELECT total_questions FROM papers WHERE id=NEW.paper_id)
 OR ((SELECT COUNT(*) FROM paper_items i JOIN questions q ON q.id=i.question_id WHERE i.paper_id=NEW.paper_id AND q.source='llm_generated')
 + (SELECT source='llm_generated' FROM questions WHERE id=NEW.question_id))*10 > (SELECT total_questions*3 FROM papers WHERE id=NEW.paper_id)
BEGIN SELECT RAISE(ABORT,'Paper quota exceeded'); END;
CREATE TRIGGER IF NOT EXISTS paper_count AFTER INSERT ON paper_items BEGIN
 UPDATE papers SET llm_question_count=(SELECT COUNT(*) FROM paper_items i JOIN questions q ON q.id=i.question_id WHERE i.paper_id=NEW.paper_id AND q.source='llm_generated') WHERE id=NEW.paper_id;
END;
CREATE TRIGGER IF NOT EXISTS paper_source_immutable BEFORE UPDATE OF source ON questions
WHEN EXISTS (SELECT 1 FROM paper_items WHERE question_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Paper question provenance is immutable'); END;
CREATE TRIGGER IF NOT EXISTS paper_items_immutable BEFORE UPDATE ON paper_items
BEGIN SELECT RAISE(ABORT,'Paper items are immutable'); END;
CREATE TRIGGER IF NOT EXISTS paper_items_no_delete BEFORE DELETE ON paper_items
BEGIN SELECT RAISE(ABORT,'Paper items are immutable'); END;
CREATE TRIGGER IF NOT EXISTS paper_count_verified BEFORE UPDATE OF llm_question_count ON papers
WHEN NEW.llm_question_count != (SELECT COUNT(*) FROM paper_items i JOIN questions q ON q.id=i.question_id WHERE i.paper_id=NEW.id AND q.source='llm_generated')
BEGIN SELECT RAISE(ABORT,'Paper source count must match its items'); END;
CREATE TRIGGER IF NOT EXISTS paper_total_immutable BEFORE UPDATE OF total_questions ON papers
WHEN NEW.total_questions != OLD.total_questions AND EXISTS (SELECT 1 FROM paper_items WHERE paper_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Paper composition is immutable'); END;
CREATE TRIGGER IF NOT EXISTS publish_complete BEFORE UPDATE OF status ON papers
WHEN NEW.status='published' AND (SELECT COUNT(*) FROM paper_items WHERE paper_id=NEW.id)!=NEW.total_questions
BEGIN SELECT RAISE(ABORT,'Incomplete paper'); END;
CREATE TABLE IF NOT EXISTS nlq_queries (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), question_text TEXT NOT NULL,
 generated_sql TEXT, parameters TEXT, answer_text TEXT, rows_json TEXT, was_blocked INTEGER NOT NULL DEFAULT 0,
 block_reason TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pinned_queries (
 user_id TEXT REFERENCES users(id), query_id TEXT REFERENCES nlq_queries(id), PRIMARY KEY(user_id,query_id)
);
CREATE INDEX IF NOT EXISTS idx_attempts_date ON attempts(submitted_at,test_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_recs_student ON recommendations(student_id,status);
CREATE INDEX IF NOT EXISTS idx_questions_subtopic ON questions(subtopic_id,difficulty);
"""


@contextmanager
def connect(write=False):
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    if write:
        db.execute("BEGIN IMMEDIATE")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize():
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)


def rows(db, sql, params=()):
    return [dict(row) for row in db.execute(sql, params).fetchall()]


def one(db, sql, params=()):
    row = db.execute(sql, params).fetchone()
    return dict(row) if row else None
