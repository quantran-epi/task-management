import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

const ENABLED_KEY = 'knowledge_server_enabled';
const BASE_URL_KEY = 'knowledge_server_base_url';

export interface ValidatedKnowledgeBaseUrl {
  baseUrl: string;
  loopbackHttpWarning: boolean;
}

export function validateKnowledgeBaseUrl(value: string): ValidatedKnowledgeBaseUrl {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Knowledge server base URL is invalid');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Knowledge server base URL cannot contain credentials, query, or fragment');
  }
  if (url.pathname && !/^\/+$/u.test(url.pathname)) {
    throw new Error('Enter only the knowledge server base URL without /api/v1 paths');
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Knowledge server requires HTTPS except for loopback HTTP');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Knowledge server requires HTTPS except for loopback HTTP');
  }
  return {
    baseUrl: `${url.protocol}//${url.host}`,
    loopbackHttpWarning: url.protocol === 'http:',
  };
}

export interface PersistedKnowledgeConfig {
  enabled: boolean;
  baseUrl: string;
}

export interface KnowledgeConfigValue extends PersistedKnowledgeConfig {
  ready: boolean;
  token: string;
  loopbackHttpWarning: boolean;
  setToken(token: string): void;
  savePersistedConfig(config: PersistedKnowledgeConfig): Promise<void>;
}

const KnowledgeConfigContext = createContext<KnowledgeConfigValue | null>(null);
const OPTIONAL_KNOWLEDGE_CONFIG_FALLBACK: KnowledgeConfigValue = {
  ready: true,
  enabled: false,
  baseUrl: '',
  token: '',
  loopbackHttpWarning: false,
  setToken: () => {},
  savePersistedConfig: async () => {},
};

export function KnowledgeConfigProvider({
  children,
  db = defaultDb,
}: React.PropsWithChildren<{ db?: TaskPlannerDatabase }>) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([db.settings.get(ENABLED_KEY), db.settings.get(BASE_URL_KEY)]).then(
      ([enabledSetting, baseUrlSetting]) => {
        if (!active) return;
        setEnabled(enabledSetting?.value === true);
        setBaseUrl(typeof baseUrlSetting?.value === 'string' ? baseUrlSetting.value : '');
        setReady(true);
      }
    );
    return () => {
      active = false;
      setToken('');
    };
  }, [db]);

  const savePersistedConfig = useCallback(
    async (config: PersistedKnowledgeConfig) => {
      const validated = config.baseUrl
        ? validateKnowledgeBaseUrl(config.baseUrl)
        : { baseUrl: '', loopbackHttpWarning: false };
      await db.transaction('rw', db.settings, async () => {
        await db.settings.put({ key: ENABLED_KEY, value: config.enabled });
        await db.settings.put({ key: BASE_URL_KEY, value: validated.baseUrl });
      });
      setEnabled(config.enabled);
      setBaseUrl(validated.baseUrl);
    },
    [db]
  );

  const loopbackHttpWarning = baseUrl
    ? validateKnowledgeBaseUrl(baseUrl).loopbackHttpWarning
    : false;
  const value = useMemo<KnowledgeConfigValue>(
    () => ({
      ready,
      enabled,
      baseUrl,
      token,
      loopbackHttpWarning,
      setToken,
      savePersistedConfig,
    }),
    [ready, enabled, baseUrl, token, loopbackHttpWarning, savePersistedConfig]
  );

  return React.createElement(KnowledgeConfigContext.Provider, { value }, children);
}

export function useOptionalKnowledgeConfig(): KnowledgeConfigValue {
  return useContext(KnowledgeConfigContext) ?? OPTIONAL_KNOWLEDGE_CONFIG_FALLBACK;
}

export function useKnowledgeConfig(): KnowledgeConfigValue {
  const value = useContext(KnowledgeConfigContext);
  if (!value) throw new Error('useKnowledgeConfig requires KnowledgeConfigProvider');
  return value;
}
