const $=id=>document.getElementById(id);
const src=$('sourceInput'),tgt=$('targetInput'),swap=$('swapBtn'),label=$('swapLabel');
const srcDrop=$('sourceDrop'),tgtDrop=$('targetDrop'),srcImg=$('sourcePreview'),tgtImg=$('targetPreview');
const resultBox=$('resultBox'),resultImage=$('resultImage'),downloadBtn=$('downloadBtn');
const statusText=$('statusText'),apiStatus=$('apiStatus'),apiBadge=document.querySelector('.apiBadge'),statusLine=document.querySelector('.statusLine');
const singleModeBtn=$('singleModeBtn'),multiModeBtn=$('multiModeBtn'),faceAssignments=$('faceAssignments');
const multiEmpty=$('multiEmpty'),faceCountBadge=$('faceCountBadge'),targetHint=$('targetHint'),resultStep=$('resultStep');
let resultUrl='', mode='single', detectedFaces=[], assignedFiles=[], detectionPreviewSize=null;




/* ==========================================================
   PHONE CONNECTION + LARGE IMAGE FIX
   - Keeps original preview
   - Optimizes image only for API upload
   - Uses same-origin /api route to avoid browser CORS issues
   - Retries once with smaller files after a dropped connection
   ========================================================== */
async function makeApiImage(file, maxSide=1400, quality=.86){
  if(!file) return file;
  try{
    const bitmap = await createImageBitmap(file);
    const w=bitmap.width, h=bitmap.height;
    const longest=Math.max(w,h);

    if(longest<=maxSide && file.size<=1800*1024){
      bitmap.close?.();
      return file;
    }

    const scale=Math.min(1,maxSide/longest);
    const nw=Math.max(1,Math.round(w*scale));
    const nh=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas');
    canvas.width=nw;
    canvas.height=nh;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.drawImage(bitmap,0,0,nw,nh);
    bitmap.close?.();

    const blob=await new Promise((resolve,reject)=>{
      canvas.toBlob(
        b=>b?resolve(b):reject(new Error('IMAGE_OPTIMIZE_FAILED')),
        'image/jpeg',
        quality
      );
    });

    return new File(
      [blob],
      ((file.name||'photo').replace(/\.[^.]+$/,'')||'photo')+'-api.jpg',
      {type:'image/jpeg',lastModified:Date.now()}
    );
  }catch(err){
    console.warn('Image optimization skipped:',err);
    return file;
  }
}

async function apiFetch(path, options={}, timeoutMs=180000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const headers=new Headers(options.headers||{});
    const token=await window.getFirebaseIdToken?.();
    if(token)headers.set('Authorization',`Bearer ${token}`);
    const url=(window.FC_API_BASE||'')+path;
    return await fetch(url,{
      ...options,
      headers,
      cache:'no-store',
      credentials:'omit',
      signal:controller.signal
    });
  }finally{
    clearTimeout(timer);
  }
}

async function postSingleSwap(sourceFile,targetFile,smallRetry=false){
  const source=await makeApiImage(sourceFile,smallRetry?960:1280,smallRetry ? .78 : .84);
  const target=await makeApiImage(targetFile,smallRetry?1100:1440,smallRetry ? .79 : .85);

  const fd=new FormData();
  fd.append('source_image',source);
  fd.append('target_image',target);

  return await apiFetch('/api/face-swap',{method:'POST',body:fd},180000);
}

async function postIndexedSwap(sourceFile,targetFile,targetIndex,smallRetry=false){
  const source=await makeApiImage(sourceFile,smallRetry?760:980,smallRetry ? .76 : .82);
  const target=await makeApiImage(targetFile,smallRetry?1000:1280,smallRetry ? .78 : .84);

  // Use the original multi-face endpoint with ONE source/target index per
  // request. This keeps each request short (similar to single-face) and also
  // works with older backend builds that do not have /api/face-swap-index.
  const fd=new FormData();
  fd.append('target_image',target);
  fd.append('source_images',source);
  fd.append('target_indices',String(targetIndex));

  return await apiFetch('/api/multi-face-swap',{method:'POST',body:fd},180000);
}

