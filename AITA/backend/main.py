import csv
import hashlib
import io
import json
import os
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from db import connect, initialize, one, rows
from domain import (
    BASE,
    analytics,
    fail,
    grade,
    owns_batch,
    paper_plan,
    public_question,
    recommend,
    run_report,
    scope,
    uid,
    week_bounds,
)
from seed import IST, now, seed_database


@asynccontextmanager
async def lifespan(app):
    if os.environ.get("JPI_MODE", "local") != "local":
        raise RuntimeError(
            "This build supports local demo mode only. Production authentication is not configured."
        )
    initialize()
    seed_database()
    yield


app = FastAPI(title="Pragati · JEE Intelligence", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def protect_mutations(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        allowed_origins = {
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            os.environ.get("JPI_FRONTEND_ORIGIN", "http://127.0.0.1:3000"),
        }
        if request.headers.get("x-jpi-request") != "1" or (
            origin and origin not in allowed_origins
        ):
            return JSONResponse(
                {
                    "error": {
                        "code": "FORBIDDEN",
                        "message": "Cross-origin mutation rejected.",
                    }
                },
                status_code=403,
            )
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {
            "error": exc.detail
            if isinstance(exc.detail, dict)
            else {"code": "ERROR", "message": str(exc.detail)}
        },
        status_code=exc.status_code,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Check the submitted fields.",
                "details": [
                    {"field": ".".join(map(str, e["loc"])), "message": e["msg"]}
                    for e in exc.errors()
                ],
            }
        },
        status_code=422,
    )


def current_user(request: Request):
    token = request.cookies.get("jpi_session", "")
    digest = hashlib.sha256(token.encode()).hexdigest()
    with connect() as db:
        user = one(
            db,
            "SELECT u.id,u.full_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1",
            (digest, now()),
        )
    if not user:
        fail("AUTH_REQUIRED", "Choose a demo profile to continue.", 401)
    return user


def require(role):
    def dependency(user=Depends(current_user)):
        if user["role"] != role:
            fail("FORBIDDEN", "This page is not available for your role.", 403)
        return user

    return dependency


Teacher = Depends(require("teacher"))
Student = Depends(require("student"))
Management = Depends(require("management"))


def selected_window(weeks: int = Query(4)):
    if weeks not in {2, 4, 8}:
        fail("VALIDATION_ERROR", "Choose 2, 4, or 8 completed weeks.")
    return weeks


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Model):
    profile: Literal["teacher", "student", "management"]


class Answer(Model):
    student_answer: dict
    time_taken_seconds: int = Field(default=0, ge=0, le=86400)


class Homework(Model):
    batch_id: str
    student_id: str | None = None
    subtopic_id: str
    count: int = Field(default=3, ge=1, le=30)
    difficulty: int = Field(default=3, ge=1, le=5)
    due_date: date | None = None


class Reteach(Model):
    batch_id: str
    subtopic_id: str
    note: str = Field(default="", max_length=1000)


class Composition(Model):
    subtopic_id: str
    count: int = Field(ge=1, le=100)
    difficulty: int = Field(default=3, ge=1, le=5)


class Paper(Model):
    batch_id: str
    name: str = Field(min_length=3, max_length=150)
    total_questions: int = Field(ge=1, le=100)
    composition: list[Composition] = Field(min_length=1, max_length=20)
    allow_llm: bool = False


class NLQ(Model):
    question: str = Field(min_length=3, max_length=500)


class Category(Model):
    subtopic_id: str


class ManualRecord(Model):
    student_email: str = Field(max_length=254)
    question_id: str = Field(max_length=100)
    student_answer: dict | None
    time_taken_seconds: int = Field(default=0, ge=0, le=86400)


class ManualImport(Model):
    test_id: str
    records: list[ManualRecord] = Field(min_length=1, max_length=5000)
    preview: bool = False


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "local", "ai_enabled": False, "sample_data": True}


