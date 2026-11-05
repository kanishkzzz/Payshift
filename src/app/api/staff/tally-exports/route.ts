import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "@/modules/auth";
import { calendarDaysDifferenceIST } from "@/modules/ledger/date-utils";
import { ReportsService } from "@/modules/reports/reports-service";



const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
    try {
        const { user } = await requireStaff(["ACCOUNTS", "ADMIN"], req);
        const params = new URL(req.url).searchParams;
        const from = params.get("from") ?? "";
        const to = params.get("to") ?? "";

        if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
            return NextResponse.json({ error: "from and to are required as YYYY-MM-DD" }, { status: 400 });
        }
        const span = calendarDaysDifferenceIST(from, to);
        if (span < 0 || span > 366) {
            return NextResponse.json({ error: "Date range must be 0–366 days and from <= to" }, { status: 400 });
        }

        const centreId = user.role === "ADMIN" ? params.get("centreId") ?? undefined : user.centreId ?? undefined;
        const csv = await ReportsService.getTallyCsv({ from, to, centreId });

        // BOM so Excel shows ₹ and Hindi names correctly
        return new Response(`\uFEFF${csv}`, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="tally-receipts-${from}-to-${to}.csv"`,
            },
        });
    } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        console.error("[Reports] tally export failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}