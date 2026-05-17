"use client";

import type { SavedImage } from "../components/ImageSlotCard";

type NotionRecord = {
  pageId: string;
  url?: string;
  savedAt: string;
};

const IMAGE_STORAGE_KEY = "cargo_ops_home_images_v1";
const NOTE_STORAGE_KEY = "cargo_ops_home_note_v1";
const DAILY_NOTION_RECORD_KEY = "cargo_ops_daily_notion_record_v1";
const ISSUE_NOTION_RECORD_KEY = "cargo_ops_issue_notion_record_v1";
const DAILY_SAVE_SIGNATURE_KEY = "cargo_ops_daily_save_signature_v1";
const ISSUE_SAVE_SIGNATURE_KEY = "cargo_ops_issue_save_signature_v1";
const ISSUE_DRAFT_KEY = "cargo_ops_issue_draft_v1";

export type IssueDraft = {
  flight: string;
  route: string;
  hlnbr: string;
  text: string;
  status: "normal" | "issue";
  author: string;
};


export function loadIssueDraft(): IssueDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(ISSUE_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      flight: typeof parsed?.flight === "string" ? parsed.flight : "",
      route: typeof parsed?.route === "string" ? parsed.route : "",
      hlnbr: typeof parsed?.hlnbr === "string" ? parsed.hlnbr : "",
      text: typeof parsed?.text === "string" ? parsed.text : "",
      status: parsed?.status === "issue" ? "issue" : "normal",
      author: typeof parsed?.author === "string" ? parsed.author : "jkpark",
    };
  } catch {
    return null;
  }
}

export function saveIssueDraft(draft: IssueDraft) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ISSUE_DRAFT_KEY, JSON.stringify(draft));
}

export function clearIssueDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ISSUE_DRAFT_KEY);
}

export function loadImages(): SavedImage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(IMAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveImages(images: SavedImage[]) {
  if (typeof window === "undefined") return false;

  try {
    localStorage.setItem(IMAGE_STORAGE_KEY, JSON.stringify(images));
    return true;
  } catch {
    return false;
  }
}

export function loadNote() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NOTE_STORAGE_KEY) || "";
}

export function saveNote(note: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTE_STORAGE_KEY, note);
}

export function loadDailyNotionRecord(): NotionRecord | null {
  return loadNotionRecord(DAILY_NOTION_RECORD_KEY);
}

export function saveDailyNotionRecord(record: NotionRecord) {
  saveNotionRecord(DAILY_NOTION_RECORD_KEY, record);
}

export function clearDailyNotionRecord() {
  clearNotionRecord(DAILY_NOTION_RECORD_KEY);
}

export function loadIssueNotionRecord(): NotionRecord | null {
  return loadNotionRecord(ISSUE_NOTION_RECORD_KEY);
}

export function saveIssueNotionRecord(record: NotionRecord) {
  saveNotionRecord(ISSUE_NOTION_RECORD_KEY, record);
}

export function clearIssueNotionRecord() {
  clearNotionRecord(ISSUE_NOTION_RECORD_KEY);
}

function loadNotionRecord(key: string): NotionRecord | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.pageId ? parsed : null;
  } catch {
    return null;
  }
}

function saveNotionRecord(key: string, record: NotionRecord) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(record));
}

function clearNotionRecord(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

type SaveSignature = {
  signature: string;
  savedAt: number;
};

export function getLastDailySaveSignature(): SaveSignature | null {
  return loadSaveSignature(DAILY_SAVE_SIGNATURE_KEY);
}

export function saveLastDailySaveSignature(signature: SaveSignature) {
  saveSaveSignature(DAILY_SAVE_SIGNATURE_KEY, signature);
}

export function getLastIssueSaveSignature(): SaveSignature | null {
  return loadSaveSignature(ISSUE_SAVE_SIGNATURE_KEY);
}

export function saveLastIssueSaveSignature(signature: SaveSignature) {
  saveSaveSignature(ISSUE_SAVE_SIGNATURE_KEY, signature);
}

function loadSaveSignature(key: string): SaveSignature | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return typeof parsed?.signature === "string" && typeof parsed?.savedAt === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function saveSaveSignature(key: string, signature: SaveSignature) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(signature));
}