@app.post("/api/auth/demo")
def login(data: Login, request: Request, response: Response):
    profiles = {
        "teacher": "teacher-priya",
        "student": "student-01",
        "management": "management-raj",
    }
    token = secrets.token_urlsafe(32)
    with connect(write=True) as db:
        old = hashlib.sha256(
            request.cookies.get("jpi_session", "").encode()
        ).hexdigest()
        db.execute(
            "DELETE FROM sessions WHERE token_hash=? OR expires_at<?", (old, now())
        )
        db.execute(
            "INSERT INTO sessions VALUES (?,?,?)",
            (
                hashlib.sha256(token.encode()).hexdigest(),
                profiles[data.profile],
                (datetime.now(IST) + timedelta(hours=12)).isoformat(),
            ),
        )
    response.set_cookie(
        "jpi_session", token, httponly=True, samesite="strict", max_age=43200, path="/"
    )
    return {"role": data.profile, "mode": "local"}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, user=Depends(current_user)):
    with connect(write=True) as db:
        db.execute(
            "DELETE FROM sessions WHERE token_hash=?",
            (
                hashlib.sha256(
                    request.cookies.get("jpi_session", "").encode()
                ).hexdigest(),
            ),
        )
    response.delete_cookie("jpi_session", path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    with connect() as db:
        batches = rows(
            db,
            "SELECT b.* FROM batches b JOIN memberships m ON m.batch_id=b.id WHERE m.user_id=?",
            (user["id"],),
        )
    last_week = (datetime.now(IST).date() - timedelta(weeks=1)).isocalendar()
    return {
        **user,
        "batches": batches,
        "mode": "local",
        "default_week": f"{last_week.year}-W{last_week.week:02d}",
        "today": datetime.now(IST).date().isoformat(),
    }


@app.get("/api/taxonomy")
def taxonomy(user=Depends(current_user)):
    with connect() as db:
        return {
            "subjects": rows(db, "SELECT * FROM subjects"),
            "topics": rows(db, "SELECT * FROM topics"),
            "subtopics": rows(
                db,
                "SELECT s.*,t.name AS topic_name,t.subject_id,(SELECT COUNT(*) FROM questions q WHERE q.subtopic_id=s.id AND q.source='curated') AS bank_count FROM subtopics s JOIN topics t ON t.id=s.topic_id ORDER BY t.name,s.name",
            ),
        }


@app.get("/api/teacher/batches")
def batches(user=Teacher):
    with connect() as db:
        return rows(
            db,
            "SELECT b.*,(SELECT COUNT(*) FROM memberships m2 JOIN users u ON u.id=m2.user_id WHERE m2.batch_id=b.id AND u.role='student' AND u.is_active=1) AS student_count FROM batches b JOIN memberships m ON m.batch_id=b.id WHERE m.user_id=?",
            (user["id"],),
        )


@app.get("/api/teacher/batches/{batch_id}/dashboard")
def dashboard(batch_id: str, weeks: int = Depends(selected_window), user=Teacher):
    with connect() as db:
        return analytics(db, user, batch_id, weeks)


@app.get("/api/teacher/batches/{batch_id}/topic-mistake-rates")
def topic_rates(batch_id: str, weeks: int = Depends(selected_window), user=Teacher):
    with connect() as db:
        data = analytics(db, user, batch_id, weeks)
        return {"rows": data["topics"], "window": data["window"]}


@app.get("/api/teacher/batches/{batch_id}/weekly-mistakes")
def weekly(batch_id: str, iso_year: int, iso_week: int, user=Teacher):
    start, end = week_bounds(iso_year, iso_week)
    with connect() as db:
        clause, params = scope(db, user, batch_id)
        data = rows(
            db,
            "SELECT u.id AS student_id,u.full_name,aa.category_id,s2.name AS subtopic_name,tp2.id AS topic_id,tp2.name AS topic_name,COUNT(*) AS count "
            + BASE
            + " LEFT JOIN subtopics s2 ON s2.id=aa.category_id LEFT JOIN topics tp2 ON tp2.id=s2.topic_id"
            + f" WHERE {clause} AND a.submitted_at>=? AND a.submitted_at<? AND aa.outcome='wrong' AND u.is_active=1 GROUP BY u.id,aa.category_id ORDER BY u.full_name,count DESC",
            [*params, start, end],
        )
        students = {}
        for item in data:
            student = students.setdefault(
                item["student_id"],
                {
                    "student_id": item["student_id"],
                    "full_name": item["full_name"],
                    "categories": [],
                    "total_wrong": 0,
                    "uncategorized_count": 0,
                },
            )
            student["total_wrong"] += item["count"]
            if item["category_id"]:
                student["categories"].append(item)
            else:
                student["uncategorized_count"] += item["count"]
        for student in students.values():
            student["joined_this_week"] = bool(
                one(
                    db,
                    "SELECT 1 FROM memberships WHERE user_id=? AND joined_at>=? AND joined_at<?"
                    + (
                        " AND batch_id=?"
                        if batch_id != "all"
                        else " AND batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?)"
                    ),
                    [
                        student["student_id"],
                        start,
                        end,
                        batch_id if batch_id != "all" else user["id"],
                    ],
                )
            )
        return {
            "rows": sorted(students.values(), key=lambda s: -s["total_wrong"]),
            "iso_year": iso_year,
            "iso_week": iso_week,
        }


@app.get("/api/teacher/batches/{batch_id}/uncategorized")
def uncategorized(batch_id: str, user=Teacher):
    with connect() as db:
        clause, params = scope(db, user, batch_id)
        return rows(
            db,
            "SELECT aa.id,q.stem,u.full_name,q.subtopic_id,t.name AS test_name "
            + BASE
            + f" WHERE {clause} AND aa.outcome='wrong' AND aa.category_id IS NULL ORDER BY a.submitted_at DESC LIMIT 200",
            params,
        )


@app.post("/api/teacher/answers/{answer_id}/categorize")
def categorize(answer_id: str, data: Category, user=Teacher):
    with connect(write=True) as db:
        answer = one(
            db,
            "SELECT aa.*,a.student_id,t.batch_id FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id JOIN tests t ON t.id=a.test_id WHERE aa.id=?",
            (answer_id,),
        )
        if not answer:
            fail("NOT_FOUND", "Answer not found.", 404)
        owns_batch(db, user, answer["batch_id"])
        if answer["category_id"] or answer["outcome"] != "wrong":
            fail("CONFLICT", "This answer is not awaiting categorization.", 409)
        if not one(db, "SELECT 1 FROM subtopics WHERE id=?", (data.subtopic_id,)):
            fail("VALIDATION_ERROR", "Unknown subtopic.")
        db.execute(
            "UPDATE attempt_answers SET category_id=? WHERE id=?",
            (data.subtopic_id, answer_id),
        )
        count = recommend(db, answer["student_id"], answer_id, answer["question_id"])
        return {"ok": True, "recommendations_created": count}


@app.post("/api/teacher/reteach")
def reteach(data: Reteach, user=Teacher):
    with connect(write=True) as db:
        owns_batch(db, user, data.batch_id)
        if not one(db, "SELECT 1 FROM subtopics WHERE id=?", (data.subtopic_id,)):
            fail("VALIDATION_ERROR", "Unknown subtopic.")
        key = uid()
        db.execute(
            "INSERT INTO reteach_logs VALUES (?,?,?,?,?,?)",
            (key, user["id"], data.batch_id, data.subtopic_id, data.note, now()),
        )
        return {"id": key}


@app.post("/api/teacher/homework/{kind}")
def assign_homework(kind: Literal["remedial", "class"], data: Homework, user=Teacher):
    with connect(write=True) as db:
        owns_batch(db, user, data.batch_id)
        if kind == "remedial":
            if not data.student_id or not one(
                db,
                "SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.batch_id=? AND u.role='student' AND u.is_active=1",
                (data.student_id, data.batch_id),
            ):
                fail("FORBIDDEN", "Choose an active student in this batch.", 403)
        elif data.student_id is not None:
            fail(
                "VALIDATION_ERROR",
                "Class homework cannot target an individual student.",
            )
        sub = one(db, "SELECT name FROM subtopics WHERE id=?", (data.subtopic_id,))
        if not sub:
            fail("VALIDATION_ERROR", "Unknown subtopic.")
        questions = rows(
            db,
            "SELECT id FROM questions WHERE subtopic_id=? AND abs(difficulty-?)<=1 AND source='curated' ORDER BY abs(difficulty-?),id LIMIT ?",
            (data.subtopic_id, data.difficulty, data.difficulty, data.count),
        )
        if len(questions) < data.count:
            fail(
                "LLM_UNAVAILABLE",
                f"Only {len(questions)} bank questions are available. AI generation is not enabled in local mode; reduce the count or choose another subtopic.",
                503,
            )
        if data.due_date and data.due_date < datetime.now(IST).date():
            fail("VALIDATION_ERROR", "The due date cannot be in the past.")
        key = uid()
        db.execute(
            "INSERT INTO homework VALUES (?,?,?,?,?,?,?,?)",
            (
                key,
                user["id"],
                data.batch_id,
                data.student_id,
                data.subtopic_id,
                f"{sub['name']} · {'Remedial practice' if kind == 'remedial' else 'Class homework'}",
                data.due_date.isoformat() if data.due_date else None,
                now(),
            ),
        )
        db.executemany(
            "INSERT INTO homework_questions VALUES (?,?,?)",
            [(key, q["id"], p + 1) for p, q in enumerate(questions)],
        )
        return {"homework_id": key, "count": len(questions), "source": "sample_bank"}


@app.get("/api/teacher/homework")
def teacher_homework(batch_id: str = "all", user=Teacher):
    with connect() as db:
        if batch_id != "all":
            owns_batch(db, user, batch_id)
        return rows(
            db,
            "SELECT h.*,s.name AS subtopic_name,b.name AS batch_name,u.full_name AS student_name,(SELECT COUNT(*) FROM homework_questions WHERE homework_id=h.id) AS question_count,(SELECT COUNT(*) FROM homework_answers WHERE homework_id=h.id) AS answers_submitted FROM homework h JOIN subtopics s ON s.id=h.subtopic_id JOIN batches b ON b.id=h.batch_id LEFT JOIN users u ON u.id=h.student_id WHERE h.batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?)"
            + (" AND h.batch_id=?" if batch_id != "all" else "")
            + " ORDER BY h.created_at DESC",
            [user["id"], *([batch_id] if batch_id != "all" else [])],
        )


@app.post("/api/teacher/question-papers/dry-run")
def dry_run(data: Paper, user=Teacher):
    with connect() as db:
        owns_batch(db, user, data.batch_id)
        plan = paper_plan(db, data)
        return {k: v for k, v in plan.items() if k != "selected"}


@app.post("/api/teacher/question-papers")
def create_paper(data: Paper, user=Teacher):
    with connect(write=True) as db:
        owns_batch(db, user, data.batch_id)
        plan = paper_plan(db, data)
        if plan["over_budget"]:
            fail(
                "LLM_QUOTA_EXCEEDED",
                f"At most {plan['llm_budget']} of {data.total_questions} questions may be LLM-generated. Composition requires {plan['llm_question_count']} LLM questions.",
                details={
                    "allowed": plan["llm_budget"],
                    "required": plan["llm_question_count"],
                },
            )
        if plan["llm_question_count"]:
            fail(
                "LLM_UNAVAILABLE" if data.allow_llm else "BANK_INSUFFICIENT",
                "The bank cannot cover this composition. AI generation is not enabled in local mode.",
                503 if data.allow_llm else 422,
            )
        key = uid()
        db.execute(
            "INSERT INTO papers(id,batch_id,created_by,name,total_questions,created_at) VALUES (?,?,?,?,?,?)",
            (key, data.batch_id, user["id"], data.name, data.total_questions, now()),
        )
        db.executemany(
            "INSERT INTO paper_items VALUES (?,?,?)",
            [(key, q, i + 1) for i, q in enumerate(plan["selected"])],
        )
        return {"paper_id": key, **{k: v for k, v in plan.items() if k != "selected"}}


@app.get("/api/teacher/question-papers")
def papers(user=Teacher):
    with connect() as db:
        return rows(
            db,
            "SELECT p.*,b.name AS batch_name FROM papers p JOIN batches b ON b.id=p.batch_id WHERE p.batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?) ORDER BY p.created_at DESC",
            (user["id"],),
        )


@app.get("/api/teacher/question-papers/{paper_id}")
def get_paper(paper_id: str, user=Teacher):
    with connect() as db:
        paper = one(db, "SELECT * FROM papers WHERE id=?", (paper_id,))
        if not paper:
            fail("NOT_FOUND", "Paper not found.", 404)
        owns_batch(db, user, paper["batch_id"])
        paper["items"] = [
            {
                **public_question(q),
                "position": q["position"],
                "correct_answer": json.loads(q["correct_answer"]),
                "solution": q["solution"],
            }
            for q in rows(
                db,
                "SELECT q.*,i.position FROM paper_items i JOIN questions q ON q.id=i.question_id WHERE i.paper_id=? ORDER BY i.position",
                (paper_id,),
            )
        ]
        return paper


@app.post("/api/teacher/question-papers/{paper_id}/publish")
def publish(paper_id: str, user=Teacher):
    with connect(write=True) as db:
        paper = one(db, "SELECT * FROM papers WHERE id=?", (paper_id,))
        if not paper:
            fail("NOT_FOUND", "Paper not found.", 404)
        owns_batch(db, user, paper["batch_id"])
        if paper["status"] == "published":
            fail("CONFLICT", "This paper is already published.", 409)
        db.execute("UPDATE papers SET status='published' WHERE id=?", (paper_id,))
        test_id = uid()
        db.execute(
            "INSERT INTO tests VALUES (?,?,?,?,?)",
            (
                test_id,
                paper["batch_id"],
                paper["name"],
                "custom",
                datetime.now(IST).date().isoformat(),
            ),
        )
        db.execute(
            "INSERT INTO test_questions SELECT ?,question_id,position FROM paper_items WHERE paper_id=?",
            (test_id, paper_id),
        )
        return {"test_id": test_id, "status": "published"}


@app.get("/api/teacher/tests")
def tests(batch_id: str, user=Teacher):
    with connect() as db:
        owns_batch(db, user, batch_id)
        return rows(
            db,
            "SELECT t.*,(SELECT COUNT(*) FROM attempts a WHERE a.test_id=t.id) AS submissions FROM tests t WHERE batch_id=? ORDER BY scheduled_for DESC",
            (batch_id,),
        )


@app.get("/api/teacher/tests/{test_id}/template")
def template(test_id: str, user=Teacher):
    with connect() as db:
        test = one(db, "SELECT * FROM tests WHERE id=?", (test_id,))
        if not test:
            fail("NOT_FOUND", "Test not found.", 404)
        owns_batch(db, user, test["batch_id"])
        questions = rows(
            db,
            "SELECT q.id,q.stem FROM test_questions tq JOIN questions q ON q.id=tq.question_id WHERE tq.test_id=? ORDER BY tq.position",
            (test_id,),
        )
        students = rows(
            db,
            "SELECT u.id,u.full_name,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.batch_id=? AND u.role='student' AND u.is_active=1 ORDER BY u.full_name",
            (test["batch_id"],),
        )
        return {
            "questions": questions,
            "students": students,
            "columns": [
                "student_email",
                "question_id",
                "student_answer",
                "is_correct",
                "time_taken_seconds",
            ],
        }


def import_records(db, user, test_id, records, preview):
    test = one(db, "SELECT * FROM tests WHERE id=?", (test_id,))
    if not test:
        fail("NOT_FOUND", "Test not found.", 404)
    owns_batch(db, user, test["batch_id"])
    if not records or len(records) > 5000:
        fail("VALIDATION_ERROR", "Import between 1 and 5,000 rows.")
    errors, prepared, seen = [], [], set()
    for number, record in enumerate(records, 2):
        try:
            student = one(
                db,
                "SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE lower(u.email)=? AND m.batch_id=? AND u.role='student' AND u.is_active=1",
                (
                    str(record.get("student_email", "")).strip().lower(),
                    test["batch_id"],
                ),
            )
            if not student:
                fail(
                    "VALIDATION_ERROR", "Student is not an active member of this batch."
                )
            question = one(
                db,
                "SELECT q.* FROM questions q JOIN test_questions tq ON tq.question_id=q.id WHERE tq.test_id=? AND q.id=?",
                (test_id, record.get("question_id")),
            )
            if not question:
                fail("VALIDATION_ERROR", "Question is not part of this test.")
            key = (student["id"], question["id"])
            if key in seen or one(
                db,
                "SELECT 1 FROM attempts a JOIN attempt_answers aa ON aa.attempt_id=a.id WHERE a.test_id=? AND a.student_id=? AND aa.question_id=?",
                (test_id, *key),
            ):
                fail(
                    "CONFLICT",
                    "Duplicate answer: this student/question pair already exists.",
                )
            seen.add(key)
            raw = record.get("student_answer")
            answer = (
                json.loads(raw)
                if isinstance(raw, str) and raw.strip().startswith("{")
                else (
                    {"option_label": raw.strip().upper()}
                    if isinstance(raw, str) and raw.strip()
                    else raw
                )
            )
            if answer in (None, ""):
                answer, outcome = None, "skipped"
            else:
                outcome = "correct" if grade(question, answer) else "wrong"
            claimed = str(record.get("is_correct", "")).lower().strip()
            if claimed and (
                claimed not in {"true", "false", "1", "0"}
                or (claimed in {"true", "1"}) != (outcome == "correct")
            ):
                fail(
                    "VALIDATION_ERROR",
                    "Provided is_correct disagrees with server grading.",
                )
            seconds = int(record.get("time_taken_seconds") or 0)
            if not 0 <= seconds <= 86400:
                fail("VALIDATION_ERROR", "Time must be between 0 and 86400 seconds.")
            prepared.append(
                {
                    "student_id": student["id"],
                    "question": question,
                    "answer": answer,
                    "outcome": outcome,
                    "seconds": seconds,
                }
            )
        except (HTTPException, ValueError, TypeError) as exc:
            errors.append(
                {
                    "row": number,
                    "message": exc.detail["message"]
                    if isinstance(exc, HTTPException)
                    else "Invalid answer JSON or time value.",
                }
            )
    if errors:
        fail(
            "VALIDATION_ERROR",
            f"Import rejected: {len(errors)} invalid row(s). Nothing was saved.",
            details=errors,
        )
    result = {
        "row_count": len(prepared),
        "correct": sum(r["outcome"] == "correct" for r in prepared),
        "wrong": sum(r["outcome"] == "wrong" for r in prepared),
        "skipped": sum(r["outcome"] == "skipped" for r in prepared),
        "preview": preview,
        "rows": [
            {
                "student_id": r["student_id"],
                "question_id": r["question"]["id"],
                "outcome": r["outcome"],
            }
            for r in prepared[:20]
        ],
    }
    if preview:
        return result
    when = datetime.combine(
        date.fromisoformat(test["scheduled_for"]), datetime.min.time(), IST
    ).replace(hour=12)
    iso = when.isocalendar()
    for record in prepared:
        existing = one(
            db,
            "SELECT id FROM attempts WHERE test_id=? AND student_id=?",
            (test_id, record["student_id"]),
        )
        aid = existing["id"] if existing else uid()
        if not existing:
            db.execute(
                "INSERT INTO attempts VALUES (?,?,?,?,?,?)",
                (
                    aid,
                    test_id,
                    record["student_id"],
                    when.isoformat(),
                    iso.year,
                    iso.week,
                ),
            )
        aa_id = uid()
        q = record["question"]
        db.execute(
            "INSERT INTO attempt_answers VALUES (?,?,?,?,?,?,?)",
            (
                aa_id,
                aid,
                q["id"],
                json.dumps(record["answer"]),
                record["outcome"],
                record["seconds"],
                q["subtopic_id"] if record["outcome"] != "skipped" else None,
            ),
        )
        if record["outcome"] == "wrong":
            recommend(db, record["student_id"], aa_id, q["id"])
    return result


@app.post("/api/teacher/attempts/import")
async def import_csv(
    file: UploadFile = File(...),
    test_id: str = Form(...),
    preview: bool = Form(False),
    user=Teacher,
):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        fail("VALIDATION_ERROR", "CSV files must be at most 2 MB.")
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), strict=True)
        required = {"student_email", "question_id", "student_answer"}
        if (
            not reader.fieldnames
            or not required.issubset(reader.fieldnames)
            or len(set(reader.fieldnames)) != len(reader.fieldnames)
        ):
            fail(
                "VALIDATION_ERROR",
                "CSV requires unique headers: student_email, question_id, student_answer.",
            )
        records = list(reader)
        if any(None in r or any(v is None for v in r.values()) for r in records):
            fail("VALIDATION_ERROR", "CSV row widths do not match the headers.")
    except (UnicodeDecodeError, csv.Error):
        fail("VALIDATION_ERROR", "Upload a valid UTF-8 CSV file.")
    with connect(write=True) as db:
        return import_records(db, user, test_id, records, preview)


