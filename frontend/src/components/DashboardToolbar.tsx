import { Pencil, Plus, RotateCcw, Check, Lock, Unlock } from "lucide-react";

interface Props {
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onReset: () => void;
}

export function DashboardToolbar({ editMode, onToggleEdit, onAddWidget, onReset }: Props) {
  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg border transition-all duration-300"
      style={{
        backgroundColor: editMode ? "color-mix(in srgb, var(--theme-accent) 5%, transparent)" : "var(--theme-card-bg)",
        borderColor: editMode ? "color-mix(in srgb, var(--theme-accent) 25%, transparent)" : "var(--theme-card-border)",
      }}
    >
      {/* Edit toggle */}
      <button
        onClick={onToggleEdit}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border"
        style={{
          borderColor: editMode ? "var(--theme-accent)" : "var(--theme-surface-border)",
          color: editMode ? "var(--theme-accent)" : "var(--theme-text-muted)",
          backgroundColor: editMode ? "color-mix(in srgb, var(--theme-accent) 15%, transparent)" : "transparent",
        }}
      >
        {editMode ? (
          <>
            <Check className="w-3.5 h-3.5" />
            Done Editing
          </>
        ) : (
          <>
            <Pencil className="w-3.5 h-3.5" />
            Edit Dashboard
          </>
        )}
      </button>

      {editMode && (
        <>
          <div className="h-4 w-px" style={{ backgroundColor: "var(--theme-surface-border)" }} />

          {/* Add Widget */}
          <button
            onClick={onAddWidget}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Widget
          </button>

          {/* Reset */}
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
            style={{ borderColor: "var(--theme-surface-border)", color: "var(--theme-text-muted)" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
            <Unlock className="w-3 h-3" />
            Drag &amp; drop to rearrange · Resize from corners
          </div>
        </>
      )}

      {!editMode && (
        <div className="flex items-center gap-1.5 text-[10px] ml-2" style={{ color: "var(--theme-text-muted)", opacity: 0.6 }}>
          <Lock className="w-3 h-3" />
          Layout locked
        </div>
      )}
    </div>
  );
}
