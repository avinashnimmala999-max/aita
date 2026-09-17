import json
import math
import uuid
from datetime import date, datetime, timedelta

from fastapi import HTTPException

from db import one, rows
from seed import IST, now


def fail(code, message, status=422, details=None):
    raise HTTPException(status, {"code": code, "message": message, "details": details})


def uid():
    return str(uuid.uuid4())


def window_bounds(weeks=4, today=None):
    today = today or datetime.now(IST).date()
    end = today - timedelta(days=today.weekday())
    return (end - timedelta(weeks=weeks)).isoformat(), end.isoformat()


def week_bounds(year, week):
    try:
        start = date.fromisocalendar(year, week, 1)
        return start.isoformat(), (start + timedelta(days=7)).isoformat()
    except ValueError:
        fail("VALIDATION_ERROR", "Choose a valid ISO year and week.")


def owns_batch(db, user, batch_id):
    if not one(
        db,
        "SELECT 1 FROM memberships WHERE user_id=? AND batch_id=?",
        (user["id"], batch_id),
    ):
        fail("FORBIDDEN", "You do not have access to this batch.", 403)


def scope(db, user, batch_id="all"):
    if user["role"] == "management":
        return "1=1", []
    if user["role"] == "student":
        return "a.student_id=?", [user["id"]]
    if batch_id != "all":
        owns_batch(db, user, batch_id)
        return "t.batch_id=?", [batch_id]
    return "t.batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?)", [
        user["id"]
    ]


BASE = "FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id JOIN tests t ON t.id=a.test_id JOIN questions q ON q.id=aa.question_id JOIN subtopics s ON s.id=q.subtopic_id JOIN topics tp ON tp.id=s.topic_id JOIN users u ON u.id=a.student_id"


def analytics(db, user, batch_id="all", weeks=4):
    clause, params = scope(db, user, batch_id)
    start, end = window_bounds(weeks)
    where = f" WHERE {clause} AND a.submitted_at>=? AND a.submitted_at<? AND u.is_active=1 AND aa.outcome!='skipped'"
    params = [*params, start, end]
    topics = rows(
        db,
        "SELECT tp.id AS topic_id,tp.name AS topic_name,tp.subject_id,COUNT(*) AS attempts,SUM(aa.outcome='wrong') AS wrong,ROUND(1.0*SUM(aa.outcome='wrong')/COUNT(*),4) AS avg_mistake_rate,COUNT(DISTINCT a.student_id) AS student_count "
        + BASE
        + where
        + " GROUP BY tp.id ORDER BY avg_mistake_rate DESC",
        params,
    )
    for topic in topics:
        topic["low_volume"] = topic["attempts"] < 20
        topic["subtopics"] = rows(
            db,
            "SELECT s.id,s.name,COUNT(*) AS attempts,SUM(aa.outcome='wrong') AS wrong "
            + BASE
            + where
            + " AND tp.id=? GROUP BY s.id ORDER BY wrong DESC",
            [*params, topic["topic_id"]],
        )
    stats = one(
        db,
        "SELECT COUNT(*) AS answers,COUNT(DISTINCT a.id) AS submissions,COUNT(DISTINCT t.id) AS tests,COALESCE(ROUND(100.0*SUM(aa.outcome='correct')/NULLIF(COUNT(*),0),1),0) AS accuracy "
        + BASE
        + where,
        params,
    )
    students = rows(
        db,
        "SELECT u.id,u.full_name,COUNT(*) AS attempts,SUM(aa.outcome='wrong') AS wrong,ROUND(100.0*SUM(aa.outcome='correct')/COUNT(*),1) AS accuracy "
        + BASE
        + where
        + " GROUP BY u.id ORDER BY accuracy ASC",
        params,
    )
    for student in students:
        weak = one(
            db,
            "SELECT s.id,s.name,tp.name AS topic_name,COUNT(*) AS wrong "
            + BASE
            + where
            + " AND u.id=? AND aa.outcome='wrong' GROUP BY s.id ORDER BY wrong DESC LIMIT 1",
            [*params, student["id"]],
        )
        student["weakest"] = weak
    trend = rows(
        db,
        "SELECT a.iso_year,a.iso_week,q.subtopic_id,substr(q.subtopic_id,1,instr(q.subtopic_id,'.')-1) AS subject,ROUND(100.0*SUM(aa.outcome='correct')/COUNT(*),1) AS accuracy "
        + BASE
        + where
        + " GROUP BY a.iso_year,a.iso_week,subject ORDER BY a.iso_year,a.iso_week",
        params,
    )
    points = {}
    for row in trend:
        key = f"{row['iso_year']}-W{row['iso_week']:02d}"
        points.setdefault(key, {"week": f"W{row['iso_week']}", "label": key})[
            row["subject"]
        ] = row["accuracy"]
    if user["role"] == "management":
        active = one(
            db, "SELECT COUNT(*) AS n FROM users WHERE role='student' AND is_active=1"
        )["n"]
        interventions = one(
            db,
            "SELECT COUNT(*) AS n FROM reteach_logs WHERE created_at>=? AND created_at<?",
            (start, now()),
        )["n"]
    elif user["role"] == "student":
        active, interventions = 1, 0
    else:
        selected = " AND m.batch_id=?" if batch_id != "all" else ""
        active = one(
            db,
            "SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.role='student' AND u.is_active=1 AND m.batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?)"
            + selected,
            [user["id"], *([batch_id] if batch_id != "all" else [])],
        )["n"]
        interventions = one(
            db,
            "SELECT COUNT(*) AS n FROM reteach_logs WHERE batch_id IN (SELECT batch_id FROM memberships WHERE user_id=?) AND created_at>=? AND created_at<?"
            + (" AND batch_id=?" if batch_id != "all" else ""),
            [user["id"], start, now(), *([batch_id] if batch_id != "all" else [])],
        )["n"]
    return {
        "stats": {
            **stats,
            "active_students": active,
            "needs_attention": sum(
                s["accuracy"] < 40 and s["attempts"] >= 20 for s in students
            ),
            "reteach_actions": interventions,
        },
        "topics": topics,
        "students": students,
        "trend": list(points.values()),
        "window": {
            "start": start,
            "end_exclusive": end,
            "weeks": weeks,
            "timezone": "Asia/Kolkata",
            "label": "completed ISO weeks",
        },
    }


