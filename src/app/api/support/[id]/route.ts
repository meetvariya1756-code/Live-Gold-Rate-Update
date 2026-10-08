import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  const { id } = await params;
  const reqId = parseInt(id, 10);

  const request = await one<any>(
    'SELECT * FROM support_requests WHERE id = $1',
    [reqId]
  );

  if (!request) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }

  // Security check for clients
  if (user.role !== 'admin' && request.client_user_id !== user.userId) {
    const store = request.store_id
      ? await one('SELECT id FROM stores WHERE id = $1 AND client_user_id = $2', [request.store_id, user.userId])
      : null;
    if (!store) {
      return NextResponse.json({ error: 'Unauthorized access to this support ticket' }, { status: 403 });
    }
  }

  // If admin is viewing, automatically mark as read
  if (user.role === 'admin' && !request.is_read_by_admin) {
    await q('UPDATE support_requests SET is_read_by_admin = TRUE WHERE id = $1', [reqId]);
    request.is_read_by_admin = true;
  }

  const messages = await q(
    'SELECT * FROM support_messages WHERE request_id = $1 ORDER BY created_at ASC',
    [reqId]
  );

  return NextResponse.json({ request, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  const { id } = await params;
  const reqId = parseInt(id, 10);
  const body = await req.json().catch(() => ({}));

  const existing = await one<any>('SELECT * FROM support_requests WHERE id = $1', [reqId]);
  if (!existing) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }

  // Clients can only close their own tickets; admins can update status and admin_notes
  if (user.role !== 'admin' && existing.client_user_id !== user.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.status && ['pending', 'in_progress', 'resolved', 'closed'].includes(body.status)) {
    values.push(body.status);
    updates.push(`status = $${values.length}`);
  }

  if (user.role === 'admin' && typeof body.admin_notes === 'string') {
    values.push(body.admin_notes);
    updates.push(`admin_notes = $${values.length}`);
  }

  if (user.role === 'admin' && typeof body.is_read_by_admin === 'boolean') {
    values.push(body.is_read_by_admin);
    updates.push(`is_read_by_admin = $${values.length}`);
  }

  if (!updates.length) {
    return NextResponse.json({ request: existing });
  }

  values.push(reqId);
  const updated = await one<any>(
    `UPDATE support_requests SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values
  );

  return NextResponse.json({ ok: true, request: updated });
}
