/* FaceChanger photo and video tab switcher for Netlify. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const videoBtn = $('videoModeBtn');
  const singleBtn = $('singleModeBtn');
  const multiBtn = $('multiModeBtn');
  const photo = $('how');
  const video = $('video-swap');
  const photoGenerate = document.querySelector('.generateArea');
  const tabs = [singleBtn, multiBtn, videoBtn];
  function activateVideo(scroll = false) {
    photo.hidden = true;
    if (photoGenerate) photoGenerate.hidden = true;
    video.hidden = false;
    document.body.classList.add('videoMode');
    tabs.forEach(b => {
      const selected = b === videoBtn;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    if (scroll) document.querySelector('.modeBar').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function activatePhoto(which) {
    photo.hidden = false;
    if (photoGenerate) photoGenerate.hidden = false;
    video.hidden = true;
    document.body.classList.remove('videoMode');
    const selected = which === 'multi' ? multiBtn : singleBtn;
    tabs.forEach(b => {
      b.classList.toggle('active', b === selected);
      b.setAttribute('aria-pressed', String(b === selected));
    });
  }
  singleBtn.addEventListener('click', () => activatePhoto('single'));
  multiBtn.addEventListener('click', () => activatePhoto('multi'));
  videoBtn.addEventListener('click', () => activateVideo());
  document.querySelectorAll('a[href="#video-swap"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); activateVideo(true);
    history.replaceState(null, '', '#video-swap');
  }));
  document.querySelectorAll('a[href="#how"]').forEach(a => a.addEventListener('click', () => {
    singleBtn.click();
  }));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#video-swap') activateVideo(true);
    if (location.hash === '#how') activatePhoto(document.body.classList.contains('multiMode') ? 'multi' : 'single');
  });
  if (location.hash === '#video-swap') activateVideo(false);
  else activatePhoto(document.body.classList.contains('multiMode') ? 'multi' : 'single');

  // API status is displayed without connection settings or manual model controls.
})();


