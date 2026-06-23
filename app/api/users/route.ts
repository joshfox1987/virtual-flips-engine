import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const upsertUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = upsertUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid user payload.' }, { status: 400 });
    }

    const { id, email, name } = parsed.data;
    const userEmail = email ?? `${id}@local.virtual-flips`;

    const user = await db.user.upsert({
      where: { email: userEmail },
      create: {
        id,
        email: userEmail,
        name,
      },
      update: {
        name,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Users POST error:', error);
    return NextResponse.json({ error: 'Failed to upsert user.' }, { status: 500 });
  }
}
