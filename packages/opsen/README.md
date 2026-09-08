# @vibe-kit/opsen

Run VibeKit agents on [opsen](https://opsen.dev) — with machine, model and
tool spend on one bill and a budget enforced mid-run.

## Installation

```bash
npm install @vibe-kit/opsen
```

## Usage

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createOpsenProvider } from "@vibe-kit/opsen";

const opsen = createOpsenProvider({
  apiKey: process.env.OPSEN_API_KEY!,
  taskId: "code-review",
  budgetUsd: 2.0,
});

const vibeKit = new VibeKit()
  .withAgent({
    type: "grok",
    provider: "xai",
    apiKey: process.env.XAI_API_KEY!,
    model: "grok-4",
  })
  .withSandbox(opsen);

const result = await vibeKit.generateCode({ prompt: "Fix the failing test" });
```

Get an API key at https://opsen.dev/keys

## Why another sandbox provider

Every sandbox in the current list bills for the machine and leaves the
model bill with a different vendor. VibeKit takes the model provider and
key separately from the sandbox, so a team running Grok on a sandbox holds
two bills with no shared identifier between them.

opsen sits in both paths:

```typescript
await instance.cost();
// { total_usd: 0.41, compute_usd: 0.02, tokens_usd: 0.39,
//   calls: 34, task_id: "code-review" }
```

`budgetUsd` is a ceiling enforced during the run — an agent that would
cross it is refused mid-flight rather than found on an invoice.

The agent type is recorded as a label when the session starts, so "which
agent cost what" stays answerable across grok, claude, codex, gemini and
opencode.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | — | Required. From opsen.dev/keys |
| `taskId` | `vibekit-{agent}` | Groups this agent's spend |
| `budgetUsd` | none | Hard cap, enforced mid-run |
| `labels` | `{}` | Arbitrary tags to group spend by |
| `runtime` | `auto` | `auto`, `e2b`, `modal`, or your own machines |
| `baseUrl` | `https://opsen.dev` | For self-hosted deployments |

## Note on `getHost`

Port exposure depends on the runtime underneath. It works on E2B, works on
Modal when the port was declared at sandbox creation, and throws with a
message naming the limitation where unavailable — rather than returning a
URL that does not answer.

## License

MIT
