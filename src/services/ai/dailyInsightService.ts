import type { PlannedAllocationWithTask } from '../../db/repositories/allocationRepo';

export interface BriefingInput {
  date: string;
  capacityMinutes: number;
  allocations: PlannedAllocationWithTask[];
}

export interface DebriefingInput {
  date: string;
  capacityMinutes: number;
  loggedMinutes: number;
  allocations: PlannedAllocationWithTask[];
}

export interface DeterministicBriefingResult {
  date: string;
  plannedMinutes: number;
  capacityMinutes: number;
  loadPercent: number;
  isOverCapacity: boolean;
  highPriorityCount: number;
  activeTaskCount: number;
  status: 'empty' | 'underloaded' | 'balanced' | 'overloaded';
  recommendations: string[];
}

export interface DeterministicDebriefingResult {
  date: string;
  loggedMinutes: number;
  capacityMinutes: number;
  capacityPercent: number;
  isOverCapacity: boolean;
  completedCount: number;
  incompleteCount: number;
  completionRate: number;
  rolloverSuggestions: string[];
}

export function generateDeterministicBriefing(
  input: BriefingInput
): DeterministicBriefingResult {
  const { date, capacityMinutes, allocations } = input;
  const activeAllocs = allocations.filter(
    (a) => a.isActive && a.task.status !== 'Cancelled'
  );

  const plannedMinutes = activeAllocs.reduce(
    (sum, a) => sum + (a.allocatedMinutes || 0),
    0
  );

  const loadPercent =
    capacityMinutes > 0
      ? Math.round((plannedMinutes / capacityMinutes) * 100)
      : 0;

  const isOverCapacity = plannedMinutes > capacityMinutes && capacityMinutes > 0;

  const highPriorityCount = activeAllocs.filter(
    (a) => a.task.priority === 'High'
  ).length;

  let status: DeterministicBriefingResult['status'] = 'balanced';
  const recommendations: string[] = [];

  if (activeAllocs.length === 0) {
    status = 'empty';
    recommendations.push(
      'Chưa có công việc nào được lên kế hoạch cho ngày hôm nay. Hãy phân bổ các tác vụ quan trọng từ danh sách.'
    );
  } else if (isOverCapacity) {
    status = 'overloaded';
    recommendations.push(
      `Khối lượng công việc dự kiến (${plannedMinutes}p) vượt quá công suất (${capacityMinutes}p). Hãy giảm bớt hoặc chuyển việc ít khẩn cấp sang ngày mai.`
    );
    if (highPriorityCount > 0) {
      recommendations.push(
        `Tập trung xử lý trước ${highPriorityCount} công việc ưu tiên Cao để giảm rủi ro trễ hạn.`
      );
    }
  } else if (loadPercent < 50 && capacityMinutes > 0) {
    status = 'underloaded';
    recommendations.push(
      `Kế hoạch chỉ chiếm ${loadPercent}% công suất ngày. Bạn có thể kéo thêm công việc tồn đọng để giải phóng tuần tới.`
    );
  } else {
    status = 'balanced';
    recommendations.push(
      `Khối lượng công việc cân bằng (${loadPercent}% công suất). Giữ nhịp độ ổn định và ưu tiên việc quan trọng đầu buổi sáng.`
    );
  }

  return {
    date,
    plannedMinutes,
    capacityMinutes,
    loadPercent,
    isOverCapacity,
    highPriorityCount,
    activeTaskCount: activeAllocs.length,
    status,
    recommendations,
  };
}

export function generateDeterministicDebriefing(
  input: DebriefingInput
): DeterministicDebriefingResult {
  const { date, capacityMinutes, loggedMinutes, allocations } = input;
  const relevantAllocs = allocations.filter(
    (a) => a.task.status !== 'Cancelled'
  );

  const completedAllocs = relevantAllocs.filter(
    (a) => a.task.status === 'Done' || !a.isActive
  );
  const incompleteAllocs = relevantAllocs.filter(
    (a) => a.isActive && a.task.status !== 'Done'
  );

  const totalCount = relevantAllocs.length;
  const completedCount = completedAllocs.length;
  const incompleteCount = incompleteAllocs.length;

  const completionRate =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const capacityPercent =
    capacityMinutes > 0
      ? Math.round((loggedMinutes / capacityMinutes) * 100)
      : 0;

  const isOverCapacity = loggedMinutes > capacityMinutes && capacityMinutes > 0;

  const rolloverSuggestions: string[] = incompleteAllocs.map((a) => {
    const pText = a.task.priority === 'High' ? ' [Ưu tiên Cao]' : '';
    return `${a.task.name}${pText} (${a.allocatedMinutes || 0}p)`;
  });

  return {
    date,
    loggedMinutes,
    capacityMinutes,
    capacityPercent,
    isOverCapacity,
    completedCount,
    incompleteCount,
    completionRate,
    rolloverSuggestions,
  };
}

