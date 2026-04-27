import { useState, useEffect, useCallback } from "react";
import { api, type AuthUser } from "../api/client";
import { Card } from "./Card";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  ShieldCheck,
  Eye,
  Building2,
  X,
  Save,
  UserCheck,
  UserX,
} from "lucide-react";

const ROLE_OPTIONS = [
  { value: "superadmin", label: "Super Admin", icon: ShieldCheck, color: "#EF4444" },
  { value: "admin", label: "Admin", icon: Shield, color: "#F59E0B" },
  { value: "customer", label: "Customer", icon: Building2, color: "#3B82F6" },
  { value: "viewer", label: "Viewer", icon: Eye, color: "#6B7280" },
];

function RoleBadge({ role }: { role: string }) {
  const r = ROLE_OPTIONS.find((o) => o.value === role) ?? ROLE_OPTIONS[3];
  const Icon = r.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        backgroundColor: `color-mix(in srgb, ${r.color} 15%, transparent)`,
        color: r.color,
      }}
    >
      <Icon className="w-3 h-3" />
      {r.label}
    </span>
  );
}

interface UserFormData {
  username: string;
  password: string;
  display_name: string;
  role: string;
  customer: string;
}

const emptyForm: UserFormData = {
  username: "",
  password: "",
  display_name: "",
  role: "viewer",
  customer: "",
};

export function UserManagement() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AuthUser | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
  };

  const openEdit = (u: AuthUser) => {
    setEditId(u.id);
    setForm({
      username: u.username,
      password: "",
      display_name: u.display_name ?? "",
      role: u.role,
      customer: u.customer ?? "",
    });
    setShowForm(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      if (editId) {
        const updates: Record<string, unknown> = {
          display_name: form.display_name || undefined,
          role: form.role,
          customer: form.customer || undefined,
        };
        if (form.password) updates.password = form.password;
        await api.updateUser(editId, updates as Parameters<typeof api.updateUser>[1]);
      } else {
        if (!form.username || !form.password) {
          setError("Username and password are required");
          setSaving(false);
          return;
        }
        await api.createUser({
          username: form.username,
          password: form.password,
          display_name: form.display_name || undefined,
          role: form.role,
          customer: form.customer || undefined,
        });
      }
      setShowForm(false);
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: AuthUser) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await api.deleteUser(userToDelete.id);
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setUserToDelete(null);
    }
  };

  return (
    <div className="space-y-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--theme-accent) 12%, transparent)" }}
          >
            <Users className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>
              User Management
            </h2>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {users.length} user{users.length !== 1 ? "s" : ""} registered
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)",
            color: "var(--theme-accent)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add User
        </button>
      </div>

      {error && !showForm && (
        <div
          className="px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#EF4444",
          }}
        >
          {error}
        </div>
      )}

      {/* Users Table */}
      <Card>
        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--theme-text-muted)" }}>
            Loading users...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--theme-surface-border)" }}>
                  {["User", "Role", "Customer", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="text-left py-2 px-3 text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:opacity-80 transition-opacity"
                    style={{ borderBottom: "1px solid var(--theme-surface-border)" }}
                  >
                    <td className="py-2.5 px-3">
                      <div>
                        <span className="font-medium" style={{ color: "var(--theme-text-primary)" }}>
                          {u.display_name || u.username}
                        </span>
                        <span className="text-xs ml-1.5" style={{ color: "var(--theme-text-muted)" }}>
                          @{u.username}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-2.5 px-3">
                      <span style={{ color: u.customer ? "var(--theme-text-secondary)" : "var(--theme-text-muted)" }}>
                        {u.customer || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => handleToggleActive(u)}
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: u.is_active ? "#22C55E" : "#EF4444" }}
                      >
                        {u.is_active ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" /> Active
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5" /> Disabled
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg hover:opacity-80"
                          style={{ color: "var(--theme-text-muted)" }}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setUserToDelete(u)}
                          className="p-1.5 rounded-lg hover:opacity-80"
                          style={{ color: "#EF4444" }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div
            className="w-full max-w-md rounded-xl p-6 shadow-2xl"
            style={{ backgroundColor: "var(--theme-card-bg)", border: "1px solid var(--theme-card-border)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold" style={{ color: "var(--theme-text-primary)" }}>
                {editId ? "Edit User" : "Create User"}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1" style={{ color: "var(--theme-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div
                className="px-3 py-2 rounded-lg text-xs mb-4"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#EF4444",
                }}
              >
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  Username
                </label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={!!editId}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--theme-surface-raised)",
                    color: "var(--theme-text-primary)",
                    border: "1px solid var(--theme-surface-border)",
                    opacity: editId ? 0.5 : 1,
                  }}
                  placeholder="username"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  {editId ? "New Password (leave blank to keep)" : "Password"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--theme-surface-raised)",
                    color: "var(--theme-text-primary)",
                    border: "1px solid var(--theme-surface-border)",
                  }}
                  placeholder={editId ? "••••••••" : "password"}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  Display Name
                </label>
                <input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--theme-surface-raised)",
                    color: "var(--theme-text-primary)",
                    border: "1px solid var(--theme-surface-border)",
                  }}
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--theme-surface-raised)",
                    color: "var(--theme-text-primary)",
                    border: "1px solid var(--theme-surface-border)",
                  }}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
                  Customer (for customer role)
                </label>
                <input
                  value={form.customer}
                  onChange={(e) => setForm({ ...form, customer: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--theme-surface-raised)",
                    color: "var(--theme-text-primary)",
                    border: "1px solid var(--theme-surface-border)",
                  }}
                  placeholder="e.g. CMWI"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{ color: "var(--theme-text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: "var(--theme-accent)",
                  color: "white",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!userToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={() => setUserToDelete(null)}
        title="Delete User"
        message={`Delete user "${userToDelete?.username}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
