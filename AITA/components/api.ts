"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: { row?: number; field?: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method: method || (body !== undefined ? "POST" : "GET"),
    headers: {
      "X-JPI-Request": "1",
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      result.error?.message || "The server is unavailable. Please try again.",
      response.status,
      result.error?.details,
    );
  return result;
}

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    setLoading(true);
    if (!path) {
      setLoading(false);
      return;
    }
    api<T>(path)
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error, loading, reload, setData };
}

export type Role = "teacher" | "student" | "management";
export type Batch = {
  id: string;
  name: string;
  target_exam: string;
  student_count?: number;
};
export type User = {
  id: string;
  full_name: string;
  role: Role;
  batches: Batch[];
  default_week: string;
  today: string;
};
export type Subtopic = {
  id: string;
  name: string;
  topic_id: string;
  topic_name: string;
  subject_id: string;
  bank_count: number;
};
export type Taxonomy = {
  subtopics: Subtopic[];
  topics: { id: string; name: string; subject_id: string }[];
};
export type Topic = {
  topic_id: string;
  topic_name: string;
  subject_id: string;
  attempts: number;
  wrong: number;
  avg_mistake_rate: number;
  student_count: number;
  low_volume: boolean;
  subtopics: { id: string; name: string; attempts: number; wrong: number }[];
};
export type Learner = {
  id: string;
  full_name: string;
  attempts: number;
  wrong: number;
  accuracy: number;
  weakest: {
    id: string;
    name: string;
    topic_name: string;
    wrong: number;
  } | null;
};
export type Dashboard = {
  stats: {
    active_students: number;
    answers: number;
    submissions: number;
    tests: number;
    accuracy: number;
    needs_attention: number;
    reteach_actions: number;
  };
  topics: Topic[];
  students: Learner[];
  trend: {
    week: string;
    label: string;
    phy?: number;
    chem?: number;
    math?: number;
  }[];
  window: { start: string; end_exclusive: string; weeks: number };
  pending_recommendations?: number;
  pending_homework?: number;
  last_test?: {
    name: string;
    total: number;
    correct: number;
    wrong: number;
    skipped: number;
  };
  pinned?: (Report & { id: string; question_text: string })[];
};
export type Question = {
  id: string;
  subtopic_id: string;
  stem: string;
  question_type: string;
  options: { label: string; body: string }[];
  difficulty: number;
  source: string;
};
export type Feedback = {
  is_correct: boolean;
  correct_answer: Record<string, unknown>;
  solution: string;
  next_recommendation_id?: string;
  followup_count?: number;
  depth_limit_reached?: boolean;
};
export type Recommendation = {
  id: string;
  subtopic_name: string;
  topic_name: string;
  test_name: string;
  question: Question;
  status: string;
  depth: number;
  feedback?: Feedback | null;
};
export type HomeworkItem = {
  id: string;
  name: string;
  subtopic_name: string;
  batch_name?: string;
  student_name?: string;
  teacher_name?: string;
  student_id: string | null;
  due_date: string | null;
  created_at: string;
  question_count: number;
  attempted_count?: number;
  answers_submitted?: number;
  items?: { question: Question; feedback: Feedback | null }[];
};
export type Report = {
  answer_text: string;
  sql: string;
  parameters: string[];
  rows: Record<string, string | number>[];
  nlq_query_id: string;
};
export const subjects: Record<string, string> = {
  phy: "Physics",
  chem: "Chemistry",
  math: "Mathematics",
};
export const formatDate = (value: string) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00+05:30` : value,
  ).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
