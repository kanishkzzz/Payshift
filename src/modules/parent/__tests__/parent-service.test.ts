import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { ParentError, ParentService, getLinkedStudentIds, renderReceiptHtml } from "../parent-service";

describe("renderReceiptHtml", () => {
    const base = {
        receiptNo: "RCP-2026-KOT-0001",
        issuedAt: "2026-11-02",
        instituteName: "Tracky",
        centreName: "Kota Main",
        centreCity: "Kota",
        gstin: "08AAAAA0000A1Z5",
        studentId: "STU-0587",
        studentName: "Aarav",
        batchName: "JEE 2027 A",
        amountPaise: BigInt(1_500_000),
        taxablePaise: BigInt(1_271_186),
        gstPaise: BigInt(228_815),
        paymentRef: "pay_123",
        source: "ONLINE_GATEWAY",
    };

    it("shows GST split and total", () => {
        const html = renderReceiptHtml(base);
        expect(html).toContain("₹1144.07"); // CGST
        expect(html).toContain("₹1144.08"); // SGST
        expect(html).toContain("₹15000.00");
    });

    it("escapes user-provided text", () => {
        const html = renderReceiptHtml({ ...base, studentName: '<script>alert("x")</script>' });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
});

describe.skipIf(!process.env.DATABASE_URL)("ParentService (seeded DB)", () => {
    it("guardian of STU-0587 sees STU-0587 dues", async () => {
        const guardian = await prisma.guardian.findFirst({ where: { studentId: "STU-0587" } });
        if (!guardian) return console.warn("No guardian for STU-0587 in seed; skipping.");

        const dues = await ParentService.getDues(guardian.id, "2026-11-02");
        expect(dues.map((d) => d.studentId)).toContain("STU-0587");
    });

    it("IDOR: a guardian gets 404 for another student's receipt", async () => {
        const guardian = await prisma.guardian.findFirst({ where: { studentId: "STU-0587" } });
        if (!guardian) return;

        const linked = await getLinkedStudentIds(guardian.id);
        const foreign = await prisma.receipt.findFirst({
            where: { payment: { studentId: { notIn: linked } } },
        });
        if (!foreign) return console.warn("No receipt for another student in seed; skipping.");

        await expect(ParentService.getReceiptHtml(guardian.id, foreign.id)).rejects.toMatchObject({
            statusCode: 404,
        });
        await expect(ParentService.getReceiptHtml(guardian.id, foreign.id)).rejects.toBeInstanceOf(ParentError);
    });

    it("receipts list only contains linked students", async () => {
        const guardian = await prisma.guardian.findFirst({ where: { studentId: "STU-0587" } });
        if (!guardian) return;

        const linked = await getLinkedStudentIds(guardian.id);
        const receipts = await ParentService.getReceipts(guardian.id);
        for (const r of receipts) expect(linked).toContain(r.studentId);
    });
});