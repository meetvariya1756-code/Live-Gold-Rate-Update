'use client';
import { useState, useEffect, useRef } from 'react';
import { toast, Spinner } from '@/components/ui';
import {
  MessageSquare,
  PhoneCall,
  Bot,
  User,
  Headphones,
  Sparkles,
  Send,
  X,
  CheckCircle2,
  Clock,
  Plus,
  Key,
  Lightbulb,
  Check,
  RotateCcw,
  TrendingUp,
  Zap,
  Gem,
  ShieldCheck,
} from 'lucide-react';

interface SupportRequest {
  id: number;
  store_name: string;
  shop_domain: string;
  client_name: string;
  client_phone?: string;
  client_email?: string;
  type: 'chat' | 'call';
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  subject?: string;
  message?: string;
  preferred_call_time?: string;
  collaborator_code?: string;
  human_requested?: boolean;
  call_accepted_at?: string;
  closed_by?: string;
  created_at: string;
}

interface Message {
  id: number;
  sender_role: 'admin' | 'client' | 'bot';
  sender_name: string;
  message: string;
  created_at: string;
}

const DEFAULT_GREETING_MESSAGE: Message = {
  id: 0,
  sender_role: 'bot',
  sender_name: 'Support Assistant',
  message: 'Hello! How can I help you today? Feel free to ask any question or request to connect with our human support team.',
  created_at: new Date().toISOString(),
};

