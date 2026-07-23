---
'pinflow': patch
---

Vue wrapper: forward the full `PinflowConfig` to `init()`. The `<Annotator>` component previously declared an enumerated props subset, silently dropping `theme`, `source`, `onChange`, `routeKey`, `describeRoute`, and `submitTo` for Vue consumers. All config keys now pass through; `onChange` maps from a new `changeHandler` prop (same rename convention as `submitHandler`, since Vue reserves `on*`-prefixed props for `v-on` listeners). `theme` and `submitTo` are snapshotted at init like the other object props.
