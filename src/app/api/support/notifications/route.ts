import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);

  if (user.role !== 'admin') {
    // For clients, count active unresolved requests and recent messages
    const clientStats = await one<{ active_count: number }>(
      `SELECT COUNT(*)::int as active_count FROM support_requests 
       WHERE (client_user_id = $1 OR store_id IN (SELECT id FROM stores WHERE client_user_id = $1))
       AND status IN ('pending', 'in_progress')`,
      [user.userId]
    );

    const latestAdminReply = await one<any>(
      `SELECT sm.id, sm.request_id, sm.message, sm.created_at, sr.store_name 
       FROM support_messages sm
       JOIN support_requests sr ON sm.request_id = sr.id
       WHERE (sr.client_user_id = $1 OR sr.store_id IN (SELECT id FROM stores WHERE client_user_id = $1))
       AND sm.sender_role IN ('admin', 'bot')
       ORDER BY sm.created_at DESC
       LIMIT 1`,
      [user.userId]
    );

    return NextResponse.json({
      role: 'client',
      activeCount: clientStats?.active_count || 0,
      latestReply: latestAdminReply || null,
    });
  }

  // Admin stats: unread & pending requests
  const stats = await one<{ pending_count: number; unread_count: number }>(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'pending')::int as pending_count,
       COUNT(*) FILTER (WHERE is_read_by_admin = FALSE)::int as unread_count
     FROM support_requests`
  );

  // Latest requests for instant popups/toasts
  const latestRequests = await q<any>(
    `SELECT id, store_name, shop_domain, client_name, type, subject, message, preferred_call_time, status, is_read_by_admin, human_requested, human_requested_at, call_accepted_at, created_at, updated_at,
     (SELECT sm.message FROM support_messages sm WHERE sm.request_id = support_requests.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
     (SELECT sm.sender_role FROM support_messages sm WHERE sm.request_id = support_requests.id ORDER BY sm.created_at DESC LIMIT 1) as last_sender_role
     FROM support_requests 
     ORDER BY 
       CASE WHEN human_requested = TRUE AND is_read_by_admin = FALSE THEN 1 ELSE 2 END,
       updated_at DESC 
     LIMIT 8`
  );

  return NextResponse.json({
    role: 'admin',
    pendingCount: stats?.pending_count || 0,
    unreadCount: stats?.unread_count || 0,
    latestRequests: latestRequests || [],
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body.requestIds) && body.requestIds.length > 0) {
    await q(
      `UPDATE support_requests SET is_read_by_admin = TRUE WHERE id = ANY($1::int[])`,
      [body.requestIds]
    );
  } else {
    await q(`UPDATE support_requests SET is_read_by_admin = TRUE WHERE is_read_by_admin = FALSE`);
  }

  return NextResponse.json({ ok: true });
}
