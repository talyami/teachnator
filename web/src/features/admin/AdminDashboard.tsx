import React, { useEffect, useState } from 'react';
import {
  AdminStats,
  AdminUserListItem,
  ApiKeyItem,
  AuditLogItem,
  UserPlan,
  UserRole,
  UserStatus
} from '@fast-learning/shared';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';

interface AdminDashboardProps {
  onClose: () => void;
}

type AdminTab = 'users' | 'keys' | 'audit' | 'test';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { t, isRtl } = useI18n();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Users Tab
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // User Edit Modal
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null);
  const [editPlan, setEditPlan] = useState<UserPlan>('free');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editStatus, setEditStatus] = useState<UserStatus>('active');
  const [editLimitOverride, setEditLimitOverride] = useState<string>('');
  const [editKeyId, setEditKeyId] = useState<string>('shared');
  const [savingUser, setSavingUser] = useState(false);

  // Keys Tab
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyIsDefault, setNewKeyIsDefault] = useState(false);
  const [addingKey, setAddingKey] = useState(false);

  // Audit Tab
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Test AI Tab
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; reply?: string } | null>(null);

  const fetchStats = async () => {
    try {
      const data = await api.get<AdminStats>('/admin/stats');
      setStats(data);
    } catch (err: any) {
      console.error('Failed to fetch admin stats:', err);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const query = new URLSearchParams({ search, page: page.toString() }).toString();
      const res = await api.get<{ users: AdminUserListItem[]; total: number; page: number; totalPages: number }>(
        `/admin/users?${query}`
      );
      setUsers(res.users);
      setTotalPages(res.totalPages);
      setTotalUsersCount(res.total);
    } catch (err: any) {
      alert('فشل تحميل قائمة المستخدمين: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await api.get<ApiKeyItem[]>('/admin/keys');
      setKeys(res);
    } catch (err: any) {
      console.error('Failed to fetch keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchAudit = async () => {
    setLoadingAudit(true);
    try {
      const res = await api.get<AuditLogItem[]>('/admin/audit-log');
      setAuditLogs(res);
    } catch (err: any) {
      console.error('Failed to fetch audit log:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchKeys();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'keys') fetchKeys();
    if (activeTab === 'audit') fetchAudit();
  }, [activeTab, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const openEditUser = (u: AdminUserListItem) => {
    setEditingUser(u);
    setEditPlan(u.plan);
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditLimitOverride(u.daily_ai_limit_override !== null ? u.daily_ai_limit_override.toString() : '');
    setEditKeyId(u.assigned_key_id ? u.assigned_key_id.toString() : 'shared');
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      const limitVal = editLimitOverride.trim() === '' ? null : parseInt(editLimitOverride.trim(), 10);
      await api.patch(`/admin/users/${editingUser.id}`, {
        plan: editPlan,
        role: editRole,
        status: editStatus,
        daily_ai_limit_override: limitVal
      });

      const targetKey = editKeyId === 'shared' ? null : parseInt(editKeyId, 10);
      if (targetKey !== editingUser.assigned_key_id) {
        await api.patch(`/admin/users/${editingUser.id}/key`, {
          keyId: targetKey
        });
      }

      setEditingUser(null);
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      alert('فشل حفظ بيانات المستخدم: ' + err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleRevokeSessions = async (userId: number) => {
    if (!confirm('هل تريد تسجيل خروج هذا المستخدم من جميع أجهزته فوراً؟')) return;
    try {
      await api.post(`/admin/users/${userId}/revoke-sessions`, {});
      alert('تم إنهاء جميع جلسات المستخدم بنجاح');
      fetchUsers();
    } catch (err: any) {
      alert('فشل إنهاء الجلسات: ' + err.message);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyLabel.trim() || !newKeyValue.trim()) {
      alert('يرجى ملء الاسم والمفتاح');
      return;
    }
    setAddingKey(true);
    try {
      await api.post('/admin/keys', {
        label: newKeyLabel.trim(),
        keyValue: newKeyValue.trim(),
        provider: 'gemini',
        isDefault: newKeyIsDefault
      });
      setNewKeyLabel('');
      setNewKeyValue('');
      setNewKeyIsDefault(false);
      fetchKeys();
      fetchStats();
    } catch (err: any) {
      alert('فشل إضافة المفتاح: ' + err.message);
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteKey = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا المفتاح؟ سيتم تحويل المستخدمين المخصصين له إلى المسبح الافتراضي.')) return;
    try {
      await api.del(`/admin/keys/${id}`);
      fetchKeys();
      fetchStats();
    } catch (err: any) {
      alert('فشل حذف المفتاح: ' + err.message);
    }
  };

  const handleTestKey = async (keyId?: number) => {
    setTestingAi(true);
    setTestResult(null);
    try {
      const res = await api.post<{ success: boolean; message: string; reply?: string }>('/admin/test-ai', {
        keyId
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'فشل الاتصال'
      });
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-50 rounded-3xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Top Header */}
        <div className="p-5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-md shadow-indigo-200">
              ⚡
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">{t.admin.title}</h2>
              <p className="text-xs text-slate-400">{t.admin.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-white border-b border-slate-200">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 block">{t.admin.statUsers}</span>
              <span className="text-lg font-black text-slate-800">{stats.totalUsers}</span>
            </div>
            <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
              <span className="text-[11px] font-bold text-indigo-500 block">{t.admin.statActiveToday}</span>
              <span className="text-lg font-black text-indigo-700">{stats.activeToday}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
              <span className="text-[11px] font-bold text-emerald-500 block">{t.admin.statMaterials}</span>
              <span className="text-lg font-black text-emerald-700">{stats.totalMaterials}</span>
            </div>
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
              <span className="text-[11px] font-bold text-amber-500 block">{t.admin.statAttempts}</span>
              <span className="text-lg font-black text-amber-700">{stats.totalAttempts}</span>
            </div>
            <div className="p-3 bg-violet-50 rounded-2xl border border-violet-100">
              <span className="text-[11px] font-bold text-violet-500 block">{t.admin.statUnitsToday}</span>
              <span className="text-lg font-black text-violet-700">{stats.aiUnitsToday}</span>
            </div>
            <div className="p-3 bg-cyan-50 rounded-2xl border border-cyan-100">
              <span className="text-[11px] font-bold text-cyan-500 block">{t.admin.statKeys}</span>
              <span className="text-lg font-black text-cyan-700">{stats.keyPoolCount}</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-6 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-4 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.admin.tabUsers} ({totalUsersCount})
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`py-2 px-4 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeTab === 'keys'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.admin.tabKeys} ({keys.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-2 px-4 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.admin.tabAudit}
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`py-2 px-4 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeTab === 'test'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.admin.tabTest}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* TAB 1: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="ابحث بالبريد الإلكتروني أو الاسم..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  بحث 🔍
                </button>
              </form>

              {loadingUsers ? (
                <div className="py-12 text-center text-xs text-slate-400">جاري تحميل بيانات المستخدمين...</div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-start text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                        <tr>
                          <th className="p-3 text-start">{t.admin.tableUser}</th>
                          <th className="p-3 text-start">{t.admin.tableRole}</th>
                          <th className="p-3 text-start">{t.admin.tablePlan}</th>
                          <th className="p-3 text-start">{t.admin.tableAssignedKey}</th>
                          <th className="p-3 text-start">{t.admin.tableUsageToday}</th>
                          <th className="p-3 text-start">{t.admin.statMaterials} / {t.common.active}</th>
                          <th className="p-3 text-start">{t.admin.tableStatus}</th>
                          <th className="p-3 text-start">{t.admin.tableActions}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-slate-50/70 transition">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                                  {u.avatar_url ? (
                                    <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    u.name?.charAt(0) || 'U'
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800">{u.name || 'مستخدم بدون اسم'}</div>
                                  <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  u.role === 'admin'
                                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {u.role === 'admin' ? 'مدير نظام 👑' : 'مستخدم'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="space-y-0.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    u.plan === 'unlimited'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}
                                >
                                  {u.plan === 'unlimited' ? 'غير محدود ∞' : 'مجاني Free'}
                                </span>
                                {u.daily_ai_limit_override !== null && (
                                  <div className="text-[10px] text-amber-700 font-bold">
                                    تخصيص: {u.daily_ai_limit_override} وحدة
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {u.assigned_key_label ? (
                                <span className="bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-md font-bold text-[10px]">
                                  🔑 {u.assigned_key_label}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">المسبح الافتراضي</span>
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-700">{u.usage_today} وحدة</td>
                            <td className="p-3 text-slate-500">
                              <span>{u.material_count} مادة</span> / <span>{u.session_count} جهاز</span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  u.status === 'banned'
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {u.status === 'banned' ? 'محظور ⛔' : 'نشط'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditUser(u)}
                                  className="p-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                                  title="تعديل المستخدم"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleRevokeSessions(u.id)}
                                  className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition cursor-pointer"
                                  title="تسجيل خروج من جميع الأجهزة"
                                >
                                  🚪
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                    <div>
                      صفحة {page} من {totalPages || 1} (إجمالي {totalUsersCount} مستخدم)
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition cursor-pointer"
                      >
                        السابق
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition cursor-pointer"
                      >
                        التالي
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: KEY POOL */}
          {activeTab === 'keys' && (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs text-indigo-900 leading-relaxed">
                <strong className="block text-indigo-800 font-black mb-1">تسلسل مسبح المفاتيح السحابي:</strong>
                1. المفتاح المخصص للمستخدم إن وجد ➔ 2. المفتاح الافتراضي في المسبح ➔ 3. مفتاح ملف .env الاحتياطي.
                <br />
                جميع المفاتيح تشفر بخوارزمية AES-256-GCM مع Auth Tag قبل الحفظ في قاعدة البيانات.
              </div>

              {/* Add Key Form */}
              <form onSubmit={handleAddKey} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black text-slate-800">إضافة مفتاح سحابي جديد إلى المسبح</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">تسمية المفتاح (Label)</label>
                    <input
                      type="text"
                      placeholder="مثال: Google Cloud Tier 1"
                      value={newKeyLabel}
                      onChange={e => setNewKeyLabel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1 font-semibold">قيمة المفتاح (API Key)</label>
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      value={newKeyValue}
                      onChange={e => setNewKeyValue(e.target.value)}
                      className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKeyIsDefault}
                      onChange={e => setNewKeyIsDefault(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    تعيين كمفتاح افتراضي للمسبح المشترك (Default Shared Pool)
                  </label>
                  <button
                    type="submit"
                    disabled={addingKey}
                    className="py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    {addingKey ? 'جاري التشفير والإضافة...' : 'إضافة المفتاح للمسبح ➕'}
                  </button>
                </div>
              </form>

              {/* Key List */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                    <tr>
                      <th className="p-3">التسمية</th>
                      <th className="p-3">المزود والقيمة المشفرة</th>
                      <th className="p-3">النوع</th>
                      <th className="p-3">مستخدمون مخصصون</th>
                      <th className="p-3">تاريخ الإضافة</th>
                      <th className="p-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {keys.map(k => (
                      <tr key={k.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-3 font-bold text-slate-800">{k.label}</td>
                        <td className="p-3 font-mono text-slate-600">{k.masked_key}</td>
                        <td className="p-3">
                          {k.is_default ? (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              افتراضي المسبح ⭐
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">مخصص</span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-700">{k.assigned_user_count} مستخدم</td>
                        <td className="p-3 text-slate-400 text-[11px]">
                          {new Date(k.created_at).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleTestKey(k.id)}
                              className="px-2 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-[11px] font-bold rounded-lg transition cursor-pointer"
                            >
                              اختبار الاتصال ⚡
                            </button>
                            <button
                              onClick={() => handleDeleteKey(k.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="حذف المفتاح"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-3">المدير</th>
                    <th className="p-3">الإجراء</th>
                    <th className="p-3">المستخدم المستهدف</th>
                    <th className="p-3">التفاصيل</th>
                    <th className="p-3">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-bold text-slate-800">{log.admin_email}</td>
                      <td className="p-3">
                        <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{log.target_user_email || '—'}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(log.created_at).toLocaleString('ar-EG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: TEST AI */}
          {activeTab === 'test' && (
            <div className="max-w-xl mx-auto p-6 bg-white rounded-3xl border border-slate-200 space-y-4 text-center">
              <div className="text-4xl">🩺</div>
              <h3 className="text-base font-black text-slate-800">فحص وتأكيد جاهزية محرك الذكاء الاصطناعي</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                يقوم هذا الاختبار بإرسال استعلام فعلي خفيف إلى Google Gemini API باستخدام المفتاح السحابي المحدد للتحقق
                من صلاحيته وسرعة استجابته.
              </p>

              <button
                onClick={() => handleTestKey()}
                disabled={testingAi}
                className="py-3 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-200 transition cursor-pointer disabled:opacity-50"
              >
                {testingAi ? 'جاري الاختبار والتحقق...' : 'إجراء فحص الاتصال الآن ⚡'}
              </button>

              {testResult && (
                <div
                  className={`p-4 rounded-2xl text-xs font-semibold text-right ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  <div className="font-bold mb-1">{testResult.message}</div>
                  {testResult.reply && (
                    <div className="font-mono text-slate-600 text-[11px]">
                      رد النموذج: "{testResult.reply}"
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Edit Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-100 text-right">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800">تعديل بيانات المستخدم: {editingUser.name}</h3>
                <button
                  onClick={() => setEditingUser(null)}
                  className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الخطة (Plan)</label>
                  <select
                    value={editPlan}
                    onChange={e => setEditPlan(e.target.value as UserPlan)}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                  >
                    <option value="free">مجاني Free (20 وحدة يومياً)</option>
                    <option value="unlimited">غير محدود Unlimited (100 وحدة يومياً)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">تجاوز الحصة اليومية (Daily Limit Override)</label>
                  <input
                    type="number"
                    placeholder="اتركه فارغاً للاعتماد على الخطة"
                    value={editLimitOverride}
                    onChange={e => setEditLimitOverride(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">المفتاح السحابي المخصص (Dedicated Key)</label>
                  <select
                    value={editKeyId}
                    onChange={e => setEditKeyId(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                  >
                    <option value="shared">المسبح المشترك الافتراضي (Default Shared Pool)</option>
                    {keys.map(k => (
                      <option key={k.id} value={k.id.toString()}>
                        {k.label} ({k.masked_key})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الرتبة (Role)</label>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as UserRole)}
                    disabled={editingUser.id === user?.id}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white disabled:opacity-50"
                  >
                    <option value="user">مستخدم عادي User</option>
                    <option value="admin">مدير نظام Admin</option>
                  </select>
                  {editingUser.id === user?.id && (
                    <span className="text-[10px] text-amber-600 block mt-0.5">لا يمكنك تخفيض رتبة حسابك الشخصي</span>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الحالة (Status)</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as UserStatus)}
                    disabled={editingUser.id === user?.id}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white disabled:opacity-50"
                  >
                    <option value="active">نشط Active</option>
                    <option value="banned">محظور Banned</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => setEditingUser(null)}
                  className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveUser}
                  disabled={savingUser}
                  className="py-2 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {savingUser ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
