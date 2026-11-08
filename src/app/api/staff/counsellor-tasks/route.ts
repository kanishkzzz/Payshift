import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireStaff } from "@/modules/auth";
import { RiskError, RiskService } from "@/modules/risk/risk-service";

const querySchema = z.object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).optional(),
    mine: z.enum(["true", "false"]).optional(),
});

export async function GET(req: Request) {
    try {
        const { user } = await requireStaff(["COUNSELLOR", "ADMIN"], req);
        const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        const tasks = await RiskService.listTasks(user, {
            status: parsed.data.status,
            mine: parsed.data.mine === "true",
        });
        return NextResponse.json({ tasks });
    } catch (err) {
        if (err instanceof AuthError || err instanceof RiskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        console.error("[CounsellorTasks]", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}