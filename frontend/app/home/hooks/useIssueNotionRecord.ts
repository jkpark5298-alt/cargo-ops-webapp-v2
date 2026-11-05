import { useRef, useState } from "react";
import {
  clearIssueNotionRecord,
  getLastIssueSaveSignature,
  saveIssueNotionRecord,
  saveLastIssueSaveSignature,
} from "../../lib/local-storage";
import { deleteIssueRecord, saveIssueRecord, updateIssueRecord } from "../../lib/notion-api";
import { IssueNotionRecord } from "../types";
import { IMAGE_SLOT_PROPERTY_NAME, ISSUE_IMAGE_SLOT } from "../constants";
import {
  getCurrentTimeText,
  getImageBySlot,
  getTodayDateInputValue,
  getWeatherSummary,
  isRecentSameSave,
  makeSaveSignature,
} from "../helpers";

export type UseIssueNotionRecordParams = {
  author: string;
  images: import("../types").SavedImage[];
  issueFlight: string;
  issueHlnbr: string;
  issueRoute: string;
  issueText: string;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  weather: import("../types").WeatherInfo;
};

/** 특이사항 Notion 기록(저장·수정·삭제) */
export function useIssueNotionRecord({
  author,
  images,
  issueFlight,
  issueHlnbr,
  issueRoute,
  issueText,
  setNotice,
  weather,
}: UseIssueNotionRecordParams) {
  const issueSavingRef = useRef(false);
  const [isIssueSaving, setIsIssueSaving] = useState(false);
  const [issueNotionRecord, setIssueNotionRecord] =
    useState<IssueNotionRecord | null>(null);

  const buildIssuePayload = () => {
    const issueImage = getImageBySlot(images, ISSUE_IMAGE_SLOT.key);

    return {
      title: `${issueFlight.trim().toUpperCase()} ${issueRoute || ""} 특이사항`,
      date: new Date().toISOString(),
      time: getCurrentTimeText(),
      flight: issueFlight.trim().toUpperCase(),
      route: issueRoute,
      hlnbr: issueHlnbr,
      issue: issueText,
      weather: getWeatherSummary(weather),
      author,
      status: "확인 중",
      image: issueImage
        ? {
            slotKey: ISSUE_IMAGE_SLOT.key,
            type: issueImage.type,
            propertyName: IMAGE_SLOT_PROPERTY_NAME[ISSUE_IMAGE_SLOT.key],
            label: issueImage.label,
            savedAt: issueImage.savedAt,
            capturedAt: issueImage.capturedAt,
            locationText: issueImage.locationText,
            memo: issueImage.memo || "",
            dataUrl: issueImage.dataUrl,
          }
        : null,
    };
  };

  const validateIssueForm = () => {
    if (!issueFlight.trim()) {
      setNotice("특이사항 기록을 위해 편명을 입력하세요.");
      return false;
    }

    if (!issueText.trim()) {
      setNotice("특이사항 내용을 입력하세요.");
      return false;
    }

    return true;
  };

  const handleSaveIssueToNotion = async () => {
    if (issueSavingRef.current) {
      setNotice("Notion 특이사항 기록 저장 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    if (issueNotionRecord?.pageId) {
      setNotice("이미 저장된 특이사항 기록이 있습니다. 내용을 바꾸려면 수정 버튼을, 새 특이사항은 '새 특이사항 작성'을 사용하세요.");
      return;
    }

    if (!validateIssueForm()) return;

    const payload = buildIssuePayload();
    const signature = makeSaveSignature(payload);

    if (isRecentSameSave(getLastIssueSaveSignature(), signature)) {
      setNotice("방금 같은 특이사항 기록을 저장했습니다. 중복 저장을 막았습니다.");
      return;
    }

    issueSavingRef.current = true;
    setIsIssueSaving(true);

    try {
      const result = await saveIssueRecord(payload);

      const record = {
        pageId: result.pageId,
        url: result.url,
        savedAt: new Date().toLocaleString("ko-KR"),
        workDate: getTodayDateInputValue(),
      };

      setIssueNotionRecord(record);
      saveIssueNotionRecord(record);
      saveLastIssueSaveSignature({ signature, savedAt: Date.now() });
      setNotice("Notion에 특이사항 기록을 저장했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 저장 중 오류가 발생했습니다.");
    } finally {
      issueSavingRef.current = false;
      setIsIssueSaving(false);
    }
  };

  const handleUpdateIssueToNotion = async () => {
    if (!issueNotionRecord?.pageId) {
      setNotice("수정할 Notion 특이사항 기록이 없습니다. 먼저 저장하세요.");
      return;
    }

    if (!validateIssueForm()) return;

    try {
      const result = await updateIssueRecord(issueNotionRecord.pageId, buildIssuePayload());

      const nextRecord = {
        ...issueNotionRecord,
        url: result.url || issueNotionRecord.url,
        savedAt: new Date().toLocaleString("ko-KR"),
      };

      setIssueNotionRecord(nextRecord);
      saveIssueNotionRecord(nextRecord);
      setNotice("Notion 특이사항 기록을 수정했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteIssueFromNotion = async () => {
    if (!issueNotionRecord?.pageId) {
      setNotice("삭제할 Notion 특이사항 기록이 없습니다.");
      return;
    }

    const confirmed = window.confirm("Notion 특이사항 기록을 삭제할까요?");
    if (!confirmed) return;

    try {
      await deleteIssueRecord(issueNotionRecord.pageId);

      clearIssueNotionRecord();
      setIssueNotionRecord(null);
      setNotice("Notion 특이사항 기록을 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notion 삭제 중 오류가 발생했습니다.");
    }
  };

  const openIssueNotionPage = () => {
    if (!issueNotionRecord?.url) {
      setNotice("열 수 있는 Notion 특이사항 링크가 없습니다.");
      return;
    }

    window.open(issueNotionRecord.url, "_blank", "noopener,noreferrer");
  };

  return {
    handleDeleteIssueFromNotion,
    handleSaveIssueToNotion,
    handleUpdateIssueToNotion,
    isIssueSaving,
    issueNotionRecord,
    openIssueNotionPage,
    setIssueNotionRecord,
  };
}
