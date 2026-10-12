import nodemailer from 'nodemailer';

export interface ChatMessageSummary {
  sender_role: string;
  sender_name: string;
  message: string;
  message_type?: string;
  file_url?: string | null;
  file_name?: string | null;
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

/**
 * Creates nodemailer transporter.
 * Uses SMTP settings if provided in .env (e.g., Gmail SMTP), otherwise logs cleanly.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;
  const user = process.env.SMTP_USER || 'meetvariya1756@gmail.com';
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '';

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
        attachmentHtml = `
          <div style="margin-top: 8px; font-size: 12px;">
            📎 <b>Attachment:</b> <a href="${m.file_url}" target="_blank" style="color: #2563eb; text-decoration: underline;">${m.file_name || 'View file'}</a>
          </div>
        `;
      }

      return `
        <div style="margin-bottom: 14px; padding: 12px 16px; border-radius: 8px; background-color: ${bg}; border: 1px solid ${border};">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; color: #64748b;">
            <span>
              <strong style="color: ${roleColor}; font-size: 13px;">${m.sender_name}</strong>
              <span style="background: ${isAdmin ? '#dbeafe' : '#f1f5f9'}; color: ${roleColor}; padding: 1px 6px; border-radius: 10px; font-size: 11px; margin-left: 6px; font-weight: 600;">${roleBadge}</span>
            </span>
            <span>${dateStr}</span>
          </div>
          <div style="font-size: 14px; line-height: 1.5; color: #1e293b; white-space: pre-wrap;">${escapeHtml(m.message || '')}</div>
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
      <div style="display: inline-block; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 12px; margin-bottom: 10px;">
        ✓ Ticket Resolved
      </div>
      <h2 style="margin: 0 0 6px; font-size: 20px; font-weight: 700;">Support Conversation Transcript</h2>
      <p style="margin: 0; font-size: 13px; color: #94a3b8;">
        Gold Rate Pricer Support · Ticket #${ticket.id}
      </p>
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
      <p style="margin: 0; color: #94a3b8;">
        If you have further questions, you can start a new conversation via the Gold Rate Pricer Support Widget in your Shopify Admin.
      </p>
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
  const textContent = `Support Ticket #${ticket.id} Resolved\n\nStore: ${ticket.store_name} (${ticket.shop_domain})\nCustomer: ${ticket.client_name}\n\n--- Conversation History ---\n` +
    messages.map((m) => `[${new Date(m.created_at).toLocaleString()}] ${m.sender_name} (${m.sender_role}): ${m.message}`).join('\n\n');

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"Gold Rate Pricer Support" <${defaultAdminEmail}>`,
      to: recipient,
      // If client has their own email, also copy the admin email as requested
      cc: recipient !== defaultAdminEmail ? defaultAdminEmail : undefined,
      subject: `[Resolved] Support Conversation Transcript - Ticket #${ticket.id} (${ticket.store_name})`,
      text: textContent,
      html,
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
