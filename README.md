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
| `npm run check -- welfare-health` | Validates the category, its packets, and the key. Lists what is missing. | No |
| `npm run rate -- welfare-health` | Sends every unrated pair to the model and saves each answer as it arrives. | Yes, paid |
| `npm run report -- welfare-health` | Writes `report.md` and `spot-check.md` under `runs/welfare-health/`. | No |
| `npm test` | Runs the tests. | No |
| `npm run typecheck` | Type-checks the source. | No |

`rate` works through one comparison at a time. Stop it whenever you like; the next run picks up where it stopped. The pilot has 24 records, which is 552 calls.

## Files

| Path | Holds |
|---|---|
| `categories/<category-id>.json` | The question, the two ends of the scale, and the anchor records, listed from the high end to the low end |
| `key.json` | The name behind each blinded id, and the terms no record may contain |
| `packets/<category-id>/<subject-id>.json` | The evidence for one subject in one category |
| `runs/<category-id>/comparisons.jsonl` | One saved answer per line |
| `runs/<category-id>/report.md` | Scores with names |
| `runs/<category-id>/spot-check.md` | Ten random pairs with no names or ids, for a human to judge |

## Writing a packet

Name the file after the subject's id in `key.json`, for example `packets/welfare-health/s05.json`.

```json
{
  "items": [
    {
      "tier": "official_act",
      "text": "Voted against a budget that reduced funding for public health coverage for low-income residents.",
      "sources": ["https://example.org/roll-call/123", "https://example.org/budget-summary"]
    },
    {
      "tier": "statement",
      "text": "Announced the intention to introduce a bill extending public health coverage to all residents.",
      "sources": ["https://example.org/press/456"]
    }
  ]
}
```

**Tiers**

- `official_act`: a recorded use of official power, such as a vote, a sponsored bill, or a policy enacted in government.
- `influence`: an endorsement, or public pressure on other officials.
- `statement`: a statement about an act taken or intended. Talk that is tied to no act stays out.

**Rules**

- Every item needs at least one link in `sources`: the record of the act, and a second link when the first does not say what the act does. Sources are for you and for audits; they are never sent to the rater.
- Describe what an act does, not what it is called. Write "public health coverage for people over 65", not the program's name.
- Leave out every name of a person, party, country, region, institution, office, program, and currency. `check` refuses a packet that contains a term from `key.json`, but the list is a starting point, so read each packet for tells the list does not have.
- Use "they" for the subject. Gendered pronouns give the person away.
- Use words that fit any system: "regional governments" and "national", not "states" and "federal"; "legislator", "head of government", "legislative term".
- Use US spelling and plain international wording everywhere: "retirees", "recipients", "supplement". Spelling and idiom give the country away.
- For a party, start each official act with "In government," when it enacted the policy while governing.
- For a caucus, file votes its members cast as a bloc under `official_act`, and positions it published to press its party under `influence`.
- Give amounts as shares or percentages.
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

## Changing things after a run has started

- Saved answers are never re-rated. After changing a packet, an anchor, or the question, move `runs/<category-id>/` aside and rate again.
- A run uses one model. `rate` refuses to add answers from a second model to an existing run.

## Limits

- The method comes from a preprint and has not been validated for this use.
- Blinding hides names. A rater that knows recent politics may still recognize a well-known act.
- A record's wording can show whether it describes a legislator or a governing party.
- The anchor records are drafts.
- The question is asked in one direction only.
