import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireParent } from "@/modules/auth";

const schema = z.object({ preferredLang: z.enum(["EN", "HI"]) });

export async function GET(req: Request) {
  try {
    const { user } = await requireParent(req);
    return NextResponse.json({ preferredLang: user.preferredLang });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Unable to load message preferences." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { user } = await requireParent(req);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose English or Hindi for fee reminders." }, { status: 400 });
    const guardian = await prisma.guardian.update({ where: { id: user.id }, data: { preferredLang: parsed.data.preferredLang }, select: { preferredLang: true } });
    return NextResponse.json({ preferredLang: guardian.preferredLang });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[ParentPreferences]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to save message preferences." }, { status: 500 });
  }
}
