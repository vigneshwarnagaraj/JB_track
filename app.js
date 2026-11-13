/* Applications are held in memory until the user exports a backup. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const statuses = ['Applied', 'Interviewing', 'Offer received', 'Rejected', 'Withdrawn', 'Accepted'];
  const statusOf = row => statuses.includes(row.status) ? row.status : 'Applied';
  const statusTime = row => Date.parse(row.status_updated_at) || 0;
  let applications = [];
  let saving = false;
  let dirty = false;
  let handle = null;
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dateFromKey = key => new Date(`${key}T12:00:00`);
  const displayDate = key => dateFromKey(key).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeLink = value => {try {const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null;} catch {return null;}};
  function message(text, error = false) {$('message').textContent = text; $('message').hidden = !text; $('message').className = `message${error?' error':''}`;}
  function navigate() {
    const selected = ['home','new','applications'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    document.querySelectorAll('.page').forEach(page => page.hidden = page.id !== selected);
    document.querySelectorAll('nav a').forEach(link => link.classList.toggle('active',link.dataset.page === selected));
    $('breadcrumb').textContent = {home:'Overview',new:'New application',applications:'All applications'}[selected];
    document.title = `${$('breadcrumb').textContent} — Chapter`;
  }
  function updateClock() {
    $('application-date').value = localDate();
    $('today-label').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  }
  function empty(title, copy, action = '') {return `<div class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;}
  function recentRow(a) {return `<a class="recent-row" href="#applications"><span class="company-avatar">${esc(a.company.slice(0,1).toUpperCase())}</span><div><strong>${esc(a.company)}</strong><small>${esc(a.position)}${a.location?' · '+esc(a.location):''}</small></div><time datetime="${esc(a.application_date)}">${displayDate(a.application_date)}</time><span aria-hidden="true">↗</span></a>`;}
  function render() {
    const today = localDate();
    const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay()+6)%7);
    const thisWeek = localDate(monday);
    const values = [applications.length, applications.filter(a => a.application_date === today).length, applications.filter(a => a.application_date >= thisWeek && a.application_date <= today).length, new Set(applications.map(a=>a.company.trim().toLowerCase())).size];
    ['total','today-count','week-count','companies'].forEach((id,i)=>$(id).textContent=values[i]);
    $('nav-count').textContent=applications.length;
    const days = Array.from({length:7},(_,i)=>{const d = new Date();d.setDate(d.getDate()-6+i);const key=localDate(d);return {date:d,key,count:applications.filter(a=>a.application_date===key).length};});
    const max = Math.max(1,...days.map(d=>d.count));
    $('chart').innerHTML = days.map(d=>`<div class="chart-column"><b>${d.count}</b><div class="bar-space"><div class="bar" style="height:${Math.max(2,d.count/max*125)}px" title="${esc(d.key)}: ${d.count} applications"></div></div><small>${d.date.toLocaleDateString('en-US',{weekday:'short'})}</small></div>`).join('');
    $('recent').innerHTML = applications.length ? applications.slice(0,4).map(recentRow).join('') : empty('A fresh start, full of possibilities','Add an application or open an existing backup.','<a href="#new">Add your first application ↗</a>');
    renderStatusCounts();
    renderList();
  }
  function renderStatusCounts() {
    const counts = new Map(statuses.map(status => [status, 0]));
    for (const row of applications) {
      const status = statusOf(row);
      counts.set(status, counts.get(status) + 1);
    }
    $('status-counts').innerHTML = [...counts].map(([status,count]) =>
      `<div><dt>${status}</dt><dd>${count}</dd></div>`).join('');
  }

  function statusControl(row) {
    return `<label class="status-control">Job status
      <select class="job-status" data-id="${esc(row.id)}" aria-label="Job status for ${esc(row.company)} — ${esc(row.position)}">
        ${statuses.map(status => `<option${status === statusOf(row) ? ' selected' : ''}>${status}</option>`).join('')}
      </select></label>`;
  }

  function renderList() {
    const query = $('search').value.trim().toLowerCase();
    const filtered = applications.filter(a=>[a.company,a.position,a.location].some(v=>(v||'').toLowerCase().includes(query)));
    if (!filtered.length) {$('application-list').innerHTML=empty(query?'No matching applications':'No applications yet',query?'Try a different company, position, or location.':'Save an application to start your timeline.',query?'':'<a href="#new">New application ↗</a>');return;}
    const groups = new Map(); filtered.forEach(a=>{if(!groups.has(a.application_date))groups.set(a.application_date,[]);groups.get(a.application_date).push(a);});
    $('application-list').innerHTML=[...groups].map(([date,rows])=>`<section class="date-group"><h2 class="date-group-title"><time datetime="${esc(date)}">${displayDate(date)}</time><small>${rows.length} application${rows.length===1?'':'s'}</small></h2>${rows.map((a,i)=>`<div class="application-entry">${applicationDetail(a,i)}${statusControl(a)}</div>`).join('')}</section>`).join('');
  }
  function applicationDetail(a,i) {
    const field=(label,value)=>`<div><div class="detail-label">${label}</div><div class="detail-value">${esc(value||'Not provided')}</div></div>`;
    const link=safeLink(a.job_link);
    return `<details class="application"><summary><span class="number">${i+1}.</span><span class="company-avatar">${esc(a.company.slice(0,1).toUpperCase())}</span><span><strong>${esc(a.company)}</strong><small>${esc(a.position)}${a.location?' · '+esc(a.location):''}</small></span></summary><div class="application-body"><div class="detail-grid">${field('Company name',a.company)}${field('Position',a.position)}${field('Location',a.location)}${field('Application date',displayDate(a.application_date))}${field('Salary',a.salary)}<div><div class="detail-label">Job link</div><div class="detail-value">${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(a.job_link)} ↗</a>`:'Not provided'}</div></div><div><div class="detail-label">Resume used</div><div class="detail-value">${a.resume?`<button class="button secondary open-resume" data-id="${esc(a.id)}">Download ${esc(a.resume.name)} ↗</button>`:'Not provided'}</div></div></div><div class="detail-block">${field('Job description',a.description)}</div>${(a.questions||[]).length?`<div class="detail-block"><div class="detail-label">Additional details</div>${a.questions.map(q=>`<div class="question-detail">${field('Question',q.question)}<br>${field('Response given',q.response)}</div>`).join('')}</div>`:''}</div></details>`;
  }
  function mergeRows(rows) {
    const merged = new Map(applications.map(row => [row.id, row]));
    for (const row of rows) {
      const current = merged.get(row.id);
      if (!current) merged.set(row.id, row);
      else if (statusTime(row) > statusTime(current)) {
        merged.set(row.id, {...current, status:statusOf(row), status_updated_at:row.status_updated_at});
      }
    }
    applications = [...merged.values()].sort((a,b) =>
      b.application_date.localeCompare(a.application_date) || b.created_at.localeCompare(a.created_at));
  }

  function parseBackup(text) {
    const backup = JSON.parse(text);
    if (backup.format !== 'chapter-backup-v1' || !Array.isArray(backup.applications)) {
      throw new Error('Choose a Chapter backup JSON file.');
    }
    const fields = ['id','company','position','location','application_date','salary','job_link','description','created_at'];
    for (const row of backup.applications) {
      if (!row || fields.some(field => typeof row[field] !== 'string') ||
          !row.id || !row.company || !row.position ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row.application_date) ||
          Number.isNaN(dateFromKey(row.application_date).valueOf()) ||
          !Array.isArray(row.questions) || row.questions.some(q =>
            !q || typeof q.question !== 'string' || typeof q.response !== 'string') ||
          (row.resume !== null && (!row.resume || typeof row.resume.name !== 'string' ||
            typeof row.resume.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(row.resume.data)))) {
        throw new Error('This backup contains an invalid application.');
      }
    }
    return backup.applications;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function openBackup(file, openedHandle = null) {
    if (saving) return;
    saving = true;
    try {
      const rows = parseBackup(await file.text());
      const saved = new Map(rows.map(row => [row.id, row]));
      mergeRows(rows);
      dirty = applications.some(row => {
        const previous = saved.get(row.id);
        return !previous || statusOf(row) !== statusOf(previous) || statusTime(row) !== statusTime(previous);
      });
      handle = openedHandle;
      render();
      $('backup-state').textContent = dirty ? 'Merged backup. Sync to save all applications.' : 'Backup opened: ' + file.name;
      message('Backup opened. Existing applications on this page were kept.');
    } catch (error) {
      message('Could not open backup. ' + error.message, true);
    } finally {
      saving = false;
    }
  }

  $('open-backup').addEventListener('click', async () => {
    if (saving) return;
    if (!window.showOpenFilePicker) {
      $('backup-file').click();
      return;
    }
    try {
      const [selected] = await window.showOpenFilePicker({types:[{description:'Chapter backup',accept:{'application/json':['.json']}}]});
      await openBackup(await selected.getFile(), selected);
    } catch (error) {
      if (error.name !== 'AbortError') $('backup-file').click();
    }
  });

  $('backup-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (file) await openBackup(file);
    event.target.value = '';
  });

  $('sync').addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    let writable;
    try {
      if (!handle && window.showSaveFilePicker) {
        handle = await window.showSaveFilePicker({suggestedName:'chapter-backup.json',types:[{description:'Chapter backup',accept:{'application/json':['.json']}}]});
      }
      // Merge the current contents before writing so an older open tab cannot erase records.
      if (handle) {
        writable = await handle.createWritable({mode:'exclusive'});
        const file = await handle.getFile();
        if (file.size) mergeRows(parseBackup(await file.text()));
      }
      const blob = new Blob([JSON.stringify({format:'chapter-backup-v1',applications})],{type:'application/json'});
      if (handle) {
        await writable.write(blob);
        await writable.close();
        dirty = false;
        message('Backup saved to ' + handle.name + '.');
        $('backup-state').textContent = 'Saved to ' + handle.name;
      } else {
        download(blob, 'chapter-backup-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json');
        message('Backup download started. Keep the downloaded JSON file and open it next time.');
        $('backup-state').textContent = 'Backup download started. Verify the file in Downloads.';
      }
      render();
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      if (error.name !== 'AbortError') message('Sync failed. Applications are still on this page. ' + error.message, true);
    } finally {
      saving = false;
    }
  });

  $('application-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if (saving) return;
    const form=event.currentTarget;const data=new FormData(form);const file=$('resume').files[0];
    const company=String(data.get('company')).trim(),position=String(data.get('position')).trim();
    if(!company||!position){message('Please enter a company name and position.',true);return;}
    const jobLink=String(data.get('job_link')).trim();
    if(jobLink&&!safeLink(jobLink)){message('Use an http:// or https:// job link.',true);return;}
    if(file&&(file.size>10*1024*1024||! /\.(pdf|doc|docx)$/i.test(file.name))){message('Choose a PDF, DOC, or DOCX resume up to 10 MB.',true);return;}
    const questions=[...document.querySelectorAll('.question-pair')].map(pair=>({question:pair.querySelector('[name=question]').value.trim(),response:pair.querySelector('[name=response]').value.trim()}));
    saving = true;
    $('save-button').disabled = true;
    const applicationDate = localDate();
    try {
      let resume = null;
      if (file) {
        const data = await new Promise((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        resume = {name:file.name,data};
      }
      mergeRows([{
        id:crypto.randomUUID(), company, position, application_date:applicationDate,
        created_at:new Date().toISOString(), location:String(data.get('location')).trim(),
        salary:String(data.get('salary')).trim(), job_link:jobLink,
        description:String(data.get('description')).trim(), questions, resume
      }]);
      dirty = true;
      form.reset();
      $('questions').replaceChildren();
      $('file-name').textContent = '';
      $('backup-state').textContent = 'Unsaved applications. Press Sync to save your backup.';
      message('Application added. Press Sync to save it to your computer.');
      render();
      location.hash = 'applications';
    } catch (error) {
      message('Could not add the application. ' + error.message, true);
    } finally {
      saving = false;
      $('save-button').disabled = false;
    }
  });
  $('add-question').addEventListener('click',()=>{
    const div=document.createElement('div');div.className='question-pair';
    div.innerHTML='<button type="button" class="remove-question" aria-label="Remove this question">×</button><label>Question<input name="question" required maxlength="5000" placeholder="What did the application ask?"></label><label>Response given<textarea name="response" required rows="3" maxlength="20000" placeholder="The answer you submitted…"></textarea></label>';
    div.querySelector('button').addEventListener('click',()=>div.remove());$('questions').append(div);div.querySelector('input').focus();
  });
  $('resume').addEventListener('change',()=>{$('file-name').textContent=$('resume').files[0]?.name||'';});
  $('application-list').addEventListener('change', event => {
    const control = event.target.closest('.job-status');
    if (!control) return;
    const row = applications.find(application => application.id === control.dataset.id);
    if (!row) return;
    if (saving || !statuses.includes(control.value)) {
      control.value = statusOf(row);
      return;
    }
    if (statusOf(row) === control.value) return;
    row.status = control.value;
    row.status_updated_at = new Date(Math.max(Date.now(), statusTime(row) + 1)).toISOString();
    dirty = true;
    $('backup-state').textContent = 'Unsaved status changes. Press Sync to save your backup.';
    renderStatusCounts();
  });

  $('application-list').addEventListener('click', event => {
    const button = event.target.closest('.open-resume');
    const resume = button && applications.find(row => row.id === button.dataset.id)?.resume;
    if (!resume) return;
    const bytes = Uint8Array.from(atob(resume.data), char => char.charCodeAt(0));
    download(new Blob([bytes],{type:'application/octet-stream'}), resume.name);
  });
  $('search').addEventListener('input',renderList);
  window.addEventListener('hashchange',navigate);
  window.addEventListener('beforeunload',event=>{
    if (dirty || saving || $('application-form').elements.company.value ||
        $('application-form').elements.position.value || $('resume').files.length) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  updateClock();
  navigate();
  render();
  let clockKey=localDate();setInterval(()=>{updateClock();if(clockKey!==localDate()){clockKey=localDate();render();}},15000);
})();
