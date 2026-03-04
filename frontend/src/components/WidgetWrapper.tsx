import { Pencil, Trash2, GripVertical } from "lucide-react";
import type { WidgetConfig } from "../types";
import { Card } from "./Card";

interface Props {
  widget: WidgetConfig;
  editMode: boolean;
  onEdit: () => void;
  onRemove: () => void;
  tooltip?: string;
  children: React.ReactNode;
}

export function WidgetWrapper({ widget, editMode, onEdit, onRemove, tooltip, children }: Props) {
  return (
    <Card
      className={`h-full flex flex-col ${editMode ? "ring-1 ring-offset-1" : ""}`}
      noPad
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 sm:px-4 pt-2 sm:pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          {editMode && (
            <GripVertical className="w-4 h-4 cursor-grab flex-shrink-0 drag-handle" style={{ color: "var(--theme-text-muted)" }} />
          )}
          <h3
            className={`text-xs font-medium truncate${tooltip ? " guide-tip guide-tip-below" : ""}`}
            data-tip={tooltip || undefined}
            style={{ color: "var(--theme-text-muted)" }}
          >
            <span className="w-1 h-3 rounded-full inline-block mr-2 align-middle" style={{ backgroundColor: "var(--theme-accent)" }} />
            {widget.name}
          </h3>
        </div>

        {editMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-1 rounded transition-colors hover:opacity-80"
              style={{ color: "var(--theme-text-muted)" }}
              title="Edit widget"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {!widget.builtIn && (
              <button
                onClick={onRemove}
                className="p-1 rounded transition-colors hover:opacity-80 text-red-400"
                title="Remove widget"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-2.5 sm:px-4 pb-2 sm:pb-3 min-h-0 overflow-hidden">
        {children}
      </div>
    </Card>
  );
}