def public_question(q):
    return {
        k: (json.loads(q[k]) if k == "options" else q[k])
        for k in (
            "id",
            "subtopic_id",
            "stem",
            "question_type",
            "options",
            "difficulty",
            "source",
            "provenance",
        )
    }


def grade(q, answer):
    if not isinstance(answer, dict):
        fail("VALIDATION_ERROR", "Answer must be a JSON object.")
    correct = json.loads(q["correct_answer"])
    kind = q["question_type"]
    if kind == "mcq_single":
        if set(answer) != {"option_label"} or answer["option_label"] not in [
            x["label"] for x in json.loads(q["options"])
        ]:
            fail("VALIDATION_ERROR", "Choose a valid answer option.")
        return answer["option_label"] == correct["option_label"]
    if kind == "mcq_multi":
        labels = answer.get("option_labels")
        if (
            set(answer) != {"option_labels"}
            or not isinstance(labels, list)
            or not labels
            or any(
                not isinstance(v, str) or v not in "ABCD" or len(v) != 1 for v in labels
            )
            or len(set(labels)) != len(labels)
        ):
            fail("VALIDATION_ERROR", "Choose distinct valid answer options.")
        return set(labels) == set(correct["option_labels"])
    if kind == "numeric":
        value = answer.get("value")
        if (
            set(answer) != {"value"}
            or isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            fail("VALIDATION_ERROR", "Enter a finite numeric answer.")
        return math.isclose(
            value, correct["value"], abs_tol=correct.get("tolerance", 0), rel_tol=0
        )
    fail(
        "MANUAL_GRADING_REQUIRED",
        "Subjective questions require a teacher; automatic grading is disabled.",
    )


def recommend(db, student_id, root_id, question_id, parent_id=None, depth=1):
    if depth > 3:
        return 0
    question = one(db, "SELECT * FROM questions WHERE id=?", (question_id,))
    category = one(
        db, "SELECT category_id FROM attempt_answers WHERE id=?", (root_id,)
    )["category_id"]
    if not category:
        return 0
    candidates = rows(
        db,
        "SELECT q.id FROM questions q WHERE q.subtopic_id=? AND abs(q.difficulty-?)<=1 AND q.source='curated' AND q.id!=? AND q.id NOT IN (SELECT question_id FROM recommendations WHERE student_id=?) AND q.id NOT IN (SELECT aa.question_id FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id WHERE a.student_id=?) ORDER BY abs(q.difficulty-?),q.id LIMIT 3",
        (
            category,
            question["difficulty"],
            question_id,
            student_id,
            student_id,
            question["difficulty"],
        ),
    )
    for item in candidates:
        db.execute(
            "INSERT INTO recommendations(id,student_id,root_answer_id,parent_id,depth,question_id,created_at) VALUES (?,?,?,?,?,?,?)",
            (uid(), student_id, root_id, parent_id, depth, item["id"], now()),
        )
    return len(candidates)


def paper_plan(db, data):
    if sum(item.count for item in data.composition) != data.total_questions:
        fail("VALIDATION_ERROR", "Composition counts must equal the paper total.")
    if len({item.subtopic_id for item in data.composition}) != len(data.composition):
        fail(
            "VALIDATION_ERROR",
            "Use one composition row per subtopic to avoid double-counting stock.",
        )
    selected = []
    result = []
    for item in data.composition:
        sub = one(db, "SELECT name FROM subtopics WHERE id=?", (item.subtopic_id,))
        if not sub:
            fail("VALIDATION_ERROR", "Unknown subtopic.")
        available = rows(
            db,
            "SELECT id FROM questions WHERE subtopic_id=? AND abs(difficulty-?)<=1 AND source='curated' ORDER BY abs(difficulty-?),id",
            (item.subtopic_id, item.difficulty, item.difficulty),
        )
        chosen = available[: item.count]
        selected.extend(q["id"] for q in chosen)
        result.append(
            {
                "subtopic_id": item.subtopic_id,
                "name": sub["name"],
                "requested": item.count,
                "available": len(available),
                "bank_count": len(chosen),
                "llm_needed": max(0, item.count - len(chosen)),
            }
        )
    required = sum(r["llm_needed"] for r in result)
    allowed = data.total_questions * 3 // 10
    return {
        "total_questions": data.total_questions,
        "bank_question_count": len(selected),
        "llm_question_count": required,
        "llm_budget": allowed,
        "over_budget": required > allowed,
        "can_create": required == 0,
        "rows": result,
        "selected": selected,
    }


REPORTS = [
    "How many students are weak in Organic?",
    "Which topic has the highest mistake rate?",
    "Which students are underperforming recently?",
]


def run_report(db, question):
    text = question.lower().strip()
    start, end = window_bounds(4)
    if text not in {q.lower() for q in REPORTS}:
        fail(
            "NLQ_BLOCKED",
            "Local mode supports the three suggested reports only. Custom questions require the production NLQ integration.",
        )
    common = " FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id JOIN users u ON u.id=a.student_id JOIN questions q ON q.id=aa.question_id JOIN subtopics s ON s.id=q.subtopic_id WHERE u.is_active=1 AND u.role='student' AND aa.outcome!='skipped' AND a.submitted_at>=? AND a.submitted_at<?"
    params = [start, end]
    if text == REPORTS[0].lower():
        sql = (
            "SELECT COUNT(*) AS weak_student_count,(SELECT COUNT(*) FROM users WHERE role='student' AND is_active=1) AS active_total FROM (SELECT a.student_id"
            + common
            + " AND s.topic_id=? GROUP BY a.student_id HAVING COUNT(*)>=5 AND 1.0*SUM(aa.outcome='wrong')/COUNT(*)>=0.5)"
        )
        params.append("chem.org")
        result = rows(db, sql, params)
        answer = f"{result[0]['weak_student_count']} of {result[0]['active_total']} active students are weak in Organic Chemistry: at least 50% wrong across at least 5 answered questions in the last 4 completed ISO weeks."
    elif text == REPORTS[1].lower():
        sql = "SELECT tp.name AS topic,COUNT(*) AS attempts,SUM(aa.outcome='wrong') AS wrong,ROUND(100.0*SUM(aa.outcome='wrong')/COUNT(*),1) AS mistake_rate FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id JOIN users u ON u.id=a.student_id JOIN questions q ON q.id=aa.question_id JOIN subtopics s ON s.id=q.subtopic_id JOIN topics tp ON tp.id=s.topic_id WHERE u.is_active=1 AND aa.outcome!='skipped' AND a.submitted_at>=? AND a.submitted_at<? GROUP BY tp.id HAVING COUNT(*)>=20 ORDER BY mistake_rate DESC LIMIT 10"
        result = rows(db, sql, params)
        answer = (
            f"{result[0]['topic']} has the highest mistake rate at {result[0]['mistake_rate']}%, based on {result[0]['attempts']} answered questions in the last 4 completed ISO weeks."
            if result
            else "No topics have enough data in this window (minimum 20 answers)."
        )
    else:
        sql = (
            "SELECT u.full_name,COUNT(*) AS attempts,ROUND(100.0*SUM(aa.outcome='correct')/COUNT(*),1) AS accuracy"
            + common
            + " GROUP BY u.id HAVING COUNT(*)>=20 AND 1.0*SUM(aa.outcome='correct')/COUNT(*)<0.4 ORDER BY accuracy ASC LIMIT 1000"
        )
        result = rows(db, sql, params)
        answer = (
            f"{len(result)} students have accuracy below 40% across at least 20 answered questions in the last 4 completed ISO weeks."
            + (" Results are capped at 1,000 students." if len(result) == 1000 else "")
        )
    return {
        "answer_text": answer,
        "sql": sql,
        "parameters": params,
        "rows": result,
        "chart_hint": "table",
        "mode": "parameterized_local_report",
    }
