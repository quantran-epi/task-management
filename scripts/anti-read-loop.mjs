import fs from 'node:fs';

const STATE_FILE = '/tmp/claude_read_history.json';
const MIN_CHUNK_LINES = 150;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

async function main() {
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    process.exit(0);
  }

  let hookData: any = null;
  try {
    hookData = JSON.parse(rawInput);
  } catch {
    process.exit(0);
  }

  const toolName = hookData.tool_name || hookData.name;
  if (toolName !== 'Read') {
    process.exit(0);
  }

  const input = hookData.tool_input || hookData.input || {};
  const filePath = input.file_path;
  const limit = input.limit ? Number(input.limit) : null;
  const allowLarge = Boolean(input.allow_large);

  if (!filePath) {
    process.exit(0);
  }

  // 1. Chặn đọc lắt nhắt dưới 150 dòng nếu không phải file nhỏ đọc toàn bộ
  if (limit !== null && limit < MIN_CHUNK_LINES && !allowLarge) {
    process.stderr.write(
      `[ANTI-READ-LOOP HOOK] BỊ CHẶN: Bạn đang cố gọi Read với limit=${limit} (< ${MIN_CHUNK_LINES} dòng). Quy tắc bắt buộc: Phải đọc rộng (>= 150 dòng hoặc allow_large: true). Không đọc vụn vặt!\n`
    );
    process.exit(1);
  }

  // 2. Chặn đọc lặp lại file vừa đọc gần đây trong vòng vài turn
  let history: { filePath: string; timestamp: number }[] = [];
  try {
    if (fs.existsSync(STATE_FILE)) {
      history = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    history = [];
  }

  const now = Date.now();
  // Giữ lịch sử trong 5 phút gần nhất
  history = history.filter((item) => now - item.timestamp < 5 * 60 * 1000);

  // Đếm số lần đọc file này trong 2 phút gần nhất
  const recentReads = history.filter(
    (item) => item.filePath === filePath && now - item.timestamp < 2 * 60 * 1000
  );

  if (recentReads.length >= 2) {
    process.stderr.write(
      `[ANTI-READ-LOOP HOOK] BỊ CHẶN: File "${filePath}" đã được đọc ${recentReads.length} lần trong 2 phút qua. Nội dung đã nằm trong hội thoại. Dùng context đã có để gọi Edit hoặc dừng ngay, CẤM RE-READ LẶP LẠI!\n`
    );
    process.exit(1);
  }

  // Ghi nhận lần đọc thành công
  history.push({ filePath, timestamp: now });
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(history), 'utf-8');
  } catch {
    // ignore
  }

  process.exit(0);
}

main();
