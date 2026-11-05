import { NextResponse } from "next/server";
import { AuthError, requireParent } from "@/modules/auth";
import { ParentService } from "@/modules/parent/parent-service";



export async function GET(req: Request) {
    try {
        const { user } = await requireParent(req);
        return NextResponse.json({ receipts: await ParentService.getReceipts(user.id) });
    } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        console.error("[Parent] receipts failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}