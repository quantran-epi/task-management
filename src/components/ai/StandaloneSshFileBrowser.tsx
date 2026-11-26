import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  Space,
  Spin,
  Tree,
  Typography,
  useAntdToken,
} from "../ui";
import { FolderOpenOutlined, SearchOutlined } from "../ui/icon";
import { db as defaultDb, type TaskPlannerDatabase } from "../../db";
import {
  cancelRemoteCall,
  execRemoteCommand,
  getSshConfigById,
  listRemoteDir,
} from "../../services/sshService";
import {
  getSshFsToolConfig,
  resolveRemoteToolPath,
  shellQuote,
} from "../../services/ai/sshFsToolService";
import type { RemoteFileInfo } from "../../types/ssh";

const { Text } = Typography;

export interface StandaloneSshFileBrowserProps {
  open: boolean;
  onClose: () => void;
  onAttach: (paths: string[]) => void;
  /** Standalone chat uses the chat-window DB; no fallback to the default DB. */
  db?: TaskPlannerDatabase;
}

interface BrowseEntry {
  path: string;
  name: string;
  isDir: boolean;
}

function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return path;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}` || ".";
}

/**
 * Standalone-only SSH file picker. Browsing reads directory metadata and filename search only;
 * attaching hands normalized identity paths to the caller. No file content is read here.
 */
export const StandaloneSshFileBrowser: React.FC<
  StandaloneSshFileBrowserProps
> = ({ open, onClose, onAttach, db = defaultDb }) => {
  const { token } = useAntdToken();
  const [basePath, setBasePath] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchPaths, setSearchPaths] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const callIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConfigError(null);
    setBasePath(null);
    setCurrentPath(".");
    setEntries([]);
    setQuery("");
    setSearchPaths(null);
    setSelected(new Set());
    void getSshFsToolConfig(db)
      .then(async (cfg) => {
        if (!cfg?.sshConfigId)
          throw new Error("Chưa cấu hình SSH Host cho trình duyệt tệp.");
        const sshConfig = await getSshConfigById(cfg.sshConfigId, db);
        if (!sshConfig) throw new Error("Không tìm thấy cấu hình SSH đã lưu.");
        const base = resolveRemoteToolPath(".", cfg.defaultBasePath, undefined);
        if (cancelled) return;
        sshConfigIdRef.current = cfg.sshConfigId;
        setBasePath(base);
        setCurrentPath(base);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setConfigError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, db]);

  const sshConfigIdRef = useRef<string | null>(null);

  const loadDir = useCallback(
    async (rawPath: string) => {
      const configId = sshConfigIdRef.current;
      if (!configId) return;
      setLoading(true);
      setSearchPaths(null);
      try {
        const sshConfig = await getSshConfigById(configId, db);
        if (!sshConfig) throw new Error("Không tìm thấy cấu hình SSH đã lưu.");
        const target = resolveRemoteToolPath(rawPath, undefined, undefined);
        const listed: RemoteFileInfo[] = await listRemoteDir(sshConfig, target);
        setCurrentPath(target);
        setEntries(
          listed
            .filter((entry) => target !== "/" || entry.name !== ".")
            .map((entry) => ({
              path: normalizePath(
                `${target === "/" ? "" : target}/${entry.name}`,
              ),
              name: entry.name,
              isDir: entry.isDir,
            })),
        );
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [db],
  );

  useEffect(() => {
    if (!open || !basePath) return;
    void loadDir(basePath);
  }, [open, basePath, loadDir]);

  const runSearch = useCallback(async () => {
    const configId = sshConfigIdRef.current;
    const needle = query.trim();
    if (!configId || !basePath || !needle) return;
    if (callIdRef.current)
      void cancelRemoteCall(callIdRef.current).catch(() => undefined);
    const callId = `ssh-file-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    callIdRef.current = callId;
    setLoading(true);
    try {
      const sshConfig = await getSshConfigById(configId, db);
      if (!sshConfig) throw new Error("Không tìm thấy cấu hình SSH đã lưu.");
      const command = `find ${shellQuote(basePath)} -type f -iname ${shellQuote(needle)} | head -n 201`;
      const result = await execRemoteCommand(
        sshConfig,
        command,
        undefined,
        callId,
      );
      if (callIdRef.current !== callId) return;
      if (result.exitStatus !== 0 && result.finishReason !== "complete") {
        throw new Error(
          result.stderr.trim() ||
            `Lệnh find thất bại (mã ${result.exitStatus}).`,
        );
      }
      setSearchPaths(
        result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map(normalizePath),
      );
    } catch (err) {
      if (callIdRef.current === callId)
        setConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      if (callIdRef.current === callId) {
        callIdRef.current = null;
        setLoading(false);
      }
    }
  }, [basePath, db, query]);

  const entriesToShow = useMemo(
    () =>
      searchPaths !== null
        ? searchPaths.map((path) => ({
            path,
            name: path.split("/").pop() || path,
            isDir: false,
          }))
        : entries,
    [entries, searchPaths],
  );

  const paths = [...selected];
  return (
    <Modal
      open={open}
      onCancel={() => {
        if (callIdRef.current)
          void cancelRemoteCall(callIdRef.current).catch(() => undefined);
        onClose();
      }}
      title={
        <Space>
          <FolderOpenOutlined />
          <span>Duyệt tệp SSH</span>
        </Space>
      }
      okText={`Đính kèm${paths.length ? ` (${paths.length})` : ""}`}
      cancelText="Đóng"
      okButtonProps={{ disabled: paths.length === 0 }}
      onOk={() => {
        onAttach(paths);
        onClose();
      }}
      destroyOnClose
      width={640}
    >
      {configError && (
        <Alert
          type="error"
          showIcon
          message={configError}
          style={{ marginBottom: 12 }}
        />
      )}
      <Space style={{ marginBottom: 12 }}>
        <Input
          aria-label="Tìm tên tệp SSH"
          placeholder="Tìm tên tệp (find -iname)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={() => void runSearch()}
          style={{ width: 280 }}
        />
        <Button
          icon={<SearchOutlined />}
          onClick={() => void runSearch()}
          disabled={!query.trim() || !basePath}
        >
          Tìm
        </Button>
        <Button onClick={() => void loadDir(currentPath)} disabled={!basePath}>
          Thư mục hiện tại
        </Button>
      </Space>
      <Text
        type="secondary"
        style={{
          display: "block",
          marginBottom: 8,
          fontSize: "var(--font-size-small)",
        }}
      >
        {currentPath}
        {searchPaths !== null
          ? ` · ${searchPaths.length} kết quả (tối đa 200)`
          : ""}
      </Text>
      <div
        style={{
          maxHeight: 360,
          overflowY: "auto",
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 6,
          padding: 8,
        }}
      >
        {loading && <Spin size="small" />}
        <Tree
          checkable
          selectable={false}
          checkedKeys={paths}
          onCheck={(checked) =>
            setSelected(
              new Set(
                (Array.isArray(checked)
                  ? checked
                  : checked.checked) as string[],
              ),
            )
          }
          treeData={entriesToShow.map((entry) => ({
            key: entry.path,
            checkable: !entry.isDir,
            title: (
              <span
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (entry.isDir) void loadDir(entry.path);
                }}
                onKeyDown={(e) => {
                  if (entry.isDir && (e.key === "Enter" || e.key === " "))
                    void loadDir(entry.path);
                }}
              >
                {entry.name}
                {entry.isDir ? "/" : ""}
              </span>
            ),
          }))}
        />
      </div>
    </Modal>
  );
};

export default StandaloneSshFileBrowser;
