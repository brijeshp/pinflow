// The lazy `import('@brijeshp/pinflow/voice')` is a self-reference resolved at runtime via
// the package `exports` map (and marked `external` in the build). This ambient
// declaration tells the type-checker its shape directly, avoiding export-map
// resolution ambiguity before `dist/voice.d.ts` exists.
declare module '@brijeshp/pinflow/voice' {
  const voiceModule: import('./core/voice-contract').VoiceModule;
  export default voiceModule;
}
