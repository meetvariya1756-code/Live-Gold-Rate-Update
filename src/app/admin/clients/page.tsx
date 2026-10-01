'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Field, Modal, Spinner, toast } from '@/components/ui';

interface AssignedStore {
  id: number;
  name: string;
  shop_domain: string;
  currency: string;
}

interface ClientUser {
  id: number;
  username: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stores: AssignedStore[];
}

interface AllStoreItem {
  id: number;
  name: string;
  shop_domain: string;
  client_user_id: number | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientUser[] | null>(null);
  const [allStores, setAllStores] = useState<AllStoreItem[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientUser | null>(null);

  const [createForm, setCreateForm] = useState({
    username: '',
    name: '',
    password: '',
    store_ids: [] as number[],
  });

  const [editForm, setEditForm] = useState({
    name: '',
    username: '',
    password: '',
    is_active: true,
    store_ids: [] as number[],
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const c = await api<{ clients: ClientUser[] }>('/api/admin/clients');
      setClients(c.clients);
      const s = await api<AllStoreItem[]>('/api/stores');
      setAllStores(s);
    } catch (e: any) {
      toast(e.message, true);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/clients', {
        method: 'POST',
        body: createForm,
      });
      toast(`Client '${createForm.username}' created successfully`);
      setOpenCreate(false);
      setCreateForm({ username: '', name: '', password: '', store_ids: [] });
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingClient) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/clients/${editingClient.id}`, {
        method: 'PUT',
        body: editForm,
      });
      toast(`Client updated successfully`);
      setEditingClient(null);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`Are you sure you want to delete client '${username}'? Associated stores will be unassigned.`)) return;
    try {
      await api(`/api/admin/clients/${id}`, { method: 'DELETE' });
      toast(`Client deleted`);
      await loadData();
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  const toggleStatus = async (client: ClientUser) => {
    try {
      await api(`/api/admin/clients/${client.id}`, {
        method: 'PUT',
        body: { is_active: !client.is_active },
      });
      toast(`Client ${!client.is_active ? 'activated' : 'deactivated'}`);
      await loadData();
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  const openEditModal = (c: ClientUser) => {
    setEditingClient(c);
    setEditForm({
      name: c.name,
      username: c.username,
      password: '',
      is_active: c.is_active,
      store_ids: c.stores.map((s) => s.id),
    });
    setError('');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Link href="/" className="btn-back" title="Back to stores">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </Link>
          <div>
            <h1>Client Accounts & Access</h1>
            <div className="muted small">
              Create client login credentials. Clients can only see and manage their assigned Shopify stores.
            </div>
          </div>
        </div>
        <button className="primary" onClick={() => { setOpenCreate(true); setError(''); }}>
          + Add Client
        </button>
      </div>

      <div className="card">
        {clients === null ? (
          <div className="empty"><Spinner /> Loading clients…</div>
        ) : !clients.length ? (
          <div className="empty">
            <p>No clients created yet.</p>
            <button className="primary" onClick={() => setOpenCreate(true)}>Create your first client</button>
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Client</th>
                <th>Role</th>
                <th>Status</th>
                <th>Assigned Stores</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    <div className="muted small">ID: <code>{c.username}</code></div>
                  </td>
                  <td>
                    <span className={`badge ${c.role === 'admin' ? 'gold' : ''}`}>
                      {c.role === 'admin' ? 'Admin' : 'Client'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${c.is_active ? 'green' : 'red'}`}>
                      {c.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    {c.stores.length ? (
                      <div className="row" style={{ gap: 4 }}>
                        {c.stores.map((s) => (
                          <Link key={s.id} href={`/stores/${s.id}`}>
                            <span className="badge" style={{ background: '#f0f0f0', color: '#111' }}>
                              🏪 {s.name}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="muted small">No stores assigned</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button className="sm" onClick={() => openEditModal(c)}>
                        Edit & Assign
                      </button>
                      {c.role !== 'admin' && (
                        <>
                          <button
                            className="sm"
                            style={{ color: c.is_active ? '#b42318' : '#0f7b3f' }}
                            onClick={() => toggleStatus(c)}
                          >
                            {c.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button className="sm danger" onClick={() => handleDelete(c.id, c.username)}>
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Client Modal */}
      {openCreate && (
        <Modal
          title="Create New Client Account"
          onClose={() => setOpenCreate(false)}
          footer={
            <>
              <button onClick={() => setOpenCreate(false)}>Cancel</button>
              <button className="primary" disabled={busy || !createForm.username || !createForm.password} onClick={handleCreate}>
                {busy ? <Spinner /> : null} Create Client
              </button>
            </>
          }
        >
          {error && <div className="banner error">{error}</div>}
          <div className="grid">
            <Field label="Client ID / Username" required hint="Used by client to log in (e.g. client_stylestitch or client@jewels.com)">
              <input
                className="plain"
                value={createForm.username}
                placeholder="client_username"
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              />
            </Field>

            <Field label="Client / Business Name" required hint="Display name (e.g. StyleStitch Jewels)">
              <input
                className="plain"
                value={createForm.name}
                placeholder="StyleStitch Jewels"
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </Field>

            <Field label="Password" required hint="Initial login password">
              <input
                className="plain"
                type="password"
                value={createForm.password}
                placeholder="••••••••"
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
            </Field>

            <Field label="Assign Stores" hint="Select stores this client has access to:">
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {allStores.length ? (
                  allStores.map((s) => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={createForm.store_ids.includes(s.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...createForm.store_ids, s.id]
                            : createForm.store_ids.filter((id) => id !== s.id);
                          setCreateForm({ ...createForm, store_ids: ids });
                        }}
                      />
                      <span><b>{s.name}</b> <span className="muted small">({s.shop_domain})</span></span>
                    </label>
                  ))
                ) : (
                  <div className="muted small">No stores connected yet. Connect stores first.</div>
                )}
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <Modal
          title={`Edit Client: ${editingClient.name}`}
          onClose={() => setEditingClient(null)}
          footer={
            <>
              <button onClick={() => setEditingClient(null)}>Cancel</button>
              <button className="primary" disabled={busy} onClick={handleUpdate}>
                {busy ? <Spinner /> : null} Save Changes
              </button>
            </>
          }
        >
          {error && <div className="banner error">{error}</div>}
          <div className="grid">
            <Field label="Client Name" required>
              <input
                className="plain"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </Field>

            <Field label="Client ID / Username" required>
              <input
                className="plain"
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              />
            </Field>

            <Field label="Reset Password" hint="Leave blank to keep current password">
              <input
                className="plain"
                type="password"
                placeholder="New password (optional)"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
            </Field>

            {editingClient.role !== 'admin' && (
              <Field label="Account Status">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  />
                  <span>Account Active (can log in)</span>
                </label>
              </Field>
            )}

            <Field label="Assigned Stores">
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {allStores.map((s) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editForm.store_ids.includes(s.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...editForm.store_ids, s.id]
                          : editForm.store_ids.filter((id) => id !== s.id);
                        setEditForm({ ...editForm, store_ids: ids });
                      }}
                    />
                    <span><b>{s.name}</b> <span className="muted small">({s.shop_domain})</span></span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
