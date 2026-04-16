# docs/

Marketing and documentation assets referenced from the root README.

## `demo.gif`

The primary demo recording shown at the top of the README. Not yet committed.

To regenerate:

```bash
# From repo root
pnpm build
pnpm --filter pinflow-demo dev

# In another terminal, record the annotation flow with your tool of choice.
# Target: ~10 seconds, under 2 MB.
```

Save the output as `docs/demo.gif`.
