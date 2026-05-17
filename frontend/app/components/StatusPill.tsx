type Props = { label?: string };

export default function StatusPill({ label }: Props) {
  const text = label || '정보 없음';
  const lower = text.toLowerCase();

  let className = 'status-ok';
  if (lower.includes('지연') || lower.includes('변경') || lower.includes('대기')) className = 'status-warn';
  if (lower.includes('결항') || lower.includes('회항') || lower.includes('취소')) className = 'status-bad';

  return <span className={className}>{text}</span>;
}
