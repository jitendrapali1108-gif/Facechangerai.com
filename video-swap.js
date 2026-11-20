/* FaceChanger video swap. Existing photo and multi-face workflows stay unchanged. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('videoSourceInput');
  const target = $('videoTargetInput');
  const button = $('generateVideoBtn');
  const message = $('videoSwapMessage');
  const progressWrap = $('videoProgressWrap');
  const progressBar = $('videoProgressBar');
  const progressText = $('videoProgressText');
  const resultPanel = $('videoResultPanel');
  const resultPlayer = $('videoResultPreview');
  let sourceUrl = '', targetUrl = '', resultUrl = '', busy = false;
  let modelsReady = new Set();
  let modelsKnown = false;
  const MAX_PHOTO = 10 * 1024 * 1024;
  const MAX_VIDEO = 80 * 1024 * 1024;
  // Automatic order; no model selector is displayed in the website.
  // Only API-advertised ready models are attempted (older APIs use InSwapper).
  const MODEL_PRIORITY = [
    'inswapper_128',
    'hyperswap_1a_256',
    'ghost_2_256',
    'simswap_256',
    'uniface_256'
  ];
  function candidateModels() {
    return modelsKnown ? MODEL_PRIORITY.filter(name => modelsReady.has(name)) : ['inswapper_128'];
  }
  const setMessage = msg => { message.textContent = msg; };
  function errText(obj, fallback) {
    const d = obj && obj.detail;
    if (typeof d === 'string') return d;
    if (d && typeof d.error === 'string') return d.error;
    if (Array.isArray(d)) return d.map(v => v.msg || JSON.stringify(v)).join(', ');
    return fallback;
  }
  async function throwIfBad(resp, fallback) {
    if (resp.ok) return resp;
    let obj = null;
    try { obj = await resp.json(); } catch {}
    const error = new Error(errText(obj, `${fallback} (HTTP ${resp.status})`));
    error.httpStatus = resp.status;
    // Retry only when a *model* could be the cause, never on oversized uploads,
    // bad media, unauthorised requests, rate limits, or a lost connection.
    error.canTryNextModel = [502, 503].includes(resp.status) ||
      (resp.status === 400 && /model|facefusion|inswapper|processor/i.test(error.message)) ||
      (resp.status === 504 && /facefusion_timeout/i.test(error.message));
    throw error;
  }
  async function refreshModels() {
    try {
      const response = await apiFetch('/api/models', {}, 15000);
      await throwIfBad(response, 'Cannot check models');
      const data = await response.json();
      if (Array.isArray(data.ready_models)) {
        modelsReady = new Set(data.ready_models.filter(name => MODEL_PRIORITY.includes(name)));
      } else {
        modelsReady = new Set([
          ...(data.inswapper_ready ? ['inswapper_128'] : []),
          ...(data.facefusion_installed ? MODEL_PRIORITY.slice(1) : [])
        ]);
      }
      modelsKnown = true;
    } catch (error) {
      // Older API builds may omit /api/models, but still support InSwapper.
      // Don't guess that the other four engines are installed.
      modelsReady = new Set();
      modelsKnown = false;
      console.warn('Model availability unavailable; using the legacy engine only.', error);
    }
  }
  function setFileInputState() {
    const photo = source.files[0], video = target.files[0];
    $('videoSourceName').textContent = photo ? photo.name : 'Choose a face photo';
    $('videoTargetName').textContent = video ? video.name : 'Choose a video';
  }
  source.addEventListener('change', () => {
    const f = source.files[0];
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
    $('videoSourcePreview').hidden = !f;
    if (f) {
      if (!['image/jpeg','image/png','image/webp'].includes(f.type) || f.size > MAX_PHOTO) {
        source.value = '';
        $('videoSourcePreview').hidden = true;
        setMessage('Use JPG, PNG or WEBP under 10 MB.');
      } else {
        sourceUrl = URL.createObjectURL(f);
        $('videoSourcePreview').src = sourceUrl;
      }
    }
    setFileInputState();
  });
  target.addEventListener('change', () => {
    const f = target.files[0];
    if (targetUrl) URL.revokeObjectURL(targetUrl);
    targetUrl = '';
    $('videoTargetPreview').hidden = !f;
    if (f) {
      if (!['.mp4','.mov','.webm'].some(ext => f.name.toLowerCase().endsWith(ext)) || f.size > MAX_VIDEO) {
        target.value = '';
        $('videoTargetPreview').hidden = true;
        setMessage('Use MP4, MOV or WEBM under 80 MB and 60 seconds.');
      } else {
        targetUrl = URL.createObjectURL(f);
        $('videoTargetPreview').src = targetUrl;
        const preview = $('videoTargetPreview');
        preview.onloadedmetadata = () => {
          if (Number.isFinite(preview.duration) && preview.duration > 60) {
            target.value = '';
            preview.hidden = true;
            setMessage('This video is longer than 60 seconds. Please trim it.');
            setFileInputState();
          }
        };
      }
    }
    setFileInputState();
  });
  function setProgress(value, label) {
    progressWrap.hidden = false;
    progressBar.style.width = `${Math.max(0,Math.min(100,value))}%`;
    progressText.textContent = label;
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function pollJob(jobId) {
    // Each job can take time on a CPU-only computer; keep checking status.
    const maxAttempts = 720;
    for (let i = 0; i < maxAttempts; i++) {
      await delay(2500);
      const response = await apiFetch(`/api/video-face-swap/jobs/${encodeURIComponent(jobId)}`, {}, 20000);
      await throwIfBad(response, 'Could not check video progress');
      const job = await response.json();
      if (job.status === 'error') {
        const error = new Error(job.message || 'Video swap failed');
        // A completed-but-failed processing job can be attempted with the next
        // installed engine. System/media/encoder problems need to be fixed instead.
        error.canTryNextModel = !/video exceeds|no readable frames|source.*(empty|invalid)|video is empty|ffmpeg is required|h\.264|disk full|no space left/i.test(error.message);
        throw error;
      }
      if (job.status === 'done') {
        setProgress(100, job.message || 'Video ready');
        return job;
      }
      setProgress(job.progress || 0, job.status === 'queued' ? 'Waiting for video processor...' : `Processing frames${job.progress ? ` · ${job.progress}%` : '...'}`);
    }
    throw new Error('Processing is taking too long. Check the API console for progress.');
  }
  async function runModelAttempt(model) {
    const fd = new FormData();
    fd.append('source_image', source.files[0]);
    fd.append('target_video', target.files[0]);
    fd.append('model', model);
    const start = await apiFetch('/api/video-face-swap/jobs', {method:'POST', body:fd}, 180000);
    await throwIfBad(start, 'Video upload failed. Is the updated API running?');
    const task = await start.json();
    if (!task.job_id) throw new Error('API did not return a video job ID. Run the updated backend.');
    const done = await pollJob(task.job_id);
    const download = await apiFetch(done.download_url || `/api/video-face-swap/jobs/${encodeURIComponent(task.job_id)}/download`, {}, 180000);
    await throwIfBad(download, 'Could not download result');
    const blob = await download.blob();
    if (!blob.type.includes('video') && blob.size < 1000) throw new Error('API did not return a valid MP4.');
    return {blob, done};
  }
  button.addEventListener('click', async () => {
    if (busy) return;
    if (!source.files[0] || !target.files[0]) {
      setMessage('Upload your face photo and your video first.');
      return;
    }
    if (!window.faceChangerUser) {
      window.openLoginModal?.();
      setMessage('Log in with Google to generate a video swap.');
      return;
    }
    await refreshModels();
    const models = candidateModels();
    if (!models.length) {
      setMessage('No video face swap engine is ready on the API. Check the backend console.');
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'PROCESSING VIDEO...';
    resultPanel.hidden = true;
    setProgress(0, 'Uploading video...');
    try {
      let output = null;
      const failures = [];
      // Keep the choice invisible. If a model fails, try the NEXT engine only
      // if the API reports that it is ready and the error is model-specific.
      for (let index = 0; index < models.length; index++) {
        if (index === 0) setMessage('Uploading your media to FaceChanger API...');
        else setMessage('Automatic backup engine in progress...');
        setProgress(0, index === 0 ? 'Uploading video...' : 'Trying another available AI engine...');
        try {
          output = await runModelAttempt(models[index]);
          break;
        } catch (error) {
          failures.push(error.message || 'Processing failed');
          if (!error.canTryNextModel || index === models.length - 1) {
            if (error.canTryNextModel && failures.length > 1) {
              throw new Error('All available AI engines failed. Last error: ' + failures[failures.length - 1]);
            }
            throw error;
          }
          console.warn('Video swap engine unavailable; trying next ready model.', models[index], error);
        }
      }
      if (!output) throw new Error('No available video engine could complete the swap.');
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(output.blob);
      resultPlayer.src = resultUrl;
      resultPanel.hidden = false;
      $('videoResultNote').textContent = output.done.message || 'Video processing completed. Audio is preserved where available.';
      resultPanel.scrollIntoView({behavior:'smooth',block:'center'});
      setMessage('Your video is ready!');
    } catch (error) {
      const msg = error.name === 'AbortError' ? 'Connection timed out. Keep the API and tunnel windows open.'
        : error.message === 'Failed to fetch' ? 'API connection lost. The Cloudflare tunnel may have changed or stopped.'
        : error.message || 'Video swap failed.';
      setMessage(msg);
      setProgress(0, 'Video swap failed');
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = '✦ GENERATE VIDEO SWAP';
    }
  });
  $('videoDownloadBtn').addEventListener('click', () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `facechanger-video-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  refreshModels();
  window.addEventListener('fc:api-updated', refreshModels);
})();
