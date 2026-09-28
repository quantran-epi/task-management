import React, { useState } from 'react';
import { Button, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../db';
import { getAllProjects, createProject, updateProject } from '../db/repositories/projectRepo';
import { getAllMilestones, createMilestone, updateMilestone } from '../db/repositories/milestoneRepo';
import { ProjectTable } from '../components/projects/ProjectTable';
import { ProjectModal } from '../components/projects/ProjectModal';
import { MilestoneModal } from '../components/projects/MilestoneModal';
import { CascadeDeleteModal } from '../components/projects/CascadeDeleteModal';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { createTask } from '../db/repositories/taskRepo';
import { deleteProjectWithCascade, deleteMilestoneWithCascade } from '../db/repositories/cascadeRepo';
import type { Project, Milestone, ProjectStatus, MilestoneStatus } from '../types/models';
import type { TaskPlannerDatabase } from '../db';

export interface ProjectsViewProps {
  db?: TaskPlannerDatabase;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ db = defaultDb }) => {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [activeProjectIdForMilestone, setActiveProjectIdForMilestone] = useState<string>('');
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const [cascadeModalOpen, setCascadeModalOpen] = useState(false);
  const [cascadeTarget, setCascadeTarget] = useState<{
    type: 'project' | 'milestone';
    id: string;
    name: string;
    childMilestoneCount: number;
    childTaskCount: number;
  } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  // Live queries
  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];

  // Handlers for Project
  const handleOpenCreateProject = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const handleOpenEditProject = (project: Project) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (values: {
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    notes?: string | undefined;
    status: ProjectStatus;
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
    documentLinks?: string[] | undefined;
    reminderDate?: string | undefined;
    reminderNote?: string | undefined;
  }) => {
    try {
      if (editingProject) {
        await updateProject(editingProject.id, values, db);
        message.success({ content: 'Đã cập nhật dự án', duration: 1.5 });
      } else {
        await createProject(values, db);
        message.success({ content: 'Đã tạo dự án', duration: 1.5 });
      }
      setProjectModalOpen(false);
    } catch {
      message.error({ content: 'Không thể lưu dự án', duration: 2 });
    }
  };

  const handleDeleteProjectPrompt = (project: Project) => {
    const projMilestones = milestones.filter((m) => m.projectId === project.id);
    const projTasks = tasks.filter((t) => t.projectId === project.id);

    setCascadeTarget({
      type: 'project',
      id: project.id,
      name: project.name,
      childMilestoneCount: projMilestones.length,
      childTaskCount: projTasks.length,
    });
    setCascadeModalOpen(true);
  };

  // Handlers for Milestone
  const handleOpenCreateMilestone = (projectId: string) => {
    setActiveProjectIdForMilestone(projectId);
    setEditingMilestone(null);
    setMilestoneModalOpen(true);
  };

  const handleOpenEditMilestone = (ms: Milestone) => {
    setActiveProjectIdForMilestone(ms.projectId);
    setEditingMilestone(ms);
    setMilestoneModalOpen(true);
  };

  const handleSaveMilestone = async (values: {
    projectId: string;
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    status: MilestoneStatus;
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
    reminderDate?: string | undefined;
    reminderNote?: string | undefined;
  }) => {
    try {
      if (editingMilestone) {
        await updateMilestone(editingMilestone.id, values, db);
        message.success({ content: 'Đã cập nhật cột mốc', duration: 1.5 });
      } else {
        await createMilestone(values, db);
        message.success({ content: 'Đã tạo cột mốc', duration: 1.5 });
      }
      setMilestoneModalOpen(false);
    } catch {
      message.error({ content: 'Không thể lưu cột mốc', duration: 2 });
    }
  };

  const handleDeleteMilestonePrompt = (ms: Milestone) => {
    const childTasks = tasks.filter((t) => t.milestoneId === ms.id);

    setCascadeTarget({
      type: 'milestone',
      id: ms.id,
      name: ms.name,
      childMilestoneCount: 0,
      childTaskCount: childTasks.length,
    });
    setCascadeModalOpen(true);
  };

  // Cascade Deletion Confirmation
  const handleConfirmCascade = async (mode: 'cascade' | 'orphan') => {
    if (!cascadeTarget) return;

    try {
      if (cascadeTarget.type === 'project') {
        await deleteProjectWithCascade(cascadeTarget.id, mode, db);
        message.success({ content: 'Đã xóa dự án', duration: 2 });
      } else {
        await deleteMilestoneWithCascade(cascadeTarget.id, mode, db);
        message.success({ content: 'Đã xóa cột mốc', duration: 2 });
      }
      setCascadeModalOpen(false);
    } catch {
      message.error({ content: 'Không thể xóa bản ghi', duration: 2 });
    }
  };

  // Contextual Add Task
  const handleAddTask = async (projectId?: string, milestoneId?: string) => {
    try {
      const created = await createTask(
        {
          name: 'Tác vụ mới',
          status: 'Open',
          priority: 'Medium',
          estimateMinutes: 0,
          projectId: projectId || undefined,
          milestoneId: milestoneId || undefined,
        },
        db
      );
      setDrawerTaskId(created.id);
      setDrawerOpen(true);
    } catch {
      message.error({ content: 'Không thể tạo tác vụ', duration: 2 });
    }
  };

  const handleEditTask = (taskId: string) => {
    setDrawerTaskId(taskId);
    setDrawerOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Phân cấp công việc</h2>
          <span style={{ fontSize: 14, color: '#8c8c8c' }}>
            Quản lý dự án, cột mốc và các sản phẩm bàn giao
          </span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenCreateProject}
        >
          Dự án mới
        </Button>
      </div>

      <ProjectTable
        projects={projects}
        milestones={milestones}
        tasks={tasks}
        onAddTask={handleAddTask}
        onEditProject={handleOpenEditProject}
        onDeleteProject={handleDeleteProjectPrompt}
        onAddMilestone={handleOpenCreateMilestone}
        onEditMilestone={handleOpenEditMilestone}
        onDeleteMilestone={handleDeleteMilestonePrompt}
        onEditTask={handleEditTask}
      />

      <ProjectModal
        open={projectModalOpen}
        project={editingProject}
        onClose={() => setProjectModalOpen(false)}
        onSave={handleSaveProject}
      />

      <MilestoneModal
        open={milestoneModalOpen}
        projectId={activeProjectIdForMilestone}
        project={projects.find((p) => p.id === activeProjectIdForMilestone)}
        milestone={editingMilestone}
        onClose={() => setMilestoneModalOpen(false)}
        onSave={handleSaveMilestone}
      />

      <CascadeDeleteModal
        open={cascadeModalOpen}
        targetType={cascadeTarget?.type || 'project'}
        targetName={cascadeTarget?.name || ''}
        childMilestoneCount={cascadeTarget?.childMilestoneCount || 0}
        childTaskCount={cascadeTarget?.childTaskCount || 0}
        onClose={() => setCascadeModalOpen(false)}
        onConfirm={handleConfirmCascade}
      />

      <TaskDrawer
        taskId={drawerTaskId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTaskId(null);
        }}
        db={db}
      />
    </div>
  );
};
