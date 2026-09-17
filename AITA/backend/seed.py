import json
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from db import connect

IST = ZoneInfo("Asia/Kolkata")
TAXONOMY = {
    "phy": (
        "Physics",
        [
            (
                "mech",
                "Mechanics",
                "kinematics newtons_laws wpe circular rotational gravitation shm fluids",
            ),
            (
                "em",
                "Electromagnetism",
                "electrostatics current_electricity magnetism emi ac em_waves",
            ),
            (
                "modern",
                "Modern Physics",
                "photoelectric atomic_structure nuclei semiconductors dual_nature",
            ),
            ("optics", "Optics", "ray_optics wave_optics"),
            (
                "thermo",
                "Thermodynamics & Heat",
                "thermal_properties kinetic_theory thermodynamics",
            ),
            ("waves", "Waves", "wave_motion sound"),
        ],
    ),
    "chem": (
        "Chemistry",
        [
            (
                "phy",
                "Physical Chemistry",
                "mole_concept atomic_structure bonding_phy thermodynamics equilibrium electrochem kinetics solutions surface solid_state redox",
            ),
            (
                "org",
                "Organic Chemistry",
                "goc isomerism hydrocarbons haloalkanes alcohols_phenols_ethers carbonyls carboxylic_acids amines biomolecules polymers everyday_life named_reactions",
            ),
            (
                "inorg",
                "Inorganic Chemistry",
                "periodic bonding_inorg hydrogen_sblock pblock dfblock coordination qual_analysis metallurgy env_chem",
            ),
        ],
    ),
    "math": (
        "Mathematics",
        [
            (
                "algebra",
                "Algebra",
                "sets_relations_functions quadratics sequences_series complex binomial perm_comb probability induction",
            ),
            (
                "calculus",
                "Calculus",
                "limits_continuity differentiation aod indefinite_integration definite_integration area differential_equations",
            ),
            (
                "coord",
                "Coordinate Geometry",
                "straight_lines circle parabola ellipse hyperbola",
            ),
            (
                "trig",
                "Trigonometry",
                "ratios_identities equations inverse heights_distances",
            ),
            ("vec3d", "Vectors & 3D", "vectors three_d_geometry"),
            ("matdet", "Matrices & Determinants", "matrices determinants"),
            ("stats", "Statistics & Reasoning", "statistics reasoning"),
        ],
    ),
}
BANK_SUBTOPICS = [
    "chem.org.carbonyls",
    "phy.mech.rotational",
    "math.calculus.aod",
    "chem.phy.mole_concept",
    "phy.em.current_electricity",
    "math.coord.circle",
    "chem.inorg.coordination",
    "math.algebra.quadratics",
]


def now():
    return datetime.now(IST).isoformat()


def sample_question(group, n):
    if group == 0:
        stem = f"An acyclic saturated aldehyde contains {n + 2} carbon atoms and one oxygen atom. What is the number of hydrogen atoms in its molecular formula?"
        answer = 2 * (n + 2)
        solution = f"A saturated acyclic aldehyde has general formula $C_nH_{{2n}}O$. For $n={n + 2}$, the hydrogen count is ${answer}$."
    elif group == 1:
        stem = f"A uniform solid disc of mass $2$ kg and radius $1$ m experiences a constant net torque of ${n + 2}$ N m about its central axis. Find its angular acceleration in rad/s²."
        answer = n + 2
        solution = f"$I=\\frac12 MR^2=1$ kg m². Using $\\tau=I\\alpha$, $\\alpha={answer}$ rad/s²."
    elif group == 2:
        stem = f"The function $f(x)=x^2-{2 * (n + 1)}x+{n + 4}$ is defined on the real numbers. At what value of $x$ does it attain its minimum?"
        answer = n + 1
        solution = f"$f'(x)=2x-{2 * (n + 1)}=0$ gives $x={answer}$. Since $f''(x)=2>0$, this is the minimum."
    elif group == 3:
        stem = f"A sample contains ${18 * (n + 1)}$ g of pure water. Using a molar mass of $18$ g/mol, how many moles of water are present?"
        answer = n + 1
        solution = f"Number of moles $n=m/M={18 * (n + 1)}/18={answer}$ mol."
    elif group == 4:
        stem = f"A ${2 * (n + 2)}$ V ideal battery is connected across a $2$ Ω resistor. What current, in amperes, flows through the resistor?"
        answer = n + 2
        solution = f"By Ohm's law, $I=V/R={2 * (n + 2)}/2={answer}$ A."
    elif group == 5:
        stem = f"The equation of a circle is $x^2+y^2={((n + 2) ** 2)}$. What is its radius?"
        answer = n + 2
        solution = f"Compare with $x^2+y^2=r^2$. The positive radius is $r=\\sqrt{{{answer**2}}}={answer}$."
    elif group == 6:
        charge = n % 3 + 1
        ligands = n // 3 + 2
        stem = f"In a hypothetical complex ion $[MCl_{{{ligands}}}]^{{{charge}-}}$, each chloride ligand carries charge $-1$. What is the oxidation state of $M$?"
        answer = ligands - charge
        solution = f"Let the metal oxidation state be $x$. Then $x-{ligands}=-{charge}$, so $x={answer}$."
    else:
        stem = (
            f"If $x={n + 1}$ is one root of $x^2-{n + 5}x+k=0$, what is the other root?"
        )
        answer = 4
        solution = f"By Vieta's formula, the sum of roots is ${n + 5}$. The other root is ${n + 5}-{n + 1}=4$."
    values = [answer, answer + 1, answer + 3, answer - 1]
    shift = n % 4
    values = values[shift:] + values[:shift]
    labels = "ABCD"
    options = [{"label": labels[i], "body": str(v)} for i, v in enumerate(values)]
    return stem, options, {"option_label": labels[values.index(answer)]}, solution


