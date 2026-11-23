# us-political-alignment

Places US House members, foreign parties, and House caucuses on one scale per issue category. A language model compares two anonymous evidence records at a time and says which one fits the category's question better. The tool turns those answers into scores, with written anchor records fixing the ends of the scale.

The rater never sees a name, a party, a record id, or a source.

## Setup

Node.js 22.18 or newer and npm 10.

```bash
npm ci
cp .env.example .env   # then set ANTHROPIC_API_KEY and RATER_MODEL
```

Only `rate` needs the `.env` file.

## Commands

| Command | What it does | Network |
|---|---|---|
| `npm run check -- welfare-health` | Validates the category, its packets, and the key. Lists what is missing and how much is left to rate. | No |
| `npm run rate -- welfare-health` | Submits the unrated pairs as one batch, or collects the answers of the batch it submitted earlier. | Yes, paid |
| `npm run report -- welfare-health` | Writes `report.md` and `spot-check.md` under `runs/welfare-health/`. | No |
| `npm run site -- welfare-health` | Writes the public page to `dist/index.html` from the saved run. | No |
| `npm test` | Runs the tests. | No |
| `npm run typecheck` | Type-checks the source. | No |

`rate` uses the batch interface, which costs half as much as live calls and answers later, usually within the hour. Run it once to submit and again to collect; it tells you which of the two it did. A comparison that failed is submitted again on the next run. The pilot has 24 records, which is 552 comparisons.

To spend less before a full run:

- `check` prints how many comparisons are left and roughly how many input tokens they hold.
- `npm run rate -- welfare-health 30` submits only the first 30. They include the anchors, so the report's checks on a sample show early whether the scale is sound.

## Files

| Path | Holds |
|---|---|
| `categories/<category-id>.json` | The question, the two ends of the scale, the slots every record fills, and the anchor records, listed from the high end to the low end |
| `events/<category-id>.json` | For each legislature, the program changes of the period, each worded once |
| `key.json` | The name and legislature behind each blinded id, and the terms no record may contain |
| `packets/<category-id>/<subject-id>.json` | The evidence for one subject in one category |
| `runs/<category-id>/comparisons.jsonl` | One saved answer per line |
| `runs/<category-id>/report.md` | Scores with names |
| `runs/<category-id>/spot-check.md` | Ten random pairs with no names or ids, for a human to judge |

## Writing evidence

Four rules keep a record's place on the scale from depending on how its evidence was written. `check` enforces the first three.

1. **Same slots for every record.** The category file lists the slots. A record fills each slot or names it in `emptySlots`, and the rater then reads "No recorded act" there. `check` refuses a record that does neither, or both.
2. **Same events for every record from one legislature.** The events file lists the program changes of the period for each legislature. Choose them by the size in the official cost estimate, before looking at how anyone voted. Every record from that legislature takes a stance on each one, and `check` refuses a record that skips one.
3. **One wording per event.** The wording lives in the events file. A record supplies only its stance, and the tool joins the two. Records can then differ in what they did, never in how a measure is described.
4. **Size and reach as shares.** Say what a measure changes as a share of the program's funding, of residents, or of recipients. Take the figure from the official estimate, and say so in the text when it comes from anywhere else. Use no adjective for size: "by about 14 percent", not "deeply". This rule is checked by reading, not by the tool.

### Events

```json
{
  "legislatures": [
    {
      "id": "sample-house",
      "events": [
        {
          "id": "budget-law-health",
          "slot": "changes-health",
          "text": "a budget law that reduced national funding for public health coverage for low-income residents by about 14 percent over ten years",
          "sources": ["https://example.org/roll-call/123", "https://example.org/cost-estimate"]
        }
      ]
    }
  ]
}
```

- The rater reads `<stance> <text>.`, so begin the text with "a" or "the" and leave off the final period.
- One vote that changes two programs is two events with the same stance, one in each slot.
- A subject's `legislature` in `key.json` picks its events.

### Packets

Name the file after the subject's id in `key.json`, for example `packets/welfare-health/s05.json`.

```json
{
  "items": [
    {
      "slot": "keeps-health",
      "tier": "official_act",
      "text": "Votes to keep in place public health coverage for older and low-income residents.",
      "sources": ["https://example.org/roll-call/123"]
    },
    { "event": "budget-law-health", "stance": "Voted against" },
    {
      "slot": "seeks",
      "tier": "statement",
      "text": "Announced the intention to introduce a bill extending public health coverage to all residents.",
      "sources": ["https://example.org/press/456"]
    }
  ],
  "emptySlots": ["keeps-income", "changes-income"]
}
```

