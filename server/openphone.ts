/**
 * OpenPhone API Client
 * Handles authentication and API requests to OpenPhone Public API
 */

import axios, { AxiosInstance } from "axios";

const OPENPHONE_API_BASE_URL = "https://api.openphone.com";

export interface OpenPhoneCall {
  id: string;
  phoneNumberId: string;
  userId: string;
  direction: "incoming" | "outgoing";
  status: string;
  participants: Array<{
    phoneNumber: string;
  }>;
  duration: number;
  createdAt: string;
  completedAt: string | null;
  answeredAt: string | null;
  from?: string;
  to?: string;
}

export interface OpenPhoneCallsResponse {
  data: OpenPhoneCall[];
  nextPageToken?: string;
}

/**
 * OpenPhone Transcript API Response Structure
 * 
 * IMPORTANT: OpenPhone API returns "dialogue" (NOT "segments")
 * - API field: dialogue[]
 * - Each dialogue item has: content, identifier, userId, start, end
 * - We transform dialogue → segments when storing in database
 */
export interface OpenPhoneTranscript {
  callId: string;
  duration: number;
  status: string;
  dialogue: Array<{
    content: string;  // The actual transcript text (API field name)
    start: number;
    end: number;
    identifier: string | null;  // Phone number of speaker (API field name)
    userId: string | null;  // OpenPhone user ID (null for external participants)
  }>;
}

export interface OpenPhoneTranscriptResponse {
  data: OpenPhoneTranscript;
}

/**
 * Make authenticated request to OpenPhone API
 */
