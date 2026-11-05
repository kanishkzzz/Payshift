import { NextResponse } from "next/server";
import { AuthError, requireParent } from "@/modules/auth";
import { ParentError, ParentService } from "@/modules/parent/parent-service";



export async function GET(req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
    try {
        const { user } = await requireParent(req);
        const { receiptId } = await params;
        const html = await ParentService.getReceiptHtml(user.id, receiptId);

        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                // No scripts allowed on the receipt page at all
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            },
        });
    } catch (err) {
        if (err instanceof AuthError || err instanceof ParentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        console.error("[Parent] receipt failed:", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}