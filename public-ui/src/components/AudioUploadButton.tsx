import { useRef } from "react";

/** A styled button standing in for a bare `<input type="file">` — clicking
 * it opens the same native file picker, but it looks like a real "upload
 * audio" action instead of raw browser chrome ("Choose File / No file
 * chosen"). Also owns the reset-after-select fix: an unmanaged file input's
 * `value` never clears itself, so picking the same file twice in a row
 * silently no-ops on the second pick without this. */
export const AudioUploadButton: React.FC<{ label: string; icon: string; onFile: (file: File) => void }> = ({
  label,
  icon,
  onFile,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-text bg-panel border-2 border-border rounded-full px-3 py-1.5 cursor-pointer brutal-shadow-sm transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        <span aria-hidden="true">{icon}</span>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
};
