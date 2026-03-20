import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  return NextResponse.json({ exists: !!existing });
}
