import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import type { TaskPlannerDatabase } from '../../../db';
import {
  fetchAvailableModels,
  getNineRouterConfig,
  setNineRouterConfig,
} from '../../../services/ai/nineRouterTokenService';
import {
  discoverAllMcpTools,
  getMcpServers,
  saveMcpServers,
  type McpServerConfig,
} from '../../../services/ai/mcpClient';
import { getToolsForTurn } from '../../../services/ai/chatTurnTools';
import type { AiChatToolboxProps } from '../../ai/AiChatWidget';

export interface StepChatToolbox extends AiChatToolboxProps {
  /** Tool set for one turn: DB tools plus read-only/any MCP tools per Analysis Mode. */
  toolsForTurn: () => Promise<unknown[]>;
}

/**
 * D-03/D-04 toolbox state for one step panel. Analysis Mode defaults to `true`:
 * a step chat inspects the record, it does not mutate it.
 */
export function useStepChatToolbox(db: TaskPlannerDatabase): StepChatToolbox {
  const [analysisMode, setAnalysisMode] = useState(true);
  const [autoApproveMutations, setAutoApproveMutations] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getNineRouterConfig(db);
        const [models, servers] = await Promise.all([
          fetchAvailableModels(db).catch(() => []),
          getMcpServers(db).catch(() => []),
        ]);
        if (cancelled) return;
        setSelectedModel(config.defaultModel || models[0] || '');
        setAvailableModels(models);
        setMcpServers(servers);
      } catch {
        // Model discovery is optional; the turn still runs with the persisted config.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const handleRefreshModels = useCallback(async () => {
    setIsRefreshingModels(true);
    try {
      setAvailableModels(await fetchAvailableModels(db));
      message.success('Đã làm mới danh sách mô hình');
    } catch {
      message.error('Không thể tải danh sách mô hình');
    } finally {
      setIsRefreshingModels(false);
    }
  }, [db]);

  const handleToggleMcpServer = useCallback(
    (id: string, enabled: boolean) => {
      const updated = mcpServers.map((server) =>
        server.id === id ? { ...server, enabled } : server
      );
      setMcpServers(updated);
      if (enabled) setMcpEnabled(true);
      void saveMcpServers(updated, db).catch(() => undefined);
    },
    [mcpServers, db]
  );

  return {
    selectedModel,
    toolsForTurn: async () => {
      const dynamicMcpTools = mcpEnabled ? await discoverAllMcpTools(db).catch(() => []) : [];
      return getToolsForTurn(analysisMode, dynamicMcpTools);
    },
    availableModels,
    onModelChange: (model) => {
      setSelectedModel(model);
      void setNineRouterConfig({ defaultModel: model }, db);
    },
    onRefreshModels: handleRefreshModels,
    isRefreshingModels,
    analysisMode,
    onToggleAnalysisMode: () => setAnalysisMode((prev) => !prev),
    autoApproveMutations,
    onToggleAutoApproveMutations: () => setAutoApproveMutations((prev) => !prev),
    mcpEnabled,
    onToggleMcpEnabled: () => setMcpEnabled((prev) => !prev),
    mcpServers,
    onToggleMcpServer: handleToggleMcpServer,
  };
}
