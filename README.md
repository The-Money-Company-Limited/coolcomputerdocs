# Cool Computer Services

This repository is the source for the official [Cool Computers user and developer guide](https://cool.computer/docs).

[Cool Computers](https://www.cool.computer) provides persistent Linux computers with their own addresses and inboxes. Start with the [developer-resource index](https://www.cool.computer/docs.md) for the guide, native CLI, authentication, agent instructions, and live HTTP API contract.

The product website, pricing, legal pages, and live OpenAPI contract remain in the RuntimeVM repository. The guide links to those sources instead of copying them.

## Run locally

From the repository root:

```sh
npm ci
npm test
npm run dev
```

Open `http://localhost:3000`.

The default local command omits generated endpoint pages. Run `npm run dev:full` to include endpoint pages from the live OpenAPI URL, as Mintlify's hosted preview does.

## Check a change

```sh
npm test
npm run validate
npm run check:links
```

Run `npm run validate:full` to include the hosted OpenAPI contract.

`npm test` checks navigation, local links, product facts, starter placeholders, and a short list of writing habits that make reference text vague or repetitive. It does not try to identify who wrote the text.
