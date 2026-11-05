import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "@/modules/auth";
import { ReportsService, toJsonSafe } from "@/modules/reports/reports-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
    try {
        const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);
        const params = new URL(req.url).searchParams;

        const asOf = params.get("asOf") ?? undefined;
        if (asOf && !DATE_RE.test(asOf)) {
            return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
        }

        // Centre-bound staff only see their own centre; ADMIN can filter freely.
        const centreId =
            user.role === "ADMIN" ? params.get("centreId") ?? undefined : user.centreId ?? params.get("centreId") ?? undefined;

        const summary = await ReportsService.getDuesSummary({
            asOf,
            centreId,
            batchId: params.get("batchId") ?? undefined,
        });
        return NextResponse.json(toJsonSafe(summary));
    } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        console.error("[Reports] dues failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}