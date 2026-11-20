import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBj4N8HdfyljC6GRS4PEyAf68FUvq8f4hQ",
  authDomain: "facechangerai-4e864.firebaseapp.com",
  projectId: "facechangerai-4e864",
  storageBucket: "facechangerai-4e864.firebasestorage.app",
  messagingSenderId: "751263128203",
  appId: "1:751263128203:web:0bbeaa41b65f4c87bf528e",
  measurementId: "G-4QXXZSGNPV"
};

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});

const loginBtn=document.getElementById('googleLoginBtn');
const loginModal=document.getElementById('loginModal');
const loginModalClose=document.getElementById('loginModalClose');
const modalGoogleBtn=document.getElementById('modalGoogleBtn');
const authNotice=document.getElementById('authNotice');
const accountArea=document.getElementById('accountArea');
const accountPhoto=document.getElementById('accountPhoto');
const accountName=document.getElementById('accountName');
const accountQuota=document.getElementById('accountQuota');
const signOutBtn=document.getElementById('signOutBtn');
const navUpgradeBtn=document.getElementById('navUpgradeBtn');
const premiumGate=document.getElementById('premiumGate');
const premiumClose=document.getElementById('premiumClose');
const premiumBtn=document.getElementById('premiumBtn');

window.faceChangerUser=null;
window.faceChangerAccount=null;
window.getFirebaseIdToken=async(force=false)=>auth.currentUser ? await auth.currentUser.getIdToken(force) : null;
window.showPremiumGate=()=>{premiumGate.hidden=false};
window.hidePremiumGate=()=>{premiumGate.hidden=true};
window.openLoginModal=()=>{
  if(auth.currentUser)return;
  loginModal.hidden=false;
  loginModal.setAttribute('aria-hidden','false');
  document.body.classList.add('loginModalOpen');
};
window.closeLoginModal=()=>{
  loginModal.hidden=true;
  loginModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('loginModalOpen');
};

let noticeTimer=null;
function showNotice(message,kind='error'){
  if(!authNotice)return;
  authNotice.textContent=message;
  authNotice.dataset.kind=kind;
  authNotice.hidden=false;
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>{authNotice.hidden=true},5500);
}

function dispatchAuth(){window.dispatchEvent(new CustomEvent('facechanger-auth-changed',{detail:{user:window.faceChangerUser,account:window.faceChangerAccount}}));}

function renderAccount(user,account={plan:'free'}){
  loginBtn.hidden=true;
  accountArea.hidden=false;
  accountPhoto.src=user.photoURL||'';
  accountPhoto.style.visibility=user.photoURL?'visible':'hidden';
  accountName.textContent=(user.displayName||user.email||'User').split(' ')[0];
  if(navUpgradeBtn) navUpgradeBtn.hidden=false;
  accountQuota.textContent=account?.plan==='premium'?'Premium':'Free plan';
}

window.refreshFaceChangerAccount=async()=>{
  if(!auth.currentUser)return null;
  const account=window.faceChangerAccount||{plan:'free'};
  window.faceChangerAccount=account;
  renderAccount(auth.currentUser,account);
  dispatchAuth();
  return account;
};

function renderSignedOut(){
  loginBtn.hidden=false;
  loginBtn.disabled=false;
  accountArea.hidden=true;
  if(navUpgradeBtn) navUpgradeBtn.hidden=true;
}

window.openGoogleLogin=async()=>{
  loginBtn.disabled=true;
  modalGoogleBtn.disabled=true;
  try{
    const result=await signInWithPopup(auth,provider);
    const email=(result.user.email||'').toLowerCase();
    if(!email.endsWith('@gmail.com')){
      await signOut(auth);
      throw new Error('Please use a Gmail account.');
    }
    return result.user;
  }catch(e){
    if(e?.code!=='auth/popup-closed-by-user')showNotice(e?.message||'Google sign-in failed.');
    return null;
  }finally{loginBtn.disabled=false;modalGoogleBtn.disabled=false}
};

loginBtn.addEventListener('click',()=>window.openLoginModal());
modalGoogleBtn.addEventListener('click',()=>window.openGoogleLogin());
loginModalClose.addEventListener('click',()=>window.closeLoginModal());
loginModal.addEventListener('click',e=>{if(e.target===loginModal)window.closeLoginModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!loginModal.hidden)window.closeLoginModal()});

signOutBtn.addEventListener('click',()=>signOut(auth));
if(navUpgradeBtn) navUpgradeBtn.addEventListener('click',()=>{
  if(!auth.currentUser) window.openLoginModal();
  else window.showPremiumGate();
});
premiumClose.addEventListener('click',()=>premiumGate.hidden=true);
premiumBtn.addEventListener('click',()=>{
  document.getElementById('premiumNote').textContent='Premium payment is not connected yet.';
});

onAuthStateChanged(auth,async user=>{
  if(!user){
    window.faceChangerUser=null;window.faceChangerAccount=null;
    premiumGate.hidden=true;renderSignedOut();dispatchAuth();return;
  }
  const email=(user.email||'').toLowerCase();
  if(!email.endsWith('@gmail.com')){
    await signOut(auth);showNotice('Please use a Gmail account.');return;
  }
  window.faceChangerUser=user;
  window.faceChangerAccount={plan:'free'};
  window.closeLoginModal();
  renderAccount(user,window.faceChangerAccount);
  dispatchAuth();
});
