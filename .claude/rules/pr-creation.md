# PR Template

When creating **or updating** a pull request description, always use the repo's PR template at `.github/pull_request_template.md`. Read it first and keep its headings, in this order:

1. `### **Ticket:**`: the ticket key with a hyperlink to the ticket, or "N/A" for chores with no ticket.
2. `### Changes`, containing:
   - `#### Affected Resources:`: keep the **entire** checklist. Check relevant boxes with `[x]` and leave the rest unchecked `[ ]`. If the change touches an area the list does not include, add it.
   - `#### Details:`: concise, specific bullets, not a changelog dump. Stick to a sentence or less per item where possible.
3. `### Testing`: how you verified the change. It can be as simple as "deployed to a dev environment and tested manually".

If the template omits a heading (e.g. no `### **Ticket:**` in a repo without a tracker), follow the template rather than this list.
