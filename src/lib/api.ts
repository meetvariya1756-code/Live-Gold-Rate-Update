import { NextResponse } from 'next/server';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function handler<A extends any[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      console.error(e);
      return err(e?.message || 'Server error', e?.status && e.status >= 400 && e.status < 600 ? e.status : 500);
    }
  };
}

export type Ctx<P> = { params: Promise<P> };
