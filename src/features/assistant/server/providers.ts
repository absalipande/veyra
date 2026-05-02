const FALLBACK_CLOUDFLARE_MODEL = "@cf/meta/llama-3-8b-instruct";

type AssistantMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getAssistantModelName() {
  return process.env.CLOUDFLARE_AI_MODEL ?? process.env.VEYRA_AI_MODEL ?? FALLBACK_CLOUDFLARE_MODEL;
}

export function getAssistantProviderName() {
  return process.env.VEYRA_AI_PROVIDER?.trim().toLowerCase() || "cloudflare-workers-ai";
}

export async function generateAssistantResponse(messages: AssistantMessage[]) {
  const provider = getAssistantProviderName();
  if (provider === "disabled") {
    return "Ask Veyra is not configured yet.";
  }

  if (provider !== "cloudflare-workers-ai") {
    return "Ask Veyra is currently configured for Cloudflare Workers AI only.";
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_TOKEN;
  if (!accountId || !apiToken) {
    return "Ask Veyra needs Cloudflare Workers AI environment variables before it can answer.";
  }

  const model = getAssistantModelName();
  console.info("[assistant.provider]", {
    provider,
    model,
  });

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        messages,
        temperature: 0.25,
        max_tokens: 700,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare Workers AI request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    result?: { response?: string | null };
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };

  if (json.success === false) {
    throw new Error(json.errors?.[0]?.message ?? "Cloudflare Workers AI request failed");
  }

  return (
    json.result?.response?.trim() ||
    "I could not produce a useful answer from the available Veyra context."
  );
}
