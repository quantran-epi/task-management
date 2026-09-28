export const SCHEMA_V1 = {
  projects: 'id, status, deadline',
  milestones: 'id, projectId, status, deadline',
  tasks: 'id, projectId, milestoneId, status, priority, deadline',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

export const SCHEMA_V2 = {
  projects: 'id, status, deadline, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;
