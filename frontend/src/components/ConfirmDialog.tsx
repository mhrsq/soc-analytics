import { useEffect, useRef } from "react";
import { AlertTriangle, Info } from "lucide-react";

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "info";
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "info",
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === "danger";
  const Icon = isDanger ? AlertTriangle : Info;
  const iconColor = isDanger ? "#ef4444" : "var(--theme-accent)";
  const btnBg = isDanger
    ? "color-mix(in srgb, #ef4444 85%, #000)"
    : "var(--theme-accent)";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5"
        style={{
          background: "var(--theme-card-bg)",
          border: "1px solid var(--theme-surface-border)",
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `color-mix(in srgb, ${iconColor} 12%, transparent)` }}
          >
            <Icon size={18} style={{ color: iconColor }} />
          </div>
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--theme-text-primary)" }}
            >
              {title}
            </h3>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              {message}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] outline-none"
            style={{
              color: "var(--theme-text-secondary)",
              background: "var(--theme-surface-raised)",
              border: "1px solid var(--theme-surface-border)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] outline-none"
            style={{ background: btnBg, color: "#fff" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
