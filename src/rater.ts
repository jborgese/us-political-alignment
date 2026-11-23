import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"

const MAX_TOKENS = 4096

const verdictSchema = z.object({
  choice: z.enum(["A", "B"]),
  reason: z.string(),
})

const verdictFormat = zodOutputFormat(verdictSchema)

export type Verdict = z.infer<typeof verdictSchema>

export interface RatingRequest {
  id: string
  system: string
  message: string
}

export interface RatedRequest {
  id: string
  verdict: Verdict
}

export type BatchProgress =
  | { ended: false; processing: number }
  | { ended: true; rated: RatedRequest[]; failed: string[] }

export interface BatchRater {
  submit: (requests: RatingRequest[]) => Promise<string>
  collect: (batchId: string) => Promise<BatchProgress>
}

type BatchLine = Anthropic.Messages.Batches.MessageBatchIndividualResponse

const verdictOf = (line: BatchLine): Verdict | undefined => {
  if (line.result.type !== "succeeded") return undefined
  const text = line.result.message.content.find((block) => block.type === "text")?.text
  if (text === undefined) return undefined
  try {
    return verdictFormat.parse(text)
  } catch {
    return undefined
  }
}

export const createBatchRater = (model: string): BatchRater => {
  const client = new Anthropic()
  return {
    submit: async (requests) => {
      const batch = await client.messages.batches.create({
        requests: requests.map(({ id, system, message }) => ({
          custom_id: id,
          params: {
            model,
            max_tokens: MAX_TOKENS,
            system,
            messages: [{ role: "user", content: message }],
            output_config: { format: verdictFormat },
          },
        })),
      })
      return batch.id
    },
    collect: async (batchId) => {
      const batch = await client.messages.batches.retrieve(batchId)
      if (batch.processing_status !== "ended") return { ended: false, processing: batch.request_counts.processing }
      const lines: BatchLine[] = []
      for await (const line of await client.messages.batches.results(batchId)) lines.push(line)
      const read = lines.map((line) => ({ id: line.custom_id, verdict: verdictOf(line) }))
      return {
        ended: true,
        rated: read.flatMap(({ id, verdict }) => (verdict ? [{ id, verdict }] : [])),
        failed: read.filter(({ verdict }) => verdict === undefined).map(({ id }) => id),
      }
    },
  }
}
