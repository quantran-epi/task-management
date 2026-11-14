import type { AiOfficeDeleteResult } from '../../../db/repositories/aiOfficeRepo';

/**
 * IN-04: one home for the failure copy — both delete surfaces render it.
 */
export const DELETE_FAILED_COPY = 'Không xóa được. Thử lại.';

/**
 * D-10/D-11/D-12: the repo decides, the view only renders. Names only — never an id (T-36-15).
 * An empty `usedBy` means a running turn holds the profile (D-13), not a roster reference.
 *
 * Shared by the AI Office view and the staff explorer so both surfaces refuse with the same copy.
 */
export function refusalMessage(result: AiOfficeDeleteResult): string | null {
  if (result.deleted) return null;
  // The union overlaps on `entity: 'employee'`, so narrow on the payload shape instead.
  if (result.entity === 'skill' || result.usedBy.some((row) => 'agentName' in row)) {
    const names = result.usedBy
      .map((row) => ('agentName' in row ? row.agentName : ''))
      .filter(Boolean)
      .join(', ');
    return names
      ? `Không thể xóa kỹ năng vì đang được gán cho: ${names}. Gỡ kỹ năng khỏi các nhân viên đó trước.`
      : 'Không thể xóa kỹ năng vì một lượt chạy đang dùng nó. Đợi lượt chạy kết thúc rồi thử lại.';
  }
  const names = result.usedBy
    .map((row) => ('teamName' in row ? row.teamName : ''))
    .filter(Boolean)
    .join(', ');
  const subject = result.entity === 'lead' ? 'lead' : 'nhân viên';
  return names
    ? `Không thể xóa ${subject} vì đang được dùng trong nhóm: ${names}. Gỡ khỏi các nhóm đó trước.`
    : `Không thể xóa ${subject} vì một lượt chạy đang dùng hồ sơ này. Đợi lượt chạy kết thúc rồi thử lại.`;
}
