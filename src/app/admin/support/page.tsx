'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Spinner, toast } from '@/components/ui';
import { timeAgo } from '@/lib/client';
import {
  Phone,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Lock,
  Mail,
  Store,
  Search,
  Key,
  Bot,
  Shield,
  User,
  Check,
  X,
  ArrowRight,
  PhoneCall,
  Sparkles,
} from 'lucide-react';

interface SupportRequest {
  id: number;
  store_id: number | null;
  store_name: string;
  shop_domain: string;
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  type: 'chat' | 'call';
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  subject?: string;
  message?: string;
  preferred_call_time?: string | null;
  collaborator_code?: string | null;
  admin_notes?: string | null;
  is_read_by_admin: boolean;
  human_requested?: boolean;
  call_accepted_at?: string | null;
  closed_by?: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface Message {
  id: number;
  sender_role: 'admin' | 'client' | 'bot';
  sender_name: string;
  message: string;
  created_at: string;
}

function AdminSupportContent() {
  const searchParams = useSearchParams();
  const ticketIdParam = searchParams.get('ticketId');

  const [requests, setRequests] = useState<SupportRequest[] | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [replyText, setReplyText] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/support');
      if (res.ok) {
        const data = await res.json();
        const list: SupportRequest[] = data.requests || [];
        setRequests(list);

        if (ticketIdParam) {
          const match = list.find((r) => r.id === parseInt(ticketIdParam, 10));
          if (match) openTicket(match);
        }
      }
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 10000);
    return () => clearInterval(interval);
  }, []);

  const openTicket = async (ticket: SupportRequest) => {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.admin_notes || '');
    try {
      const res = await fetch(`/api/support/${ticket.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.request) {
          setSelectedTicket(data.request);
          setAdminNotes(data.request.admin_notes || '');
        }
      }
    } catch {}
  };

  // Poll chat messages for active ticket
  useEffect(() => {
    if (!selectedTicket) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/support/${selectedTicket.id}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          if (data.request) {
            setSelectedTicket(data.request);
          }
        }
      } catch {}
    }, 3500);
    return () => clearInterval(interval);
  }, [selectedTicket?.id]);

  const updateStatus = async (status: string) => {
    if (!selectedTicket) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data.request);
        toast(`Status updated to ${status.replace('_', ' ').toUpperCase()}`);
        loadRequests();
      }
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const saveAdminNotes = async () => {
    if (!selectedTicket) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: adminNotes }),
      });
      if (res.ok) {
        toast('Internal admin notes saved.');
        loadRequests();
      }
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSavingNotes(false);
    }
  };

  const sendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setReplyText('');
        loadRequests();
      }
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  // Filter requests
  const filtered = (requests || []).filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.store_name.toLowerCase().includes(q) ||
        r.shop_domain.toLowerCase().includes(q) ||
        r.client_name.toLowerCase().includes(q) ||
        (r.client_phone && r.client_phone.toLowerCase().includes(q)) ||
        (r.client_email && r.client_email.toLowerCase().includes(q)) ||
        (r.subject && r.subject.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const pendingCount = (requests || []).filter((r) => r.status === 'pending').length;
  const inProgressCount = (requests || []).filter((r) => r.status === 'in_progress').length;
  const callCount = (requests || []).filter((r) => r.type === 'call').length;
  const chatCount = (requests || []).filter((r) => r.type === 'chat').length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      {/* Page Header */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Link href="/" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>
              ← Stores
            </Link>
            <span style={{ color: '#9ca3af' }}>/</span>
            <span style={{ color: '#111827', fontSize: 13, fontWeight: 600 }}>Customer Support</span>
          </div>
          <h1 style={{ color: '#111827', fontSize: 22, fontWeight: 700 }}>Client Support & Assistance Dashboard</h1>
          <div style={{ color: '#4b5563', fontSize: 13, marginTop: 2 }}>
            Manage real-time live chat conversations and callback requests from client stores.
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#4b5563', fontWeight: 600 }}>Pending Attention</span>
            <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              Action Needed
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: pendingCount > 0 ? '#b45309' : '#111827' }}>
            {pendingCount}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#4b5563', fontWeight: 600 }}>In Progress</span>
            <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              Active
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1d4ed8' }}>{inProgressCount}</div>
        </div>

        <div className="card" style={{ padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#4b5563', fontWeight: 600 }}>Call Requests</span>
            <span style={{ fontSize: 11, background: '#f3e8ff', color: '#7e22ce', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              Callbacks
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7e22ce' }}>{callCount}</div>
        </div>

        <div className="card" style={{ padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#4b5563', fontWeight: 600 }}>Chat Inquiries</span>
            <span style={{ fontSize: 11, background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              Live Messages
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#059669' }}>{chatCount}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: 18, padding: '12px 18px', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 8 }}>
            <button
              style={{
                background: statusFilter === 'all' ? '#111827' : '#ffffff',
                color: statusFilter === 'all' ? '#ffffff' : '#374151',
                border: `1px solid ${statusFilter === 'all' ? '#111827' : '#d1d5db'}`,
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setStatusFilter('all')}
            >
              All Status
            </button>
            <button
              style={{
                background: statusFilter === 'pending' ? '#b45309' : '#ffffff',
                color: statusFilter === 'pending' ? '#ffffff' : '#92400e',
                border: `1px solid ${statusFilter === 'pending' ? '#b45309' : '#fde68a'}`,
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setStatusFilter('pending')}
            >
              <Clock size={13} />
              <span>Pending ({pendingCount})</span>
            </button>
            <button
              style={{
                background: statusFilter === 'in_progress' ? '#1d4ed8' : '#ffffff',
                color: statusFilter === 'in_progress' ? '#ffffff' : '#1e40af',
                border: `1px solid ${statusFilter === 'in_progress' ? '#1d4ed8' : '#bfdbfe'}`,
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setStatusFilter('in_progress')}
            >
              <Sparkles size={13} />
              <span>In Progress ({inProgressCount})</span>
            </button>
            <button
              style={{
                background: statusFilter === 'resolved' ? '#15803d' : '#ffffff',
                color: statusFilter === 'resolved' ? '#ffffff' : '#166534',
                border: `1px solid ${statusFilter === 'resolved' ? '#15803d' : '#bbf7d0'}`,
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setStatusFilter('resolved')}
            >
              <CheckCircle2 size={13} />
              <span>Resolved</span>
            </button>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <select
              className="plain sm"
              style={{ width: 140, background: '#fff', color: '#111827', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px' }}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Channels</option>
              <option value="chat">Chat Messages</option>
              <option value="call">Call Requests</option>
            </select>
            <input
              className="plain sm"
              style={{ width: 230, background: '#fff', color: '#111827', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px' }}
              placeholder="Search store, phone, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Requests List + Active Ticket Drawer */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedTicket ? 'minmax(420px, 1fr) minmax(460px, 1.25fr)' : '1fr',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Table of Requests */}
        <div className="card" style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          {requests === null ? (
            <div className="empty" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
              <Spinner /> Loading support requests…
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
              No support requests match your criteria.
            </div>
          ) : (
            <table className="list" style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ minWidth: 160, padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#4b5563', textAlign: 'left' }}>Store / Client</th>
                  <th style={{ width: 90, padding: '10px 8px', fontSize: 12, fontWeight: 700, color: '#4b5563', textAlign: 'center' }}>Type</th>
                  <th style={{ minWidth: 160, padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#4b5563', textAlign: 'left' }}>Topic / Message</th>
                  <th style={{ width: 110, padding: '10px 8px', fontSize: 12, fontWeight: 700, color: '#4b5563', textAlign: 'center' }}>Status</th>
                  <th style={{ width: 95, padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#4b5563', whiteSpace: 'nowrap', textAlign: 'left' }}>Date</th>
                  <th style={{ width: 65, padding: '10px 12px', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSelected = selectedTicket?.id === r.id;
                  const isCall = r.type === 'call';

                  return (
                    <tr
                      key={r.id}
                      className={`click ${isSelected ? 'selected-row' : ''}`}
                      style={{
                        background: isSelected
                          ? '#eff6ff'
                          : !r.is_read_by_admin
                          ? '#fffbeb'
                          : '#ffffff',
                        borderLeft: !r.is_read_by_admin
                          ? '4px solid #f59e0b'
                          : isSelected
                          ? '4px solid #2563eb'
                          : '4px solid transparent',
                        borderBottom: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onClick={() => openTicket(r)}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{r.store_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                          {r.client_name} <span style={{ color: '#9ca3af' }}>({r.shop_domain})</span>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: 14,
                            background: isCall ? '#f5f3ff' : '#eff6ff',
                            color: isCall ? '#7c3aed' : '#2563eb',
                            border: `1px solid ${isCall ? '#ddd6fe' : '#bfdbfe'}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isCall ? <PhoneCall size={12} /> : <MessageSquare size={12} />}
                          <span>{isCall ? 'Call' : 'Chat'}</span>
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: '#1f2937',
                            maxWidth: 190,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={r.subject || r.message || ''}
                        >
                          {r.subject || (isCall ? 'Call Support Request' : 'Chat Support Inquiry')}
                        </div>
                        {isCall && r.preferred_call_time && (
                          <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 500, marginTop: 2 }}>
                            Time: {r.preferred_call_time}
                          </div>
                        )}
                        {r.client_phone && (
                          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={11} /> {r.client_phone}
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 9px',
                            borderRadius: 14,
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background:
                              r.status === 'resolved'
                                ? '#dcfce7'
                                : r.status === 'in_progress'
                                ? '#dbeafe'
                                : r.status === 'closed'
                                ? '#f1f5f9'
                                : '#fef3c7',
                            color:
                              r.status === 'resolved'
                                ? '#166534'
                                : r.status === 'in_progress'
                                ? '#1e40af'
                                : r.status === 'closed'
                                ? '#475569'
                                : '#92400e',
                            border: `1px solid ${
                              r.status === 'resolved'
                                ? '#bbf7d0'
                                : r.status === 'in_progress'
                                ? '#bfdbfe'
                                : r.status === 'closed'
                                ? '#cbd5e1'
                                : '#fde68a'
                            }`,
                          }}
                        >
                          {r.status === 'resolved' ? (
                            <CheckCircle2 size={12} />
                          ) : r.status === 'in_progress' ? (
                            <Sparkles size={12} />
                          ) : r.status === 'closed' ? (
                            <Check size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          <span>
                            {r.status === 'in_progress'
                              ? 'In Progress'
                              : r.status === 'resolved'
                              ? 'Resolved'
                              : r.status === 'closed'
                              ? 'Closed'
                              : 'Pending'}
                          </span>
                        </span>
                      </td>

                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#6b7280', padding: '12px' }} title={new Date(r.created_at).toLocaleString()}>
                        {timeAgo(r.created_at)}
                      </td>

                      <td style={{ textAlign: 'right', padding: '12px 14px' }}>
                        <button
                          style={{
                            background: isSelected ? '#2563eb' : '#ffffff',
                            color: isSelected ? '#ffffff' : '#374151',
                            border: `1px solid ${isSelected ? '#2563eb' : '#d1d5db'}`,
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openTicket(r);
                          }}
                        >
                          <span>Open</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Selected Ticket Live Details & Chat Drawer (Right Side) */}
        {selectedTicket && (
          <div
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              background: '#ffffff',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#fafafa',
                borderRadius: '12px 12px 0 0',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {selectedTicket.type === 'call' ? <PhoneCall size={16} color="#7c3aed" /> : <MessageSquare size={16} color="#2563eb" />}
                    <span>{selectedTicket.type === 'call' ? 'Call Request' : 'Chat Ticket'} #{selectedTicket.id}</span>
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 10,
                      background:
                        selectedTicket.status === 'resolved'
                          ? '#dcfce7'
                          : selectedTicket.status === 'in_progress'
                          ? '#dbeafe'
                          : selectedTicket.status === 'closed'
                          ? '#f1f5f9'
                          : '#fef3c7',
                      color:
                        selectedTicket.status === 'resolved'
                          ? '#166534'
                          : selectedTicket.status === 'in_progress'
                          ? '#1e40af'
                          : selectedTicket.status === 'closed'
                          ? '#475569'
                          : '#92400e',
                      border: `1px solid ${
                        selectedTicket.status === 'resolved'
                          ? '#bbf7d0'
                          : selectedTicket.status === 'in_progress'
                          ? '#bfdbfe'
                          : selectedTicket.status === 'closed'
                          ? '#cbd5e1'
                          : '#fde68a'
                      }`,
                    }}
                  >
                    {selectedTicket.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ color: '#4b5563', fontSize: 12 }}>
                  Requested by <b style={{ color: '#111827' }}>{selectedTicket.client_name}</b> from <b style={{ color: '#111827' }}>{selectedTicket.store_name}</b> ({selectedTicket.shop_domain})
                </div>
              </div>

              <button
                onClick={() => setSelectedTicket(null)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  color: '#4b5563',
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>

            {/* Quick Action & Contact Toolbar */}
            <div
              style={{
                padding: '12px 20px',
                background: '#ffffff',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div className="row" style={{ gap: 8 }}>
                {selectedTicket.client_phone && (
                  <a
                    href={`tel:${selectedTicket.client_phone}`}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: 12,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 6,
                      boxShadow: '0 1px 3px rgba(22, 163, 74, 0.2)',
                    }}
                  >
                    <Phone size={13} /> Call {selectedTicket.client_phone}
                  </a>
                )}
                {selectedTicket.client_email && (
                  <a
                    href={`mailto:${selectedTicket.client_email}?subject=Support: ${selectedTicket.subject || 'Gold Rate Pricer Support'}`}
                    style={{
                      background: '#ffffff',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 6,
                    }}
                  >
                    <Mail size={13} /> Email
                  </a>
                )}
                {selectedTicket.store_id && (
                  <Link
                    href={`/stores/${selectedTicket.store_id}`}
                    style={{
                      background: '#ffffff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 12px',
                      borderRadius: 6,
                    }}
                  >
                    <Store size={13} /> Store Setup →
                  </Link>
                )}
              </div>

              {/* Status Updater */}
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Status:</span>
                <select
                  style={{
                    minWidth: 125,
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#111827',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  value={selectedTicket.status}
                  onChange={(e) => updateStatus(e.target.value)}
                  disabled={busy}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            {/* Shopify Collaborator Access Info Card */}
            <div
              style={{
                margin: '14px 20px 0',
                padding: '12px 16px',
                borderRadius: 10,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Key size={15} /> <span>Shopify Collaborator Access</span>
                </div>
                <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
                  Store: <b style={{ color: '#1e3a8a' }}>{selectedTicket.shop_domain}</b>
                  {selectedTicket.collaborator_code ? (
                    <span style={{ marginLeft: 8, background: '#dbeafe', padding: '2px 8px', borderRadius: 6, fontWeight: 800, color: '#1e3a8a' }}>
                      Code: {selectedTicket.collaborator_code}
                    </span>
                  ) : (
                    <span style={{ marginLeft: 6, color: '#64748b' }}>(No code required or standard request)</span>
                  )}
                </div>
              </div>

              <a
                href="https://partners.shopify.com/organizations"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 14px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                }}
              >
                <span>Request Access in Partner Dashboard</span>
                <ExternalLink size={13} />
              </a>
            </div>

            {/* Premium Soft Call Support Details Banner (if type === 'call') */}
            {selectedTicket.type === 'call' && (
              <div
                style={{
                  margin: '14px 20px 0',
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  borderLeft: '4px solid #7c3aed',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PhoneCall size={16} /> <span>Call Support Request Details</span>
                  </div>
                  {selectedTicket.call_accepted_at ? (
                    <span
                      style={{
                        background: '#dcfce7',
                        color: '#15803d',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 12,
                        border: '1px solid #bbf7d0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <CheckCircle2 size={12} /> Accepted & Client Notified
                    </span>
                  ) : (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 12,
                        border: '1px solid #fde68a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Clock size={12} /> Awaiting Admin Acceptance
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>Preferred Callback Time:</span>
                    <div style={{ fontWeight: 700, color: '#111827', marginTop: 1 }}>
                      {selectedTicket.preferred_call_time || 'Immediate / ASAP'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>Client Contact Number:</span>
                    <div style={{ marginTop: 1 }}>
                      <a href={`tel:${selectedTicket.client_phone}`} style={{ color: '#7c3aed', fontWeight: 700, textDecoration: 'none' }}>
                        {selectedTicket.client_phone}
                      </a>
                    </div>
                  </div>
                </div>

                {selectedTicket.message && (
                  <div style={{ fontSize: 12, color: '#374151', background: '#ffffff', border: '1px solid #e9d5ff', padding: '8px 12px', borderRadius: 8, marginBottom: 10 }}>
                    <b style={{ color: '#5b21b6' }}>Client Inquiry Note:</b> "{selectedTicket.message}"
                  </div>
                )}

                {/* Admin Accept & Notify Action Button */}
                {!selectedTicket.call_accepted_at && selectedTicket.status !== 'closed' && (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e9d5ff',
                      padding: '10px 14px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#4b5563' }}>
                      Ready to call? Send immediate confirmation to client:
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      style={{
                        background: '#16a34a',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: 12,
                        border: 'none',
                        padding: '7px 14px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const res = await fetch(`/api/support/${selectedTicket.id}/accept-call`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ estimate: 'within 5-10 minutes' }),
                          });
                          if (res.ok) {
                            const d = await res.json();
                            setSelectedTicket(d.request);
                            setMessages((prev) => [...prev, d.message]);
                            toast('✅ Call request accepted! Client has been notified.');
                            loadRequests();
                          }
                        } catch (e: any) {
                          toast(e.message, true);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Check size={14} />
                      <span>Accept & Notify Client (Calling in 5-10m)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Live Chat Timeline */}
            <div
              style={{
                padding: '18px 20px',
                minHeight: 220,
                maxHeight: 320,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                background: '#f8fafc',
                borderTop: '1px solid #e5e7eb',
                marginTop: 14,
              }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 700 }}>
                Conversation History
              </div>
              {messages.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                  No messages exchanged yet. Send a reply below.
                </div>
              ) : (
                messages.map((m) => {
                  const isAdmin = m.sender_role === 'admin';
                  const isBot = m.sender_role === 'bot';

                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isAdmin ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        background: isAdmin
                          ? '#2563eb'
                          : isBot
                          ? '#fef9c3'
                          : '#ffffff',
                        color: isAdmin
                          ? '#ffffff'
                          : isBot
                          ? '#713f12'
                          : '#111827',
                        border: isAdmin
                          ? 'none'
                          : isBot
                          ? '1px solid #fef08a'
                          : '1px solid #e2e8f0',
                        borderRadius: isAdmin
                          ? '14px 14px 2px 14px'
                          : '14px 14px 14px 2px',
                        padding: '10px 14px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          marginBottom: 4,
                          color: isAdmin ? '#dbeafe' : isBot ? '#854d0e' : '#4b5563',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {isBot ? (
                          <>
                            <Bot size={13} />
                            <span>Support Bot</span>
                          </>
                        ) : isAdmin ? (
                          <>
                            <Shield size={13} />
                            <span>You (Admin)</span>
                          </>
                        ) : (
                          <>
                            <User size={13} />
                            <span>{m.sender_name}</span>
                          </>
                        )}
                        <span>• {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{m.message}</div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Admin Message Reply Form */}
            <form
              onSubmit={sendAdminReply}
              style={{
                padding: '12px 20px',
                display: 'flex',
                gap: 8,
                background: '#ffffff',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <input
                className="plain"
                style={{
                  flex: 1,
                  background: '#ffffff',
                  color: '#111827',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                }}
                placeholder="Type a reply to the merchant..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !replyText.trim()}
                style={{
                  background: replyText.trim() ? '#2563eb' : '#93c5fd',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: replyText.trim() ? 'pointer' : 'default',
                }}
              >
                {busy ? <Spinner /> : 'Send Reply'}
              </button>
            </form>

            {/* Admin Internal Notes */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e5e7eb',
                background: '#fafafa',
                borderRadius: '0 0 12px 12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Lock size={13} /> <span>Internal Admin Notes (Private)</span>
                </span>
                <button
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#374151',
                  }}
                  onClick={saveAdminNotes}
                  disabled={savingNotes}
                >
                  {savingNotes ? 'Saving…' : 'Save Notes'}
                </button>
              </div>
              <textarea
                rows={2}
                style={{
                  width: '100%',
                  background: '#ffffff',
                  color: '#111827',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}
                placeholder="Log notes about phone calls, resolved issues, or next steps (only visible to admins)..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense>
      <AdminSupportContent />
    </Suspense>
  );
}
