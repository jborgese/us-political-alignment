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
| `npm run stability -- welfare-health` | Does the same for the reworded versions of the category's records. See [Testing the wording](#testing-the-wording). | Yes, paid |
| `npm run report -- welfare-health` | Writes `report.md` and `spot-check.md` under `runs/welfare-health/`. | No |
| `npm run site` | Writes the public pages to `dist/` from the saved runs: an overview and one page per published category. | No |
| `npm test` | Runs the tests. | No |
| `npm run typecheck` | Type-checks the source. | No |

`rate` uses the batch interface, which costs half as much as live calls and answers later, usually within the hour. Run it once to submit and again to collect; it tells you which of the two it did. A comparison that failed is submitted again on the next run. The pilot has 24 records, which is 552 comparisons.

To spend less before a full run:

- `check` prints how many comparisons are left and roughly how many input tokens they hold, for the category and for its reworded versions.
- `npm run rate -- welfare-health 30` submits only the first 30. They include the anchors, so the report's checks on a sample show early whether the scale is sound. `stability` takes the same limit.

## Files

| Path | Holds |
|---|---|
| `categories/<category-id>.json` | The question, the two ends of the scale, the slots every record fills, the anchor records listed from the high end to the low end, and optionally a `weighing` rule that replaces the default one in the rater's instructions |
| `events/<category-id>.json` | For each legislature, the program changes of the period, each worded once |
| `key.json` | The name and legislature behind each blinded id, and the terms no record may contain |
| `packets/<category-id>/<subject-id>.json` | The evidence for one subject in one category |
| `rewordings/<category-id>/<version>.json` | One more wording of each record under test, with the same facts |
| `systems/<category-id>.json` | Optional. The policy figures that place each country's own system on a separate scale on the site; never sent to the rater. See [The site](#the-site) |
| `runs/<category-id>/comparisons.jsonl` | One saved answer per line |
| `runs/<category-id>/stability.jsonl` | One saved answer per line for the reworded versions |
| `runs/<category-id>/report.md` | Scores with names |
| `runs/<category-id>/spot-check.md` | Ten random pairs with no names or ids, for a human to judge |

## Writing evidence

Four rules keep a record's place on the scale from depending on how its evidence was written. `check` enforces the first three.

1. **Same slots for every record.** The category file lists the slots. A record fills each slot or names it in `emptySlots`, and the rater then reads "No recorded act" there. `check` refuses a record that does neither, or both.
2. **Same events for every record from one legislature.** The events file lists the program changes of the period for each legislature. Choose them by the size in the official cost estimate, before looking at how anyone voted. Every record from that legislature takes a stance on each one or names it in `noPosition` when it had neither a vote nor a stated position, and the rater then reads nothing for that event. `check` refuses a record that does neither, or both.
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

An item is either a stance on an event or a free item with its own slot, tier, text, and sources. A stance takes the event's slot and counts as an official act, unless it gives a `tier` of its own for a position the record stated or pressed for without a vote. Give a stance its own `sources` when the event's sources do not show how this subject acted.

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
- Use the same window for every subject: acts from 3 January 2025 onward. One exception: a national party's platform adopted before the window may serve as its baseline, but only alongside acts in the window that affirm or adjust it, and the record says which.
- When a subject has no usable evidence in a category, save `{ "items": [] }`. The subject is left out of the rating and listed in the report.
- Collect a record's own pushes for change, not only its stances on the events: bills it introduced or cosponsored, amendments it moved or voted for, motions it carried. A party out of government gets to vote only on what the government brings, so without these the rater sees its opponents' agenda instead of its own.

## Reading the report

`report.md` opens with three checks.

- **Anchors in order.** The anchors must come out in the order they were written. When they do not, the scale is not valid and the report withholds every score.
- **Agreement across orders.** Each pair is rated twice, once in each order. A low share means the rater's answers depend on presentation.
- **First-listed wins.** A share far from 50% means position bias.

Then compare the foreign parties' order with the Chapel Hill expert survey on the matching variable, such as `immigrate_policy` for immigration or `lrecon` for economics. The survey measures stated positions and the scale measures acts in the period, so single disagreements can be real. A run of reversals, especially between parties in and out of government, means the rater is scoring power to act rather than position: check the weighing and the opposition records before publishing.

Scores run from 0 at the low anchor to 100 at the high anchor. A subject can score outside that range.

Give `spot-check.md` to someone who has not opened `report.md` or `key.json`. They judge each pair, then open the rater's answer under it.

## Testing the wording

A record's score should come from its facts, not from how they were phrased. The stability test rates other wordings of the same record and measures how far the score moves.