@app.post("/api/teacher/attempts/manual")
def manual(data: ManualImport, user=Teacher):
    with connect(write=True) as db:
        return import_records(
            db, user, data.test_id, [r.model_dump() for r in data.records], data.preview
        )


def student_homeworks(db, user):
    return rows(
        db,
        "SELECT h.*,s.name AS subtopic_name,u.full_name AS teacher_name,(SELECT COUNT(*) FROM homework_questions WHERE homework_id=h.id) AS question_count,(SELECT COUNT(*) FROM homework_answers WHERE homework_id=h.id AND student_id=?) AS attempted_count FROM homework h JOIN subtopics s ON s.id=h.subtopic_id JOIN users u ON u.id=h.assigner_id WHERE (h.student_id=? OR (h.student_id IS NULL AND h.batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?))) ORDER BY h.created_at DESC",
        (user["id"], user["id"], user["id"]),
    )


@app.get("/api/student/dashboard")
def student_dashboard(user=Student):
    with connect() as db:
        data = analytics(db, user)
        data["pending_recommendations"] = one(
            db,
            "SELECT COUNT(*) AS n FROM recommendations WHERE student_id=? AND status='pending'",
            (user["id"],),
        )["n"]
        data["pending_homework"] = sum(
            h["attempted_count"] < h["question_count"]
            for h in student_homeworks(db, user)
        )
        data["last_test"] = one(
            db,
            "SELECT t.name,a.submitted_at,COUNT(*) AS total,SUM(aa.outcome='correct') AS correct,SUM(aa.outcome='wrong') AS wrong,SUM(aa.outcome='skipped') AS skipped FROM attempts a JOIN tests t ON t.id=a.test_id JOIN attempt_answers aa ON aa.attempt_id=a.id WHERE a.student_id=? GROUP BY a.id ORDER BY a.submitted_at DESC LIMIT 1",
            (user["id"],),
        )
        return data


