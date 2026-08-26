# Cool Computers Guide

This repository is the source for the Cool Computers user and developer guide.

The product website, pricing, legal pages, and live OpenAPI contract remain in the RuntimeVM repository. The guide links to those sources instead of copying them.

## Run locally

```sh
cd coolcomputerdocs
npm test
npm run dev
```

Open `http://localhost:3000`.

The local command omits generated endpoint pages because this Mac intercepts `*.cool.computer` certificates. Mintlify's hosted preview reads the live OpenAPI URL and includes those pages. Run `npm run dev:full` on a machine that trusts the public certificate path.

## Check a change

```sh
npm test
npm run validate
npm run check:links
```

Run `npm run validate:full` to include the hosted OpenAPI contract.

`npm test` checks navigation, local links, product facts, starter placeholders, and a short list of writing habits that make reference text vague or repetitive. It does not try to identify who wrote the text.