async function makeOpenPhoneRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.OPENPHONE_API_KEY;
  
  if (!apiKey) {
    const error = "OPENPHONE_API_KEY environment variable is not set";
    console.error("[OpenPhone] API Error:", error);
    throw new Error(error);
  }

  const url = `${OPENPHONE_API_BASE_URL}${endpoint}`;
  
  console.log(`[OpenPhone] Making request to: ${url}`);
  console.log(`[OpenPhone] Method: ${options.method || "GET"}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  console.log(`[OpenPhone] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenPhone API error (${response.status}): ${errorText}`;
    
    // Provide more specific error messages
    if (response.status === 401) {
      errorMessage = "OpenPhone API key is invalid";
    } else if (response.status === 404) {
      // Try to parse if it's a JSON error
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // Not JSON, use the text as-is
      }
    } else if (response.status === 400) {
      // Bad request - might be invalid phone number ID
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message?.includes("phoneNumberId") || errorJson.message?.includes("phone number")) {
          errorMessage = "Phone number ID not found in your OpenPhone account";
        } else {
          errorMessage = errorJson.message || errorText;
        }
      } catch {
        errorMessage = errorText;
      }
    }
    
    console.error(`[OpenPhone] API Error (${response.status}):`, errorText);
    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log(`[OpenPhone] Response received successfully`);
  
  return data;
}

/**
 * Fetch calls from OpenPhone API with pagination support
 * Note: OpenPhone API requires phoneNumberId and maxResults.
 * Participants parameter is optional and only used for filtering by specific phone numbers.
 * When omitted, returns all calls for the specified phone number.
 */
export async function fetchCalls(params: {
  phoneNumberId: string;
  participants?: string[]; // Optional - only include if filtering by specific participants
  userId?: string;
  createdAfter?: string;
  createdBefore?: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<OpenPhoneCallsResponse> {
  const apiKey = process.env.OPENPHONE_API_KEY;
  
  if (!apiKey) {
    const error = "OPENPHONE_API_KEY environment variable is not set";
    console.error("[OpenPhone] API Error:", error);
    throw new Error(error);
  }

  console.log("[OpenPhone] Fetching calls with params:", {
    phoneNumberId: params.phoneNumberId,
    participants: params.participants,
    userId: params.userId,
    createdAfter: params.createdAfter,
    createdBefore: params.createdBefore,
    maxResults: params.maxResults || 10,
    pageToken: params.pageToken ? `${params.pageToken.substring(0, 20)}...` : undefined,
  });

  // Log whether participants filter is applied
  if (params.participants && params.participants.length > 0) {
    console.log(`[OpenPhone] Filtering by ${params.participants.length} participant(s)`);
  } else {
    console.log(`[OpenPhone] No participants filter - fetching all calls for phone number`);
  }

  try {
    // Use axios for proper array serialization in query strings
    // Axios handles arrays correctly: participants[]=value1&participants[]=value2
    // For empty arrays, axios sends participants[]= (empty value)
    const axiosInstance: AxiosInstance = axios.create({
      baseURL: OPENPHONE_API_BASE_URL,
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
    });

    // Build query params - only include participants if filtering by specific numbers
    const requestParams: Record<string, any> = {
      phoneNumberId: params.phoneNumberId,
      maxResults: params.maxResults || 10,
    };

    // Only add optional params if they have values
    if (params.userId) requestParams.userId = params.userId;
    if (params.createdAfter) requestParams.createdAfter = params.createdAfter;
    if (params.createdBefore) requestParams.createdBefore = params.createdBefore;
    if (params.pageToken) requestParams.pageToken = params.pageToken;
    
    // Only include participants if explicitly provided and not empty
    // This allows fetching all calls when participants is omitted
    if (params.participants && params.participants.length > 0) {
      requestParams.participants = params.participants;
    }

    console.log(`[OpenPhone] Making request to: ${OPENPHONE_API_BASE_URL}/v1/calls`);
    console.log(`[OpenPhone] Query params:`, {
      ...requestParams,
      participants: requestParams.participants 
        ? requestParams.participants 
        : "(omitted - fetching all calls)",
      pageToken: requestParams.pageToken ? `${requestParams.pageToken.substring(0, 20)}...` : undefined,
    });

    const response = await axiosInstance.get<OpenPhoneCallsResponse>("/v1/calls", {
      params: requestParams,
      paramsSerializer: (params) => {
        // Custom serializer to handle arrays properly when participants are provided
        const searchParams = new URLSearchParams();
        
        Object.keys(params).forEach((key) => {
          const value = params[key];
          
          if (Array.isArray(value)) {
            // For arrays (participants), send as participants[]=value1&participants[]=value2
            value.forEach((item) => {
              searchParams.append(`${key}[]`, String(item));
            });
          } else if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        });
        
        return searchParams.toString();
      },
    });

    console.log(`[OpenPhone] Response status: ${response.status} ${response.statusText}`);
    console.log("[OpenPhone] API Response:", {
      statusCode: response.status,
      callsReturned: response.data.data?.length || 0,
      nextPageToken: response.data.nextPageToken ? `${response.data.nextPageToken.substring(0, 20)}...` : undefined,
      dateRange: {
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
      },
      participantsFiltered: params.participants && params.participants.length > 0,
    });

    // Log if no calls were returned
    if (!response.data.data || response.data.data.length === 0) {
      const dateRangeMsg = params.createdAfter 
        ? ` in the date range starting from ${new Date(params.createdAfter).toLocaleString()}`
        : "";
      console.log(`[OpenPhone] No calls found for phone number ${params.phoneNumberId}${dateRangeMsg}`);
    }

    return response.data;
  } catch (error) {
    let errorMessage = "Unknown error";
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorText = error.response?.data || error.message;
      
      console.error(`[OpenPhone] API Error (${status || "network"}):`, errorText);
      
      // Provide more specific error messages
      if (status === 401) {
        errorMessage = "OpenPhone API key is invalid";
      } else if (status === 404) {
        errorMessage = typeof errorText === "string" ? errorText : errorText?.message || "Resource not found";
      } else if (status === 400) {
        // Bad request - might be invalid phone number ID or participants format
        if (typeof errorText === "object" && errorText.message) {
          if (errorText.message.includes("phoneNumberId") || errorText.message.includes("phone number")) {
            errorMessage = "Phone number ID not found in your OpenPhone account";
          } else if (errorText.message.includes("participants") || errorText.message.includes("Expected array")) {
            errorMessage = `Participants parameter error: ${errorText.message}`;
          } else {
            errorMessage = errorText.message || JSON.stringify(errorText);
          }
        } else {
          errorMessage = typeof errorText === "string" ? errorText : JSON.stringify(errorText);
        }
      } else {
        errorMessage = typeof errorText === "string" ? errorText : JSON.stringify(errorText);
      }
    } else {
      errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[OpenPhone] Failed to fetch calls:", {
        phoneNumberId: params.phoneNumberId,
        error: errorMessage,
      });
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Fetch transcript for a specific call
 */
export async function fetchTranscript(callId: string): Promise<OpenPhoneTranscriptResponse> {
  console.log(`[OpenPhone] Fetching transcript for call: ${callId}`);
  const endpoint = `/v1/call-transcripts/${callId}`;
  
  try {
    const response = await makeOpenPhoneRequest<OpenPhoneTranscriptResponse>(endpoint);
    console.log(`[OpenPhone] Transcript fetched successfully for call ${callId}:`, {
      duration: response.data?.duration,
      segments: response.data?.dialogue?.length || 0,
      status: response.data?.status,
    });
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenPhone] Failed to fetch transcript for call ${callId}:`, errorMessage);
    throw error;
  }
}

/**
 * Test OpenPhone API connection
 * This is a lightweight test that only checks if the API key is valid
 * For actual call fetching, use syncCalls which handles required parameters
 */
export async function testOpenPhoneConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const apiKey = process.env.OPENPHONE_API_KEY;
    
    if (!apiKey) {
      return { success: false, error: "OPENPHONE_API_KEY not set" };
    }

    // Test with a minimal request to verify API key
    const response = await fetch(`${OPENPHONE_API_BASE_URL}/v1/phone-numbers?maxResults=1`, {
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return { success: true };
    } else {
      const errorText = await response.text();
      return { success: false, error: `API returned ${response.status}: ${errorText}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("OpenPhone API connection test failed:", errorMessage);
    return { success: false, error: errorMessage };
  }
}