export function SupportWidget({
  user,
  store,
}: {
  user?: { userId: number; name: string; username: string; role: 'admin' | 'client' } | null;
  store?: { id: number; name: string; shop_domain: string } | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'messages' | 'call'>('messages');

  // Active chat state
  const [currentTicket, setCurrentTicket] = useState<SupportRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([DEFAULT_GREETING_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isClosingChat, setIsClosingChat] = useState(false);

  // Call Support states
  const [currentCallTicket, setCurrentCallTicket] = useState<SupportRequest | null>(null);
  const [callPhone, setCallPhone] = useState('');
  const [callCollaboratorCode, setCallCollaboratorCode] = useState('');
  const [callTime, setCallTime] = useState('Immediate / ASAP');
  const [callNote, setCallNote] = useState('');
  const [submittingCall, setSubmittingCall] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Check for existing active chat & call requests on initial load
  const loadExistingRequests = async () => {
    try {
      const res = await fetch('/api/support');
      if (res.ok) {
        const data = await res.json();
        const list: SupportRequest[] = data.requests || [];
        
        // Find most recent chat request
        const activeChat = list.find((r) => r.type === 'chat');
        if (activeChat) {
          setCurrentTicket(activeChat);
          const msgRes = await fetch(`/api/support/${activeChat.id}`);
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            if (msgData.messages && msgData.messages.length > 0) {
              setMessages(msgData.messages);
            }
          }
        }

        // Find most recent call request
        const activeCall = list.find((r) => r.type === 'call' && r.status !== 'closed');
        if (activeCall) {
          setCurrentCallTicket(activeCall);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadExistingRequests();
  }, []);

  // Poll for live messages if widget is open
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(async () => {
      try {
        // Poll active chat ticket
        if (currentTicket) {
          const res = await fetch(`/api/support/${currentTicket.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.messages) {
              setMessages(data.messages);
            }
            if (data.request) {
              setCurrentTicket(data.request);
            }
          }
        }

        // Poll active call ticket
        if (currentCallTicket) {
          const res = await fetch(`/api/support/${currentCallTicket.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.request) {
              setCurrentCallTicket(data.request);
            }
          }
        }
      } catch {}
    }, 3500);

    return () => clearInterval(interval);
  }, [isOpen, currentTicket?.id, currentCallTicket?.id]);

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setInputText('');
    setIsSending(true);

    const storeName = store?.name || user?.name || 'My Jewellery Store';
    const shopDomain = store?.shop_domain || (user?.username ? `${user.username}.myshopify.com` : 'store.myshopify.com');
    const clientName = user?.name || 'Store Owner';

    try {
      if (!currentTicket || currentTicket.status === 'closed') {
        // Create new chat ticket
        const res = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            store_id: store?.id,
            store_name: storeName,
            shop_domain: shopDomain,
            client_name: clientName,
            subject: text.slice(0, 50),
            message: text,
          }),
        });
        const data = await res.json();
        if (res.ok && data.request) {
          setCurrentTicket(data.request);
          const msgRes = await fetch(`/api/support/${data.request.id}`);
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            setMessages(msgData.messages || []);
          }
        }
      } else {
        // Append user message to local state immediately
        const tempMsg: Message = {
          id: Date.now(),
          sender_role: user?.role === 'admin' ? 'admin' : 'client',
          sender_name: user?.name || clientName,
          message: text,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, tempMsg]);
        setIsTyping(true);

        const res = await fetch(`/api/support/${currentTicket.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        if (res.ok) {
          const refreshRes = await fetch(`/api/support/${currentTicket.id}`);
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            setMessages(refreshData.messages || []);
          }
        }
      }
    } catch (e: any) {
      toast(e.message || 'Error sending message', true);
    } finally {
      setIsSending(false);
      setIsTyping(false);
    }
  };

  const escalateToHuman = async () => {
    if (!currentTicket) {
      await sendMessage('I want to connect with a human agent.');
      return;
    }
    try {
      const res = await fetch(`/api/support/${currentTicket.id}/escalate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCurrentTicket(data.request);
        setMessages((prev) => [...prev, data.message]);
        toast('Connected to Live Human Support. An agent has been notified.');
      }
    } catch {}
  };

  const handleCloseChat = async () => {
    if (!currentTicket || isClosingChat) return;
    const confirm = window.confirm('Are you sure you want to end this chat session?');
    if (!confirm) return;

    setIsClosingChat(true);
    try {
      const res = await fetch(`/api/support/${currentTicket.id}/close`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCurrentTicket(data.request);
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        toast('Chat session ended. You can start a new chat anytime.');
      }
    } catch (e: any) {
      toast(e.message || 'Failed to close chat', true);
    } finally {
      setIsClosingChat(false);
    }
  };

  const startNewChat = () => {
    setCurrentTicket(null);
    setMessages([DEFAULT_GREETING_MESSAGE]);
    setInputText('');
  };

  const submitCallSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callPhone.trim() || submittingCall) return;
    setSubmittingCall(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'call',
          store_id: store?.id,
          store_name: store?.name || user?.name || 'My Store',
          shop_domain: store?.shop_domain || (user?.username ? `${user.username}.myshopify.com` : ''),
          client_name: user?.name || 'Store Owner',
          client_phone: callPhone,
          collaborator_code: callCollaboratorCode,
          preferred_call_time: callTime,
          message: callNote,
        }),
      });
      const data = await res.json();
      if (res.ok && data.request) {
        setCurrentCallTicket(data.request);
        toast('Call Support requested. Our team will contact you shortly.');
        setCallPhone('');
        setCallCollaboratorCode('');
        setCallNote('');
      } else {
        toast(data.error || 'Failed to request call', true);
      }
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSubmittingCall(false);
    }
  };

  return (
    <>
      {/* Floating Messenger Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 96,
            right: 24,
            width: 390,
            maxWidth: 'calc(100vw - 48px)',
            height: 580,
            maxHeight: 'calc(100vh - 120px)',
            background: '#ffffff',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 99999,
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
            animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Messenger Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: '#ffffff',
              padding: '16px 18px',
              position: 'relative',
            }}
          >
            {/* Top Navigation Tabs & Header Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: 20,
                  padding: '3px',
                  display: 'inline-flex',
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('messages')}
                  style={{
                    background: activeTab === 'messages' ? '#ffffff' : 'transparent',
                    color: activeTab === 'messages' ? '#1d4ed8' : '#ffffff',
                    border: 'none',
                    borderRadius: 16,
                    padding: '5px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <MessageSquare size={13} />
                  <span>Messages</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('call')}
                  style={{
                    background: activeTab === 'call' ? '#ffffff' : 'transparent',
                    color: activeTab === 'call' ? '#1d4ed8' : '#ffffff',
                    border: 'none',
                    borderRadius: 16,
                    padding: '5px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <PhoneCall size={13} />
                  <span>Call Support</span>
                </button>
              </div>

              {/* Header Right Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeTab === 'messages' && currentTicket && currentTicket.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={handleCloseChat}
                    disabled={isClosingChat}
                    style={{
                      background: 'rgba(239, 68, 68, 0.25)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      color: '#ffffff',
                      borderRadius: 12,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    title="End this chat session"
                  >
                    <X size={12} />
                    <span>{isClosingChat ? 'Ending...' : 'End Chat'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    color: '#ffffff',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Agent / Support Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  border: '1.5px solid rgba(255,255,255,0.6)',
                }}
              >
                <Headphones size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Customer Support</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                  {currentTicket?.status === 'closed'
                    ? 'Chat session ended'
                    : currentTicket?.human_requested
                    ? 'Live Agent Connected'
                    : 'Automated Assistant & Live Agents'}
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: LIVE CHAT MESSAGES */}
          {activeTab === 'messages' && (
            <>
              {/* Messages Body */}
              <div
                style={{
                  flex: 1,
                  padding: '16px',
                  overflowY: 'auto',
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {messages.map((m, idx) => {
                  const isUser = m.sender_role === 'client' && user?.role !== 'admin';
                  const isBot = m.sender_role === 'bot';
                  const isAdmin = m.sender_role === 'admin';

                  return (
                    <div
                      key={m.id || idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '84%',
                          background: isUser
                            ? '#2563eb'
                            : isAdmin
                            ? '#1e293b'
                            : '#ffffff',
                          color: isUser || isAdmin ? '#ffffff' : '#1e293b',
                          padding: '10px 14px',
                          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          border: isUser || isAdmin ? 'none' : '1px solid #e2e8f0',
                          fontSize: 13,
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {m.message}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#94a3b8',
                          marginTop: 3,
                          padding: '0 4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {isBot ? (
                          <>
                            <Bot size={11} />
                            <span>Bot</span>
                          </>
                        ) : isAdmin ? (
                          <>
                            <ShieldCheck size={11} />
                            <span>Support Specialist</span>
                          </>
                        ) : (
                          <>
                            <User size={11} />
                            <span>You</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </div>
                  );
                })}

                {/* Closed Chat Notice Banner */}
                {currentTicket?.status === 'closed' && (
                  <div
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: 12,
                      padding: '14px 16px',
                      textAlign: 'center',
                      marginTop: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Chat Session Closed
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      This chat session was closed by {currentTicket.closed_by || 'the user'}. If you need more assistance, start a new chat below.
                    </div>
                    <button
                      type="button"
                      onClick={startNewChat}
                      style={{
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 20,
                        padding: '8px 18px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
                      }}
                    >
                      <Plus size={14} />
                      <span>Start New Conversation</span>
                    </button>
                  </div>
                )}

                {/* Quick Suggestion Chips (when chat is active and new) */}
                {currentTicket?.status !== 'closed' && messages.length <= 3 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => sendMessage('How to set up today gold rates?')}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 14,
                        padding: '6px 12px',
                        fontSize: 11,
                        color: '#334155',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <TrendingUp size={12} color="#2563eb" />
                      <span>Rate setup</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMessage('How to update and push prices to Shopify?')}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 14,
                        padding: '6px 12px',
                        fontSize: 11,
                        color: '#334155',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Zap size={12} color="#d97706" />
                      <span>Price push</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMessage('How are making charges and wastage calculated?')}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 14,
                        padding: '6px 12px',
                        fontSize: 11,
                        color: '#334155',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Gem size={12} color="#7c3aed" />
                      <span>Wastage formula</span>
                    </button>
                  </div>
                )}

                {/* Connect with Human Agent Option */}
                {currentTicket?.status !== 'closed' && !currentTicket?.human_requested && (
                  <div style={{ textAlign: 'center', margin: '6px 0' }}>
                    <button
                      type="button"
                      onClick={escalateToHuman}
                      style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: '1px solid #fca5a5',
                        borderRadius: 20,
                        padding: '6px 14px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <User size={13} />
                      <span>Connect with Human Agent</span>
                    </button>
                  </div>
                )}

                {currentTicket?.status !== 'closed' && currentTicket?.human_requested && (
                  <div
                    style={{
                      background: '#ecfdf5',
                      border: '1px solid #6ee7b7',
                      color: '#065f46',
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 12,
                      textAlign: 'center',
                      fontWeight: 500,
                    }}
                  >
                    Admin notified. A human specialist will respond here shortly.
                  </div>
                )}

                {isTyping && (
                  <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', paddingLeft: 4 }}>
                    Agent is typing...
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Compose Message Box (only if not closed) */}
              {currentTicket?.status !== 'closed' ? (
                <div
                  style={{
                    padding: '12px 14px',
                    background: '#ffffff',
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#f1f5f9',
                      borderRadius: 24,
                      padding: '6px 14px',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Compose your message..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        fontSize: 13,
                        color: '#0f172a',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => sendMessage()}
                      disabled={isSending || !inputText.trim()}
                      style={{
                        background: inputText.trim() ? '#2563eb' : 'transparent',
                        color: inputText.trim() ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        borderRadius: '50%',
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: inputText.trim() ? 'pointer' : 'default',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      {isSending ? <Spinner /> : <Send size={15} />}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* TAB 2: CALL SUPPORT */}
          {activeTab === 'call' && (
            <div
              style={{
                flex: 1,
                padding: '18px',
                overflowY: 'auto',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {/* If there is an active call request, show real-time status card */}
              {currentCallTicket && currentCallTicket.status !== 'closed' ? (
                <div
                  style={{
                    background: currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress' ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress' ? '#86efac' : '#fde047'}`,
                    borderRadius: 12,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress' ? '#16a34a' : '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        flexShrink: 0,
                      }}
                    >
                      {currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress' ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Clock size={20} />
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress' ? '#166534' : '#854d0e',
                        }}
                      >
                        {currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress'
                          ? 'Call Request Accepted'
                          : 'Call Request Submitted'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Ticket #{currentCallTicket.id} • {new Date(currentCallTicket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: 8,
                      padding: '12px',
                      fontSize: 13,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <span style={{ color: '#64748b' }}>Phone Number:</span>{' '}
                      <b style={{ color: '#0f172a' }}>{currentCallTicket.client_phone}</b>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Preferred Time:</span>{' '}
                      <b style={{ color: '#0f172a' }}>{currentCallTicket.preferred_call_time || 'Immediate / ASAP'}</b>
                    </div>
                    {currentCallTicket.collaborator_code && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#64748b' }}>Collaborator Code:</span>{' '}
                        <b style={{ color: '#7c3aed', background: '#f5f3ff', padding: '1px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Key size={12} />
                          {currentCallTicket.collaborator_code}
                        </b>
                      </div>
                    )}
                    {currentCallTicket.message && (
                      <div>
                        <span style={{ color: '#64748b' }}>Note:</span>{' '}
                        <span style={{ fontStyle: 'italic', color: '#334155' }}>"{currentCallTicket.message}"</span>
                      </div>
                    )}
                  </div>

                  {currentCallTicket.call_accepted_at || currentCallTicket.status === 'in_progress' ? (
                    <div
                      style={{
                        background: '#dcfce7',
                        border: '1px solid #bbf7d0',
                        color: '#15803d',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      <b>Your request has been accepted.</b> Our support agent will call you shortly on <b>{currentCallTicket.client_phone}</b>.
                    </div>
                  ) : (
                    <div
                      style={{
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        color: '#b45309',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      <b>Awaiting Agent:</b> Our team has received your request and will accept it shortly.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab('messages')}
                      style={{
                        flex: 1,
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <MessageSquare size={14} />
                      <span>Open Live Chat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentCallTicket(null)}
                      style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Plus size={14} />
                      <span>New Request</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Form for requesting a call */
                <form
                  onSubmit={submitCallSupport}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PhoneCall size={16} />
                    <span><b>Need phone assistance?</b> Submit your number and our support team will call you back.</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Phone / WhatsApp Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={callPhone}
                      onChange={(e) => setCallPhone(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        color: '#000',
                        background: '#fff',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Shopify Collaborator Request Code (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 4821"
                      maxLength={10}
                      value={callCollaboratorCode}
                      onChange={(e) => setCallCollaboratorCode(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        color: '#000',
                        background: '#fff',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Lightbulb size={12} color="#d97706" />
                      <span>If you need live store setup assistance, find your 4-digit code in <b>Shopify Admin ➔ Settings ➔ Users</b>.</span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Preferred Callback Time
                    </label>
                    <select
                      value={callTime}
                      onChange={(e) => setCallTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        color: '#000',
                        background: '#fff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="Immediate / ASAP">Immediate / ASAP (Urgent)</option>
                      <option value="Morning (10:00 AM - 1:00 PM)">Morning (10:00 AM - 1:00 PM)</option>
                      <option value="Afternoon (2:00 PM - 5:00 PM)">Afternoon (2:00 PM - 5:00 PM)</option>
                      <option value="Evening (5:00 PM - 8:00 PM)">Evening (5:00 PM - 8:00 PM)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      What do you need help with?
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Assistance configuring diamond markup and wastage..."
                      value={callNote}
                      onChange={(e) => setCallNote(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        color: '#000',
                        background: '#fff',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingCall || !callPhone.trim()}
                    style={{
                      marginTop: 6,
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    {submittingCall ? <Spinner /> : (
                      <>
                        <PhoneCall size={15} />
                        <span>Request Call Support</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Circular Launcher Avatar Button (Bottom Right) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 58,
          height: 58,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
          color: '#ffffff',
          border: '2px solid #ffffff',
          boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 99999,
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        title="Chat with Support"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </>
  );
}
