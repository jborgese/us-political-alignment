import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"

const MAX_TOKENS = 4096

const verdictSchema = z.object({
  choice: z.enum(["A", "B"]),
  reason: z.string(),
})

export type Verdict = z.infer<typeof verdictSchema>
export type Rater = (system: string, message: string) => Promise<Verdict>

export const createRater = (model: string): Rater => {
  const client = new Anthropic()
  return async (system, message) => {
    const response = await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: message }],
      output_config: { format: zodOutputFormat(verdictSchema) },
    })
    if (response.parsed_output === null) {
      throw new Error(`The rater gave no usable verdict (stop reason: ${response.stop_reason})`)
    }
    return response.parsed_output
  }
}
