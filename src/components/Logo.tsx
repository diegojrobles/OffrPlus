/**
 * Offr+ brand components.
 *
 * These are exact vector traces of the supplied artwork, produced by
 * color-separating the highest-resolution image in the brand PDF and
 * tracing each connected component (mean boundary deviation ≈ 0.33 px
 * of the source raster; max < 1 px). Path data lives in logoPaths.ts.
 *
 * Layer colors are CSS variables (set per theme in index.css) with the
 * artwork's own values as fallbacks; ink layers use currentColor so the
 * mark follows the surrounding text color.
 */
import {
  mark_arrow,
  mark_dot_center,
  mark_dot_light,
  mark_green_outer,
  mark_grey,
  mark_ink_mid,
  mark_ink_outer,
  mark_ink_ul,
  wm_green_light,
  wm_green_main,
  wm_grey,
  wm_ink,
} from "./logoPaths";

const GREEN = "var(--logo-green, #96be6e)";
const GREEN_LIGHT = "var(--logo-green-light, #aac88c)";
const GREY = "var(--logo-grey, #c8c8c8)";

interface MarkProps {
  size?: number;
  className?: string;
  /** Slow orbit animation on the two outer arcs (landing hero). */
  animated?: boolean;
  title?: string;
}

/** The icon: traced at 3× from the 878px lockup. viewBox is centered on the mark. */
export function OrbitMark({
  size = 32,
  className,
  animated = false,
  title = "Offr+",
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="325 686.5 757 757"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <g
        className={animated ? "orbit-spin" : undefined}
        style={{ transformOrigin: "703.5px 1065px" }}
      >
        <path d={mark_green_outer} fill={GREEN} fillRule="evenodd" />
        <path d={mark_ink_outer} fill="currentColor" fillRule="evenodd" />
      </g>
      <path d={mark_ink_ul} fill="currentColor" fillRule="evenodd" />
      <path d={mark_ink_mid} fill="currentColor" fillRule="evenodd" />
      <path d={mark_grey} fill={GREY} fillRule="evenodd" />
      <path d={mark_arrow} fill={GREEN} fillRule="evenodd" />
      <path d={mark_dot_center} fill={GREEN} fillRule="evenodd" />
      <path d={mark_dot_light} fill={GREEN_LIGHT} fillRule="evenodd" />
    </svg>
  );
}

interface WordmarkProps {
  /** Rendered height in px. Width follows the lockup's aspect ratio. */
  size?: number;
  className?: string;
}

/**
 * The full horizontal lockup — mark + "ffr+" — traced as one unit from
 * the poster art, so letterforms, spacing, and mark-to-type scale are
 * exactly the original's.
 */
export function Wordmark({ size = 30, className }: WordmarkProps) {
  const width = Math.round(size * (2802 / 1029));
  return (
    <svg
      width={width}
      height={size}
      viewBox="483 1008 2802 1029"
      fill="none"
      className={className}
      role="img"
      aria-label="Offr+"
    >
      <path d={wm_ink} fill="currentColor" fillRule="evenodd" />
      <path d={wm_grey} fill={GREY} fillRule="evenodd" />
      <path d={wm_green_main} fill={GREEN} fillRule="evenodd" />
      <path d={wm_green_light} fill={GREEN_LIGHT} fillRule="evenodd" />
    </svg>
  );
}
