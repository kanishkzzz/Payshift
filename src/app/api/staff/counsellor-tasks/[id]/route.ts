import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireStaff } from "@/modules/auth";
import { RiskError, RiskService } from "@/modules/risk/risk-service";

const schema = z
    .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).optional(),
        notes: z.string().trim().max(2000).optional(),
        assigneeId: z.string().min(1).nullable().optional(),
    })
    .refine((d) => d.status !== undefined || d.notes !== undefined || d.assigneeId !== undefined, {
        message: "Provide at least one of status, notes or assigneeId",
    });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { user } = await requireStaff(["COUNSELLOR", "ADMIN"], req);
        const { id } = await params;
        const parsed = schema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        return NextResponse.json(await RiskService.updateTask(id, user, parsed.data));
    } catch (err) {
        if (err instanceof AuthError || err instanceof RiskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        console.error("[CounsellorTask]", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}