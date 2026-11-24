# Agents

So, the setup for my agents are fully based on pstack created by Lauren Tan. As I mentioned before, it provides much better results, especially with Claude Sonnet 5.5 that was the main coding agent, although consumes more tokens because of the design process applied internally in this stack and then thorough self-review.

The idea behind my approach that we have one agent orchestrator that has our specification with architecture and product description, including UI flows we would like to provide to our user. This spec was created on my own with deeper explanation written by Claude and approved by me. Then, based on this specification and plan with phases, our orchestrator hands over everything to subagents which work in their own subtrees and could implement different phases or features in parallel. Then, the orchestrator merges them and resolved conflicts if there are any.

# Main prompts

There was one main chat to plan everything out and then I just handed over the spec to the main agent. Here they are:
```
Ok, what is considered good practices when developing this kind of loop and apps with agents that revolve around it (to explore what we should take into account)
```
```
Ok, let's keep the good practices you mentioned in mind and consider my following ideas:
- назвемо продукт postdog і стилізація буде подібна саме на щось середнє між постхогом і лініаром

The dashboard itself with task view and editor is similar to Linear, and in terms of available functionality such as task linking too

we could have a documentation in our dashboard which contains different data, e.g., written down by hand or created by transcribing our calls. This docs could contain some important data we have to remember. All agents should eat this documentation which provide extra context for how to handle tasks and other things

This is an idea for one more agent: to conduct review over our docs and recommend to mark some data as stale and keep our docs in touch

The agents should be able to communicate when there may be some conflict between them, e.g., when the first planner agent tries to gather information on what to do but some relevant tasks are already in work by the other agent

the second, decomposition, agent should have two regimes: the first is when it just recommends how to better decompose tasks. In UI we mark such tasks with an orange point meaninf it has smth to be reviewed. The second one is when we decompose everything and save automatically but also add a notification saying what has been done specifically with roll out if we don't agree with the choice made by our agent

We can change the regime in our settings

This agent could also ask some clarifying questions if it needs extra context for splitting tasks. But it mustn't stop completely if it has these clarifying questions for one task but nor for the other, I mean, it continues working on other tasks too. If some tasks could be related and end up as one task after decomposition, the agent should mark them as such

The user should be able to disable all ai features if requested from the setting view

The UI should be responsible and fit properly on the mobile, tablet and desktop layouts

The UI and its style should be similar to Linear. We should use Tailwind and shadcn/ui for building blocks of our UI

We must follow the feature sliced design on the frontend and the layered architecture on the express.js backend

Use swr for handling server state, react hook form for forms

Use drizzleorm along with sqlite and express.js. For sqlite use better-sqlite3, store its file directly in the repo and also initialize it with some placeholder data

Use langfuse to track and debug

And let's create a spec that i can hand over to other agents to work on
```

# Examples of bad ow weak agent results

Most of the time, the agents provided rather good results, because of the stack I mentioned before. But there are still quite a few problems with some implementation parts:
- agents implemented a very simple solution for triggering our product agents - with manual clicks. But I decided that it's better to have them activate also on schedule, because, e.g., you'd like to get today's planner in the morning automatically and don't wait for it to generate after a click
- state updates for our agent runs were implemented on page reload at first, but to improve UX I decided that it's better to use polling instead

# What to delegate to agents and what not

I didn't delegate to agents product and UX design, because most of the time their results there are not good enough. Also, every tech decision and concerns related to them were on my side, because I already have an optimal solution for these problems in my mind, including the architecture or how to implement frontend.