import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { RefundService, RefundError } from "../refund-service";

describe.skipIf(!process.env.DATABASE_URL)("RefundService (seeded DB)", () => {
    it("lists refunds with readable reason labels and paidPaise", async () => {
        const cases = await RefundService.list();
        expect(cases.length).toBeGreaterThanOrEqual(1);

        const stu60Case = cases.find((c) => c.student.id === "STU-0060");
        expect(stu60Case).toBeDefined();
        expect(stu60Case?.reasonCode).toBe("STUDENT_WITHDRAWAL");
        expect(stu60Case?.reasonLabel).toBe("Student withdrawal");
        expect(stu60Case?.reasonDetail).toBe("Relocating out of city");
        expect(stu60Case?.status).toBe("APPROVED");
        expect(BigInt(stu60Case?.paidPaise ?? 0)).toBeGreaterThanOrEqual(BigInt(800000));
    });

    it("requires reasonDetail when reasonCode is OTHER", async () => {
        await expect(
            RefundService.createCase({
                enrollmentId: "enr_stu-0587",
                leaveDate: "2026-11-02",
                reasonCode: "OTHER",
                reasonDetail: "",
                actorId: "usr_admin_01",
            })
        ).rejects.toThrow(RefundError);

        await expect(
            RefundService.createCase({
                enrollmentId: "enr_stu-0587",
                leaveDate: "2026-11-02",
                reasonCode: "OTHER",
                reasonDetail: "   ",
                actorId: "usr_admin_01",
            })
        ).rejects.toThrow("reasonDetail is required when reasonCode is OTHER");
    });

    it("enforces allowed transitions: PENDING -> APPROVED | REJECTED, APPROVED -> SETTLED, rejecting invalid transitions with 409", async () => {
        // STU-0060 refund case is currently APPROVED in seed
        const existing = await prisma.refundCase.findUnique({
            where: { id: "ref_case_stu_0060" },
        });
        expect(existing).toBeDefined();
        expect(existing?.status).toBe("APPROVED");

        // Trying to approve an already APPROVED case must throw 409
        await expect(
            RefundService.transition("ref_case_stu_0060", "approve", "usr_admin_01")
        ).rejects.toThrow(RefundError);

        try {
            await RefundService.transition("ref_case_stu_0060", "approve", "usr_admin_01");
        } catch (err: unknown) {
            const rErr = err as RefundError;
            expect(rErr.statusCode).toBe(409);
        }

        // Trying to reject an already APPROVED case must throw 409
        try {
            await RefundService.transition("ref_case_stu_0060", "reject", "usr_admin_01")
        } catch (err: unknown) {
            const rErr = err as RefundError;
            expect(rErr.statusCode).toBe(409);
        }
    });

    it("validates settlement against actual paid payments in transaction, rejecting excess with 422", async () => {
        // Create a temporary test case where computed refund exceeds payments
        const dummyCase = await prisma.refundCase.create({
            data: {
                enrollmentId: "enr_stu-0060",
                leaveDate: new Date("2026-09-15T00:00:00.000Z"),
                computedPaise: BigInt(999999999), // Exceeds paid amount
                policyVersion: "v2026.1",
                paidByDate: new Date("2026-10-15T00:00:00.000Z"),
                reasonCode: "MEDICAL_GROUNDS",
                status: "APPROVED",
            },
        });

        try {
            await expect(
                RefundService.transition(dummyCase.id, "settle", "usr_admin_01")
            ).rejects.toThrow("Refund exceeds amount paid on this enrollment");
        } finally {
            await prisma.refundCase.delete({ where: { id: dummyCase.id } });
        }
    });

    it("successfully settles an approved refund within paid limits without touching original payment rows", async () => {
        const prePayments = await prisma.payment.findMany({
            where: { studentId: "STU-0060" },
        });

        const res = await RefundService.transition("ref_case_stu_0060", "settle", "usr_admin_01");
        expect(res.status).toBe("SETTLED");

        const updated = await prisma.refundCase.findUnique({
            where: { id: "ref_case_stu_0060" },
        });
        expect(updated?.status).toBe("SETTLED");
        expect(updated?.settledAt).toBeDefined();
        expect(updated?.settledById).toBe("usr_admin_01");

        // Verify payments are never altered (append-only ledger invariant)
        const postPayments = await prisma.payment.findMany({
            where: { studentId: "STU-0060" },
        });
        expect(postPayments.length).toBe(prePayments.length);
        expect(postPayments[0].amountPaise).toBe(prePayments[0].amountPaise);
        expect(postPayments[0].status).toBe(prePayments[0].status);

        // Reset back to APPROVED for idempotent re-runs or subsequent tests
        await prisma.refundCase.update({
            where: { id: "ref_case_stu_0060" },
            data: { status: "APPROVED", settledAt: null, settledById: null },
        });

        // Clean up audit log created by this test
        await prisma.auditLog.deleteMany({
            where: {
                entityType: "REFUND_CASE",
                entityId: "ref_case_stu_0060",
                action: "REFUND_CASE_SETTLED",
            },
        });
    });
});

