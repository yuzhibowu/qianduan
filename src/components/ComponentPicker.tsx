import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type Option = { id: string; name: string; category: string; poster: string };

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export default function ComponentPicker({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [preview, setPreview] = useState<{
    option: Option;
    x: number;
    y: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setFocusedIndex(selectedIndex);
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, selectedIndex]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    setOpen(false);
    setPreview(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(focusedIndex);
      else setOpen(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setFocusedIndex(selectedIndex);
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setFocusedIndex(
        (index) => (index + direction + options.length) % options.length,
      );
    }
  };

  return (
    <div className="component-picker" ref={rootRef}>
      <button
        type="button"
        className="component-picker-trigger"
        aria-label="组件"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.name}</span>
        <span className={`component-picker-arrow ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div
          className="component-picker-menu"
          role="listbox"
          aria-label="组件"
          onPointerLeave={() => setPreview(null)}
        >
          {options.map((option, index) => {
            const isSelected = option.id === value;
            return (
              <div className="component-picker-item" key={option.id}>
                {index > 0 &&
                  options[index - 1].category !== option.category && (
                    <div
                      className="component-picker-divider"
                      aria-hidden="true"
                    />
                  )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`component-picker-option ${isSelected ? "selected" : ""} ${focusedIndex === index ? "focused" : ""}`}
                  onPointerEnter={(event) => {
                    setFocusedIndex(index);
                    setPreview({
                      option,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onPointerMove={(event) =>
                    setPreview({
                      option,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }
                  onClick={() => choose(index)}
                >
                  {option.name}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {open && preview && (
        <div
          className="component-picker-preview"
          style={{
            left: Math.min(preview.x + 16, window.innerWidth - 204),
            top: Math.min(
              Math.max(12, preview.y - 56),
              window.innerHeight - 132,
            ),
          }}
        >
          <img src={preview.option.poster} alt="" />
          <span>{preview.option.name}</span>
        </div>
      )}
    </div>
  );
}
