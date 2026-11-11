/* Cloud is the only durable source of truth. No browser storage or offline queue. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.TRACKER_CONFIG || {};
  let client = null, user = null, applications = [], loaded = false, saving = false;
  let reading = false, reloadRequested = false, loadSequence = 0;
  // Retain this ID through ambiguous network failures, preventing duplicate retries.
  let pending = null;
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
    ['total','today-count','week-count','companies'].forEach((id,i)=>$(id).textContent=loaded?values[i]:'—');
    $('nav-count').textContent=loaded?applications.length:'—';
    const days = Array.from({length:7},(_,i)=>{const d = new Date();d.setDate(d.getDate()-6+i);const key=localDate(d);return {date:d,key,count:applications.filter(a=>a.application_date===key).length};});
    const max = Math.max(1,...days.map(d=>d.count));
    $('chart').innerHTML = days.map(d=>`<div class="chart-column"><b>${loaded?d.count:'—'}</b><div class="bar-space"><div class="bar" style="height:${loaded?Math.max(2,d.count/max*125):2}px" title="${esc(d.key)}: ${loaded?d.count:'not loaded'} applications"></div></div><small>${d.date.toLocaleDateString('en-US',{weekday:'short'})}</small></div>`).join('');
    $('recent').innerHTML = !loaded ? empty('Your next chapter is waiting', 'Connect and sign in to see your applications here.') : applications.length ? applications.slice(0,4).map(recentRow).join('') : empty('A fresh start, full of possibilities','Your first saved application will appear here.','<a href="#new">Add your first application ↗</a>');
    renderList();
  }
  function renderList() {
    if (!loaded) {$('application-list').innerHTML=empty('Your applications live in the cloud','Connect and sign in to load your records.');return;}
    const query = $('search').value.trim().toLowerCase();
    const filtered = applications.filter(a=>[a.company,a.position,a.location].some(v=>(v||'').toLowerCase().includes(query)));
    if (!filtered.length) {$('application-list').innerHTML=empty(query?'No matching applications':'No applications yet',query?'Try a different company, position, or location.':'Save an application to start your timeline.',query?'':'<a href="#new">New application ↗</a>');return;}
    const groups = new Map(); filtered.forEach(a=>{if(!groups.has(a.application_date))groups.set(a.application_date,[]);groups.get(a.application_date).push(a);});
    $('application-list').innerHTML=[...groups].map(([date,rows])=>`<section class="date-group"><h2 class="date-group-title"><time datetime="${esc(date)}">${displayDate(date)}</time><small>${rows.length} application${rows.length===1?'':'s'}</small></h2>${rows.map((a,i)=>applicationDetail(a,i)).join('')}</section>`).join('');
  }
  function applicationDetail(a,i) {
    const field=(label,value)=>`<div><div class="detail-label">${label}</div><div class="detail-value">${esc(value||'Not provided')}</div></div>`;
    const link=safeLink(a.job_link);
    return `<details class="application"><summary><span class="number">${i+1}.</span><span class="company-avatar">${esc(a.company.slice(0,1).toUpperCase())}</span><span><strong>${esc(a.company)}</strong><small>${esc(a.position)}${a.location?' · '+esc(a.location):''}</small></span></summary><div class="application-body"><div class="detail-grid">${field('Company name',a.company)}${field('Position',a.position)}${field('Location',a.location)}${field('Application date',displayDate(a.application_date))}${field('Salary',a.salary)}<div><div class="detail-label">Job link</div><div class="detail-value">${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(a.job_link)} ↗</a>`:'Not provided'}</div></div><div><div class="detail-label">Resume used</div><div class="detail-value">${a.resume_path?`<button class="button secondary open-resume" data-id="${esc(a.id)}">Open ${esc(a.resume_name||'resume')} ↗</button>`:'Not provided'}</div></div></div><div class="detail-block">${field('Job description',a.description)}</div>${(a.questions||[]).length?`<div class="detail-block"><div class="detail-label">Additional details</div>${a.questions.map(q=>`<div class="question-detail">${field('Question',q.question)}<br>${field('Response given',q.response)}</div>`).join('')}</div>`:''}</div></details>`;
  }
  function updateAuthUI() {
    $('identity').textContent=user?user.email:'Not signed in';
    $('connection-banner').hidden=!!user;
    $('connect-button').textContent=client?'Sign in ↗':'Set up connection ↗';
    $('connection-banner').querySelector('strong').textContent=client?'Your cloud workspace is ready.':'Let’s connect your cloud workspace.';
    $('connection-banner').querySelector('p').textContent=client?'Sign in to save and view your private applications.':'Your information will be saved online. Connect your database to get started.';
    $('cloud-state').textContent=user?'● Connected to cloud':client?'○ Sign in to cloud':'○ Cloud not connected';
    $('cloud-state').classList.toggle('connected',!!user);
    $('save-button').disabled=!user||saving;
    $('refresh').disabled=!user||reading||saving;
    $('save-hint').textContent=user?'Saved to your cloud database only after confirmation.':'Sign in to save directly to the cloud.';
  }
  function openAccount() {
    $('dialog-title').textContent=user?'Your account':client?'Welcome back.':'Connect to your cloud';
    $('setup-copy').hidden=!!client;
    $('auth-fields').hidden=!client||!!user;
    $('signed-in-fields').hidden=!user;
    $('signed-email').textContent=user?.email||'';
    $('auth-error').textContent='';
    $('account-dialog').showModal();
  }
  async function loadApplications() {
    if (!user) return;
    if (reading) {reloadRequested=true;return;}
    reading=true; const sequence=++loadSequence; const owner=user.id; updateAuthUI();
    try {
      const rows=[]; let offset=0;
      while(true){
        const {data,error}=await client.from('applications').select('*').eq('user_id',owner).order('application_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
        if(error)throw error;
        rows.push(...data);if(data.length<500)break;offset+=500;
      }
      if(sequence!==loadSequence||user?.id!==owner)return;
      applications=rows;loaded=true;render();
      $('cloud-state').textContent='● Up to date with cloud';
    }catch(error){if(sequence===loadSequence){message(`Could not load cloud records. ${error.message} Your cloud data has not been changed.`,true);$('cloud-state').textContent='○ Cloud read failed';}}
    finally{reading=false;$('refresh').disabled=!user||saving;if(reloadRequested){reloadRequested=false;loadApplications();}}
  }
  $('application-form').addEventListener('submit',async event=>{
    event.preventDefault(); if(!user||saving)return;
    if(pending && pending.user_id!==user.id){message('Sign in with the original account to resolve this pending save.',true);return;}
    const form=event.currentTarget;const data=new FormData(form);const file=$('resume').files[0];
    const company=String(data.get('company')).trim(),position=String(data.get('position')).trim();
    if(!company||!position){message('Please enter a company name and position.',true);return;}
    const jobLink=String(data.get('job_link')).trim();
    if(jobLink&&!safeLink(jobLink)){message('Use an http:// or https:// job link.',true);return;}
    if(file&&(file.size>10*1024*1024||! /\.(pdf|doc|docx)$/i.test(file.name))){message('Choose a PDF, DOC, or DOCX resume up to 10 MB.',true);return;}
    const questions=[...document.querySelectorAll('.question-pair')].map(pair=>({question:pair.querySelector('[name=question]').value.trim(),response:pair.querySelector('[name=response]').value.trim()}));
    // Freeze the attempted record until confirmed. A timeout must not create a new ID.
    if(!pending){
      const id=crypto.randomUUID();
      pending={id,user_id:user.id,company,position,location:String(data.get('location')).trim(),application_date:localDate(),salary:String(data.get('salary')).trim(),job_link:jobLink,description:String(data.get('description')).trim(),questions,resume_name:file?.name||null,resume_path:file?`${user.id}/${id}/resume.${file.name.split('.').pop().toLowerCase()}`:null};
    }
    saving=true;updateAuthUI();$('save-button').textContent='Saving to cloud…';message('');
    // Prevent changes to an in-flight record and ambiguous retries.
    const controls=[...form.querySelectorAll('input,textarea,button')];controls.forEach(el=>el.disabled=true);
    try {
      const {data:existing,error:readError}=await client.from('applications').select('id').eq('id',pending.id).eq('user_id',user.id).maybeSingle();
      if(readError)throw readError;
      if(!existing){
        if(file&&pending.resume_path){
          const {error:uploadError}=await client.storage.from('resumes').upload(pending.resume_path,file,{upsert:true,contentType:file.type||'application/octet-stream',cacheControl:'0'});
          if(uploadError)throw uploadError;
        }
        const {error}=await client.from('applications').insert(pending);
        if(error)throw error;
      }
      // An existing UUID after a timeout confirms that the earlier save succeeded.
      pending=null;form.reset();$('questions').replaceChildren();$('file-name').textContent='';updateClock();
      controls.forEach(el=>el.disabled=false);message('Application saved to the cloud.');
      await loadApplications();location.hash='applications';
    }catch(error){
      message(`Save could not be confirmed. ${error.message} Your form is kept on this page. Retry to check and save the same application without creating a duplicate. Keep this page open.`,true);
      $('save-button').textContent='Retry cloud save ↗';
      // Keep original values locked until the attempted insert has been resolved.
    }finally{saving=false;$('save-button').disabled=false;if(!pending)$('save-button').textContent='Save application ↗';updateAuthUI();}
  });
  $('add-question').addEventListener('click',()=>{
    const div=document.createElement('div');div.className='question-pair';
    div.innerHTML='<button type="button" class="remove-question" aria-label="Remove this question">×</button><label>Question<input name="question" required maxlength="5000" placeholder="What did the application ask?"></label><label>Response given<textarea name="response" required rows="3" maxlength="20000" placeholder="The answer you submitted…"></textarea></label>';
    div.querySelector('button').addEventListener('click',()=>div.remove());$('questions').append(div);div.querySelector('input').focus();
  });
  $('resume').addEventListener('change',()=>{$('file-name').textContent=$('resume').files[0]?.name||'';});
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;$('login-button').disabled=true;$('auth-error').textContent='Signing in…';
    try{
      const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;
      user=data.user;$('password').value='';$('account-dialog').close();updateAuthUI();await loadApplications();
    }catch(error){$('auth-error').textContent=error.message;}finally{$('login-button').disabled=false;}
  });
  $('sign-out').addEventListener('click',async()=>{
    if(saving||pending){$('auth-error').textContent='Resolve your pending application save before signing out.';return;}
    const {error}=await client.auth.signOut({scope:'local'});if(error){$('auth-error').textContent=error.message;return;}
    user=null;applications=[];loaded=false;++loadSequence;$('application-form').reset();$('questions').replaceChildren();$('file-name').textContent='';$('search').value='';$('account-dialog').close();message('');updateClock();updateAuthUI();render();
  });
  $('application-list').addEventListener('click',async e=>{
    const button=e.target.closest('.open-resume');if(!button||!user)return;
    const a=applications.find(a=>a.id===button.dataset.id);if(!a)return;
    const target=window.open('about:blank','_blank');if(target)target.opener=null;
    button.disabled=true;
    try{const {data,error}=await client.storage.from('resumes').createSignedUrl(a.resume_path,60);if(error)throw error;if(target)target.location.replace(data.signedUrl);else{message('Allow popups for this site to open your resume.',true);}}
    catch(error){target?.close();message(`Could not open resume. ${error.message}`,true);}finally{button.disabled=false;}
  });
  $('refresh').addEventListener('click',()=>{message('');loadApplications();});
  $('search').addEventListener('input',renderList);
  $('connect-button').addEventListener('click',openAccount);$('account-button').addEventListener('click',openAccount);
  document.querySelector('.close-dialog').addEventListener('click',()=>$('account-dialog').close());
  window.addEventListener('hashchange',navigate);
  window.addEventListener('beforeunload',event=>{if(saving||pending||$('application-form').elements.company.value||$('application-form').elements.position.value||$('resume').files.length){event.preventDefault();event.returnValue='';}});
  if(config.supabaseUrl&&config.supabasePublishableKey){
    try{
      if(!window.supabase)throw new Error('Cloud library could not load. Check your internet connection and reload.');
      client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:(url,options={})=>fetch(url,{...options,cache:'no-store'})}});
      client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'&&user){user=null;applications=[];loaded=false;++loadSequence;updateAuthUI();render();message('Your session ended. Sign in again to access your cloud records.',true);}});
    }catch(error){message(error.message,true);client=null;}
  }
  updateClock();navigate();updateAuthUI();render();
  let clockKey=localDate();setInterval(()=>{updateClock();if(clockKey!==localDate()){clockKey=localDate();render();}},15000);
})();
