import { ENV } from "./env";

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
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
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

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
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

  return toolChoice;
};

const resolveApiUrl = () => {
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    const base = ENV.forgeApiUrl.replace(/\/$/, "");
    // Azure OpenAI uses a different path pattern; detect by presence of
    // "openai.azure.com" and trust the URL as-is (includes deployment + version).
    if (base.includes("openai.azure.com")) return base;
    return `${base}/v1/chat/completions`;
  }
  return "https://api.openai.com/v1/chat/completions";
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

/**
 * Convert OpenAI-style messages to Gemini API format.
 * Handles text-only and multimodal (image) messages.
 */
function convertMessagesToGemini(messages: Message[]): any[] {
  const geminiContents: any[] = [];

  for (const msg of messages) {
    // Skip system messages — prepend to first user message instead
    if (msg.role === "system") continue;

    const role = msg.role === "assistant" ? "model" : "user";
    const parts: any[] = [];

    const contentArray = ensureArray(msg.content);
    for (const part of contentArray) {
      if (typeof part === "string") {
        parts.push({ text: part });
      } else if (part.type === "text") {
        parts.push({ text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url.url;
        // Handle base64 data URLs
        if (url.startsWith("data:")) {
          const [header, data] = url.split(",");
          const mimeType = header.replace("data:", "").replace(";base64", "");
          parts.push({ inline_data: { mime_type: mimeType, data } });
        } else {
          // External URL — use as text reference (Gemini doesn't support external image URLs directly)
          parts.push({ text: `[Image: ${url}]` });
        }
      }
    }

    if (parts.length > 0) {
      geminiContents.push({ role, parts });
    }
  }

  // Prepend system message content to first user message if present
  const systemMsg = messages.find(m => m.role === "system");
  if (systemMsg && geminiContents.length > 0) {
    const systemText = ensureArray(systemMsg.content)
      .map(p => (typeof p === "string" ? p : p.type === "text" ? p.text : ""))
      .join("\n");
    const firstUserMsg = geminiContents.find(c => c.role === "user");
    if (firstUserMsg) {
      firstUserMsg.parts.unshift({ text: systemText + "\n\n" });
    }
  }

  return geminiContents;
}

/**
 * Call Gemini API directly as a fallback when the forge API is unavailable.
 */
async function invokeGeminiFallback(params: InvokeParams): Promise<InvokeResult> {
  const geminiKey = ENV.geminiApiKey;
  if (!geminiKey) {
    throw new Error("Neither forge API nor GEMINI_API_KEY is available for LLM calls.");
  }

  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;

  const contents = convertMessagesToGemini(params.messages);

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  // Handle JSON response format
  const normalizedFormat = normalizeResponseFormat({
    responseFormat: params.responseFormat,
    response_format: params.response_format,
    outputSchema: params.outputSchema,
    output_schema: params.output_schema,
  });
  if (normalizedFormat?.type === "json_object" || normalizedFormat?.type === "json_schema") {
    requestBody.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini fallback API error: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const data = await response.json() as any;
  const responseText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Convert Gemini response to OpenAI-compatible format
  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: GEMINI_MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as Role,
          content: responseText,
        },
        finish_reason: data?.candidates?.[0]?.finishReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: data?.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: data?.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  // If forge API key is not configured, go straight to Gemini fallback
  if (!ENV.forgeApiKey) {
    console.log("[LLM] No forge API key configured, using Gemini fallback");
    return invokeGeminiFallback(params);
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: ENV.llmModel,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768
  payload.thinking = {
    "budget_tokens": 128
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const statusCode = response.status;
    console.warn(`[LLM] Forge API returned ${statusCode}: ${errorText.slice(0, 200)}`);

    // Fall back to Gemini on any forge API error if Gemini key is available
    if (ENV.geminiApiKey) {
      console.log(`[LLM] Forge API failed (${statusCode}), falling back to Gemini API`);
      return invokeGeminiFallback(params);
    }

    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const responseData = await response.json() as InvokeResult;

  // If forge returned an empty/invalid response, fall back to Gemini
  const content = responseData?.choices?.[0]?.message?.content;
  if (!content && ENV.geminiApiKey) {
    console.log("[LLM] Forge API returned empty content, falling back to Gemini API");
    return invokeGeminiFallback(params);
  }

  return responseData;
}
