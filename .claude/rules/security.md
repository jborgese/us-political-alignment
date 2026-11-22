# Security Standards

Apply whenever code takes input, checks identity, touches data or secrets, reports an error, adds a dependency, or changes CI. A framework rule, where the repo has one, says how to apply these in that framework.

This repo's enforcement points: every input file is validated by the Zod schemas in `src/files.ts`; `findSetProblems` in `src/ratingSet.ts` is the gate that blocks a rating run, and `rateCategory` fails closed on it before any API call; `src/comparisons.ts` is the only place that builds text sent to the model; secrets come from the environment (`.env`, git-ignored), and the repo commits no env file except `.env.example`.

## Trust Boundaries

- **The server decides.** Hidden buttons, client-side route guards, and form validation protect nothing, because the user controls the client. Every entry point is private unless it is public on purpose, and checks on the server, on every request, who the caller is and whether they may do this action to this record.
- **When the client talks to the data store directly**, as with a hosted backend, the store's access rules are the server. Turn them on for every table or collection, write them for the record's owner, and test them as a different user.
- **Take identity from the session or a verified token, never from a field the client can edit.** Re-derive on the server anything a decision rests on: user, role, tenant, ownership, prices, and totals.
- **Validate input where it enters** against a schema, and reject what fails.
- **Keep data and commands separate.** Bind SQL parameters, pass process arguments as a list, let the framework escape output, and never build a file path or a URL to fetch from raw user input.
- **Use the framework's sign-in, sessions, and cryptography, or a vetted library.** Do not write your own, and do not switch off a protection (CSRF, CORS, TLS verification, output escaping) to make an error go away.

## Secrets And Configuration

- **Secrets live in the environment or a secret manager**, never in source, config, fixtures, tests, logs, or anything the browser downloads. `.env` files stay out of git; `.env.example` stays in, with a placeholder for every variable the code reads.
- **A secret that reached a commit, a log, a ticket, or a chat is leaked.** Say so and ask the user to rotate it; rewriting history does not undo the exposure.
- **Handle secret values only as far as the task needs.** Work from `.env.example` and variable names. Do not open `.env` files, key files, or credential stores, or repeat a value in chat, a commit, or a pull request, unless the task the user asked for requires it.
- **Production is not development.** No default credentials, debug modes, sample data, or open admin endpoints in production configuration, and the least access that works for every database user, key, token, and bucket.

## Errors And Logs

- **Clients get a generic message; the server log gets the detail.** No stack traces, query text, file paths, or upstream responses in anything a user can see.
- **Fail closed on access decisions.** When the check that decides whether a request is allowed fails or cannot run, refuse the request.
- **Logging and a central error handler belong in the first slice of a service**, not in a later hardening pass.
- **Log what an investigator needs:** when, where, who (by ID), and what, for sign-ins and failed sign-ins, refused access, rejected input, privileged or destructive actions, and failed calls to the database and other services. Never log passwords, tokens, session IDs, connection strings, or full request bodies.

## Dependencies And CI

- **Check that a package is real before proposing it.** Agents invent plausible package names, and attackers register them. Confirm the exact name on the registry and that it is the maintained, widely used project.
- **The lockfile is committed, and CI installs from it** with the package manager's frozen-lockfile command.
- **Do not weaken a protection to get a step to pass.** Ask before allowing a dependency's install scripts, bypassing a release-age delay, installing from a git URL or tarball, or ignoring a scanner finding.
- **In CI workflows**, pin third-party actions to a full commit SHA, give the token the least permissions that work, and never interpolate pull-request text into a shell step.