def seed_bank(db):
    for g, sub in enumerate(BANK_SUBTOPICS):
        for n in range(24):
            stem, options, answer, solution = sample_question(g, n)
            db.execute(
                "INSERT OR IGNORE INTO questions VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    f"q-{g + 1:02d}-{n + 1:02d}",
                    sub,
                    stem,
                    "mcq_single",
                    json.dumps(options),
                    json.dumps(answer),
                    solution,
                    2 + n % 3,
                    "curated",
                    "Synthetic local demonstration bank; template-authored, not a reviewed JEE corpus",
                ),
            )


def seed_database():
    rng = random.Random(42)
    with connect(write=True) as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            seed_bank(db)
            return
        for sid, (name, topics) in TAXONOMY.items():
            db.execute("INSERT INTO subjects VALUES (?,?)", (sid, name))
            for tid, title, subs in topics:
                topic_id = f"{sid}.{tid}"
                db.execute("INSERT INTO topics VALUES (?,?,?)", (topic_id, sid, title))
                for sub in subs.split():
                    db.execute(
                        "INSERT INTO subtopics VALUES (?,?,?)",
                        (f"{topic_id}.{sub}", topic_id, sub.replace("_", " ").title()),
                    )
        db.executemany(
            "INSERT INTO users(id,full_name,email,role) VALUES (?,?,?,?)",
            [
                ("teacher-priya", "Priya Sharma", "priya@example.test", "teacher"),
                ("teacher-other", "Dev Mehta", "dev@example.test", "teacher"),
                ("management-raj", "Raj Malhotra", "raj@example.test", "management"),
            ],
        )
        names = [
            "Aarav Mehta",
            "Riya Sharma",
            "Arjun Reddy",
            "Ananya Iyer",
            "Kabir Patel",
            "Ishita Rao",
            "Vihaan Shah",
            "Diya Nair",
            "Aditya Verma",
            "Saanvi Gupta",
            "Rohan Das",
            "Meera Joshi",
            "Krish Kapoor",
            "Aditi Singh",
            "Ishaan Kumar",
            "Tara Menon",
            "Dev Agarwal",
            "Nisha Bhat",
            "Aryan Jain",
            "Kavya Rao",
            "Ved Khanna",
            "Avni Sethi",
            "Yash Bose",
            "Myra Sen",
        ]
        for bid, name in [
            ("b1", "JEE Advanced · A1"),
            ("b2", "JEE Main · A2"),
            ("b3", "Foundation · B1"),
        ]:
            db.execute(
                "INSERT INTO batches VALUES (?,?,?)",
                (bid, name, "jee_advanced" if bid == "b1" else "jee_mains"),
            )
            db.execute(
                "INSERT INTO memberships VALUES (?,?,?)",
                (bid, "teacher-other" if bid == "b3" else "teacher-priya", now()),
            )
        for i, name in enumerate(names):
            uid = f"student-{i + 1:02d}"
            db.execute(
                "INSERT INTO users(id,full_name,email,role) VALUES (?,?,?,'student')",
                (uid, name, f"student{i + 1}@example.test"),
            )
            db.execute(
                "INSERT INTO memberships VALUES (?,?,?)",
                (
                    "b1" if i < 16 else "b2" if i < 23 else "b3",
                    uid,
                    (datetime.now(IST) - timedelta(days=60)).isoformat(),
                ),
            )
        seed_bank(db)
        current = datetime.now(IST)
        monday = (current - timedelta(days=current.weekday())).replace(
            hour=10, minute=0, second=0, microsecond=0
        )
        for b, student_ids in [
            ("b1", range(1, 17)),
            ("b2", range(17, 24)),
            ("b3", range(24, 25)),
        ]:
            for w in range(8):
                when = monday - timedelta(weeks=w, days=2)
                tid = f"test-{b}-{w}"
                db.execute(
                    "INSERT INTO tests VALUES (?,?,?,?,?)",
                    (
                        tid,
                        b,
                        f"Weekly progress test {8 - w:02d}",
                        "wpt",
                        when.date().isoformat(),
                    ),
                )
                qids = [
                    f"q-{g + 1:02d}-{(w * 2 + v) % 16 + 1:02d}"
                    for g in range(8)
                    for v in range(2)
                ]
                db.executemany(
                    "INSERT INTO test_questions VALUES (?,?,?)",
                    [(tid, q, p + 1) for p, q in enumerate(qids)],
                )
                for i in student_ids:
                    uid = f"student-{i:02d}"
                    aid = f"attempt-{b}-{w}-{i}"
                    iso = when.isocalendar()
                    db.execute(
                        "INSERT INTO attempts VALUES (?,?,?,?,?,?)",
                        (aid, tid, uid, when.isoformat(), iso.year, iso.week),
                    )
                    for p, qid in enumerate(qids):
                        g = p // 2
                        correct = rng.random() > (
                            [0.66, 0.57, 0.46, 0.31, 0.27, 0.39, 0.36, 0.22][g]
                            + (0.22 if i < 4 else 0)
                            + w * 0.015
                        )
                        q = db.execute(
                            "SELECT correct_answer FROM questions WHERE id=?", (qid,)
                        ).fetchone()
                        answer = (
                            json.loads(q[0])["option_label"]
                            if correct
                            else next(
                                x
                                for x in "ABCD"
                                if x != json.loads(q[0])["option_label"]
                            )
                        )
                        aa = f"aa-{b}-{w}-{i}-{p}"
                        category = (
                            None
                            if (not correct and rng.random() < 0.025)
                            else BANK_SUBTOPICS[g]
                        )
                        db.execute(
                            "INSERT INTO attempt_answers VALUES (?,?,?,?,?,?,?)",
                            (
                                aa,
                                aid,
                                qid,
                                json.dumps({"option_label": answer}),
                                "correct" if correct else "wrong",
                                rng.randint(25, 130),
                                category,
                            ),
                        )
            import_test = f"import-{b}"
            db.execute(
                "INSERT INTO tests VALUES (?,?,?,?,?)",
                (
                    import_test,
                    b,
                    "Daily practice · ready for import",
                    "dpt",
                    current.date().isoformat(),
                ),
            )
            db.executemany(
                "INSERT INTO test_questions VALUES (?,?,?)",
                [(import_test, f"q-{g + 1:02d}-01", g + 1) for g in range(8)],
            )
        origins = db.execute(
            "SELECT aa.id,aa.question_id,q.subtopic_id FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id JOIN questions q ON q.id=aa.question_id WHERE a.student_id='student-01' AND aa.outcome='wrong' AND aa.category_id IS NOT NULL ORDER BY a.submitted_at DESC LIMIT 3"
        ).fetchall()
        used = set()
        for index, origin in enumerate(origins):
            candidates = db.execute(
                "SELECT id FROM questions WHERE subtopic_id=? AND id!=? ORDER BY id DESC LIMIT 6",
                (origin["subtopic_id"], origin["question_id"]),
            ).fetchall()
            count = 0
            for q in candidates:
                if q[0] in used or count == 3:
                    continue
                used.add(q[0])
                db.execute(
                    "INSERT INTO recommendations(id,student_id,root_answer_id,depth,question_id,created_at) VALUES (?,?,?,1,?,?)",
                    (
                        f"rec-demo-{index}-{count}",
                        "student-01",
                        origin["id"],
                        q[0],
                        now(),
                    ),
                )
                count += 1
        db.execute(
            "INSERT INTO homework VALUES (?,?,?,?,?,?,?,?)",
            (
                "hw-demo",
                "teacher-priya",
                "b1",
                None,
                BANK_SUBTOPICS[0],
                "Carbonyls · strengthen your foundations",
                (current + timedelta(days=3)).date().isoformat(),
                now(),
            ),
        )
        db.executemany(
            "INSERT INTO homework_questions VALUES (?,?,?)",
            [("hw-demo", f"q-01-{i:02d}", i) for i in range(3, 7)],
        )
        for i, sub in enumerate(
            [BANK_SUBTOPICS[1], BANK_SUBTOPICS[4], BANK_SUBTOPICS[2]]
        ):
            db.execute(
                "INSERT INTO reteach_logs VALUES (?,?,?,?,?,?)",
                (
                    f"reteach-demo-{i}",
                    "teacher-priya",
                    "b1",
                    sub,
                    [
                        "Revisited moment of inertia with worked examples.",
                        "Cleared up series and parallel circuit misconceptions.",
                        "Practised identifying stationary points.",
                    ][i],
                    (current - timedelta(days=i + 1)).isoformat(),
                ),
            )