- Each file in `rewordings/<category-id>/` is one version. Under `records` it gives, for each record it rewords, one text for each item of that record's packet, in the packet's order: the new text of an item, or the new stance where the item is a stance on an event. Under `events` it gives, by legislature, the new wording of each event those stances refer to, so a version still words each event once.
- A rewording keeps the slot, tier, and sources of the item it replaces. `check` refuses a rewording that contains a revealing term, changes the digits of a number, or repeats the original wording. It cannot check a number written as a word, so read those yourself.
- `npm run stability -- <category-id>` rates each reworded version against every other record's original, in both orders, with the model that rated the category. Its answers go to `stability.jsonl`, so the category's own run is not touched. It refuses to start until the category itself is fully rated.
- A reworded version's score is the one its record would have had with that wording in its place: the record's own comparisons are swapped for the version's and the scale is fitted again.
- A record fails when any version scores more than 10 points from the record's own score. The largest move between two runs of the pilot was 5 points, so the line sits at twice the noise seen so far.
- `report.md` lists each version's score. Nothing is shown or held back for a record until every one of its versions is fully rated.

The pilot rewords each of the 18 records on the page twice, which is 1,656 comparisons.

## The site

`npm run site` builds an overview, `dist/index.html`, and one self-contained page per published category, `dist/<category-id>/index.html`: every record placed by strength of support, and the evidence behind whichever record the reader selects.

- Support runs from bottom to top, and every record sits on that one scale. Side-to-side position means nothing: marks move sideways only where two would overlap, and each label sits to the right, joined to its mark by a line. Buttons above the chart light up one caucus, one country, or the US parties. A left-right position will become the horizontal axis once the project has its own measure of it.
- In the overview, each issue's column is one scale in the same way.
- A member or caucus shows its party's symbol when `key.json` gives it a `party` the page knows (Democratic or Republican). A party abroad shows its country's flag. A party whose `legislature` starts with `us-` is a US party: it shows its own symbol, filled and ringed, in a lane of its own.

- `site/categories.json` lists the issues the site plans to cover, in the order shown, and says which are published. Saving a run publishes nothing: a category reaches the site when its `published` is set to `true`. The others are dimmed in the overview and in each page's list of issues.
- The overview has one column per issue and marks each record's score in it. It leaves out the reference records.
- A page is built from the current packets and the saved run, so build it only when the two match.
- The build fails when the rating of a published category is unfinished or its anchors came out of order, for the same reason the report withholds scores.
- A record is held back from the page when its evidence is thin: a section marked `required` in the category file is empty, it has fewer than three official acts, or more than 15% of its pairs changed winner with the order shown. The page and the report both name each record held back and say why.
- A record is also held back when it fails the [wording test](#testing-the-wording). A record that passes shows a bar on its marker from its lowest to its highest score across wordings.
- When `superseded.jsonl` holds earlier answers and the anchors have not changed since, the page also shows each record's score before the latest change to the evidence.
- When a category has `systems/<category-id>.json`, its page adds a strip above the chart that places each country's own system on a separate 0 to 100 scale; selecting a country lights up its records. The file's `scope` names what the figures cover and opens the strip's note. Each figure lists its value for each OECD country it covers, with the year. A country's level scales each figure from 0 at the lowest value listed to 100 at the highest, averages the figures within each half, and averages the halves, so a half with more figures does not count for more. A country's `overrides` replace a listed value with its own sourced figure. The bar on each row runs from the lowest to the highest level across other reasonable choices: goalposts at the 5th and 95th percentiles or without the countries in `exclusion`, a geometric mean of the halves, the listed value in place of each override, and leaving out each figure in turn. The code is `src/systems.ts`.
- The stylesheet and the browser scripts are in `site/`; `dodge.js` is shared by both pages. `src/site.ts` inlines them.
- `wrangler.jsonc` serves `dist/` on uspolitics.frootsnoops.com. Cloudflare builds it with `npm run site -- welfare-health` and deploys with `npx wrangler deploy` on each push to `main`. The category in that build command is left from the one-page site and is ignored.
- A push to any other branch builds a preview of the page with `npx wrangler preview`, which needs the `previews` block in `wrangler.jsonc` even when it is empty. `preview_urls` gives each preview a public address on `workers.dev`, named after the branch; it takes effect at the next deploy from `main`.

## Changing things after a run has started

- Each saved answer records which version of its two records it was given. After you change a packet, an event, an anchor, or the question, `rate` moves the answers that no longer match into `superseded.jsonl` and submits only those pairs again. A change to the question or the prompt supersedes every answer.
- `stability` does the same with `stability-superseded.jsonl` when a rewording, or a record it was compared with, has changed.
- When you change what a packet says, change its rewordings to match. `check` catches a different number of items or a changed number, but not a changed fact.
- `report` refuses to run until every pair has a current answer.
- A run uses one model. `rate` refuses to add answers from a second model to an existing run.

## Limits

- The method comes from a preprint and has not been validated for this use.
- Blinding hides names. A rater that knows recent politics may still recognize a well-known act.
- A record's wording can show whether it describes a legislator or a governing party.
- The anchor records are drafts.
- The question is asked in one direction only.
