# Cool Computers Guide instructions

## About this project

- This repository is the one source for the Cool Computers user and developer guide.
- The RuntimeVM repository owns the product website, legal and pricing pages, and the live OpenAPI contract.
- `docs.json` controls navigation and Mintlify settings.
- Every content page is an MDX file with YAML frontmatter.

## Product language

- Lead with the computer and its address.
- Say "computer," not "sandbox," "VM," "instance," or "workspace."
- Use a concrete name such as `bakery` in examples.
- Write `name.cool.computer` for the public address and `name@mail.cool.computer` for the inbox.
- Describe current behavior only. Do not announce planned tools, prices, limits, or security controls.
- The MCP preview has two read-only tools: `runtime_whoami` and `runtime_list_computers`. Use HTTP or the CLI for changes.

## Style preferences

- Use active voice and second person.
- Keep one idea in each sentence.
- Use sentence case for headings.
- Bold for UI elements: Click **Settings**.
- Use code formatting for file names, commands, paths, and code references.
- Prefer exact examples over claims about importance or quality.
- Do not use canned introductions, conclusions, vague attribution, grand claims, or editorial asides.
- Do not add a note that content was generated or assisted by a model.

## Source boundaries

- Link to the product website for pricing, privacy, terms, contact, and marketing pages. Do not copy those pages here.
- Link to `https://www.cool.computer/openapi.json` for the API contract. Do not commit another copy.
- Check RuntimeVM code or its public content before changing a factual claim.
- Do not document internal infrastructure or unpublished work.

## Checks

Run `npm test` after editing content. Run `npm run validate` before pushing a publication change.