export function buildBriefingPrompt(input: BriefingInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const briefing = generateDeterministicBriefing(input);
  const taskLines = input.allocations
    .filter((a) => a.isActive && a.task.status !== 'Cancelled')
    .map(
      (a, i) =>
        `${i + 1}. [${a.task.priority}] "${a.task.name}" - ${a.allocatedMinutes} phút (Trạng thái: ${a.task.status})`
    )
    .join('\n');

  const systemPrompt = `Bạn là trợ lý cá nhân tinh nhuệ về quản lý năng suất cá nhân trong ứng dụng PlannerMate.
Mục tiêu: Đưa ra nhận xét định hướng đầu ngày (Morning Briefing) ngắn gọn, thực tế, động viên và khả thi.
Yêu cầu:
- Trả lời bằng tiếng Việt, súc tích (dưới 150 từ), dùng Markdown.
- Nhận diện các rủi ro quá tải hoặc phân bổ chưa hợp lý nếu có.
- Gợi ý thứ tự 1-3 việc trọng tâm nhất nên giải quyết trước buổi trưa.
- Không bịa đặt thông tin; chỉ dựa trên danh sách công việc được cung cấp.`;

  const userPrompt = `Dữ liệu kế hoạch ngày ${input.date}:
- Công suất mục tiêu: ${input.capacityMinutes} phút
- Tổng thời gian đã lên lịch: ${briefing.plannedMinutes} phút (${briefing.loadPercent}% công suất)
- Trạng thái tải: ${briefing.status}
- Số việc ưu tiên Cao: ${briefing.highPriorityCount}

Danh sách công việc dự kiến:
${taskLines || '(Chưa có công việc nào)'}

Hãy đưa ra lời khuyên ngắn gọn giúp tôi khởi động ngày làm việc hiệu quả nhất.`;

  return { systemPrompt, userPrompt };
}

export function buildDebriefingPrompt(input: DebriefingInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const debriefing = generateDeterministicDebriefing(input);
  const completedLines = input.allocations
    .filter((a) => a.task.status === 'Done' || !a.isActive)
    .map((a) => `- [Hoàn thành] "${a.task.name}"`)
    .join('\n');

  const incompleteLines = input.allocations
    .filter((a) => a.isActive && a.task.status !== 'Done' && a.task.status !== 'Cancelled')
    .map(
      (a) =>
        `- [Chưa xong] [${a.task.priority}] "${a.task.name}" - Kế hoạch: ${a.allocatedMinutes}p`
    )
    .join('\n');

  const systemPrompt = `Bạn là trợ lý cá nhân tinh nhuệ về quản lý năng suất cá nhân trong ứng dụng PlannerMate.
Mục tiêu: Đưa ra nhận xét tổng kết cuối ngày (Evening Debriefing / Standup) sắc sảo, trung thực, mang tính xây dựng.
Yêu cầu:
- Trả lời bằng tiếng Việt, súc tích (dưới 150 từ), định dạng Markdown.
- Ghi nhận những gì đã đạt được.
- Phân tích việc chưa hoàn thành và gợi ý chiến lược chuyển sang ngày mai (rollover).
- Không rườm rà sáo rỗng.`;

  const userPrompt = `Dữ liệu tổng kết ngày ${input.date}:
- Thời gian làm thực tế: ${input.loggedMinutes} phút / Mục tiêu: ${input.capacityMinutes} phút (${debriefing.capacityPercent}%)
- Tỷ lệ hoàn thành công việc: ${debriefing.completedCount}/${debriefing.completedCount + debriefing.incompleteCount} việc (${debriefing.completionRate}%)

Các việc đã xong:
${completedLines || '(Không có việc nào hoàn thành)'}

Các việc chưa hoàn thành cần xử lý:
${incompleteLines || '(Tất cả việc đều đã hoàn thành)'}

Hãy đưa ra đánh giá tổng kết ngày và lời khuyên xử lý việc tồn đọng cho ngày mai.`;

  return { systemPrompt, userPrompt };
}
