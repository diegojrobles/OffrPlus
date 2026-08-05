import { useEffect, useRef, useState } from "react";
import "./ColumnPicker.css";

export interface ColumnOption {
  id: string;
  label: string;
  /** Locked columns are always shown and cannot be toggled off. */
  locked?: boolean;
}

interface ColumnPickerProps {
  options: ColumnOption[];
  isVisible: (id: string) => boolean;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  hiddenCount: number;
  /** Optional extra control rendered at the bottom of the menu. */
  footer?: React.ReactNode;
}

export function ColumnPicker({
  options,
  isVisible,
  onToggle,
  onShowAll,
  hiddenCount,
  footer,
}: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="column-picker" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Columns
        {hiddenCount > 0 && <span className="column-picker-badge">{hiddenCount}</span>}
      </button>

      {open && (
        <div className="column-picker-menu" role="menu">
          <div className="column-picker-head">
            <span>Show columns</span>
            {hiddenCount > 0 && (
              <button type="button" className="link-btn" onClick={onShowAll}>
                Show all
              </button>
            )}
          </div>

          <div className="column-picker-list">
            {options.map((opt) => (
              <label
                key={opt.id}
                className={`column-picker-item${opt.locked ? " is-locked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={opt.locked ? true : isVisible(opt.id)}
                  disabled={opt.locked}
                  onChange={() => onToggle(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          {footer && <div className="column-picker-footer">{footer}</div>}
        </div>
      )}
    </div>
  );
}
