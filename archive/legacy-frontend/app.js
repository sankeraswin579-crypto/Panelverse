const dialog = document.querySelector('#projectDialog');
const nameField = document.querySelector('#projectName');
document.querySelector('#newProject').addEventListener('click', () => dialog.showModal());
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('#createProject').addEventListener('click', (event) => {
  if (!nameField.value.trim()) {
    event.preventDefault();
    nameField.focus();
    return;
  }
  event.preventDefault();
  const list = document.querySelector('.project-list');
  const row = document.createElement('div');
  row.className = 'project-row';
  const safeName = document.createElement('strong');
  safeName.textContent = nameField.value.trim();
  const info = document.createElement('div');
  info.className = 'project-info';
  info.append(safeName);
  const sub = document.createElement('small');
  sub.textContent = 'Design team · Created just now';
  info.append(sub);
  const symbol = document.createElement('div');
  symbol.className = 'project-symbol symbol-lilac';
  symbol.textContent = '✳';
  const progress = document.createElement('div');
  progress.className = 'project-progress';
  progress.innerHTML = '<div class="progress-meta"><span>Progress</span><b>0%</b></div><div class="progress-track"><i style="width:0%"></i></div>';
  const status = document.createElement('span');
  status.className = 'status in-progress';
  status.textContent = 'Just started';
  row.append(symbol, info, progress, status);
  list.prepend(row);
  dialog.close();
  nameField.value = '';
});
