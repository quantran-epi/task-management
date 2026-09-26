/**
 * Parses user quick-add task string extracting optional trailing ~Xh Ym estimate.
 * Clamps estimate to 0-6000 minutes per D-24.
 * Examples:
 *   "Draft RFC ~2h" -> { name: "Draft RFC", estimateMinutes: 120 }
 *   "Review PR ~45m" -> { name: "Review PR", estimateMinutes: 45 }
 *   "Fix bug ~1h 30m" -> { name: "Fix bug", estimateMinutes: 90 }
 *   "Task with no estimate" -> { name: "Task with no estimate", estimateMinutes: 0 }
 */
export function parseQuickAddInput(rawInput: string): { name: string; estimateMinutes: number } {
  const tildeIndex = rawInput.lastIndexOf('~');
  if (tildeIndex === -1) {
    return { name: rawInput.trim(), estimateMinutes: 0 };
  }

  const estimatePart = rawInput.slice(tildeIndex + 1);
  const timeMatch = estimatePart.match(/^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i);

  if (timeMatch && (timeMatch[1] !== undefined || timeMatch[2] !== undefined)) {
    const hours = timeMatch[1] ? parseInt(timeMatch[1], 10) : 0;
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const totalMinutes = Math.min(6000, Math.max(0, hours * 60 + minutes));
    const name = rawInput.slice(0, tildeIndex).trim();
    return { name, estimateMinutes: totalMinutes };
  }

  return { name: rawInput.trim(), estimateMinutes: 0 };
}

/**
 * Formats integer minutes into human-friendly string (e.g. 150 -> "2h 30m", 60 -> "1h", 45 -> "45m", 0 -> "0m").
 * Negative or non-positive values format as "0m" per D-22.
 */
export function formatMinutes(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0 || !Number.isFinite(totalMinutes)) {
    return '0m';
  }

  const total = Math.floor(totalMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Validates that the input is an integer between 0 and 6000 inclusive (D-24).
 */
export function validateMinutes(minutes: unknown): boolean {
  return (
    typeof minutes === 'number' &&
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes <= 6000
  );
}
