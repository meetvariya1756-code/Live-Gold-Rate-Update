'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Phone, MessageSquare, AlertTriangle, X, ArrowRight } from 'lucide-react';

interface SupportAlert {
  id: number;
  store_name: string;
  shop_domain: string;
  client_name: string;
  type: 'chat' | 'call';
  subject?: string;
  message?: string;
  preferred_call_time?: string;
  created_at: string;
}

// Gentle synthetic notification sound
function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    osc2.frequency.setValueAtTime(880, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.2); // D6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.6);
  } catch {}
}

export function AdminNotificationListener({ isAdmin }: { isAdmin: boolean }) {
  const [activeAlerts, setActiveAlerts] = useState<SupportAlert[]>([]);
  const knownMessagesRef = useRef<Map<number, string>>(new Map());
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    if (!isAdmin) return;

    const checkNotifications = async () => {
      try {
        const res = await fetch('/api/support/notifications');
        if (!res.ok) return;
        const data = await res.json();

        if (data.latestRequests && Array.isArray(data.latestRequests)) {
          const newAlerts: SupportAlert[] = [];

          for (const req of data.latestRequests) {
            const key = req.id;
            const stateHash = `${req.updated_at || req.created_at}_${req.last_message || ''}_${req.human_requested ? 'human' : 'bot'}_${req.is_read_by_admin ? 'read' : 'unread'}`;
            const previousHash = knownMessagesRef.current.get(key);

            // New ticket or updated ticket with new unread activity
            if (!previousHash) {
              knownMessagesRef.current.set(key, stateHash);
              if (!isFirstRunRef.current && (!req.is_read_by_admin || req.human_requested)) {
                newAlerts.push(req);
              }
            } else if (previousHash !== stateHash) {
              knownMessagesRef.current.set(key, stateHash);
              // If client sent a new message or escalated and it's unread
              if (!req.is_read_by_admin && (req.last_sender_role === 'client' || req.human_requested || req.type === 'call')) {
                newAlerts.push(req);
              }
            }
          }

          if (isFirstRunRef.current) {
            isFirstRunRef.current = false;
            // On initial load, show unread if any
            const unread = data.latestRequests.filter((r: any) => !r.is_read_by_admin);
            if (unread.length > 0) {
              setActiveAlerts(unread.slice(0, 2));
            }
          } else if (newAlerts.length > 0) {
            playNotificationChime();
            setActiveAlerts((prev) => {
              const combined = [...newAlerts, ...prev.filter((p) => !newAlerts.some((n) => n.id === p.id))];
              return combined.slice(0, 4);
            });
          }
        }
      } catch {}
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 12000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const dismiss = (id: number) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    fetch('/api/support/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestIds: [id] }),
    }).catch(() => {});
  };

  if (!isAdmin || activeAlerts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 420,
        width: '90%',
        pointerEvents: 'none',
      }}
    >
      {activeAlerts.map((alert) => {
        const isHumanEscalation = (alert as any).human_requested;
        return (
          <div
            key={alert.id}
            style={{
              pointerEvents: 'auto',
              background: isHumanEscalation
                ? 'linear-gradient(135deg, #450a0a, #1f0404)'
                : 'linear-gradient(135deg, #1f1a0a, #2a2007)',
              border: isHumanEscalation ? '2px solid #ef4444' : '2px solid #d4af37',
              borderRadius: 12,
              padding: '16px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
              color: '#fff',
              animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: isHumanEscalation ? '#fca5a5' : '#fcd34d',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {isHumanEscalation ? (
                  <AlertTriangle size={16} />
                ) : alert.type === 'call' ? (
                  <Phone size={16} />
                ) : (
                  <MessageSquare size={16} />
                )}
                <span>
                  {isHumanEscalation
                    ? `Live Agent Requested – ${alert.store_name}`
                    : alert.type === 'call'
                    ? `Call Support Required – ${alert.store_name}`
                    : `New Support Message – ${alert.store_name}`}
                </span>
              </div>
              <button
                onClick={() => dismiss(alert.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#e5e5e5', marginBottom: 12, lineHeight: 1.4 }}>
              <b>Store / Client:</b> {alert.store_name} ({alert.client_name})
              {alert.type === 'call' && alert.preferred_call_time && (
                <div style={{ color: '#93c5fd', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={13} />
                  <span>Preferred Time: <b>{alert.preferred_call_time}</b></span>
                </div>
              )}
              {((alert as any).last_message || alert.message) && (
                <div style={{ color: '#f8fafc', fontSize: 12, marginTop: 6, background: 'rgba(255,255,255,0.08)', padding: '6px 10px', borderRadius: 6, fontStyle: 'italic' }}>
                  "{(alert as any).last_message || alert.message}"
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="sm"
                onClick={() => dismiss(alert.id)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}
              >
                Dismiss
              </button>
              <Link
                href={`/admin/support?ticketId=${alert.id}`}
                onClick={() => dismiss(alert.id)}
                className="sm"
                style={{
                  background: isHumanEscalation ? '#ef4444' : '#d4af37',
                  color: isHumanEscalation ? '#fff' : '#000',
                  fontWeight: 700,
                  textDecoration: 'none',
                  padding: '6px 14px',
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{isHumanEscalation ? 'Join Live Chat' : 'Open Ticket'}</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
