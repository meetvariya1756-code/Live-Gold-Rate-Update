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

  // Check authorization
  if (user.role !== 'admin' && request.client_user_id !== user.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const closedBy = user.role === 'admin' ? 'Support Administrator' : (user.name || 'Client');

  const updated = await one<any>(
    `UPDATE support_requests 
     SET status = 'closed', 
         closed_by = $1,
         updated_at = NOW() 
     WHERE id = $2
     RETURNING *`,
    [closedBy, reqId]
  );

  const closingText = `🏁 Chat has been closed by ${closedBy}. If you need further assistance, feel free to start a new chat anytime!`;

  const msg = await one<any>(
    `INSERT INTO support_messages (request_id, sender_role, sender_name, message)
     VALUES ($1, 'bot', 'System', $2)
     RETURNING *`,
    [reqId, closingText]
  );

  return NextResponse.json({ ok: true, request: updated, message: msg });
}