An item is either a stance on an event or a free item with its own slot, tier, text, and sources. A stance counts as an official act and takes the event's slot. Give a stance its own `sources` when the event's sources do not show how this subject acted.

**Tiers**

- `official_act`: a recorded use of official power, such as a vote, a sponsored bill, or a policy enacted in government.
- `influence`: an endorsement, or public pressure on other officials.
- `statement`: a statement about an act taken or intended. Talk that is tied to no act stays out.

**Rules for the text**

- Every free item needs at least one link in `sources`: the record of the act, and a second link when the first does not say what the act does. Sources are for you and for audits; they are never sent to the rater.
- Describe what an act does, not what it is called. Write "public health coverage for people over 65", not the program's name.
- Leave out every name of a person, party, country, region, institution, office, program, and currency. `check` refuses a record that contains a term from `key.json`, but the list is a starting point, so read each record for tells the list does not have.
- Use "they" for the subject. Gendered pronouns give the person away.
- Use words that fit any system: "regional governments" and "national", not "states" and "federal"; "legislator", "head of government", "legislative term".
- Use US spelling and plain international wording everywhere: "retirees", "recipients", "supplement". Spelling and idiom give the country away.
- For a party, start each official act with "In government," when it enacted the policy while governing.
- For a caucus, file votes its members cast as a bloc under `official_act`, and positions it published to press its party under `influence`.
- In the slots for what a record keeps in place, describe the guarantee in the same words for every record from one country, and say who it covers.
- Use at most 12 items, chosen for consequence, not for recency or volume. A long record must not win by length.
- Use the same window for every subject: acts from 3 January 2025 onward.
- When a subject has no usable evidence in a category, save `{ "items": [] }`. The subject is left out of the rating and listed in the report.

## Reading the report

`report.md` opens with three checks.

- **Anchors in order.** The anchors must come out in the order they were written. When they do not, the scale is not valid and the report withholds every score.
- **Agreement across orders.** Each pair is rated twice, once in each order. A low share means the rater's answers depend on presentation.
- **First-listed wins.** A share far from 50% means position bias.

Scores run from 0 at the low anchor to 100 at the high anchor. A subject can score outside that range.

Give `spot-check.md` to someone who has not opened `report.md` or `key.json`. They judge each pair, then open the rater's answer under it.

## The site

`npm run site -- welfare-health` builds one self-contained page: every record placed by strength of support, and the evidence behind whichever record the reader selects.

- Support runs from bottom to top. Left to right is one column per group, ordered by support. A left-right position will replace the columns once the project has its own measure of it.
- A member or caucus shows its party's symbol when `key.json` gives it a `party` the page knows (Democratic or Republican). A party abroad shows its country's flag.

- The page is built from the current packets and the saved run, so build it only when the two match.
- It refuses to build when the anchors came out of order, for the same reason the report withholds scores.
- A record is held back from the page when its evidence is thin: a section marked `required` in the category file is empty, it has fewer than three official acts, or more than 15% of its pairs changed winner with the order shown. The page and the report both name each record held back and say why.
- When `superseded.jsonl` holds earlier answers and the anchors have not changed since, the page also shows each record's score before the latest change to the evidence.
- The stylesheet and the browser script are in `site/`. `src/site.ts` inlines them.
- `wrangler.jsonc` serves `dist/` on uspolitics.frootsnoops.com. Cloudflare builds it with `npm run site -- welfare-health` and deploys with `npx wrangler deploy` on each push to `main`.

## Changing things after a run has started

- Each saved answer records which version of its two records it was given. After you change a packet, an event, an anchor, or the question, `rate` moves the answers that no longer match into `superseded.jsonl` and submits only those pairs again. A change to the question or the prompt supersedes every answer.
- `report` refuses to run until every pair has a current answer.
- A run uses one model. `rate` refuses to add answers from a second model to an existing run.

## Limits

- The method comes from a preprint and has not been validated for this use.
- Blinding hides names. A rater that knows recent politics may still recognize a well-known act.
- A record's wording can show whether it describes a legislator or a governing party.
- The anchor records are drafts.
- The question is asked in one direction only.
