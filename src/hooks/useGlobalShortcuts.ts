import { useState, useEffect, useRef, useMemo } from 'react';
import type { AppRoute } from '../types/navigation';
import type { ShortcutItem } from '../types/shortcuts';
import { isInputFocused, isModPressed } from '../utils/keyboard';

export interface UseGlobalShortcutsOptions {
  currentRoute?: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onTogglePalette: () => void;
  onToggleAiChat: () => void;
  onCreateTask: () => void;
  onCreateNote: () => void;
  onToggleSidebar: () => void;
  onManualSync?: () => void;
  extraShortcuts?: ShortcutItem[];
}

export function useGlobalShortcuts({
  onNavigate,
  onTogglePalette,
  onToggleAiChat,
  onCreateTask,
  onCreateNote,
  onToggleSidebar,
  onManualSync,
  extraShortcuts = [],
}: UseGlobalShortcutsOptions) {
  const [hudOpen, setHudOpen] = useState(false);
  const altTimerRef = useRef<number | null>(null);
  const altKeyHeldRef = useRef(false);

  // Define standard shortcuts
  const baseShortcuts: ShortcutItem[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-dashboard',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Màn hình Tổng quan',
      description: 'Xem tóm tắt tiến độ, phân bổ thời gian và cảnh báo',
      keys: ['Alt', '1'],
      keywords: ['dashboard', 'tong quan', 'overview'],
      action: () => onNavigate('dashboard'),
    },
    {
      id: 'nav-tasks',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Danh sách Tác vụ',
      description: 'Quản lý, lọc, gắn nhãn và theo dõi tác vụ',
      keys: ['Alt', '2'],
      keywords: ['tasks', 'tac vu', 'cong viec', 'todo'],
      action: () => onNavigate('tasks'),
    },
    {
      id: 'nav-planner',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Lập kế hoạch tuần',
      description: 'Phân bổ công việc vào từng ngày theo dung lượng',
      keys: ['Alt', '3'],
      keywords: ['planner', 'ke hoach', 'lich', 'schedule'],
      action: () => onNavigate('planner'),
    },
    {
      id: 'nav-projects',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Quản lý Dự án & Cột mốc',
      description: 'Cấu trúc công việc theo dự án và các mốc bàn giao',
      keys: ['Alt', '4'],
      keywords: ['projects', 'du an', 'milestone', 'cot moc'],
      action: () => onNavigate('projects'),
    },
    {
      id: 'nav-notes',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Ghi chú công việc',
      description: 'Tạo, ghim và đính kèm ghi chú vào tác vụ / dự án',
      keys: ['Alt', '5'],
      keywords: ['notes', 'ghi chu', 'memo', 'so tay'],
      action: () => onNavigate('notes'),
    },
    {
      id: 'nav-analytics',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Báo cáo & Thống kê',
      description: 'Biểu đồ hiệu suất, ước tính vs thực tế, heatmap',
      keys: ['Alt', '6'],
      keywords: ['analytics', 'thong ke', 'bao cao', 'charts'],
      action: () => onNavigate('analytics'),
    },
    {
      id: 'nav-settings',
      category: 'navigation',
      categoryLabel: 'Chuyển trang',
      title: 'Cài đặt hệ thống',
      description: 'Cấu hình dung lượng, sao lưu GitHub, thông báo, AI',
      keys: ['Alt', '7'],
      keywords: ['settings', 'cai dat', 'config', 'backup'],
      action: () => onNavigate('settings'),
    },

    // Global Actions
    {
      id: 'global-palette',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Mở Command Palette',
      description: 'Tìm kiếm nhanh mọi dữ liệu và thực thi lệnh tức thì',
      keys: ['Mod', 'K'],
      keywords: ['search', 'tim kiem', 'palette', 'lenh'],
      action: onTogglePalette,
    },
    {
      id: 'global-ai-assistant',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Mở Trợ lý AI',
      description: 'Lập kế hoạch thông minh, hỏi đáp tiến độ công việc',
      keys: ['Mod', 'J'],
      keywords: ['ai', 'chat', 'tro ly', 'assistant'],
      action: onToggleAiChat,
    },
    {
      id: 'global-new-task',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Tạo nhanh Tác vụ mới',
      description: 'Tạo tác vụ mới từ bất kỳ màn hình nào',
      keys: ['Mod', 'N'],
      keywords: ['new task', 'tao tac vu', 'them task'],
      action: onCreateTask,
    },
    {
      id: 'global-new-note',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Tạo nhanh Ghi chú mới',
      description: 'Mở trình soạn thảo ghi chú nhanh',
      keys: ['Mod', 'Shift', 'N'],
      keywords: ['new note', 'tao ghi chu', 'them note'],
      action: onCreateNote,
    },
    {
      id: 'global-toggle-sidebar',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Đóng / Mở Menu bên',
      description: 'Thu gọn hoặc mở rộng thanh điều hướng để tăng diện tích làm việc',
      keys: ['Mod', 'B'],
      keywords: ['sidebar', 'menu', 'thu gon', 'mo rong'],
      action: onToggleSidebar,
    },
    {
      id: 'global-manual-sync',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Đồng bộ GitHub ngay',
      description: 'Đẩy thay đổi lên kho lưu trữ GitHub đã cấu hình',
      keys: ['Mod', 'Shift', 'S'],
      keywords: ['sync', 'github', 'dong bo', 'push', 'backup'],
      action: () => onManualSync?.(),
    },
    {
      id: 'global-shortcuts-help',
      category: 'global',
      categoryLabel: 'Thao tác chung',
      title: 'Bảng phím tắt ứng dụng',
      description: 'Mở gợi ý và danh mục phím tắt đầy đủ',
      keys: ['Shift', '?'],
      keywords: ['help', 'tro giup', 'phim tat', 'shortcuts'],
      action: () => setHudOpen(true),
    },
  ], [
    onNavigate,
    onTogglePalette,
    onToggleAiChat,
    onCreateTask,
    onCreateNote,
    onToggleSidebar,
    onManualSync,
  ]);

  const allShortcuts = useMemo(() => {
    return [...baseShortcuts, ...extraShortcuts];
  }, [baseShortcuts, extraShortcuts]);

  // Global key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in input / textarea, only allow Mod+S or Esc, ignore navigation/alt HUD
      const inInput = isInputFocused(e.target);

      // Handle Escape to close HUD
      if (e.key === 'Escape' && hudOpen) {
        e.preventDefault();
        setHudOpen(false);
        return;
      }

      // Check Shift + ? (or Mod + /) to open HUD
      if (!inInput && (e.key === '?' || (e.shiftKey && e.key === '/') || (isModPressed(e) && e.key === '/'))) {
        e.preventDefault();
        setHudOpen((prev) => !prev);
        return;
      }

      // Alt key hold detection (200ms) for HUD autocomplete
      if (e.key === 'Alt') {
        if (!altKeyHeldRef.current && !inInput) {
          altKeyHeldRef.current = true;
          if (altTimerRef.current) window.clearTimeout(altTimerRef.current);
          altTimerRef.current = window.setTimeout(() => {
            if (altKeyHeldRef.current) {
              setHudOpen(true);
            }
          }, 200);
        }
        return;
      }

      // If user pressed any other key while holding Alt, cancel the HUD timer
      if (altTimerRef.current) {
        window.clearTimeout(altTimerRef.current);
        altTimerRef.current = null;
      }

      // Handle Mod key combos (Mod+K, Mod+J, Mod+N, Mod+Shift+N, Mod+B, Mod+Shift+S)
      if (isModPressed(e)) {
        const key = e.key.toLowerCase();
        if (key === 'k') {
          e.preventDefault();
          onTogglePalette();
          return;
        }
        if (key === 'j') {
          e.preventDefault();
          onToggleAiChat();
          return;
        }
        if (key === 'b') {
          e.preventDefault();
          onToggleSidebar();
          return;
        }
        if (key === 'n') {
          e.preventDefault();
          if (e.shiftKey) {
            onCreateNote();
          } else {
            onCreateTask();
          }
          return;
        }
        if (key === 's' && e.shiftKey) {
          e.preventDefault();
          onManualSync?.();
          return;
        }
      }

      // Handle Alt + Number (Alt + 1..7) for Navigation
      if (e.altKey && !e.ctrlKey && !e.metaKey && !inInput) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 7) {
          e.preventDefault();
          if (hudOpen) setHudOpen(false);
          const routeMap: Record<number, AppRoute> = {
            1: 'dashboard',
            2: 'tasks',
            3: 'planner',
            4: 'projects',
            5: 'notes',
            6: 'analytics',
            7: 'settings',
          };
          const target = routeMap[num];
          if (target) {
            onNavigate(target);
          }
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altKeyHeldRef.current = false;
        if (altTimerRef.current) {
          window.clearTimeout(altTimerRef.current);
          altTimerRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      if (altTimerRef.current) {
        window.clearTimeout(altTimerRef.current);
      }
    };
  }, [
    hudOpen,
    onNavigate,
    onTogglePalette,
    onToggleAiChat,
    onCreateTask,
    onCreateNote,
    onToggleSidebar,
    onManualSync,
  ]);

  return {
    hudOpen,
    setHudOpen,
    allShortcuts,
  };
}
