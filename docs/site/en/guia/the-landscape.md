---
title: The landscape
description: Why Hyperion makes your AI's work visible, preserves decisions and evidence, and lets you guide the process.
---

<p class="landscape-eyebrow">WHY HYPERION</p>

# A landscape for your AI’s work

When AI stops only answering and starts acting, you need a landscape — not only a chat.

Hyperion turns a request into a visible process: the agent runs what is ready; you decide; the evidence remains.

## Why Hyperion exists

Asking for an explanation and assigning work are different activities. An answer may be complete once you read it. Preparing a proposal, reviewing documents or producing a deliverable requires gathering information, making decisions, using tools and checking results. If you also need to approve something before the next step, the path matters as much as the final answer.

Chat helps you explore ideas, express nuance and change direction. But a thread mixes requests, possibilities, results and decisions. To find where work stands, you end up reconstructing that mixture: was this a suggestion or a finished step? Which version did I review? Is the agent waiting for my input or working? This problem can arise even when each individual message is clear.

Hyperion exists to make that shared state explicit. The agent proposes a process from your objective; Hyperion preserves its steps, checks state changes and presents the decisions that belong to you. You can guide the work and examine its records without relying solely on the agent's later summary.

## What “landscape” means

A landscape helps you find your bearings: where you are, what lies ahead and which paths depend on others. In Hyperion, that landscape is the visible process map. Jobs group steps; steps distinguish agent actions, information you need to supply and approvals. Connections explain what must happen before work can continue.

The map answers practical questions: what is ready, what is waiting, who needs to act and what result each step produced. You can see the whole and open details when needed. Its value depends on states representing process records: a moving diagram, by itself, does not demonstrate execution.

The [home page](/en/) illustrates the move from conversation to workflow. In real work, chat remains useful for expressing the objective; the canvas provides a stable place to follow it and participate.

## From problems to design choices

### A visible map to understand the order

A task list can say what to do without explaining why a task is waiting. Hyperion preserves dependencies: preparing a final version may depend on reviewing a draft, and that review on receiving the draft. This distinguishes pending work from work that can already begin. The agent can only record the start of an eligible step; a ready task still needs an agent to execute it.

If you change the scope during an activity, the agent can propose an explicit revision of future work. Hyperion preserves history and pauses the workflow so you can review the change before resuming. The reason is to let you change direction without rewriting what happened or treating a new proposal as implicit permission.

### Inputs and outputs to retain what was agreed

“Use the budget we discussed” requires searching and interpreting a conversation. Declaring the budget as a task input and linking it to your answer makes the required data explicit. Required outputs state what a step must deliver to enable its successor. Hyperion validates their presence and type against the contract; it does not determine whether the budget is sensible or the content is correct.

The benefit is concrete: the next phase receives identifiable data, and you can review what was used. Shared context helps explain the activity but does not replace required inputs. The [usage guide](./usar-el-flujo) shows how to inspect those values.

### Explicit decisions to preserve your involvement

An agent saying “I'll carry on” does not establish whether you authorized the next step. A separate approval makes clear what you are reviewing and what your answer will enable. Human questions include context and the subsequent action; known choices can appear as concrete options. The person responds on the canvas. The agent cannot approve on their behalf, and silence does not count as consent.

### Evidence attached to the step so you can review it

“Done” tells you little if you cannot inspect the result. Logs describe public actions and observations; outputs hold data; artifacts let you open registered deliverables and associate them with the attempt that produced them. Retrying a step preserves earlier history. This helps you examine what changed and distinguish an intention from a reported result.

### Saved state to return with context

A pause can outlast a chat turn. Hyperion saves the process so the agent can read decisions, results and eligible work again using the workflow's link or identifier. There is no need to reconstruct everything from thread memory. Preserving that state and getting an AI application to execute again are different capabilities; the available connection determines how work resumes.

## Who does what

- **The model, within the agent**, interprets the objective and proposes an approach. The agent uses its tools to perform the work and reports results.
- **Tools** enable reading, searching, editing or acting within the environment's permissions. Connecting tools, for example through MCP, does not by itself define the process or its approvals.
- **Hyperion** validates and preserves the recorded process: dependencies, data, states, decisions and history. It is not the model writing your proposal or the executor of every tool.
- **You** supply missing information, review results and make human decisions. The process should show what needs your attention and what happens next.

This separation allows a process contract independent of the provider. It does not mean every application has the same capabilities or permissions: consult [integrations](./integraciones) to choose a suitable connection.

## You in the loop

Participating should not require watching every tool call. The process places your involvement where it is needed: supplying information, judging a proposal or authorizing the next step. While an approval is pending, work that depends on it remains blocked; other independent tasks may still be eligible.

<LandscapeLoop />

## An example: preparing a workshop proposal

Imagine asking: “Use Hyperion to prepare a workshop proposal for my team. I want to review the draft before you prepare the final version.” This is an example of working with documents; it does not imply sending invitations or booking anything.

1. **Establish what is needed.** The agent creates the workflow with the original request. If duration, audience or budget are missing, it asks for them in a human step on the canvas. Your answers become inputs to the work that follows.
2. **Prepare the draft.** With those inputs, the agent performs the work through its tools. It records sources consulted, unresolved assumptions and the draft as a deliverable. Hyperion displays what the agent reports.
3. **Review before proceeding.** You open the draft from its step. The approval explains that accepting it will enable preparation of the final version. While you decide, that final step remains blocked. Rejecting the proposal leaves the workflow rejected; no approval is fabricated and nothing is sent.
4. **Return after a pause.** You can decide later. If the chat is already idle, your answer remains saved: return to the chat with the workflow continuation so the agent can read the state. There is no need to repeat the budget or pretend the agent worked during the wait.
5. **Finish with a result you can inspect.** After your approval and with the agent active, it prepares and registers the final version. You can compare the result with the approved draft. The objective ends with that document; sending it would require an explicit request and work.

The value appears at each handoff: inputs inform the draft, the draft informs your decision and the decision enables subsequent work. You do not need to design the technical contract: the agent proposes it from your request.

## What the record guarantees and where it stops

Hyperion validates the operations it receives against the recorded process. It is not an agent sandbox: it cannot prevent a program from acting outside the protocol. Environment permissions and the agent's cooperation remain necessary.

Evidence contains only what is submitted. Hyperion does not automatically observe every tool or verify the truth of every claim. An attached file makes a result available for review, but its existence does not prove correctness. A “running” state or animation does not certify that the agent is still active either.

MCP does not wake any arbitrary chat session. A cooperative wait can receive your decision while it remains open; after the turn ends, automatic resumption requires a real connector and application capabilities. Read [pause and resumption](./reanudacion) and the [current limits](../referencia/limites) to distinguish preserved state from available execution.

## When it adds value

Hyperion helps when work has several phases, data that must pass between tasks, results to review or decisions that determine what happens next. It also helps when you want to return later and understand where work stopped. The map earns its place when it reduces the effort of coordinating and reviewing.

A short question, a one-off translation or exploring an idea can be handled in your usual AI chat, without invoking Hyperion. They do not need a workflow just because AI is involved. Hyperion makes sense when an objective requires a path you want to see and guide.

<div class="landscape-cta">

[Start with your first workflow](./primeros-pasos){.landscape-cta-primary}
[Download Hyperion](/en/#download-hyperion){.landscape-cta-secondary}

</div>
