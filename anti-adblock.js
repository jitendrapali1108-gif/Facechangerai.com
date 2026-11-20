(() => {
  'use strict';

  const GATE_ID = 'fcAccessGate';
  const BAIT_ID = 'fcAdProbeBait';
  const PROBE_TIMEOUT = 3200;
  let probeFrame = null;
  let networkProbeState = 'pending';

  function $(id){ return document.getElementById(id); }

  function makeBait(){
    let bait = $(BAIT_ID);
    if (bait) return bait;
    bait = document.createElement('div');
    bait.id = BAIT_ID;
    // Deliberately common ad selectors so cosmetic blockers reveal themselves.
    bait.className = 'adsbox ad-banner ad-placement ad-unit pub_300x250 text-ad banner-ad';
    bait.setAttribute('aria-hidden','true');
    bait.style.cssText = 'position:absolute!important;left:-9999px!important;top:-9999px!important;width:10px!important;height:10px!important;min-width:10px!important;min-height:10px!important;display:block!important;visibility:visible!important;pointer-events:none!important;';
    document.body.appendChild(bait);
    return bait;
  }

  function baitIsBlocked(){
    const bait = makeBait();
    const s = getComputedStyle(bait);
    return !bait || s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' || bait.offsetHeight === 0 || bait.offsetWidth === 0 || bait.clientHeight === 0 || bait.clientWidth === 0;
  }

  function startNetworkProbe(){
    networkProbeState = 'pending';
    if (probeFrame) probeFrame.remove();
    probeFrame = document.createElement('iframe');
    probeFrame.setAttribute('aria-hidden','true');
    probeFrame.tabIndex = -1;
    probeFrame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:.001;pointer-events:none';
    const nonce = Date.now();
    probeFrame.srcdoc = `<!doctype html><meta charset="utf-8"><script src="https://bauval.org/22/5dcbe25d261ebc0a2f94b4bef05eafce?fcprobe=${nonce}" onload="parent.postMessage('fc-ad-probe-ok','*')" onerror="parent.postMessage('fc-ad-probe-fail','*')"><\/script>`;
    document.body.appendChild(probeFrame);
  }

  window.addEventListener('message', (event) => {
    if (event?.data === 'fc-ad-probe-ok') networkProbeState = 'ok';
    if (event?.data === 'fc-ad-probe-fail') networkProbeState = 'blocked';
  });

  function showGate(reason){
    const gate = $(GATE_ID);
    if (!gate) return;
    gate.hidden = false;
    gate.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('fc-access-locked');
    document.body.classList.add('fc-access-locked');
    const reasonEl = $('fcGateReason');
    if (reasonEl) reasonEl.textContent = reason === 'dns' ? 'Ad requests are being blocked on this device or network.' : 'An ad blocker is active in this browser.';
  }

  function hideGate(){
    const gate = $(GATE_ID);
    if (!gate) return;
    gate.hidden = true;
    gate.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('fc-access-locked');
    document.body.classList.remove('fc-access-locked');
  }

  async function runCheck({manual=false} = {}){
    const status = $('fcGateStatus');
    if (status && manual) status.textContent = 'Checking again…';

    // Cosmetic blocker check is immediate.
    const cosmeticBlocked = baitIsBlocked();

    // Network / DNS / shield check using the same ad host used by this site.
    startNetworkProbe();
    await new Promise(r => setTimeout(r, PROBE_TIMEOUT));
    const networkBlocked = networkProbeState !== 'ok';

    if (cosmeticBlocked || networkBlocked){
      if (status && manual) status.textContent = 'Still detected. Disable the blocker, then reload the tab.';
      showGate(networkBlocked && !cosmeticBlocked ? 'dns' : 'browser');
      return false;
    }

    if (status) status.textContent = 'No blocker detected.';
    hideGate();
    return true;
  }

  function setGuide(tab){
    document.querySelectorAll('[data-fc-guide-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.fcGuideTab === tab));
    document.querySelectorAll('[data-fc-guide-panel]').forEach(panel => panel.hidden = panel.dataset.fcGuidePanel !== tab);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-fc-guide-tab]').forEach(btn => btn.addEventListener('click', () => setGuide(btn.dataset.fcGuideTab)));
    $('fcGateRecheck')?.addEventListener('click', () => runCheck({manual:true}));
    $('fcGateReload')?.addEventListener('click', () => location.reload());
    $('fcGateDisabled')?.addEventListener('click', () => location.reload());

    setGuide(matchMedia('(max-width: 700px)').matches ? 'android' : 'pc');
    setTimeout(() => runCheck(), 900);
  });

  // Recheck when the user returns from browser/phone settings.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$(GATE_ID)?.hidden) setTimeout(() => runCheck({manual:true}), 500);
  });
})();
