import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

const PUBLIC = [
  '/login',
  '/admin/login',
  '/api/auth/login',
  '/api/auth/shopify',
  '/api/auth/shopify-direct',
  '/api/auth/callback',
  '/api/webhooks/',
  '/api/cron/',
  '/api/public/',
  '/uploads/',
  '/embed.js',
  '/privacy',
];

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    // Restrict admin routes to admin role only
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
      if (session.role !== 'admin') {
        if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        return NextResponse.redirect(new URL('/', req.url));
      }
    }
    return NextResponse.next();
  }

  // If request contains Shopify 'shop' parameter, seamlessly authenticate without login prompt
  const shop = searchParams.get('shop');
  const isAuthed = searchParams.get('authed') === '1';
  if (shop && !pathname.startsWith('/api/') && !pathname.startsWith('/stores/') && !isAuthed) {
    const incomingHost = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
    let appBase = process.env.SHOPIFY_APP_URL?.trim().replace(/\/$/, '') || '';
    if (incomingHost.includes('live-gold-feed.vennerwp.com') || (appBase.includes('trycloudflare.com') && !incomingHost.includes('trycloudflare.com'))) {
      appBase = 'https://live-gold-feed.vennerwp.com';
    } else if (!appBase || appBase.includes('0.0.0.0')) {
      appBase = req.headers.get('x-forwarded-host') && !req.headers.get('x-forwarded-host')?.includes('0.0.0.0')
        ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
        : req.nextUrl.origin.replace('0.0.0.0', 'localhost');
    }
    const directAuthUrl = new URL('/api/auth/shopify-direct', appBase);
    searchParams.forEach((val, key) => directAuthUrl.searchParams.set(key, val));
    return NextResponse.redirect(directAuthUrl);
  }

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = req.nextUrl.clone();
  if (pathname.startsWith('/admin')) {
    url.pathname = '/admin/login';
  } else {
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
  }
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
