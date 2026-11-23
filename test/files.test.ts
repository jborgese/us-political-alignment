import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it, onTestFinished } from "vitest"

import { loadPlannedCategories } from "../src/files.ts"

const writeTemp = async (content: unknown): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), "alignment-files-"))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, "categories.json")
  await writeFile(file, JSON.stringify(content))
  return file
}

describe("loadPlannedCategories", () => {
  it("reads the planned categories in order", async () => {
    const file = await writeTemp([
      { id: "welfare-health", label: "Welfare and health", published: true },
      { id: "economics", label: "Economics", published: false },
    ])

    expect((await loadPlannedCategories(file)).map(({ id }) => id)).toEqual(["welfare-health", "economics"])
  })

  it("rejects an id that could not be a folder name of its own", async () => {
    const file = await writeTemp([{ id: "../outside", label: "Outside", published: false }])

    await expect(loadPlannedCategories(file)).rejects.toThrow("is not valid")
  })
})
