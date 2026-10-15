import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

export interface ChatMessageSummary {
  sender_role: string;
  sender_name: string;
  message: string;
  message_type?: string;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  created_at: string;
}

export interface SupportTicketSummary {
  id: number;
  store_name: string;
  shop_domain: string;
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  type: string;
  created_at: string;
  resolved_at?: string;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getAbsoluteFileUrl(relativeOrAbsoluteUrl: string): string {
  if (!relativeOrAbsoluteUrl) return '';
  if (relativeOrAbsoluteUrl.startsWith('http://') || relativeOrAbsoluteUrl.startsWith('https://')) {
    return relativeOrAbsoluteUrl;
  }
  const rawBase = process.env.SHOPIFY_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const appUrl = rawBase.replace(/\/$/, '');
  const cleanPath = relativeOrAbsoluteUrl.startsWith('/') ? relativeOrAbsoluteUrl : `/${relativeOrAbsoluteUrl}`;
  return `${appUrl}${cleanPath}`;
}

/**
 * Creates nodemailer transporter.
 * Uses SMTP settings if provided in .env (e.g., Gmail SMTP), otherwise logs cleanly.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;
  const user = process.env.SMTP_USER || process.env.ADMIN_EMAIL || 'meetvariya1756@gmail.com';
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.ADMIN_APP_PASSWORD || '';

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  // Fallback: create stream or direct transporter if credentials not set yet
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'windows',
  });
}

/**
 * Builds a styled HTML email with the full conversation history.
 */
function buildChatTranscriptHtml(ticket: SupportTicketSummary, messages: ChatMessageSummary[]): string {
  const messageRows = messages
    .map((m) => {
      const isAdmin = m.sender_role === 'admin';
      const isBot = m.sender_role === 'bot';
      const bg = isAdmin ? '#eff6ff' : isBot ? '#f3f4f6' : '#ffffff';
      const border = isAdmin ? '#bfdbfe' : isBot ? '#e5e7eb' : '#e2e8f0';
      const roleColor = isAdmin ? '#1d4ed8' : isBot ? '#4b5563' : '#b45309';
      const roleBadge = isAdmin ? 'Support Specialist' : isBot ? 'Automated Bot' : 'Customer';
      const dateStr = new Date(m.created_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      let attachmentHtml = '';
      if (m.file_url) {
        const fullUrl = getAbsoluteFileUrl(m.file_url);
        const fileName = m.file_name || 'Document Attachment';
        const isPdf = fileName.toLowerCase().endsWith('.pdf') || (m.mime_type && m.mime_type.includes('pdf'));
        const isImage = m.message_type === 'image' || (m.mime_type && m.mime_type.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(fileName);
        const isAudio = m.message_type === 'audio' || (m.mime_type && m.mime_type.startsWith('audio/')) || /\.(webm|mp3|wav|ogg)$/i.test(fileName);

        const icon = isPdf ? '📄' : isImage ? '🖼️' : isAudio ? '🎤' : '📎';
        const typeLabel = isPdf ? 'PDF Document' : isImage ? 'Image File' : isAudio ? 'Voice Note' : 'Attachment';
        const sizeStr = m.file_size ? formatBytes(m.file_size) : '';

        attachmentHtml = `
          <div style="margin-top: 8px; padding: 12px 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; max-width: 460px;">
            <table style="width: 100%; border-collapse: collapse; border: 0;">
              <tr>
                <td style="width: 32px; vertical-align: middle; font-size: 24px; line-height: 1; padding-right: 10px;">
                  ${icon}
                </td>
                <td style="vertical-align: middle; text-align: left;">
                  <div style="font-size: 13px; font-weight: 700; color: #0f172a; word-break: break-all; line-height: 1.3;">
                    ${escapeHtml(fileName)}
                  </div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
                    ${typeLabel}${sizeStr ? ' • ' + sizeStr : ''} • <span style="color: #16a34a; font-weight: 600;">✓ Attached to this email</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top: 10px;">
                  <a href="${fullUrl}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                    Download / Open Online &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </div>
        `;
      }

      // If message is simply the file name or placeholder, avoid duplicating text above attachment
      const isRedundantMessage = m.file_url && (
        !m.message ||
        m.message.trim() === (m.file_name || '').trim() ||
        m.message.trim() === `📎 ${(m.file_name || '').trim()}` ||
        m.message === '📎 File Attachment' ||
        m.message === '📷 Image Attachment' ||
        m.message === '🎤 Voice Message'
      );

      const messageContentHtml = isRedundantMessage ? '' : `
        <div style="font-size: 14px; line-height: 1.5; color: #1e293b; white-space: pre-wrap; margin-bottom: ${attachmentHtml ? '8px' : '0'};">${escapeHtml(m.message || '')}</div>
      `;

      return `
        <div style="margin-bottom: 14px; padding: 12px 16px; border-radius: 8px; background-color: ${bg}; border: 1px solid ${border};">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; color: #64748b;">
            <span>
              <strong style="color: ${roleColor}; font-size: 13px;">${m.sender_name}</strong>
              <span style="background: ${isAdmin ? '#dbeafe' : '#f1f5f9'}; color: ${roleColor}; padding: 1px 6px; border-radius: 10px; font-size: 11px; margin-left: 6px; font-weight: 600;">${roleBadge}</span>
            </span>
            <span>${dateStr}</span>
          </div>
          ${messageContentHtml}
          ${attachmentHtml}
        </div>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Support Conversation - Ticket #${ticket.id}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 24px 28px; color: #ffffff;">
      <table style="width: 100%; border-collapse: collapse; border: 0;">
        <tr>
          <td style="vertical-align: top; padding: 0;">
            <div style="display: inline-block; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 12px; margin-bottom: 10px;">
              ✓ Ticket Resolved
            </div>
            <h2 style="margin: 0 0 6px; font-size: 20px; font-weight: 700; color: #ffffff;">Support Conversation Transcript</h2>
            <p style="margin: 0; font-size: 13px; color: #94a3b8;">
              LiveGold Feed Support · Ticket #${ticket.id}
            </p>
          </td>
          <td style="vertical-align: top; text-align: right; padding: 0 0 0 16px;">
            <table align="right" style="border-collapse: collapse; border: 0; display: inline-table;">
              <tr>
                <td style="vertical-align: middle; text-align: right; padding-right: 10px;">
                  <div style="font-size: 13px; font-weight: 700; color: #ffffff; line-height: 1.25; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; white-space: nowrap;">
                    Venner Infotech
                  </div>
                  <div style="font-size: 10px; color: #94a3b8; line-height: 1.25; margin-top: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; white-space: nowrap;">
                    &amp; Marketing Solution
                  </div>
                </td>
                <td style="vertical-align: middle; width: 35px;">
                  <img src="cid:venner-logo" alt="Venner Infotech &amp; Marketing Solution" width="35" height="35" style="width: 35px; height: 35px; border-radius: 6px; display: block; border: 0;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

    <!-- Ticket Summary -->
    <div style="padding: 18px 28px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div><b>Store:</b> ${escapeHtml(ticket.store_name)} (${escapeHtml(ticket.shop_domain)})</div>
        <div><b>Customer:</b> ${escapeHtml(ticket.client_name)}</div>
        <div><b>Ticket Type:</b> ${ticket.type === 'call' ? 'Call Support' : 'Live Chat'}</div>
        <div><b>Status:</b> <span style="color: #16a34a; font-weight: 700;">Resolved</span></div>
      </div>
    </div>

    <!-- Conversation Stream -->
    <div style="padding: 24px 28px;">
      <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 16px;">
        Complete Conversation History (${messages.length} message${messages.length === 1 ? '' : 's'})
      </h3>
      ${messages.length > 0 ? messageRows : '<p style="color: #94a3b8; font-style: italic;">No messages recorded in this conversation.</p>'}
    </div>

    <!-- Footer -->
    <div style="padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
      <p style="margin: 0 0 6px;">
        This ticket has been marked as <b>Resolved</b> by our support team.
      </p>
      <p style="margin: 0 0 12px; color: #94a3b8;">
        If you have further questions, you can start a new conversation via the LiveGold Feed Support Widget in your Shopify Admin.
      </p>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8;">
        Powered by <strong style="color: #64748b;">Venner Infotech &amp; Marketing Solution</strong>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Returns attachments array for Nodemailer containing the Venner logo
 * and all chat conversation attachments (PDFs, images, docs) with safety size checks.
 */
function getEmailAttachments(messages?: ChatMessageSummary[]) {
  const logoPath = path.join(process.cwd(), 'public', 'images', 'venner-logo.png');
  const attachments: Array<{ filename: string; path: string; cid?: string }> = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: 'venner-logo.png',
      path: logoPath,
      cid: 'venner-logo', // Referenced via cid:venner-logo in email HTML
    });
  }

  // Include uploaded chat attachments (PDFs, images, docs) directly in the email
  if (messages && messages.length > 0) {
    const attachedFilePaths = new Set<string>();
    let totalBytes = 0;
    const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024; // 20MB limit for Gmail

    for (const m of messages) {
      if (m.file_url) {
        const cleanRel = m.file_url.replace(/^\/?uploads\/support\//, '').replace(/^\//, '');
        const diskPath = path.join(process.cwd(), 'public', 'uploads', 'support', cleanRel);
        if (fs.existsSync(diskPath) && !attachedFilePaths.has(diskPath)) {
          try {
            const stat = fs.statSync(diskPath);
            if (totalBytes + stat.size <= MAX_ATTACHMENTS_BYTES) {
              totalBytes += stat.size;
              attachedFilePaths.add(diskPath);
              attachments.push({
                filename: m.file_name || path.basename(diskPath),
                path: diskPath,
              });
            }
          } catch {}
        }
      }
    }
  }

  return attachments;
}

/**
 * Sends complete chat transcript email when a ticket is resolved.
 */
export async function sendResolvedTicketEmail(
  ticket: SupportTicketSummary,
  messages: ChatMessageSummary[]
): Promise<{ success: boolean; recipient: string; messageId?: string; simulated?: boolean; error?: string }> {
  const defaultAdminEmail = 'meetvariya1756@gmail.com';
  const recipient = (ticket.client_email && ticket.client_email.includes('@'))
    ? ticket.client_email.trim()
    : defaultAdminEmail;

  const html = buildChatTranscriptHtml(ticket, messages);
  const textContent = `Support Ticket #${ticket.id} Resolved\n\nStore: ${ticket.store_name} (${ticket.shop_domain})\nCustomer: ${ticket.client_name}\nPowered by Venner Infotech & Marketing Solution\n\n--- Conversation History ---\n` +
    messages.map((m) => `[${new Date(m.created_at).toLocaleString()}] ${m.sender_name} (${m.sender_role}): ${m.message}`).join('\n\n');

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"LiveGold Feed Support" <${defaultAdminEmail}>`,
      to: recipient,
      // If client has their own email, also copy the admin email as requested
      cc: recipient !== defaultAdminEmail ? defaultAdminEmail : undefined,
      subject: `[Resolved] Support Conversation Transcript - Ticket #${ticket.id} (${ticket.store_name})`,
      text: textContent,
      html,
      attachments: getEmailAttachments(messages),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Resolved ticket #${ticket.id} transcript sent to ${recipient} (messageId: ${info.messageId || 'streamed'})`);

    return {
      success: true,
      recipient,
      messageId: info.messageId,
      simulated: !process.env.SMTP_PASS,
    };
  } catch (err: any) {
    console.error(`[Email Error] Failed to send ticket #${ticket.id} email:`, err);
    return {
      success: false,
      recipient,
      error: err.message,
    };
  }
}

/**
 * Sends an instant notification email to admin when a customer initiates a ticket or sends a message.
 */
export async function sendNewMessageAdminNotification(
  ticket: { id: number; store_name: string; shop_domain?: string; client_name: string; client_email?: string | null; type?: string },
  messageText: string,
  senderName: string
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'meetvariya1756@gmail.com';
  const appUrl = process.env.SHOPIFY_APP_URL || 'http://localhost:3000';
  const ticketUrl = `${appUrl}/admin/support?ticketId=${ticket.id}`;

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"LiveGold Feed Support" <${adminEmail}>`,
      to: adminEmail,
      subject: `[New Client Message] ${ticket.store_name} - Ticket #${ticket.id}`,
      text: `New support message received from ${senderName} (${ticket.store_name}):\n\n"${messageText}"\n\nView and reply in Admin Panel: ${ticketUrl}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: #09090b; padding: 22px 28px; color: #ffffff;">
      <table style="width: 100%; border-collapse: collapse; border: 0;">
        <tr>
          <td style="vertical-align: top; padding: 0;">
            <div style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 12px; margin-bottom: 8px;">
              New Client Inquiry
            </div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Incoming Customer Message</h1>
            <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">A client has sent a message and is waiting for a live support agent.</p>
          </td>
          <td style="vertical-align: top; text-align: right; padding: 0 0 0 16px;">
            <table align="right" style="border-collapse: collapse; border: 0; display: inline-table;">
              <tr>
                <td style="vertical-align: middle; text-align: right; padding-right: 10px;">
                  <div style="font-size: 13px; font-weight: 700; color: #ffffff; line-height: 1.25; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; white-space: nowrap;">
                    Venner Infotech
                  </div>
                  <div style="font-size: 10px; color: #94a3b8; line-height: 1.25; margin-top: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; white-space: nowrap;">
                    &amp; Marketing Solution
                  </div>
                </td>
                <td style="vertical-align: middle; width: 35px;">
                  <img src="cid:venner-logo" alt="Venner Infotech &amp; Marketing Solution" width="35" height="35" style="width: 35px; height: 35px; border-radius: 6px; display: block; border: 0;" />
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding: 24px 28px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 110px;"><b>Store:</b></td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(ticket.store_name)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Client:</b></td>
          <td style="padding: 6px 0; color: #0f172a;">${escapeHtml(ticket.client_name)} ${ticket.client_email ? `(${escapeHtml(ticket.client_email)})` : ''}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Ticket ID:</b></td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">#${ticket.id}</td>
        </tr>
      </table>

      <div style="padding: 14px 18px; background: #f1f5f9; border-left: 4px solid #2563eb; border-radius: 6px; font-size: 14px; color: #1e293b; line-height: 1.5; margin-bottom: 24px;">
        <b>Message:</b><br />
        ${escapeHtml(messageText)}
      </div>

      <div style="text-align: center; margin: 28px 0 10px;">
        <a href="${ticketUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Open Ticket &amp; Connect with Client &rarr;
        </a>
      </div>
    </div>

    <div style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
      <p style="margin: 0 0 6px;">LiveGold Feed Support System</p>
      <div style="font-size: 11px; color: #94a3b8;">
        Powered by <strong style="color: #64748b;">Venner Infotech &amp; Marketing Solution</strong>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      attachments: getEmailAttachments(),
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Admin notification sent for ticket #${ticket.id}`);
  } catch (err: any) {
    console.warn(`[Email Warning] Could not send admin notification for ticket #${ticket.id}:`, err?.message || err);
  }
}


