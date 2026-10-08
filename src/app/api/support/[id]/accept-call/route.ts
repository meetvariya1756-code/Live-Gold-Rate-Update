import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(req);
  const { id } = await params;
  const reqId = parseInt(id, 10);
  const body = await req.json().catch(() => ({}));

  const callEstimate = String(body.estimate || 'shortly').trim();
  const request = await one<any>('SELECT * FROM support_requests WHERE id = $1', [reqId]);

  if (!request) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }

  // Update status to in_progress and record acceptance
  const updated = await one<any>(
    `UPDATE support_requests 
     SET status = 'in_progress', 
         call_accepted_at = NOW(),
         is_read_by_admin = TRUE,
         updated_at = NOW() 
     WHERE id = $1
     RETURNING *`,
    [reqId]
  );

  const phoneText = request.client_phone ? ` at ${request.client_phone}` : '';
  const confirmationText = `✅ Your Call Support Request has been accepted by our support team! An agent will call you ${callEstimate}${phoneText}.`;

  // Create confirmation message for client
  const msg = await one<any>(
    `INSERT INTO support_messages (request_id, sender_role, sender_name, message)
     VALUES ($1, 'admin', 'Support Team', $2)
     RETURNING *`,
    [reqId, confirmationText]
  );

  return NextResponse.json({ ok: true, request: updated, message: msg });
}
