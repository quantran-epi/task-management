// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatInputBar } from "../../src/components/ai/ChatInputBar";
import { ChatMessageList } from "../../src/components/ai/ChatMessageList";
import { StandaloneSshFileBrowser } from "../../src/components/ai/StandaloneSshFileBrowser";
import type { ChatMessage } from "../../src/types/models";

vi.mock("../../src/services/sshService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/sshService")>();
  return {
    ...actual,
    getSshConfigById: vi.fn(async () => ({
      id: "ssh-1",
      name: "remote",
      host: "localhost",
      port: 22,
      username: "user",
    })),
    listRemoteDir: vi.fn(async () => [
      { name: ".", isDir: true, size: 0 },
      { name: "a.pdf", isDir: false, size: 10 },
    ]),
    execRemoteCommand: vi.fn(async () => ({
      stdout: "/repo/a.pdf\n/repo/b.pdf\n",
      stderr: "",
      exitStatus: 0,
      finishReason: "complete",
    })),
    readRemoteFileBytes: vi.fn(),
    readRemoteFileSlice: vi.fn(),
    cancelRemoteCall: vi.fn(async () => true),
  };
});
vi.mock("../../src/services/ai/sshFsToolService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/services/ai/sshFsToolService")
    >();
  return {
    ...actual,
    getSshFsToolConfig: vi.fn(async () => ({
      sshConfigId: "ssh-1",
      defaultBasePath: "/repo",
    })),
  };
});
// pdfjs worker import is a pre-existing environment issue in this sandbox; the browser flow
// only needs config/path helpers, so stub the parser surface that pulls pdfjs into the graph.
vi.mock("../../src/services/ai/sshDocumentParser", () => ({
  getSshDocumentInfo: vi.fn(async () => ({ format: "pdf", size: 1 })),
  readSshDocumentRegion: vi.fn(async () => ({ text: "", truncated: false })),
  parseSshDocument: vi.fn(async () => ({
    text: "",
    format: "txt",
    truncated: false,
  })),
}));

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("261126-rfx persistent attachment chips", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("standing browser gate: chỉ standalone có nút; dock/team source không render nút", () => {
    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        isStandaloneChat
        onAttachFile={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Duyệt tệp SSH từ xa")).toBeInTheDocument();
    cleanup();
    render(<ChatInputBar onSubmit={vi.fn()} onAttachFile={vi.fn()} />);
    expect(
      screen.queryByLabelText("Duyệt tệp SSH từ xa"),
    ).not.toBeInTheDocument();
    const teamSource = readSource("src/components/ai/office/TeamWorkspace.tsx");
    expect(teamSource).not.toMatch(/isStandaloneChat/);
    expect(teamSource).not.toMatch(/StandaloneSshFileBrowser/);
  });

  it("chip composer thêm/xoá qua draft; message chip只读, không nút xoá", async () => {
    const onAttachFile = vi.fn();
    const onRemoveFile = vi.fn();
    const { rerender } = render(
      <ChatInputBar
        onSubmit={vi.fn()}
        isStandaloneChat
        attachedFiles={[]}
        onAttachFile={onAttachFile}
        onRemoveFile={onRemoveFile}
      />,
    );
    fireEvent.click(screen.getByLabelText("Duyệt tệp SSH từ xa"));
    expect(await screen.findByText("Duyệt tệp SSH")).toBeInTheDocument();

    rerender(
      <ChatInputBar
        onSubmit={vi.fn()}
        isStandaloneChat
        attachedFiles={["/repo/a.pdf"]}
        onAttachFile={onAttachFile}
        onRemoveFile={onRemoveFile}
      />,
    );
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    const chip = screen.getByText("a.pdf").closest(".ant-tag");
    expect(chip).toBeTruthy();
    fireEvent.click(chip!.querySelector(".ant-tag-close-icon")!);
    expect(onRemoveFile).toHaveBeenCalledWith("/repo/a.pdf");

    cleanup();
    const message: ChatMessage = {
      id: "m1",
      threadId: "t1",
      role: "user",
      content: "already sent",
      createdAt: new Date().toISOString(),
      attachments: ["/repo/a.pdf"],
    };
    render(<ChatMessageList messages={[message]} />);
    const persisted = screen.getByText("a.pdf").closest(".ant-tag");
    expect(persisted).toBeTruthy();
    expect(persisted!.querySelector(".ant-tag-close-icon")).toBeNull();
    expect(
      screen.queryByLabelText("Duyệt tệp SSH từ xa"),
    ).not.toBeInTheDocument();
  });

  it("browser multi-select trả path chuẩn hoá một lần; attach không đọc nội dung", async () => {
    const ssh = await import("../../src/services/sshService");
    const onAttach = vi.fn();
    render(
      <StandaloneSshFileBrowser open onClose={vi.fn()} onAttach={onAttach} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Duyệt tệp SSH")).toBeInTheDocument(),
    );
    // Search returns two paths; confirm both are selected via tree checkboxes.
    fireEvent.change(screen.getByLabelText("Tìm tên tệp SSH"), {
      target: { value: "*.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Tìm/ }));
    await waitFor(() => expect(screen.getByText("b.pdf")).toBeInTheDocument());
    const checkboxes = document.body.querySelectorAll(".ant-tree-checkbox");
    expect(checkboxes.length).toBe(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: /Đính kèm/ }));
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onAttach).toHaveBeenCalledWith(["/repo/a.pdf", "/repo/b.pdf"]);
    expect(ssh.readRemoteFileBytes).not.toHaveBeenCalled();
    expect(ssh.readRemoteFileSlice).not.toHaveBeenCalled();
  });

  it("saveMessage ghi attachments trước khi lưu; team gửi kèm attachments", () => {
    const drawer = readSource("src/components/ai/AIChatDrawer.tsx");
    expect(drawer).toMatch(/attachments: attachedPaths/);
    const saveIdx = drawer.indexOf("const saved = await saveMessage(");
    const computedIdx = drawer.indexOf("const allFiles = Array.from");
    expect(computedIdx).toBeGreaterThan(0);
    expect(computedIdx).toBeLessThan(saveIdx);
    const team = readSource("src/components/ai/office/TeamWorkspace.tsx");
    expect(team).toMatch(/coordinator\.send\(text, attachments\)/);
  });
});
