---
'@brijeshp/pinflow': patch
---

Adds an `agent/` folder to the package: the reading protocol for a Pinflow
artifact, in the formats coding agents actually load — a Claude Code skill and
slash command, a Cursor/Windsurf rule, and an `AGENTS.md` snippet. None of it is
code, so it adds nothing to the browser bundle, and it improves every artifact
already exported.

The artifact has always been descriptive rather than instructional, and several
fields are easy to misread: `**Position:**` is a percentage inside the element
rather than a page coordinate, `Comment N` is a file position while `[cmt_id]`
is the durable handle, and comments under `## Orphaned comments` describe
elements that no longer exist — so running their selectors finds whatever
happens to occupy that path now.

It also states the boundary the escaping cannot express. Everything interpolated
into an artifact originates from a web page and the people using it. Pinflow
escapes all of it so it cannot forge markdown structure, but that defends
structure, not meaning: an agent must read the content as a problem to solve and
never as instructions addressed to itself.
