import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    // Allow logged-in users (or embedded sessions)
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const durationSec = formData.get('duration') ? parseInt(String(formData.get('duration')), 10) : undefined;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Limit to 25MB
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 25MB limit' }, { status: 400 });
    }

    const mimeType = file.type || 'application/octet-stream';
    let messageType: 'image' | 'video' | 'audio' | 'file' = 'file';

    if (mimeType.startsWith('image/')) {
      messageType = 'image';
    } else if (mimeType.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|mkv|avi)$/i)) {
      messageType = 'video';
    } else if (mimeType.startsWith('audio/') || file.name.endsWith('.webm') || file.name.endsWith('.mp3') || file.name.endsWith('.wav') || file.name.endsWith('.ogg')) {
      messageType = 'audio';
    }

    // Create public/uploads/support directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'support');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Generate safe unique filename
    const ext = path.extname(file.name) || (messageType === 'audio' ? '.webm' : messageType === 'image' ? '.png' : '');
    const randomName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filePath = path.join(uploadsDir, randomName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    const fileUrl = `/uploads/support/${randomName}`;

    return NextResponse.json({
      ok: true,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: mimeType,
      message_type: messageType,
      duration_seconds: durationSec,
    });
  } catch (error: any) {
    console.error('Support upload error:', error);
    return NextResponse.json({ error: error.message || 'File upload failed' }, { status: 500 });
  }
}
