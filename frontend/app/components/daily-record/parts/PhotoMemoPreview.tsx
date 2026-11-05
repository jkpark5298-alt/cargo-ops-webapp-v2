"use client";

import { SavedImageWithMemo } from "../types";
import {
  photoMemoPreviewBoxStyle,
  photoMemoPreviewItemStyle,
  photoMemoPreviewMoreStyle,
  photoMemoPreviewTitleStyle,
} from "../styles";

export function PhotoMemoPreview({ images }: { images: SavedImageWithMemo[] }) {
  const memoItems = images
    .map((image, index) => ({
      id: image.id,
      label: image.label,
      memo: image.memo?.trim(),
      index,
    }))
    .filter((item) => item.memo);

  if (memoItems.length === 0) return null;

  return (
    <div style={photoMemoPreviewBoxStyle}>
      <div style={photoMemoPreviewTitleStyle}>사진 메모</div>
      {memoItems.slice(0, 3).map((item) => (
        <div key={item.id} style={photoMemoPreviewItemStyle}>
          {memoItems.length > 1 ? `${item.index + 1}. ` : ""}
          {item.memo}
        </div>
      ))}
      {memoItems.length > 3 && (
        <div style={photoMemoPreviewMoreStyle}>외 {memoItems.length - 3}건 더 있음</div>
      )}
    </div>
  );
}
