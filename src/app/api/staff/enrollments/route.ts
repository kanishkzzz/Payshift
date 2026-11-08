import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireStaff } from "@/modules/auth";

export async function GET(req: Request) {
  try {
    const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);
    const search = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const rows = await prisma.enrollment.findMany({
      where: {
        ...(user.role === "ADMIN" ? { student: { status: "ACTIVE" } } : { student: { status: "ACTIVE", batch: { centreId: user.centreId ?? "" } } }),
        ...(search ? { OR: [
          { id: { contains: search, mode: "insensitive" } },
          { student: { name: { contains: search, mode: "insensitive" } } },
          { student: { id: { contains: search, mode: "insensitive" } } },
        ] } : {}),
      },
      take: 100,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        student: { select: { id: true, name: true, status: true, batch: { select: { name: true, centre: { select: { name: true } } } } } },
        refundCases: { where: { status: { in: ["PENDING", "APPROVED"] } }, select: { id: true } },
      },
    });
    return NextResponse.json({ enrollments: rows.map(({ refundCases, ...row }) => ({ ...row, hasOpenRefund: refundCases.length > 0 })) });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[StaffEnrollments]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to load enrollments." }, { status: 500 });
  }
}
