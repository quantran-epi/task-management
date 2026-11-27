import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Tree,
  Typography,
  useAntdToken,
} from "../ui";
import {
  ArrowUpOutlined,
  FileOutlined,
  FolderOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from "../ui/icon";
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
const EMPTY_META = "—";

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
  size?: string;
  modified?: string;
  hitDir?: string;
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

function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return EMPTY_META;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(epoch: number | undefined): string {
  if (typeof epoch !== "number" || !Number.isFinite(epoch) || epoch <= 0)
    return EMPTY_META;
  const date = new Date(epoch * 1000);
  return Number.isNaN(date.getTime())
    ? EMPTY_META
    : date.toLocaleDateString("vi-VN");
}

function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
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
  const [query, setQuery] = useState("");
  const [searchPaths, setSearchPaths] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hostLabel, setHostLabel] = useState("SSH");
  const callIdRef = useRef<string | null>(null);
  const sshConfigIdRef = useRef<string | null>(null);

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
        setHostLabel(sshConfig.name || cfg.sshConfigId);
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

  const loadDir = useCallback(
    async (rawPath: string) => {
      const configId = sshConfigIdRef.current;
      if (!configId) return;
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
              size: formatSize(entry.size),
              modified: formatModified(entry.modified),
            })),
        );
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : String(err));
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
      }
    }
  }, [basePath, db, query]);

  const cancelSearch = useCallback(() => {
    if (callIdRef.current) {
      void cancelRemoteCall(callIdRef.current).catch(() => undefined);
      callIdRef.current = null;
    }
    setSearchPaths(null);
    setQuery("");
  }, []);

  const navigate = useCallback(
    (target: string) => {
      if (callIdRef.current)
        void cancelRemoteCall(callIdRef.current).catch(() => undefined);
      callIdRef.current = null;
      setQuery("");
      setConfigError(null);
      void loadDir(target);
    },
    [loadDir],
  );

  const entriesToShow = useMemo(
    () =>
      searchPaths !== null
        ? searchPaths.map((path) => ({
            path,
            name: path.split("/").pop() || path,
            isDir: false,
            size: EMPTY_META,
            modified: EMPTY_META,
            hitDir: parentPath(path),
          }))
        : entries,
    [entries, searchPaths],
  );

  const explorerTree = useMemo(() => {
    if (!basePath) return [];
    const folders = entries.filter((entry) => entry.isDir && entry.path !== basePath);
    return [
      {
        key: basePath,
        title: hostLabel,
        children: folders.map((entry) => ({
          key: entry.path,
          title: entry.name,
        })),
      },
    ];
  }, [basePath, entries, hostLabel]);

  const breadcrumbItems = useMemo(() => {
    const root = basePath || "/";
    const parts = currentPath.split("/").filter(Boolean);
    const rootParts = root.split("/").filter(Boolean);
    const rel = parts.slice(rootParts.length);
    return [
      {
        title: (
          <span style={{ cursor: basePath ? "pointer" : "default" }}
            onClick={() => basePath && navigate(root)}>
            {basePath ? hostLabel : root}
          </span>
        ),
      },
      ...rel.map((part, index) => ({
        title: (
          <span style={{ cursor: "pointer" }}
            onClick={() => navigate(`/${parts.slice(0, rootParts.length + index + 1).join("/")}`)}>
            {part}
          </span>
        ),
      })),
    ];
  }, [basePath, currentPath, hostLabel, navigate]);

  const togglePath = useCallback((path: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const paths = [...selected];
  const listStyle: React.CSSProperties = {
    height: 360,
    overflowY: "auto",
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 6,
    background: token.colorBgContainer,
  };
  const searching = Boolean(callIdRef.current);

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
          <FolderOutlined />
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
      width={1080}
      style={{ maxWidth: "calc(100vw - 48px)" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "228px minmax(0, 1fr)",
            gap: 12,
          }}
        >
          <div
            style={{
              ...listStyle,
              padding: 8,
              background: token.colorBgLayout,
            }}
          >
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 8, fontSize: "var(--font-size-small)" }}
            >
              Explorer · SSH
            </Text>
            {explorerTree.length > 0 && (
              <Tree
                checkable={false}
                selectedKeys={[currentPath]}
                defaultExpandedKeys={[basePath!]}
                treeData={explorerTree}
                onSelect={(_, info) => {
                  const key = String(info.node.key);
                  if (key === basePath || entries.some((e) => e.path === key && e.isDir))
                    navigate(key);
                }}
              />
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <Breadcrumb items={breadcrumbItems} />
              </div>
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                aria-label="Thư mục cha"
                title="Thư mục cha"
                disabled={!basePath || currentPath === "/" || searching}
                onClick={() => navigate(parentPath(currentPath))}
              />
            </div>
            <Space style={{ marginBottom: 0 }}>
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
              {searching && (
                <Button
                  aria-label="Hủy tìm kiếm"
                  onClick={cancelSearch}
                >
                  Hủy
                </Button>
              )}
            </Space>
            <Text
              type="secondary"
              style={{ display: "block", fontSize: "var(--font-size-small)" }}
            >
              {searchPaths !== null
                ? `${searchPaths.length} kết quả (tối đa 200)`
                : currentPath}
            </Text>
            {configError && (
              <Alert
                type="error"
                showIcon
                message={configError}
                action={
                  <Space size={4}>
                    <Button size="small" icon={<ReloadOutlined />}
                      onClick={() => {
                        setConfigError(null);
                        void loadDir(basePath || currentPath);
                      }}>
                      Thử lại
                    </Button>
                    <Button size="small" icon={<SettingOutlined />}
                      onClick={() => {
                        window.location.hash = "#/settings";
                        onClose();
                      }}>
                      Sửa connection SSH
                    </Button>
                  </Space>
                }
              />
            )}
            <div style={listStyle}>
              {searching ? (
                <div style={{ padding: 16 }}>
                  <Spin size="small" />
                  <Text style={{ marginLeft: 8, fontSize: "var(--font-size-small)" }}>
                    find {basePath} -iname {query.trim() || "..."} (tối đa 200)
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <Button size="small" onClick={cancelSearch}>Hủy</Button>
                  </div>
                </div>
              ) : configError && entriesToShow.length === 0 ? null : entriesToShow.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <Empty description={searchPaths !== null
                    ? "Không tìm thấy tệp nào"
                    : "Thư mục này trống"}>
                    <Button size="small" onClick={() => navigate(basePath || "/")}>
                      Về thư mục gốc
                    </Button>
                  </Empty>
                </div>
              ) : (
                entriesToShow.map((entry) => {
                  const isSelected = selected.has(entry.path);
                  return (
                    <div
                      key={entry.path}
                      data-file-path={entry.path}
                      role={entry.isDir ? "button" : undefined}
                      tabIndex={entry.isDir ? 0 : undefined}
                      onClick={() => {
                        if (entry.isDir) navigate(entry.path);
                        else togglePath(entry.path);
                      }}
                      onKeyDown={(e) => {
                        if (entry.isDir && (e.key === "Enter" || e.key === " "))
                          navigate(entry.path);
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "22px minmax(0, 1fr) 76px 96px",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        background: isSelected ? token.colorPrimary : undefined,
                      }}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        {entry.isDir ? null : (
                          <Checkbox
                            aria-label={`Chọn ${entry.name}`}
                            checked={isSelected}
                            onChange={() => togglePath(entry.path)}
                          />
                        )}
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {entry.isDir ? <FolderOutlined /> : <FileOutlined />}
                        <Text ellipsis title={entry.hitDir || entry.path}>
                          {entry.name}
                          {entry.isDir ? "/" : ""}
                        </Text>
                      </span>
                      <Text type="secondary" style={{ fontSize: "var(--font-size-small)" }}>
                        {entry.isDir ? EMPTY_META : (entry.size ?? EMPTY_META)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: "var(--font-size-small)" }}>
                        {entry.isDir ? EMPTY_META : (entry.modified ?? EMPTY_META)}
                      </Text>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <Space wrap style={{ minHeight: 32 }}>
          <Text type="secondary" style={{ fontSize: "var(--font-size-small)" }}>
            {paths.length ? `${paths.length} tệp đã chọn` : "Chưa chọn tệp nào"}
          </Text>
          {paths.map((path) => (
            <Tag
              key={path}
              closable
              onClose={() => togglePath(path)}
              title={path}
            >
              {path.split("/").pop() || path}
            </Tag>
          ))}
        </Space>
      </div>
    </Modal>
  );
};

export default StandaloneSshFileBrowser;
