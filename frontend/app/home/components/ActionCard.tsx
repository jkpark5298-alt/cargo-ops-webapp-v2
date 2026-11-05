"use client";

import {
  cardDescriptionStyle,
  cardLabelStyle,
  cardStyle,
  cardTitleStyle,
  primaryButtonStyle,
} from "../styles";

export function ActionCard({
  label,
  title,
  description,
  buttonLabel,
  onClick,
  accent,
}: {
  label: string;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <section style={{ ...cardStyle, borderColor: `${accent}66` }}>
      <div style={cardLabelStyle}>{label}</div>
      <h2 style={cardTitleStyle}>{title}</h2>
      <p style={cardDescriptionStyle}>{description}</p>
      <button
        onClick={onClick}
        style={{ ...primaryButtonStyle, background: accent }}
      >
        {buttonLabel}
      </button>
    </section>
  );
}
