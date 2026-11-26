import { TaskPlannerDatabase } from './index';

// D-01: chat-only window gets its own IndexedDB so AI/SSH settings never mix with TaskMate.
// The docked chat keeps using the default `db` singleton from ./index.
export const chatWindowDb = new TaskPlannerDatabase('TaskMateChatWindowDB');