@app.get("/api/student/weaknesses")
def weaknesses(weeks: int = Depends(selected_window), user=Student):
    with connect() as db:
        data = analytics(db, user, weeks=weeks)
        data["answers"] = rows(
            db,
            "SELECT aa.id,q.stem,aa.outcome,tp.id AS topic_id,t.name AS test_name "
            + BASE
            + " WHERE a.student_id=? AND a.submitted_at>=? AND a.submitted_at<? ORDER BY a.submitted_at DESC LIMIT 500",
            (user["id"], data["window"]["start"], data["window"]["end_exclusive"]),
        )
        return data


@app.get("/api/student/practice")
def practice(
    status: Literal["pending", "attempted", "skipped"] = "pending",
    limit: int = Query(20, ge=1, le=100),
    user=Student,
):
    with connect() as db:
        recs = rows(
            db,
            "SELECT r.*,s.name AS subtopic_name,tp.name AS topic_name,t.name AS test_name FROM recommendations r JOIN questions q ON q.id=r.question_id JOIN subtopics s ON s.id=q.subtopic_id JOIN topics tp ON tp.id=s.topic_id JOIN attempt_answers aa ON aa.id=r.root_answer_id JOIN attempts a ON a.id=aa.attempt_id JOIN tests t ON t.id=a.test_id WHERE r.student_id=? AND r.status=? ORDER BY r.created_at,r.id LIMIT ?",
            (user["id"], status, limit),
        )
        for r in recs:
            r["question"] = public_question(
                one(db, "SELECT * FROM questions WHERE id=?", (r["question_id"],))
            )
        count = one(
            db,
            "SELECT COUNT(*) AS n FROM recommendations WHERE student_id=? AND status=?",
            (user["id"], status),
        )["n"]
        return {
            "items": recs,
            "total": count,
            "pending_count": 0,
            "retrieval_mode": "taxonomy_and_difficulty",
        }


