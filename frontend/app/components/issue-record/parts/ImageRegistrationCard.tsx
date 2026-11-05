"use client";

import { type ImageSlot, type SavedImage } from "../../ImageSlotCard";
import {
  compactDisabledButtonStyle,
  compactImageButtonStyle,
  compactPasteButtonStyle,
  compactViewButtonStyle,
  imageRegistrationButtonRowStyle,
  imageRegistrationCardStyle,
  imageRegistrationDescStyle,
  imageRegistrationHeaderStyle,
  imageRegistrationTitleStyle,
  multiImageDeleteButtonStyle,
  multiImageIndexBadgeStyle,
  multiImagePreviewButtonStyle,
  multiImagePreviewGridStyle,
  multiImagePreviewItemStyle,
  multiImagePreviewStyle,
} from "../styles";

export function ImageRegistrationCard({
  slot,
  image,
  images,
  onCamera,
  onLibrary,
  onPaste,
  onView,
  onViewImage,
  onDeleteImage,
}: {
  slot: ImageSlot;
  image?: SavedImage | null;
  images: SavedImage[];
  onCamera: () => void;
  onLibrary: () => void;
  onPaste: () => void;
  onView: () => void;
  onViewImage: (image: SavedImage) => void;
  onDeleteImage: (image: SavedImage) => void;
}) {
  return (
    <div style={imageRegistrationCardStyle}>
      <div style={imageRegistrationHeaderStyle}>
        <div style={imageRegistrationTitleStyle}>{slot.title}</div>
        <div style={imageRegistrationDescStyle}>{slot.description}</div>
      </div>

      <div style={imageRegistrationButtonRowStyle}>
        <button type="button" onClick={onCamera} style={compactImageButtonStyle}>
          촬영
        </button>
        <button type="button" onClick={onLibrary} style={compactImageButtonStyle}>
          사진첩
        </button>
        <button type="button" onClick={onPaste} style={compactPasteButtonStyle}>
          붙여넣기
        </button>
        <button type="button" onClick={onView} style={image ? compactViewButtonStyle : compactDisabledButtonStyle}>
          보기
        </button>
      </div>

      {images.length > 0 ? (
        <div style={multiImagePreviewGridStyle}>
          {images.map((item, index) => (
            <div key={item.id} style={multiImagePreviewItemStyle}>
              <button
                type="button"
                onClick={() => onViewImage(item)}
                aria-label={`${slot.title} ${index + 1}번째 이미지 보기`}
                style={multiImagePreviewButtonStyle}
              >
                <img src={item.dataUrl} alt={`${slot.title} ${index + 1}`} style={multiImagePreviewStyle} />
                <span style={multiImageIndexBadgeStyle}>{index + 1}</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteImage(item);
                }}
                aria-label={`${slot.title} ${index + 1}번째 이미지 삭제`}
                style={multiImageDeleteButtonStyle}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
