import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { generateBotReply } from '@/lib/supportBot';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  const { id } = await params;
  const reqId = parseInt(id, 10);
  const body = await req.json().catch(() => ({}));

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
  }

  const request = await one<any>('SELECT * FROM support_requests WHERE id = $1', [reqId]);
  if (!request) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }

  // Check access
  if (user.role !== 'admin' && request.client_user_id !== user.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const senderName = user.role === 'admin' ? (user.name || 'Support Agent') : (user.name || request.client_name || 'Client');

  // Insert user message
  const newMsg = await one<any>(
    `INSERT INTO support_messages (request_id, sender_role, sender_name, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [reqId, user.role, senderName, message]
  );

  let botMessage = null;

  if (user.role === 'admin') {
    // Admin replying: mark status in_progress and human_requested active
    await q(
      `UPDATE support_requests 
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           human_requested = TRUE,
           updated_at = NOW() 
       WHERE id = $1`,
      [reqId]
    );
  } else {
    // Count previous client messages
    const clientMsgCount = await one<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM support_messages WHERE request_id = $1 AND sender_role = 'client'`,
      [reqId]
    );
    const count = clientMsgCount?.count || 1;

    // Check if bot should reply or escalate
    const botResult = generateBotReply(message, count, !!request.human_requested);

    if (botResult.isEscalation) {
      await q(
        `UPDATE support_requests 
         SET human_requested = TRUE, 
             human_requested_at = NOW(), 
             is_read_by_admin = FALSE, 
             status = 'pending',
             updated_at = NOW() 
         WHERE id = $1`,
        [reqId]
      );
    } else {
      await q(
        `UPDATE support_requests SET is_read_by_admin = FALSE, updated_at = NOW() WHERE id = $1`,
        [reqId]
      );
    }

    if (botResult.reply && !request.human_requested) {
      botMessage = await one<any>(
        `INSERT INTO support_messages (request_id, sender_role, sender_name, message)
         VALUES ($1, 'bot', 'Support Assistant', $2)
         RETURNING *`,
        [reqId, botResult.reply]
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: newMsg,
    botMessage,
    human_requested: request.human_requested,
  });
}