@app.get("/api/student/recommendations/{rec_id}")
def get_recommendation(rec_id: str, user=Student):
    with connect() as db:
        rec = one(
            db,
            "SELECT r.*,s.name AS subtopic_name FROM recommendations r JOIN questions q ON q.id=r.question_id JOIN subtopics s ON s.id=q.subtopic_id WHERE r.id=? AND r.student_id=?",
            (rec_id, user["id"]),
        )
        if not rec:
            fail("NOT_FOUND", "Practice question not found.", 404)
        q = one(db, "SELECT * FROM questions WHERE id=?", (rec["question_id"],))
        return {
            **rec,
            "question": public_question(q),
            "feedback": {
                "is_correct": bool(rec["was_correct"]),
                "correct_answer": json.loads(q["correct_answer"]),
                "solution": q["solution"],
            }
            if rec["status"] == "attempted"
            else None,
        }


@app.post("/api/student/recommendations/{rec_id}/attempt")
def attempt_recommendation(rec_id: str, data: Answer, user=Student):
    with connect(write=True) as db:
        rec = one(
            db,
            "SELECT * FROM recommendations WHERE id=? AND student_id=?",
            (rec_id, user["id"]),
        )
        if not rec:
            fail("NOT_FOUND", "Practice question not found.", 404)
        if rec["status"] != "pending":
            fail("CONFLICT", "This question has already been completed.", 409)
        q = one(db, "SELECT * FROM questions WHERE id=?", (rec["question_id"],))
        correct = grade(q, data.student_answer)
        db.execute(
            "UPDATE recommendations SET status='attempted',student_answer=?,was_correct=?,time_taken_seconds=?,attempted_at=? WHERE id=?",
            (
                json.dumps(data.student_answer),
                correct,
                data.time_taken_seconds,
                now(),
                rec_id,
            ),
        )
        count = (
            recommend(
                db, user["id"], rec["root_answer_id"], q["id"], rec_id, rec["depth"] + 1
            )
            if not correct
            else 0
        )
        next_rec = one(
            db,
            "SELECT id FROM recommendations WHERE student_id=? AND status='pending' ORDER BY created_at,id LIMIT 1",
            (user["id"],),
        )
        return {
            "is_correct": correct,
            "correct_answer": json.loads(q["correct_answer"]),
            "solution": q["solution"],
            "next_recommendation_id": next_rec["id"] if next_rec else None,
            "followup_queued": False,
            "followup_count": count,
            "depth_limit_reached": not correct and rec["depth"] >= 3,
        }


