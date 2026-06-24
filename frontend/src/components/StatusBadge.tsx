interface Props {
  show: boolean;
  label: string;
  variant?: "quiet" | "ink";
}

export default function StatusBadge({ show, label, variant = "quiet" }: Props) {
  if (!show) return null;
  return (
    <span className={variant === "ink" ? "badge-ink" : "badge-quiet"}>{label}</span>
  );
}