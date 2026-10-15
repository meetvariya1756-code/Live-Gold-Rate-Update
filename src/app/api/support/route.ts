import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sendNewMessageAdminNotification } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    const typeFilter = url.searchParams.get('type');
    const storeIdFilter = url.searchParams.get('storeId');

    let query = `
      SELECT 
        sr.*,
        (SELECT COUNT(*)::int FROM support_messages sm WHERE sm.request_id = sr.id) as message_count,
        (SELECT sm.message FROM support_messages sm WHERE sm.request_id = sr.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
        (SELECT sm.created_at FROM support_messages sm WHERE sm.request_id = sr.id ORDER BY sm.created_at DESC LIMIT 1) as last_message_at
      FROM support_requests sr
      WHERE 1=1
    `;
    const params: any[] = [];

    // Clients only see their own store requests
    if (user.role !== 'admin') {
      params.push(user.userId);
      query += ` AND (sr.client_user_id = $${params.length} OR sr.store_id IN (SELECT id FROM stores WHERE client_user_id = $${params.length}))`;
    } else if (storeIdFilter) {
      const parsedId = parseInt(storeIdFilter, 10);
      if (!isNaN(parsedId)) {
        params.push(parsedId);
        query += ` AND sr.store_id = $${params.length}`;
      }
    }

    if (statusFilter && statusFilter !== 'all') {
      params.push(statusFilter);
      query += ` AND sr.status = $${params.length}`;
    }

    if (typeFilter && typeFilter !== 'all') {
      params.push(typeFilter);
      query += ` AND sr.type = $${params.length}`;
    }

    query += ` ORDER BY sr.created_at DESC`;

    const requests = await q(query, params);
    return NextResponse.json({ requests });
  } catch (err: any) {
    console.error('[GET /api/support] Error:', err);
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Internal server error';
    // Give a helpful hint when DB is unreachable
    const hint = message.includes('ECONNREFUSED') || message.includes('connect')
      ? ' — Database server is not running. Please start PostgreSQL.'
      : '';
    return NextResponse.json({ error: message + hint }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
  const user = await requireAuth(req);
  const body = await req.json().catch(() => ({}));

  const type = body.type === 'call' ? 'call' : 'chat';
  let storeId = body.store_id ? parseInt(body.store_id, 10) : null;
  let storeName = String(body.store_name || '').trim();
  let shopDomain = String(body.shop_domain || '').trim();

  // If storeId is provided, look up details
  if (storeId) {
    const store = await one<{ id: number; name: string; shop_domain: string; client_user_id: number }>(
      'SELECT id, name, shop_domain, client_user_id FROM stores WHERE id = $1',
      [storeId]
    );
    if (store) {
      storeName = store.name;
      shopDomain = store.shop_domain;
    }
  } else if (user.role === 'client') {
    // Look up primary store for this client
    const store = await one<{ id: number; name: string; shop_domain: string }>(
      'SELECT id, name, shop_domain FROM stores WHERE client_user_id = $1 LIMIT 1',
      [user.userId]
    );
    if (store) {
      storeId = store.id;
      storeName = store.name;
      shopDomain = store.shop_domain;
    }
  }

  if (!storeName) {
    storeName = user.name || 'Client Store';
  }
  if (!shopDomain) {
    shopDomain = user.username ? `${user.username}.myshopify.com` : 'unknown.myshopify.com';
  }

  const clientName = String(body.client_name || user.name || 'Client').trim();
  const clientEmail = String(body.client_email || '').trim() || null;
  const clientPhone = String(body.client_phone || '').trim() || null;
  const collaboratorCode = String(body.collaborator_code || '').trim() || null;
  const subject = String(body.subject || (type === 'call' ? 'Call Support Request' : 'Chat Support Inquiry')).trim();
  const message = String(body.message || '').trim();
  const preferredCallTime = String(body.preferred_call_time || '').trim() || null;

  if (type === 'call' && !clientPhone) {
    return NextResponse.json({ error: 'Phone number is required for Call Support requests.' }, { status: 400 });
  }

  const messageType = body.message_type || 'text';
  const fileUrl = body.file_url || null;
  const fileName = body.file_name || null;
  const fileSize = body.file_size ? parseInt(String(body.file_size), 10) : null;
  const mimeType = body.mime_type || null;
  const durationSeconds = body.duration_seconds ? parseInt(String(body.duration_seconds), 10) : null;

  if (type === 'chat' && !message && !fileUrl) {
    return NextResponse.json({ error: 'Please enter a message or attachment to start Chat Support.' }, { status: 400 });
  }

  let finalMessage = message;
  if (!finalMessage && fileUrl) {
    if (messageType === 'audio') finalMessage = '🎤 Voice Message';
    else if (messageType === 'image') finalMessage = '📷 Image Attachment';
    else finalMessage = fileName ? `📎 ${fileName}` : '📎 Attachment';
  }

  // Update store collaborator code if provided
  if (collaboratorCode && storeId) {
    await q('UPDATE stores SET collaborator_code = $1 WHERE id = $2', [collaboratorCode, storeId]);
  }

  const newRequest = await one<any>(
    `INSERT INTO support_requests (
      store_id,
      client_user_id,
      store_name,
      shop_domain,
      client_name,
      client_email,
      client_phone,
      type,
      status,
      subject,
      message,
      preferred_call_time,
      is_read_by_admin,
      human_requested,
      human_requested_at,
      collaborator_code
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, FALSE, TRUE, NOW(), $12)
    RETURNING *`,
    [
      storeId,
      user.userId,
      storeName,
      shopDomain,
      clientName,
      clientEmail,
      clientPhone,
      type,
      subject,
      finalMessage,
      preferredCallTime,
      collaboratorCode,
    ]
  );

  // If initial message or attachment provided, create first message in support_messages
  if (finalMessage && newRequest?.id) {
    await q(
      `INSERT INTO support_messages (
         request_id, sender_role, sender_name, message,
         message_type, file_url, file_name, file_size, mime_type, duration_seconds
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newRequest.id,
        user.role,
        clientName,
        finalMessage,
        messageType,
        fileUrl,
        fileName,
        fileSize,
        mimeType,
        durationSeconds,
      ]
    );

    // Notify admin directly via email so human support agent can connect immediately
    if (user.role !== 'admin') {
      sendNewMessageAdminNotification(newRequest, finalMessage, clientName).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, request: newRequest });
  } catch (err: any) {
    console.error('[POST /api/support] Error:', err);
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Internal server error';
    const hint = message.includes('ECONNREFUSED') || message.includes('connect')
      ? ' — Database server is not running. Please start PostgreSQL.'
      : '';
    return NextResponse.json({ error: message + hint }, { status });
  }
}
