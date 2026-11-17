(() => {
  'use strict';
  const $ = (selector,root=document) => root.querySelector(selector);
  const $$ = (selector,root=document) => [...root.querySelectorAll(selector)];
  const data = JSON.parse($('#siteData').textContent);
  let published = data.site;
  let lang = 'es';
  let photos = data.photos;
  let selectedPhoto = 0;
  let lastFocus = null;
  const videoDialog = $('#videoDialog');
  const photoDialog = $('#photoDialog');
  const menu = $('#mobileMenu');
  const toggle = $('#menuToggle');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const safeImage = value => typeof value==='string' && (/^\/assets\/[\w./%-]+$/.test(value) || /^https:\/\//.test(value) || /^\/media\/[\w.-]+$/.test(value));
  const validEmail = value => typeof value==='string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.3"/></svg>';
  const play = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z" fill="currentColor"/></svg>';
  const translate = () => {
    $$('[data-es][data-en]').forEach(el=>el.textContent=el.getAttribute('data-'+lang));
    document.documentElement.lang = lang;
    $$('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
    toggle.setAttribute('aria-label',lang==='es'?'Abrir menú':'Open menu');
    $('[data-close="videoDialog"]').setAttribute('aria-label',lang==='es'?'Cerrar video':'Close video');
    $('[data-close="photoDialog"]').setAttribute('aria-label',lang==='es'?'Cerrar fotografía':'Close photograph');
    $('#photoPrev').setAttribute('aria-label',lang==='es'?'Fotografía anterior':'Previous photograph');
    $('#photoNext').setAttribute('aria-label',lang==='es'?'Fotografía siguiente':'Next photograph');
    $$('#gallery .gallery-item').forEach((button,i)=>button.setAttribute('aria-label',(lang==='es'?'Ampliar fotografía: ':'Enlarge photograph: ')+(photos[i]?.caption||'Tony Rivé')));
    $('#name').placeholder=lang==='es'?'Tu nombre':'Your name';
    $('#message').placeholder=lang==='es'?'Cuéntanos un poco más...':'Tell us a little more...';
    document.title=lang==='es'?'Tony Rivé — Sitio Oficial | Música, Videos y Contrataciones':'Tony Rivé — Official Website | Music, Videos & Booking';
    $('meta[name="description"]').content=lang==='es'?'La música se siente. Conoce a Tony Rivé, cantautor puertorriqueño. Música, videos oficiales, entrevistas y contrataciones.':'Music you can feel. Discover Tony Rivé, Puerto Rican singer-songwriter. Official music, videos, interviews and booking.';
    if(published){
      const hero=lang==='es'?published.heroTitle:published.heroTitleEn;
      if(typeof hero==='string' && hero.trim())$('#heroStatement').textContent=hero;
      const description=lang==='es'?published.heroDescription:published.heroDescriptionEn;
      if(typeof description==='string'&&description.trim())$('#artistDescription').textContent=description;
      const bio=lang==='es'?published.bioEs:published.bioEn;
      if(typeof bio==='string' && bio.trim()){
        const area=$('#managedBio');
        area.replaceChildren(...bio.split(/\n\n/).map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
      }
    }
    $$('#interviewVideos .video-card').forEach(b=>{
      const v=data.videos.find(v=>v.id===b.dataset.video);
      if(v){$('.eyebrow',b).textContent=lang==='es'?v.type:v.typeEn;$('h4',b).textContent=lang==='es'?v.title:v.titleEn;}
    });
    try{localStorage.setItem('tony-rive-site-lang',lang)}catch{}
  };
  function setMenu(open){
    toggle.setAttribute('aria-expanded',String(open));
    menu.hidden=!open;
    document.body.classList.toggle('menu-open',open);
    if(open){$('#header').classList.add('scrolled');$('a',menu).focus();}
  }
  toggle.addEventListener('click',()=>setMenu(menu.hidden));
  $$('a',menu).forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  menu.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const links=$$('a',menu);
    if(!e.shiftKey&&document.activeElement===links.at(-1)){e.preventDefault();toggle.focus();}
  });
  toggle.addEventListener('keydown',e=>{if(!menu.hidden&&e.key==='Tab'&&e.shiftKey){e.preventDefault();$$('a',menu).at(-1).focus();}});
  window.addEventListener('resize',()=>{if(innerWidth>900)setMenu(false)});
  $$('[data-lang]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.lang;translate()}));
  function updateHeader(){ $('#header').classList.toggle('scrolled',scrollY>55||!menu.hidden); }
  window.addEventListener('scroll',updateHeader,{passive:true});updateHeader();

  function showDialog(dialog){lastFocus=document.activeElement;dialog.showModal();document.body.classList.add('dialog-open');}
  function openVideo(id,title){
    if(!/^[\w-]{11}$/.test(id))return;
    $('#videoDialogTitle').textContent=title||'Tony Rivé';
    const iframe=document.createElement('iframe');iframe.title=title||'Tony Rivé';
    iframe.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
    iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen=true;
    $('#videoMount').replaceChildren(iframe);
    $('#youtubeFallback').href='https://www.youtube.com/watch?v='+id;
    showDialog(videoDialog);
  }
  document.addEventListener('click',e=>{
    const video=e.target.closest('[data-video]');
    if(video)openVideo(video.dataset.video,video.dataset.videoTitle||video.textContent.trim());
    const close=e.target.closest('[data-close]');
    if(close)document.getElementById(close.dataset.close).close();
  });
  [videoDialog,photoDialog].forEach(dialog=>{
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>{
      if(dialog===videoDialog)$('#videoMount').replaceChildren();
      document.body.classList.remove('dialog-open');
      lastFocus?.focus();
    });
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!menu.hidden){setMenu(false);toggle.focus();}
    if(photoDialog.open&&e.key==='ArrowRight')changePhoto(1);
    if(photoDialog.open&&e.key==='ArrowLeft')changePhoto(-1);
  });
  function renderVideos(extra=[]){
    const videos=data.videos.slice(1);
    extra.forEach(v=>{if(v&&/^[\w-]{11}$/.test(v.id)&&!videos.some(x=>x.id===v.id)&&!['SkTUvvYq5bM','ZFbFSJH56ag'].includes(v.id))videos.push({id:v.id,title:v.title||'Tony Rivé',titleEn:v.title||'Tony Rivé',type:'TONY RIVÉ · VIDEO',typeEn:'TONY RIVÉ · VIDEO',image:'https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg'});});
    $('#interviewVideos').replaceChildren(...videos.map(v=>{
      const b=document.createElement('button');b.className='video-card';b.dataset.video=v.id;b.dataset.videoTitle=v.title;b.type='button';
      const thumb=document.createElement('div');thumb.className='video-thumb';const img=document.createElement('img');img.src=v.image;img.alt=v.title;img.loading='lazy';img.width=480;img.height=300;
      thumb.append(img);thumb.insertAdjacentHTML('beforeend',play);
      const tag=document.createElement('span');tag.className='eyebrow';tag.textContent=lang==='es'?v.type:v.typeEn;
      const title=document.createElement('h4');title.textContent=lang==='es'?v.title:v.titleEn;
      b.append(thumb,tag,title);return b;
    }));
  }
  const thumbFor=url=>{
    const match=/^\/assets\/tony-rive-0([1-4])\.jpg$/.exec(url);
    return match?'/media/photo-'+match[1]+'.webp':url;
  };
  function renderPhotos(list){
    photos=list.filter(p=>p&&safeImage(p.url));
    if(!photos.length)photos=data.photos;
    $('#gallery').replaceChildren(...photos.map((p,index)=>{
      const button=document.createElement('button');button.className='gallery-item';button.type='button';button.setAttribute('aria-label',(lang==='es'?'Ampliar fotografía: ':'Enlarge photograph: ')+(p.caption||'Tony Rivé'));
      const img=document.createElement('img');img.src=p.thumb||thumbFor(p.url);img.alt=p.caption||'Tony Rivé';img.width=900;img.height=1000;img.loading='lazy';
      const caption=document.createElement('span');caption.className='gallery-caption';const text=document.createElement('span');text.textContent=p.caption||'Tony Rivé';caption.append(text);caption.insertAdjacentHTML('beforeend',arrow);
      button.append(img,caption);button.addEventListener('click',()=>{selectedPhoto=index;showPhoto();showDialog(photoDialog)});return button;
    }));
  }
  function showPhoto(){const p=photos[selectedPhoto];$('#lightboxImage').src=p.url;$('#lightboxImage').alt=p.caption||'Tony Rivé';$('#photoCaption').textContent=p.caption||'Tony Rivé';$('#photoCount').textContent=String(selectedPhoto+1).padStart(2,'0')+' / '+String(photos.length).padStart(2,'0');}
  function changePhoto(delta){selectedPhoto=(selectedPhoto+delta+photos.length)%photos.length;showPhoto();}
  $('#photoPrev').addEventListener('click',()=>changePhoto(-1));$('#photoNext').addEventListener('click',()=>changePhoto(1));
  $('#albumPlayer').addEventListener('click',()=>{
    const mount=$('#albumEmbed');
    if(mount.childElementCount===0){const frame=document.createElement('iframe');frame.title='Hasta el Último Latido — Tony Rivé — Apple Music';frame.src='https://embed.music.apple.com/us/album/hasta-el-%C3%BAltimo-latido/6800706900';frame.allow='autoplay *; encrypted-media *; fullscreen *; clipboard-write';frame.loading='lazy';mount.append(frame);}
    mount.hidden=!mount.hidden;$('#albumPlayer').setAttribute('aria-expanded',String(!mount.hidden));
  });

  let inquiry='';
  $('#contactForm').addEventListener('submit',e=>{
    e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
    const recipient=validEmail(published.contactEmail)?published.contactEmail:'tonyrivemusic@gmail.com';
    const subject=(lang==='es'?'Consulta para Tony Rivé':'Tony Rivé inquiry')+' — '+$('#topic').selectedOptions[0].textContent;
    inquiry=(lang==='es'?'Nombre':'Name')+': '+$('#name').value.trim()+'\nEmail: '+$('#email').value.trim()+'\n'+(lang==='es'?'Consulta':'Inquiry')+': '+$('#topic').selectedOptions[0].textContent+'\n'+(lang==='es'?'Fecha del evento':'Event date')+': '+($('#eventDate').value||'—')+'\n\n'+$('#message').value.trim();
    $('#draftText').textContent=inquiry;$('#openEmail').href='mailto:'+recipient+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(inquiry);
    $('#emailDraft').hidden=false;$('#formFeedback').textContent=lang==='es'?'Consulta preparada. Abre tu correo para revisarla y enviarla.':'Inquiry prepared. Open your email app to review and send it.';
  });
  $('#copyInquiry').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(inquiry);$('#formFeedback').textContent=lang==='es'?'Consulta copiada.':'Inquiry copied.';}catch{$('#formFeedback').textContent=lang==='es'?'Selecciona y copia el texto de tu consulta.':'Select and copy your inquiry text.';}
  });

  const managed=document.createElement('div');managed.id='managedBio';$('#bioFull').prepend(managed);
  try{const q=new URLSearchParams(location.search).get('lang');const stored=localStorage.getItem('tony-rive-site-lang');lang=['es','en'].includes(q)?q:(stored==='en'?'en':'es')}catch{}
  renderPhotos(data.photos);renderVideos();translate();
  if('IntersectionObserver' in window&&!motion.matches){
    document.documentElement.classList.add('js-ready');
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.06,rootMargin:'0px 0px 30px 0px'});
    $$('.reveal').forEach(el=>observer.observe(el));
    setTimeout(()=>$$('.reveal').forEach(el=>el.classList.add('visible')),6000);
  }
  fetch('/api/content',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{
    if(!j?.site)return;published={...data.site,...j.site};translate();
    if(validEmail(published.contactEmail)){$('#contactEmail').href='mailto:'+published.contactEmail;$('#contactEmail').replaceChildren(document.createTextNode(published.contactEmail));$('#contactEmail').insertAdjacentHTML('beforeend',arrow);}
    if(Array.isArray(published.photos)){
      const incoming=published.photos.filter(p=>p&&safeImage(p.url));
      const same=incoming.length===4&&incoming.every(p=>data.photos.some(d=>d.url===p.url&&d.caption===p.caption));
      renderPhotos(same?data.photos:incoming);
    }
    renderVideos(Array.isArray(published.videos)?published.videos:[]);
  }).catch(()=>{});
})();
