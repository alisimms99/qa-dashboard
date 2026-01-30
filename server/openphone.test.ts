import { describe, expect, it } from "vitest";
import { testOpenPhoneConnection, fetchCalls } from "./openphone";

describe("OpenPhone API Client", () => {
  it("should have OPENPHONE_API_KEY environment variable set", () => {
    expect(process.env.OPENPHONE_API_KEY).toBeDefined();
    expect(process.env.OPENPHONE_API_KEY).not.toBe("");
  });

  it("should successfully connect to OpenPhone API", async () => {
    const result = await testOpenPhoneConnection();
    
    if (!result.success) {
      console.error("Connection test failed:", result.error);
    }
    
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  }, 30000); // 30 second timeout for API call
});
