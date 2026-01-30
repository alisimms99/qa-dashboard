import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("calls router", () => {
  it("should list all calls", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const calls = await caller.calls.list();

    expect(calls).toBeDefined();
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    
    // Verify call structure
    const firstCall = calls[0];
    expect(firstCall).toHaveProperty("callId");
    expect(firstCall).toHaveProperty("direction");
    expect(firstCall).toHaveProperty("fromNumber");
    expect(firstCall).toHaveProperty("toNumber");
    expect(firstCall).toHaveProperty("duration");
    expect(firstCall).toHaveProperty("status");
  });

  it("should get a call by ID", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // First get all calls to get a valid callId
    const calls = await caller.calls.list();
    expect(calls.length).toBeGreaterThan(0);
    
    const testCallId = calls[0]!.callId;
    const call = await caller.calls.getById({ callId: testCallId });

    expect(call).toBeDefined();
    expect(call?.callId).toBe(testCallId);
  });

  it("should get call with details including transcript and analysis", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Use a known callId from seed data
    const testCallId = "AC3700e624eca547eb9f749a06f";
    const details = await caller.calls.getWithDetails({ callId: testCallId });

    expect(details).toBeDefined();
    expect(details?.call).toBeDefined();
    expect(details?.call.callId).toBe(testCallId);
    
    // Verify transcript exists
    expect(details?.transcript).toBeDefined();
    expect(details?.transcript?.fullText).toBeDefined();
    expect(details?.transcript?.jsonPayload).toBeDefined();
    
    // Verify analysis exists
    expect(details?.analysis).toBeDefined();
    expect(details?.analysis?.score).toBeGreaterThanOrEqual(0);
    expect(details?.analysis?.score).toBeLessThanOrEqual(100);
    expect(details?.analysis?.summary).toBeDefined();
    expect(details?.analysis?.complianceCheck).toBeDefined();
  });

  it("should return null for non-existent call", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const call = await caller.calls.getById({ callId: "NONEXISTENT123" });

    expect(call).toBeNull();
  });

  it("should return null for call details with non-existent call", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const details = await caller.calls.getWithDetails({ callId: "NONEXISTENT123" });

    expect(details).toBeNull();
  });
});
