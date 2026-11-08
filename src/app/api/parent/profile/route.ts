import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireParent } from "@/modules/auth";
import { getLinkedStudentIds } from "@/modules/parent/parent-service";

const updateSchema = z.object({ name: z.string().trim().min(2).max(100) });

export async function GET(req: Request) {
  try {
    const { user } = await requireParent(req);
    const [guardian, studentIds] = await Promise.all([
      prisma.guardian.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true, phone: true, relation: true, avatarUrl: true } }),
      getLinkedStudentIds(user.id),
    ]);
    if (!guardian) return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    const children = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, batch: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ profile: guardian, children });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[ParentProfile:GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to load your profile." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { user } = await requireParent(req);
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a name between 2 and 100 characters." }, { status: 400 });
    const profile = await prisma.guardian.update({ where: { id: user.id }, data: { name: parsed.data.name }, select: { id: true, name: true, avatarUrl: true } });
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[ParentProfile:PATCH]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to save your profile." }, { status: 500 });
  }
}
