import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  const { id } = await params;
  const reqId = parseInt(id, 10);

  const request = await one<any>('SELECT * FROM support_requests WHERE id = $1', [reqId]);
  if (!request) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }

  // Update request to human requested with high priority unread state
  const updated = await one<any>(
    `UPDATE support_requests 
     SET human_requested = TRUE, 
         human_requested_at = NOW(), 
         is_read_by_admin = FALSE, 
         status = 'pending',
         updated_at = NOW() 
     WHERE id = $1
     RETURNING *`,
    [reqId]
  );

  // Add system transfer announcement message
  const announcementMsg = await one<any>(
    `INSERT INTO support_messages (request_id, sender_role, sender_name, message)
     VALUES ($1, 'bot', 'Support Assistant', 'Live Human Support has been requested. An administrator has been notified with high priority and will connect with you here shortly.')
     RETURNING *`,
    [reqId]
  );

  return NextResponse.json({ ok: true, request: updated, message: announcementMsg });
}
