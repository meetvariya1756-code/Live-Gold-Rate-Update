import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sendNewMessageAdminNotification } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const reqId = parseInt(id, 10);
    const body = await req.json().catch(() => ({}));

    let message = String(body.message || '').trim();
    const messageType = body.message_type || 'text';
    const fileUrl = body.file_url || null;
    const fileName = body.file_name || null;
    const fileSize = body.file_size ? parseInt(String(body.file_size), 10) : null;
    const mimeType = body.mime_type || null;
    const durationSeconds = body.duration_seconds ? parseInt(String(body.duration_seconds), 10) : null;

    if (!message && !fileUrl) {
      return NextResponse.json({ error: 'Message or attachment cannot be empty.' }, { status: 400 });
    }

    if (!message && fileUrl) {
      if (messageType === 'audio') message = '🎤 Voice Message';
      else if (messageType === 'image') message = '📷 Image Attachment';
      else message = fileName ? `📎 ${fileName}` : '📎 Attachment';
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

    // Insert user message with multimedia fields
    const newMsg = await one<any>(
      `INSERT INTO support_messages (
         request_id, sender_role, sender_name, message, 
         message_type, file_url, file_name, file_size, mime_type, duration_seconds
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        reqId,
        user.role,
        senderName,
        message,
        messageType,
        fileUrl,
        fileName,
        fileSize,
        mimeType,
        durationSeconds,
      ]
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
      // Client message: update status to pending/unread and alert admin directly
      await q(
        `UPDATE support_requests 
         SET is_read_by_admin = FALSE,
             human_requested = TRUE,
             status = CASE WHEN status = 'resolved' OR status = 'closed' THEN 'pending' ELSE status END,
             updated_at = NOW() 
         WHERE id = $1`,
        [reqId]
      );

      // Direct email notification to admin so human support agent connects immediately
      sendNewMessageAdminNotification(request, message, senderName).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      message: newMsg,
      botMessage: null,
      human_requested: true,
    });
  } catch (err: any) {
    console.error('[POST /api/support/[id]/messages] Error:', err);
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Internal server error';
    const hint = message.includes('ECONNREFUSED') ? ' — Database is not running. Please start PostgreSQL.' : '';
    return NextResponse.json({ error: message + hint }, { status });
  }
}
