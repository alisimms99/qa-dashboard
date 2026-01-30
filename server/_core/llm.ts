import OpenAI from "openai";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const assertApiKey = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role: role as "tool" | "function",
      content,
      name,
      tool_call_id,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role: role as "system" | "user" | "assistant",
      content: contentParts[0].text,
      name,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  }

  return {
    role: role as "system" | "user" | "assistant",
    content: contentParts.map(part => {
      if (part.type === "text") return part.text;
      if (part.type === "image_url") return { type: "image_url", image_url: part.image_url };
      return part;
    }),
    name,
  } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    maxTokens,
    max_tokens,
  } = params;

  // Normalize messages for OpenAI
  const normalizedMessages = messages.map(normalizeMessage);

  // Build OpenAI request options
  const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: "gpt-4o-mini", // Cost-effective, good performance
    messages: normalizedMessages,
    temperature: 0.7,
  };

  // Add max_tokens if specified
  if (maxTokens || max_tokens) {
    requestOptions.max_tokens = maxTokens || max_tokens;
  } else {
    // Default max tokens for longer responses
    requestOptions.max_tokens = 4096;
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestOptions.tools = tools.map(tool => ({
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as Record<string, unknown>,
      },
    }));
  }

  // Add tool_choice if provided
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    requestOptions.tool_choice = normalizedToolChoice;
  }

  // Handle response format
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    if (normalizedResponseFormat.type === "json_object") {
      requestOptions.response_format = { type: "json_object" };
    } else if (normalizedResponseFormat.type === "json_schema") {
      // OpenAI supports structured outputs via response_format with json_schema
      // Note: OpenAI's structured outputs may differ slightly from Manus Forge
      // For now, we'll use json_object and parse/validate in the calling code
      requestOptions.response_format = { type: "json_object" };
    }
  }

  try {
    const response = await openai.chat.completions.create(requestOptions);

    // Transform OpenAI response to match InvokeResult interface
    const result: InvokeResult = {
      id: response.id,
      created: response.created,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role as Role,
          content: choice.message.content || "",
          tool_calls: choice.message.tool_calls?.map(tc => ({
            id: tc.id,
            type: tc.type as "function",
            function: {
              name: (tc as any).function?.name || '',
              arguments: JSON.stringify((tc as any).function?.arguments || {}),
            },
          })),
        },
        finish_reason: choice.finish_reason,
      })),
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };

    return result;
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(
        `OpenAI API error: ${error.status} ${error.message} – ${error.code || ""}`
      );
    }
    throw error;
  }
}