@app.get("/api/student/homework")
def homework_list(user=Student):
    with connect() as db:
        return student_homeworks(db, user)


def own_homework(db, user, homework_id):
    homework = next(
        (h for h in student_homeworks(db, user) if h["id"] == homework_id), None
    )
    if not homework:
        fail("NOT_FOUND", "Homework not found.", 404)
    return homework


@app.get("/api/student/homework/{homework_id}")
def get_homework(homework_id: str, user=Student):
    with connect() as db:
        homework = own_homework(db, user, homework_id)
        items = []
        for q in rows(
            db,
            "SELECT q.* FROM homework_questions hq JOIN questions q ON q.id=hq.question_id WHERE hq.homework_id=? ORDER BY hq.position",
            (homework_id,),
        ):
            answered = one(
                db,
                "SELECT * FROM homework_answers WHERE homework_id=? AND question_id=? AND student_id=?",
                (homework_id, q["id"], user["id"]),
            )
            items.append(
                {
                    "question": public_question(q),
                    "feedback": {
                        "is_correct": bool(answered["was_correct"]),
                        "correct_answer": json.loads(q["correct_answer"]),
                        "solution": q["solution"],
                    }
                    if answered
                    else None,
                }
            )
        return {**homework, "items": items}


@app.post("/api/student/homework/{homework_id}/questions/{question_id}/attempt")
def attempt_homework(homework_id: str, question_id: str, data: Answer, user=Student):
    with connect(write=True) as db:
        own_homework(db, user, homework_id)
        q = one(
            db,
            "SELECT q.* FROM homework_questions hq JOIN questions q ON q.id=hq.question_id WHERE hq.homework_id=? AND q.id=?",
            (homework_id, question_id),
        )
        if not q:
            fail("NOT_FOUND", "Question not found in this homework.", 404)
        if one(
            db,
            "SELECT 1 FROM homework_answers WHERE homework_id=? AND question_id=? AND student_id=?",
            (homework_id, question_id, user["id"]),
        ):
            fail("CONFLICT", "This question has already been submitted.", 409)
        correct = grade(q, data.student_answer)
        db.execute(
            "INSERT INTO homework_answers VALUES (?,?,?,?,?,?,?)",
            (
                homework_id,
                question_id,
                user["id"],
                json.dumps(data.student_answer),
                correct,
                data.time_taken_seconds,
                now(),
            ),
        )
        return {
            "is_correct": correct,
            "correct_answer": json.loads(q["correct_answer"]),
            "solution": q["solution"],
        }


