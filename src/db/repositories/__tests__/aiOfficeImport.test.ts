import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaskPlannerDatabase } from '../../index';
import { importAiStaff } from '../aiOfficeRepo';

const LEAD = {
  name: 'Luka Modric',
  role: 'Trưởng nhóm điều phối SDLC',
  capability: 'Điều phối luồng phát triển SHB.',
  persona: 'Bạn điều hành một luồng phát triển cố định.',
  model: 'claude-sonnet-5-5',
};

const SKILL = {
  name: 'SOP chuẩn hóa requirement',
  description: 'Quy trình đào sâu PL01/PL02.',
  body: '# SOP\n\nNội dung.',
};

const EMPLOYEE = {
  name: 'Patrice Evra',
  role: 'Chuyên viên phân tích nghiệp vụ',
  capability: 'Phân tích và chuẩn hóa nghiệp vụ SHB.',
  persona: 'Bạn là BA chuẩn hóa nghiệp vụ.',
  model: 'claude-opus-5-5',
  skillName: 'SOP chuẩn hóa requirement',
};

describe('importAiStaff', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('tạo skill trước rồi gắn id cho nhân viên tham chiếu skillName', async () => {
    const result = await importAiStaff(
      { skills: [SKILL], employees: [EMPLOYEE], leads: [LEAD] },
      db
    );

    expect(result.created).toEqual({ skills: 1, employees: 1, leads: 1 });
    expect(result.warnings).toEqual([]);

    const skill = await db.aiSkills.toCollection().first();
    const employee = await db.aiEmployees.toCollection().first();
    expect(skill?.name).toBe(SKILL.name);
    expect(employee?.skillId).toBe(skill?.id);
    expect((await db.aiLeads.toCollection().first())?.name).toBe(LEAD.name);
  });

  it('bỏ qua mục trùng tên, không sửa row đã có', async () => {
    await importAiStaff({ skills: [SKILL], employees: [EMPLOYEE], leads: [LEAD] }, db);

    const second = await importAiStaff(
      {
        skills: [{ ...SKILL, body: 'Nội dung khác.' }],
        employees: [{ ...EMPLOYEE, role: 'Vai trò khác' }],
        leads: [{ ...LEAD, role: 'Vai trò khác' }],
      },
      db
    );

    expect(second.created).toEqual({ skills: 0, employees: 0, leads: 0 });
    expect(second.skipped).toEqual({ skills: 1, employees: 1, leads: 1 });
    expect(await db.aiSkills.count()).toBe(1);
    expect(await db.aiEmployees.count()).toBe(1);
    expect((await db.aiEmployees.toCollection().first())?.role).toBe(EMPLOYEE.role);
  });

  it('dùng model dự phòng khi row thiếu model, và cảnh báo khi không có model nào', async () => {
    const withFallback = await importAiStaff(
      { employees: [{ ...EMPLOYEE, model: undefined }] },
      db,
      'claude-sonnet-5-5'
    );
    expect(withFallback.created.employees).toBe(1);
    expect(withFallback.warnings[0]).toContain('claude-sonnet-5-5');

    const withoutFallback = await importAiStaff(
      { leads: [{ ...LEAD, model: undefined }] },
      db
    );
    expect(withoutFallback.created.leads).toBe(0);
    expect(withoutFallback.skipped.leads).toBe(1);
    expect(withoutFallback.warnings[0]).toContain('Bỏ qua');
  });

  it('cảnh báo khi skillName không có trong file lẫn hệ thống', async () => {
    const result = await importAiStaff(
      { employees: [{ ...EMPLOYEE, skillName: 'Không tồn tại' }] },
      db
    );
    expect(result.created.employees).toBe(1);
    expect(result.warnings[0]).toContain('Không tồn tại');
    expect((await db.aiEmployees.toCollection().first())?.skillId).toBeUndefined();
  });

  it('file đội SDLC đóng gói sẵn nhập được trọn vẹn', async () => {
    const raw = readFileSync(
      resolve(process.cwd(), '.planning/AI-STAFF-SDLC-TEAM.json'),
      'utf8'
    );
    const result = await importAiStaff(JSON.parse(raw), db, 'claude-sonnet-5-5');
    expect(result.created).toEqual({ skills: 4, employees: 5, leads: 1 });
    expect(result.warnings).toEqual([]);

    const developer = await db.aiEmployees
      .toCollection()
      .filter((row) => row.name === 'Agent Developer')
      .first();
    expect(developer?.model).toBe('claude-opus-5-5');
    expect(developer?.skillId).toBeDefined();
    // WR-05: capability is a stable row marker, not the mutable display name.
    expect(developer?.agentKind).toBe('developer');
    expect(result.created.employees).toBe(5);
    expect((await db.aiEmployees.toArray()).filter((row) => row.agentKind === 'developer')).toHaveLength(1);
  });
});
