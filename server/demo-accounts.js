// Development-only identities. Production disables this fallback and should
// authenticate against the configured user store.
export const DEMO_ACCOUNTS = [
  { id: 'demo-student-01', username: 'student01', displayName: '测试学员 01', role: 'student', password: 'Maple-Study-2026-01!' },
  { id: 'demo-student-02', username: 'student02', displayName: '测试学员 02', role: 'student', password: 'Maple-Study-2026-02!' },
  { id: 'demo-student-03', username: 'student03', displayName: '测试学员 03', role: 'student', password: 'Maple-Study-2026-03!' },
  { id: 'demo-student-04', username: 'student04', displayName: '测试学员 04', role: 'student', password: 'Maple-Study-2026-04!' },
  { id: 'demo-student-05', username: 'student05', displayName: '测试学员 05', role: 'student', password: 'Maple-Study-2026-05!' },
  { id: 'demo-student-06', username: 'student06', displayName: '测试学员 06', role: 'student', password: 'Maple-Study-2026-06!' },
  { id: 'demo-student-07', username: 'student07', displayName: '测试学员 07', role: 'student', password: 'Maple-Study-2026-07!' },
  { id: 'demo-student-08', username: 'student08', displayName: '测试学员 08', role: 'student', password: 'Maple-Study-2026-08!' },
  { id: 'demo-student-09', username: 'student09', displayName: '测试学员 09', role: 'student', password: 'Maple-Study-2026-09!' },
  { id: 'demo-student-10', username: 'student10', displayName: '测试学员 10', role: 'student', password: 'Maple-Study-2026-10!' },
  { id: 'demo-admin-01', username: 'admin01', displayName: '测试管理员 01', role: 'teacher', password: 'Console-Admin-2026-01!' },
  { id: 'demo-admin-02', username: 'admin02', displayName: '测试管理员 02', role: 'teacher', password: 'Console-Admin-2026-02!' },
];

export const LEGACY_DEMO_ACCOUNTS = [
  { id: 'demo-student', username: 'hskstudent', displayName: 'HSK 学员', role: 'student', password: 'HskStudent2026!' },
  { id: 'demo-admin', username: 'hskadmin', displayName: 'HSK 管理员', role: 'teacher', password: 'HskAdmin2026!' },
];

export const ALL_DEMO_ACCOUNTS = [...DEMO_ACCOUNTS, ...LEGACY_DEMO_ACCOUNTS];
