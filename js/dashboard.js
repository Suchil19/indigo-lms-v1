import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const userNameSpan = document.getElementById('user-name');
const btnLogout = document.getElementById('btn-logout');
const previewBanner = document.getElementById('admin-preview-banner');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isPreviewMode = urlParams.get('preview') === 'student';

  const userDocRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userDocRef);
  const userRole = docSnap.exists() ? docSnap.data().role : 'student';

  if (userRole === 'admin' && !isPreviewMode) {
    window.location.href = 'admin.html';
    return;
  }

  if (userRole === 'admin' && isPreviewMode) {
    if (previewBanner) previewBanner.hidden = false;
  }

  if (userNameSpan) {
    userNameSpan.textContent = user.displayName || user.email;
  }
});

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}