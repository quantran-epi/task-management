export interface JiraConfig {
  domain: string;
  email: string;
  apiToken: string;
  corsProxy?: string;
  defaultProjectKey?: string;
  defaultIssueType?: string;
}

export interface JiraMyselfResponse {
  accountId: string;
  accountType?: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
  timeZone?: string;
  locale?: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraTransitionItem {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory: {
      id: number;
      key: string;
      name: string;
    };
  };
  hasScreen?: boolean;
  isGlobal?: boolean;
  isInitial?: boolean;
  isConditional?: boolean;
}

export interface JiraTransitionsResponse {
  expand?: string;
  transitions: JiraTransitionItem[];
}

export interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
  fields?: {
    summary?: string;
    status?: {
      id: string;
      name: string;
      statusCategory?: {
        id: number;
        key: string;
        name: string;
      };
    };
    [key: string]: unknown;
  };
}

export interface JiraCreateIssuePayload {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description?: unknown;
    [key: string]: unknown;
  };
}