async function responseImageOrThrow(r){
  if(!r.ok){
    let msg=`Request failed (${r.status})`;
    try{
      const e=await r.json();
      msg=e.detail||msg;
    }catch{}
    throw new Error(msg);
  }

  const contentType=r.headers.get('content-type')||'';
  if(!contentType.includes('image/')){
    let body='';
    try{body=await r.text();}catch{}
    throw new Error(body||'API did not return an image.');
  }
  return await r.blob();
}

function validate(file){
  if(!file)return false;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){alert('Only JPG, PNG or WEBP allowed.');return false}
  if(file.size>20*1024*1024){alert('Maximum image size is 20MB.');return false}
  return true;
}
function setPreview(input,img,drop){
  const f=input.files[0]; if(!validate(f)){input.value='';return}
  img.src=URL.createObjectURL(f); drop.classList.add('has'); updateReady();
}
function setMode(next){
  mode=next;
  const multi=mode==='multi';
  document.body.classList.toggle('multiMode',multi);
  singleModeBtn.classList.toggle('active',!multi);
  multiModeBtn.classList.toggle('active',multi);
  targetHint.textContent=multi?'Upload a group photo. Faces will be detected automatically.':'Upload the photo where you want to replace the face';
  resultStep.textContent=multi?'4':'3';
  label.textContent=multi?'SWAP MULTIPLE FACES':'GENERATE FACE SWAP';
  if(multi && tgt.files[0]) detectTargetFaces();
  updateReady();
}
singleModeBtn.onclick=()=>setMode('single');
multiModeBtn.onclick=()=>setMode('multi');

function updateReady(){
  const user=window.faceChangerUser;
  const account=window.faceChangerAccount;
  let ready=false;
  if(!user){
    // The tool remains visible before login; sign-in is required only to generate.
    if(mode==='single') ready=!!(src.files[0]&&tgt.files[0]);
    else{
      const assigned=assignedFiles.filter(Boolean).length;
      ready=!!(tgt.files[0] && detectedFaces.length && assigned);
    }
    statusText.textContent=ready?'Login to generate your face swap.':'Upload images, then login to generate.';
    label.textContent=ready?'LOGIN TO GENERATE':(mode==='multi'?'SWAP MULTIPLE FACES':'GENERATE FACE SWAP');
    swap.disabled=!ready;return;
  }
  if(mode==='single'){
    ready=!!(src.files[0]&&tgt.files[0]);
    statusText.textContent=ready?'Ready to generate.':'Upload both images to begin.';
  }else{
    const assigned=assignedFiles.filter(Boolean).length;
    ready=!!(tgt.files[0] && detectedFaces.length && assigned);
    if(!tgt.files[0]) statusText.textContent='Upload a CHANGE THIS PHOTO to detect faces.';
    else if(!detectedFaces.length) statusText.textContent='Detecting faces in CHANGE THIS PHOTO...';
    else statusText.textContent=assigned?`${assigned} face${assigned>1?'s':''} assigned. Ready to swap.`:'Choose a USE THIS FACE for at least one detected face.';
  }
  swap.disabled=!ready;
}
window.addEventListener('facechanger-auth-changed',updateReady);

src.onchange=()=>setPreview(src,srcImg,srcDrop);
tgt.onchange=()=>{
  setPreview(tgt,tgtImg,tgtDrop);
  if(mode==='multi') detectTargetFaces();
};
$('clearSource').onclick=()=>{src.value='';srcDrop.classList.remove('has');srcImg.removeAttribute('src');updateReady()};
$('clearTarget').onclick=()=>{
  tgt.value='';tgtDrop.classList.remove('has');tgtImg.removeAttribute('src');
  detectedFaces=[];assignedFiles=[];detectionPreviewSize=null;renderAssignments();faceCountBadge.textContent='No target image';updateReady()
};

function setupDrop(zone,input,img){
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.style.borderColor='#e879f9'}));
  ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.style.borderColor=''}));
  zone.addEventListener('drop',e=>{
    const f=e.dataTransfer.files[0]; if(!validate(f))return;
    const dt=new DataTransfer();dt.items.add(f);input.files=dt.files;setPreview(input,img,zone);
    if(input===tgt && mode==='multi')detectTargetFaces();
  });
}
setupDrop(srcDrop,src,srcImg); setupDrop(tgtDrop,tgt,tgtImg);

