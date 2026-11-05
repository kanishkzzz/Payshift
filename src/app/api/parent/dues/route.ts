import { NextResponse } from "next/server";
import { AuthError, requireParent } from "@/modules/auth";
import { ParentService } from "@/modules/parent/parent-service";
import { toJsonSafe } from "@/modules/reports/reports-service";



export async function GET(req: Request) {
    try {
        const { user } = await requireParent(req);
        const dues = await ParentService.getDues(user.id);
        return NextResponse.json(toJsonSafe({ students: dues }));
    } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        console.error("[Parent] dues failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}