@app.get("/api/mgmt/overview")
def overview(user=Management):
    with connect() as db:
        data = analytics(db, user)
        pinned = rows(
            db,
            "SELECT n.id,n.question_text FROM pinned_queries p JOIN nlq_queries n ON n.id=p.query_id WHERE p.user_id=?",
            (user["id"],),
        )
        data["pinned"] = [{**p, **run_report(db, p["question_text"])} for p in pinned]
        return data


@app.get("/api/mgmt/reteach-log")
def reteach_log(user=Management):
    with connect() as db:
        return rows(
            db,
            "SELECT r.*,u.full_name AS teacher_name,b.name AS batch_name,s.name AS subtopic_name FROM reteach_logs r JOIN users u ON u.id=r.teacher_id JOIN batches b ON b.id=r.batch_id JOIN subtopics s ON s.id=r.subtopic_id ORDER BY r.created_at DESC",
        )


@app.post("/api/mgmt/nlq")
def nlq(data: NLQ, user=Management):
    blocked = None
    result = None
    key = uid()
    with connect(write=True) as db:
        try:
            result = run_report(db, data.question)
        except HTTPException as exc:
            blocked = exc
        db.execute(
            "INSERT INTO nlq_queries VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                key,
                user["id"],
                data.question,
                result["sql"] if result else None,
                json.dumps(result["parameters"]) if result else None,
                result["answer_text"] if result else None,
                json.dumps(result["rows"]) if result else None,
                bool(blocked),
                blocked.detail["message"] if blocked else None,
                now(),
            ),
        )
    if blocked:
        raise blocked
    return {**result, "nlq_query_id": key}


@app.get("/api/mgmt/nlq/history")
def nlq_history(user=Management):
    with connect() as db:
        return rows(
            db,
            "SELECT id,question_text,answer_text,was_blocked,block_reason,created_at FROM nlq_queries WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
            (user["id"],),
        )


@app.post("/api/mgmt/nlq/{query_id}/pin")
def pin(query_id: str, user=Management):
    with connect(write=True) as db:
        if not one(
            db,
            "SELECT 1 FROM nlq_queries WHERE id=? AND user_id=? AND was_blocked=0",
            (query_id, user["id"]),
        ):
            fail("NOT_FOUND", "Successful query not found.", 404)
        db.execute(
            "INSERT OR IGNORE INTO pinned_queries VALUES (?,?)", (user["id"], query_id)
        )
        return {"ok": True}


@app.delete("/api/mgmt/nlq/{query_id}/pin")
def unpin(query_id: str, user=Management):
    with connect(write=True) as db:
        db.execute(
            "DELETE FROM pinned_queries WHERE user_id=? AND query_id=?",
            (user["id"], query_id),
        )
        return {"ok": True}