// API status indicator uses the configured site-wide Cloudflare URL.
let apiCheckSequence=0;
async function checkApi(){
  const sequence=++apiCheckSequence;
  const base=window.FC_API_BASE||'';
  let controller=null, timer=null;
  try{
    if(!base)throw new Error('API URL is not configured');
    // Health probe must be unauthenticated: avoid Authorization-triggered CORS preflight.
    controller=new AbortController();
    timer=setTimeout(()=>controller.abort(),12000);
    const r=await fetch(base+'/api/health', {method:'GET', mode:'cors', cache:'no-store', credentials:'omit', signal:controller.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const j=await r.json();
    if(j.status!=='ok')throw new Error('API did not respond with status: ok');
    if(sequence!==apiCheckSequence)return false;
    apiStatus.textContent='API Online';
    apiBadge.classList.add('online');apiBadge.classList.remove('offline');
    statusLine.classList.add('online');statusLine.classList.remove('offline');
    apiBadge.title=`API Online: ${base}`;
    apiBadge.setAttribute('aria-label','API Online');
    window.dispatchEvent(new CustomEvent('fc:api-status',{detail:{online:true,base}}));
    return true;
  }catch(err){
    if(sequence!==apiCheckSequence)return false;
    apiStatus.textContent='API Offline';
    apiBadge.classList.add('offline');apiBadge.classList.remove('online');
    statusLine.classList.add('offline');statusLine.classList.remove('online');
    console.warn('FaceChanger API health check failed:',base,err);
    apiBadge.title=`API Offline: ${base} — ${err?.message||'connection failed'}. Check the current API tunnel URL in api-config.js.`;
    apiBadge.setAttribute('aria-label','API Offline');
    window.dispatchEvent(new CustomEvent('fc:api-status',{detail:{online:false,base,error:err?.message||'Connection failed'}}));
    return false;
  }finally{
    if(timer)clearTimeout(timer);
  }
}
window.FC_refreshApiCheck=checkApi;

// The status dot is informational: the API endpoint is set in api-config.js.
checkApi();setInterval(checkApi,30000);

function cropFaceDataUrl(img, box){
  if(!img || !img.naturalWidth || !img.naturalHeight || !box) return '';

  // Face boxes are returned for the API-optimized detection image.
  // Scale them back to the original preview dimensions before cropping.
  const detW=detectionPreviewSize?.width || img.naturalWidth;
  const detH=detectionPreviewSize?.height || img.naturalHeight;
  const scaleX=img.naturalWidth/Math.max(1,detW);
  const scaleY=img.naturalHeight/Math.max(1,detH);

  let [x1,y1,x2,y2]=box;
  x1*=scaleX; x2*=scaleX; y1*=scaleY; y2*=scaleY;

  const fw=Math.max(1,x2-x1), fh=Math.max(1,y2-y1);
  const cx=(x1+x2)/2;
  // Shift a little upward so hair/forehead is not cut, while still showing neck/shoulders.
  const cy=(y1+y2)/2 - fh*0.08;

  // Use a generous portrait-style crop around the detected face.
  // This intentionally includes hair, chin and some shoulders instead of a tight face box.
  let cropW=Math.max(fw*2.15, fh*1.75);
  let cropH=Math.max(fh*2.35, fw*2.05);

  cropW=Math.min(cropW,img.naturalWidth);
  cropH=Math.min(cropH,img.naturalHeight);

  let sx=cx-cropW/2;
  let sy=cy-cropH/2;
  sx=Math.max(0,Math.min(sx,img.naturalWidth-cropW));
  sy=Math.max(0,Math.min(sy,img.naturalHeight-cropH));

  const c=document.createElement('canvas');
  c.width=320;
  c.height=240;
  const ctx=c.getContext('2d',{alpha:false});
  ctx.fillStyle='#050209';
  ctx.fillRect(0,0,c.width,c.height);

  // Fit the expanded crop inside the thumbnail without any further clipping.
  const fit=Math.min(c.width/cropW,c.height/cropH);
  const dw=cropW*fit, dh=cropH*fit;
  const dx=(c.width-dw)/2, dy=(c.height-dh)/2;
  ctx.drawImage(img,sx,sy,cropW,cropH,dx,dy,dw,dh);
  return c.toDataURL('image/jpeg',.9);
}

async function detectTargetFaces(){
  if(!tgt.files[0])return;
  faceCountBadge.textContent='Detecting faces…';
  multiEmpty.style.display='grid';multiEmpty.textContent='Detecting faces…';
  faceAssignments.innerHTML='';
  detectedFaces=[];assignedFiles=[];updateReady();
  try{
    const detectionFile=await makeApiImage(tgt.files[0],1440,.86);
    try{
      const detectionBitmap=await createImageBitmap(detectionFile);
      detectionPreviewSize={width:detectionBitmap.width,height:detectionBitmap.height};
      detectionBitmap.close?.();
    }catch{
      detectionPreviewSize={width:tgtImg.naturalWidth||1,height:tgtImg.naturalHeight||1};
    }
    const fd=new FormData();fd.append('image',detectionFile);
    const r=await apiFetch('/api/detect-faces',{method:'POST',body:fd},90000);
    if(!r.ok){
      let msg='Face detection failed';
      try{const j=await r.json();msg=j.detail||msg}catch{}
      throw new Error(msg);
    }
    const j=await r.json();
    detectedFaces=(j.faces||[]).slice(0,8);
    assignedFiles=new Array(detectedFaces.length).fill(null);
    faceCountBadge.textContent=`${detectedFaces.length} face${detectedFaces.length===1?'':'s'} detected`;
    renderAssignments();
    if(!detectedFaces.length)statusText.textContent='No face detected in CHANGE THIS PHOTO.';
  }catch(e){
    faceCountBadge.textContent='Detection failed';
    multiEmpty.style.display='grid';multiEmpty.textContent=e.message||'Face detection failed.';
  }
  updateReady();
}

function renderAssignments(){
  faceAssignments.innerHTML='';
  if(!detectedFaces.length){
    multiEmpty.style.display='grid';
    multiEmpty.textContent=tgt.files[0]?'No faces detected. Try a clearer CHANGE THIS PHOTO.':'Upload a CHANGE THIS PHOTO to detect faces.';
    return;
  }
  multiEmpty.style.display='none';

  const build=()=>{
    detectedFaces.forEach((face,i)=>{
      const card=document.createElement('div');card.className='faceAssignment';
      const thumb=cropFaceDataUrl(tgtImg,face.bbox);
      card.innerHTML=`
        <img class="targetFaceThumb" src="${thumb}" alt="Detected target face ${i+1}">
        <div class="faceAssignmentHead"><div><span class="faceIndex">TARGET</span><br><b>Face ${i+1}</b></div><button type="button" class="assignClear" ${assignedFiles[i]?'':'style="display:none"'}>Remove</button></div>
        <div class="assignedPreview ${assignedFiles[i]?'has':''}">
          <span class="plus">+</span>
          <img alt="Assigned USE THIS FACE">
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <button class="assignBtn" type="button">${assignedFiles[i]?'Change source':'Add USE THIS FACE'}</button>`;
      const input=card.querySelector('input');
      const preview=card.querySelector('.assignedPreview');
      const img=preview.querySelector('img');
      const btn=card.querySelector('.assignBtn');
      const clear=card.querySelector('.assignClear');
      if(assignedFiles[i]){img.src=URL.createObjectURL(assignedFiles[i]);}
      btn.onclick=()=>input.click();
      preview.onclick=()=>input.click();
      input.onchange=()=>{
        const f=input.files[0];if(!validate(f))return;
        assignedFiles[i]=f;img.src=URL.createObjectURL(f);preview.classList.add('has');
        btn.textContent='Change source';clear.style.display='inline';updateReady();
      };
      clear.onclick=()=>{
        assignedFiles[i]=null;input.value='';img.removeAttribute('src');preview.classList.remove('has');
        btn.textContent='Add USE THIS FACE';clear.style.display='none';updateReady();
      };
      faceAssignments.appendChild(card);
    });
  };
  if(tgtImg.complete&&tgtImg.naturalWidth)build();
  else tgtImg.onload=build;
}

async function watermarkBlob(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width; canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,0,0);

  const text='FACE CHANGER AI';
  const size=Math.max(12,Math.round(canvas.width*.022));
  const xGap=Math.max(170,Math.round(canvas.width*.30));
  const yGap=Math.max(100,Math.round(canvas.height*.18));

  ctx.save();
  ctx.translate(canvas.width/2,canvas.height/2);
  ctx.rotate(-32*Math.PI/180);
  ctx.globalAlpha=.12;
  ctx.font=`600 ${size}px Inter, Arial`;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillStyle='#fff';
  ctx.shadowColor='rgba(0,0,0,.35)';
  ctx.shadowBlur=Math.max(1,size*.08);

  const span=Math.max(canvas.width,canvas.height)*2;
  for(let y=-span;y<=span;y+=yGap){
    for(let x=-span;x<=span;x+=xGap){
      ctx.fillText(text,x,y);
    }
  }
  ctx.restore();
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
}

async function showResult(raw){
  const watermarked=await watermarkBlob(raw);
  if(resultUrl)URL.revokeObjectURL(resultUrl);
  resultUrl=URL.createObjectURL(watermarked);
  resultImage.src=resultUrl;resultBox.classList.add('has');downloadBtn.disabled=false;
  statusText.textContent=mode==='multi'?'Multiple face swap completed.':'Face swap completed.';
  resultBox.scrollIntoView({behavior:'smooth',block:'center'});
}

swap.onclick=async()=>{
  if(swap.disabled)return;
  if(!window.faceChangerUser){
    window.openLoginModal?.();
    updateReady();
    return;
  }
  swap.disabled=true;
  label.textContent=mode==='multi'?'SWAPPING FACES...':'GENERATING...';
  statusText.textContent='Preparing face swap...';

  try{
    let r;
    let jobs=[];
    if(mode==='multi'){
      for(let i=0;i<assignedFiles.length;i++)if(assignedFiles[i])jobs.push({index:i,file:assignedFiles[i]});
    }
    if(mode==='single'){
      try{
        statusText.textContent='Processing images...';
        r=await postSingleSwap(src.files[0],tgt.files[0],false);
      }catch(firstErr){
        if(firstErr?.name==='AbortError') throw firstErr;
        statusText.textContent='Connection interrupted. Retrying with smaller images...';
        r=await postSingleSwap(src.files[0],tgt.files[0],true);
      }
    }else{
      let currentTarget=await makeApiImage(tgt.files[0],1280,.84);

      for(let step=0;step<jobs.length;step++){
        const job=jobs[step];
        label.textContent=`SWAPPING ${step+1}/${jobs.length}...`;
        statusText.textContent=`Processing face ${step+1} of ${jobs.length}...`;

        let stepResponse;
        try{
          stepResponse=await postIndexedSwap(job.file,currentTarget,job.index,false);
          if(stepResponse.status===502 || stepResponse.status===503 || stepResponse.status===504){
            throw new Error(`RETRYABLE_${stepResponse.status}`);
          }
        }catch(firstErr){
          if(firstErr?.name==='AbortError') throw firstErr;
          statusText.textContent=`Retrying face ${step+1} with smaller images...`;
          stepResponse=await postIndexedSwap(job.file,currentTarget,job.index,true);
        }

        currentTarget=await responseImageOrThrow(stepResponse);
      }

      await showResult(currentTarget);
      return;
    }

    await showResult(await responseImageOrThrow(r));

  }catch(e){
    let msg=e?.message||'Face swap failed.';
    if(e?.name==='AbortError')msg='Processing timed out. Keep the API/Tunnel open and try again.';
    else if(msg==='Failed to fetch')msg='API connection dropped. Keep the API/Tunnel open, then retry.';
    statusText.textContent=msg;
    alert(msg);
  }finally{
    updateReady();
    label.textContent=mode==='multi'?'SWAP MULTIPLE FACES':'GENERATE FACE SWAP';
  }
};
downloadBtn.onclick=()=>{
  if(!resultUrl)return;
  const a=document.createElement('a');a.href=resultUrl;a.download=`face-changer-ai-${Date.now()}.jpg`;document.body.appendChild(a);a.click();a.remove();
};
