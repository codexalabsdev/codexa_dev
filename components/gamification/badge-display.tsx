import { Award } from "lucide-react";

type BadgeDisplayProps = {
  name: string;
  description?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

const colors: Record<string, string> = {
  cyan: "text-cyan-300",
  violet: "text-violet-300",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
};
const sizes = { sm: "size-10", md: "size-14", lg: "size-20" };

export function BadgeDisplay({
  name,
  description,
  color = "cyan",
  imageUrl,
  size = "md",
  showLabel = true,
}: BadgeDisplayProps) {
  return (
    <div
      tabIndex={0}
      className="group relative inline-flex flex-col items-center outline-none"
      aria-label={`${name}${description ? `: ${description}` : ""}`}
    >
      <div
        className={`${sizes[size]} grid place-items-center overflow-hidden rounded-full text-current transition duration-200 group-hover:scale-105 group-focus-visible:scale-105 ${colors[color ?? "cyan"] ?? colors.cyan}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Ícone do emblema ${name}`}
            className="size-full object-cover"
          />
        ) : (
          <Award className="size-1/2" aria-hidden="true" />
        )}
      </div>
      {showLabel && (
        <span className="mt-2 block w-full max-w-28 truncate text-center text-[11px] font-semibold text-slate-200">
          {name}
        </span>
      )}
      {description && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 w-52 -translate-x-1/2 translate-y-1 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          <span className="block rounded-lg border border-white/[0.12] bg-[#0b1017] px-3 py-2 text-left text-[11px] leading-4 text-slate-300 shadow-xl">
            {description}
          </span>
        </span>
      )}
    </div>
  );
}
