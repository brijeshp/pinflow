export const STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color-scheme: light dark;
}
* { box-sizing: border-box; }

.root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
}

.control {
  position: fixed;
  pointer-events: auto;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.08);
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.15s ease;
}
.control:hover { transform: translateY(-1px); }
.control[data-active="true"] {
  background: #2563eb;
}
@media (prefers-color-scheme: light) {
  .control { background: #111827; }
}

.panel {
  position: fixed;
  pointer-events: auto;
  min-width: 260px;
  max-width: 320px;
  background: #ffffff;
  color: #0f172a;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 16px 48px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08);
  font-size: 13px;
  line-height: 1.45;
}
@media (prefers-color-scheme: dark) {
  .panel { background: #0f172a; color: #e2e8f0; }
}
.panel h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.panel p { margin: 0 0 12px; opacity: 0.75; }
.panel .row { display: flex; gap: 8px; }
.panel button {
  flex: 1;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(15,23,42,0.12);
  background: #f8fafc;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.panel button.primary { background: #2563eb; color: #fff; border-color: transparent; }
.panel button:hover { filter: brightness(0.97); }

.pin {
  position: fixed;
  pointer-events: auto;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(37,99,235,0.35), 0 0 0 2px #fff;
  cursor: pointer;
  transform: translate(-50%, -50%) scale(0);
  animation: pop 0.18s ease forwards;
  transition: transform 0.12s ease;
}
.pin:hover { transform: translate(-50%, -50%) scale(1.08); }
.pin[data-orphaned="true"] { background: #a3a3a3; }

@keyframes pop {
  to { transform: translate(-50%, -50%) scale(1); }
}

@media (max-width: 640px) {
  .pin { width: 32px; height: 32px; font-size: 13px; }
}

.input {
  position: fixed;
  pointer-events: auto;
  min-width: 240px;
  max-width: 320px;
  background: #ffffff;
  color: #0f172a;
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 12px 32px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08);
}
@media (prefers-color-scheme: dark) {
  .input { background: #0f172a; color: #e2e8f0; }
}
.input textarea {
  width: 100%;
  min-height: 64px;
  max-height: 160px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}
.input .actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.7;
}
.input .delete {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
  font: inherit;
  padding: 0;
}
.input .delete:hover { opacity: 1; color: #dc2626; }

.name-prompt {
  position: fixed;
  pointer-events: auto;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #ffffff;
  color: #0f172a;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(15,23,42,0.25);
  min-width: 280px;
}
@media (prefers-color-scheme: dark) {
  .name-prompt { background: #0f172a; color: #e2e8f0; }
}
.name-prompt h3 { margin: 0 0 12px; font-size: 14px; }
.name-prompt input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(15,23,42,0.18);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
}
.name-prompt .actions { display: flex; gap: 8px; margin-top: 12px; }
.name-prompt button {
  flex: 1;
  min-height: 36px;
  border-radius: 8px;
  border: 0;
  cursor: pointer;
  font: inherit;
}
.name-prompt button.primary { background: #2563eb; color: #fff; }
.name-prompt button.secondary { background: rgba(15,23,42,0.06); color: inherit; }

.drawer {
  position: fixed;
  bottom: 16px;
  left: 16px;
  pointer-events: auto;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 12px;
  padding: 14px;
  min-width: 240px;
  max-width: 320px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.25);
  font-size: 12px;
}
.drawer h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.drawer label { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.drawer .bar { display: flex; gap: 6px; margin-top: 10px; }
.drawer button {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 0;
  background: #f8fafc;
  color: #0f172a;
  font: inherit;
  cursor: pointer;
}
.drawer button.danger { background: #dc2626; color: #fff; }
`;
