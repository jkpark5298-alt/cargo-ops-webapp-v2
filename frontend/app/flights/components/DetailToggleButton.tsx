"use client";

export function DetailToggleButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 34,
        height: 30,
        padding: "0 10px",
        borderRadius: 6,
        border: "1px solid #36527f",
        background: expanded ? "#1d4ed8" : "#10213d",
        color: "white",
        fontWeight: 800,
        cursor: "pointer",
      }}
      aria-label="detail"
      title="DETAIL"
    >
      D
    </button>
  );
}
