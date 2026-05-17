"use client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://cargo-ops-backend.onrender.com";

type NotionMutationResult = {
  success?: boolean;
  pageId: string;
  url?: string;
  detail?: string;
  message?: string;
};

type NotionLinksResult = {
  success?: boolean;
  dailyDbUrl?: string;
  issueDbUrl?: string;
  detail?: string;
  message?: string;
};

export async function saveDailyRecord(payload: unknown): Promise<NotionMutationResult> {
  return requestNotion<NotionMutationResult>("/notion/daily-records", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDailyRecord(
  pageId: string,
  payload: unknown,
): Promise<NotionMutationResult> {
  return requestNotion<NotionMutationResult>(`/notion/daily-records/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteDailyRecord(pageId: string) {
  return requestNotion<NotionMutationResult>(`/notion/daily-records/${encodeURIComponent(pageId)}`, {
    method: "DELETE",
  });
}

export async function saveIssueRecord(payload: unknown): Promise<NotionMutationResult> {
  return requestNotion<NotionMutationResult>("/notion/issue-records", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateIssueRecord(
  pageId: string,
  payload: unknown,
): Promise<NotionMutationResult> {
  return requestNotion<NotionMutationResult>(`/notion/issue-records/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteIssueRecord(pageId: string) {
  return requestNotion<NotionMutationResult>(`/notion/issue-records/${encodeURIComponent(pageId)}`, {
    method: "DELETE",
  });
}

export async function getNotionLinks(): Promise<NotionLinksResult> {
  return requestNotion<NotionLinksResult>("/notion/links", {
    method: "GET",
    cache: "no-store",
  });
}

async function requestNotion<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const result = await response.json();

  if (!response.ok || result?.success === false) {
    throw new Error(result?.detail || result?.message || "Notion 요청 실패");
  }

  return result;
}
