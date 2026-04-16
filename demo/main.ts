import { init } from 'pinflow';

init({ project: 'pinflow-dev-demo' });

// Tab switcher for install snippets
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset['tab'];
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll<HTMLPreElement>('[data-panel]').forEach((panel) => {
      panel.style.display = panel.dataset['panel'] === target ? 'block' : 'none';
    });
  });
});
