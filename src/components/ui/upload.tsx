import { useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import type {
  UploadFile as AntUploadFile,
  UploadProps as AntUploadProps,
} from 'antd';
import { classNames } from './native/classNames';
import buttonStyles from './openidea/Button.module.css';
import feedbackStyles from './openidea/Feedback.module.css';
import listStyles from './openidea/List.module.css';
import { getSharedControlTokens } from './tokens.contract';

export type { UploadProps, UploadFile } from 'antd';

export interface UploadWrapperProps extends AntUploadProps {
  width?: 'full' | 'auto';
}

/** Stable sentinel for callers that accept a file but suppress the list row. */
export const UPLOAD_LIST_IGNORE = '__taskmate_upload_list_ignore__';

type NativeFile = File & { uid: string; lastModifiedDate: Date };

function toUploadFile(file: NativeFile): AntUploadFile {
  return {
    uid: file.uid,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    originFileObj: file as AntUploadFile['originFileObj'],
  } as AntUploadFile;
}

/** Result status map matches the AntD upload vocabulary (D-12 domain status unchanged). */
const FILE_STATE: Record<string, string> = {
  uploading: 'uploading',
  done: 'success',
  success: 'success',
  error: 'error',
  removed: 'removed',
};

function formatSize(size: number | undefined): string {
  if (size === undefined) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadShellProps extends UploadWrapperProps {
  dragger: boolean;
}

/** Shared native input + trigger + file list for Upload and UploadDragger. */
function UploadShell({
  width = 'full',
  style,
  className,
  dragger,
  disabled,
  multiple,
  accept,
  children,
  beforeUpload,
  customRequest,
  onChange,
  showUploadList = true,
  fileList,
  defaultFileList,
  maxCount,
  ...rest
}: UploadShellProps) {
  const { fontSize, controlHeight, borderRadius } = getSharedControlTokens();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<AntUploadFile[]>(defaultFileList ?? []);
  const [dragover, setDragover] = useState(false);
  const visible = fileList ?? files;
  const listVisible = showUploadList !== false;

  const uploadStyle = {
    width: width === 'full' ? '100%' : undefined,
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
    '--ui-control-radius': `${borderRadius}px`,
    ...style,
  } as CSSProperties;

  const state = disabled ? 'disabled' : dragover ? 'dragover' : visible.some((file) => FILE_STATE[file.status ?? ''] === 'uploading') ? 'uploading' : visible.length === 0 ? 'empty' : 'idle';

  const ingest = (incoming: FileList | null) => {
    if (!incoming || disabled) return;
    const batch = Array.from(incoming).map((file) => Object.assign(file, {
      uid: crypto.randomUUID(),
      lastModifiedDate: new Date(file.lastModified),
    })) as NativeFile[];
    const accepted: AntUploadFile[] = [];
    for (const file of batch) {
      const allowed = maxCount === undefined || visible.length + accepted.length < maxCount;
      if (!allowed) break;
      const result = beforeUpload?.(file, batch as never) as unknown;
      if (result === false || result instanceof Promise) continue;
      if (typeof result === 'string' && result === UPLOAD_LIST_IGNORE) continue;
      const effective = result instanceof File ? (result as NativeFile) : file;
      accepted.push(toUploadFile(effective));
    }
    if (accepted.length === 0) return;
    const next = [...visible, ...accepted].slice(maxCount === undefined ? undefined : maxCount);
    if (fileList === undefined) setFiles(next);
    onChange?.({ file: accepted[0]!, fileList: next, event: undefined } as never);
    for (const file of accepted) {
      customRequest?.({
        file: file.originFileObj as never,
        onSuccess: (response?: unknown) => {
          const updated = next.map((entry) => entry.uid === file.uid ? { ...entry, status: 'done' as const, response } : entry);
          if (fileList === undefined) setFiles(updated);
          onChange?.({ file: updated.find((entry) => entry.uid === file.uid)!, fileList: updated, event: undefined } as never);
        },
        onError: (error?: unknown) => {
          const updated = next.map((entry) => entry.uid === file.uid ? { ...entry, status: 'error' as const, error } : entry);
          if (fileList === undefined) setFiles(updated);
          onChange?.({ file: updated.find((entry) => entry.uid === file.uid)!, fileList: updated, event: undefined } as never);
        },
        onProgress: (event?: { percent?: number }) => {
          const updated = next.map((entry) => entry.uid === file.uid
            ? (event?.percent === undefined
              ? { ...entry, status: 'uploading' as const }
              : { ...entry, status: 'uploading' as const, percent: event.percent })
            : entry);
          if (fileList === undefined) setFiles(updated);
          onChange?.({ file: updated.find((entry) => entry.uid === file.uid)!, fileList: updated, event: event as never } as never);
        },
      } as never, { defaultRequest: () => {} });
    }
  };

  const trigger = (
    <button
      type="button"
      data-oi-control="upload-trigger"
      className={classNames(buttonStyles.button, buttonStyles.secondary)}
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
    >
      {children ?? 'Chọn tệp'}
    </button>
  );

  const dropHandlers = dragger ? {
    onDragOver: (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); if (!disabled) setDragover(true); },
    onDragLeave: () => setDragover(false),
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragover(false);
      ingest(event.dataTransfer.files);
    },
  } : {};

  return (
    <div
      data-oi-control={dragger ? 'upload-dragger' : 'upload'}
      data-state={state}
      className={className}
      style={uploadStyle}
      {...dropHandlers}
      {...(rest as object)}
    >
      <input
        ref={inputRef}
        type="file"
        data-oi-control="upload-input"
        accept={accept as string | undefined}
        multiple={multiple}
        disabled={disabled}
        hidden
        onChange={(event) => {
          ingest(event.target.files);
          event.target.value = '';
        }}
      />
      {dragger ? <div data-oi-part="dragger-area">{trigger}</div> : trigger}
      {listVisible && visible.length > 0 && (
        <div className={listStyles.list} data-oi-control="upload-list">
          {visible.map((file) => {
            const fileState = FILE_STATE[file.status ?? ''] ?? 'idle';
            return (
              <div
                key={file.uid}
                className={listStyles.row}
                data-oi-control="upload-row"
                data-state={fileState}
                style={{ height: 24 }}
              >
                <span data-oi-part="file-name">{file.name}</span>
                <span data-oi-part="file-size">{formatSize(file.size)}</span>
                {fileState === 'uploading' && (
                  <div className={feedbackStyles.progress} data-oi-control="upload-progress" role="progressbar">
                    <div className={feedbackStyles.bar} style={{ width: `${file.percent ?? 0}%` }} />
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Xóa ${file.name}`}
                  data-oi-control="upload-remove"
                  onClick={() => {
                    const next = visible.filter((entry) => entry.uid !== file.uid);
                    if (fileList === undefined) setFiles(next);
                    onChange?.({ file, fileList: next, event: undefined } as never);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Native Upload trigger + list; callers keep all AntD props by type alias. */
export function Upload(props: UploadWrapperProps) {
  return <UploadShell {...props} dragger={false} />;
}

/** Native drag-and-drop upload area. */
export const UploadDragger = ({ children, ...props }: UploadWrapperProps) => (
  <UploadShell {...props} dragger>
    <span data-oi-part="dragger-content">{children as ReactNode}</span>
  </UploadShell>
);
