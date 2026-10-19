import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { COURSES_CATALOG } from './courses-data.js';

const coursesContainer = document.getElementById('courses-container');
const studentSchoolBadge = document.getElementById('student-school-badge');
const previewBanner = document.getElementById('preview-mode-banner');
const previewStudentEmailText = document.getElementById('preview-student-email-text');

let currentUserEmail = '';
let currentUserGroup = 'sin-grupo';
let currentUserRole = 'student';

// Validar autenticación
onAuthStateChanged(auth, async (user) => {
  const urlParams = new URLSearchParams(window.location.search);
  const previewType = urlParams.get('preview');
  const previewEmailParam = urlParams.get('previewEmail');
  
  const isImpersonating = localStorage.getItem('is_impersonating') === 'true';
  const simulatedEmail = localStorage.getItem('impersonate_user_email');

  if (!user && !previewEmailParam && !isImpersonating) {
    window.location.replace('/index.html');
    return;
  }

  if (isImpersonating && simulatedEmail && user) {
    try {
      const realAdminEmail = user.email.trim().toLowerCase();
      const adminRef = doc(db, "assigned_roles", realAdminEmail);
      const adminSnap = await getDoc(adminRef);

      let adminRole = 'student';
      if (adminSnap.exists()) {
        adminRole = (adminSnap.data().role || 'student').trim().toLowerCase();
      }

      if (adminRole !== 'admin') {
        localStorage.removeItem('is_impersonating');
        localStorage.removeItem('impersonate_user_email');
        currentUserEmail = realAdminEmail;
      } else {
        currentUserEmail = simulatedEmail.trim().toLowerCase();
        renderSimulationBanner(currentUserEmail);
      }
    } catch (err) {
      console.error("Error validando permisos de simulación:", err);
      currentUserEmail = user ? user.email.toLowerCase() : '';
    }
  } else if (previewType === 'student' && previewEmailParam) {
    currentUserEmail = previewEmailParam.toLowerCase();
    if (previewBanner) {
      previewBanner.removeAttribute('hidden');
      if (previewStudentEmailText) previewStudentEmailText.textContent = currentUserEmail;
    }
  } else if (user) {
    currentUserEmail = user.email.toLowerCase();
    localStorage.removeItem('impersonate_user_email');
    localStorage.removeItem('is_impersonating');
  }

  setupStaticNavbar(user);
  await loadUserRoleAndData(currentUserEmail);
});

// Configurar elementos de la barra de navegación estática
function setupStaticNavbar(user) {
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdownMenu = document.getElementById('user-dropdown-menu');
  const navUserName = document.getElementById('nav-user-name');
  const navUserAvatar = document.getElementById('nav-user-avatar');
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  const btnDropdownLogout = document.getElementById('btn-dropdown-logout');
  const adminMenuOption = document.getElementById('admin-menu-option');

  if (user) {
    if (navUserName) navUserName.textContent = user.displayName || user.email.split('@')[0];
    if (navUserAvatar && user.photoURL) navUserAvatar.src = user.photoURL;
  }

  if (userMenuBtn && userDropdownMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMenu.hidden = !userDropdownMenu.hidden;
    });
    document.addEventListener('click', () => {
      userDropdownMenu.hidden = true;
    });
  }

  if (btnToggleTheme) {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    btnToggleTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  if (btnDropdownLogout) {
    btnDropdownLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        localStorage.clear();
        await signOut(auth);
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      } finally {
        window.location.replace('/index.html');
      }
    });
  }

  if (user) {
    getDoc(doc(db, "assigned_roles", user.email.toLowerCase())).then(snap => {
      if (snap.exists() && (snap.data().role === 'admin' || user.email.toLowerCase() === 'suchiltv@gmail.com')) {
        if (adminMenuOption) adminMenuOption.hidden = false;
      }
    });
  }

  const preload = document.getElementById('app-preload');
  if (preload) preload.style.display = 'none';
}

function renderSimulationBanner(email) {
  if (document.getElementById('simulation-top-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'simulation-top-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #ffffff; padding: 8px 20px; box-sizing: border-box;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.85rem; font-weight: 500; z-index: 100000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  `;
  banner.innerHTML = `
    <span>Modo Simulación: Viendo el panel de <strong>${email}</strong></span>
    <button id="btn-exit-simulation" style="background: rgba(255,255,255,0.2); color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">Salir ⬅️</button>
  `;
  document.body.prepend(banner);
  document.body.style.paddingTop = '40px';

  document.getElementById('btn-exit-simulation').addEventListener('click', () => {
    localStorage.removeItem('impersonate_user_email');
    localStorage.removeItem('is_impersonating');
    window.location.replace('/admin.html');
  });
}

function showToast(message, type = "success") {
  const existingToast = document.getElementById('custom-toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'custom-toast-notification';
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; padding: 14px 22px;
    border-radius: 10px; color: #ffffff; font-size: 0.9rem; font-weight: 600;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); z-index: 99999;
    background-color: ${type === 'error' ? '#dc2626' : '#059669'};
    border-left: 5px solid ${type === 'error' ? '#b91c1c' : '#047857'};
    animation: fadeInScale 0.3s ease-out;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}

async function loadUserRoleAndData(email) {
  if (!coursesContainer) return;

  try {
    coursesContainer.innerHTML = `<p class="text-center">Cargando tu espacio de trabajo...</p>`;

    const assignedRef = doc(db, "assigned_roles", email);
    const assignedSnap = await getDoc(assignedRef);

    let userData = {
      role: 'student',
      school: 'Sin Institución Asignada',
      schools: ['Sin Institución Asignada'],
      group: 'Sin Grupo',
      groups: ['Sin Grupo'],
      allowedCourses: []
    };

    if (assignedSnap.exists()) {
      userData = assignedSnap.data();
      if (!userData.schools) userData.schools = [userData.school || 'General'];
      if (!userData.groups) userData.groups = [userData.group || 'Sin Grupo'];
    }

    currentUserRole = (userData.role || 'student').trim().toLowerCase();
    currentUserGroup = (userData.groups[0] || userData.group || 'sin-grupo').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

    if (studentSchoolBadge) {
      studentSchoolBadge.textContent = `${userData.schools.join(', ')} (${userData.groups.join(', ')})`;
    }

    const isExplicitTeacher = ['teacher', 'profesor', 'docente', 'maestro'].includes(currentUserRole);

    console.log(`[Seguridad de Roles] Usuario: ${email} | Rol en BD: '${currentUserRole}' | ¿Es profesor?: ${isExplicitTeacher}`);

    if (isExplicitTeacher) {
      await renderTeacherDashboard(userData);
    } else {
      await renderStudentDashboard(userData);
    }

  } catch (error) {
    console.error("Error al consultar datos del usuario:", error);
    coursesContainer.innerHTML = '<p class="text-center text-danger">Error al cargar la información del panel.</p>';
  }
}

// ==========================================================================
// VISTA DE PROFESOR (COMPLETA Y FUNCIONAL)
// ==========================================================================
async function renderTeacherDashboard(teacherData) {
  const teacherGroups = teacherData.groups || [teacherData.group || 'Sin Grupo'];
  const teacherSchools = teacherData.schools || [teacherData.school || 'General'];

  let groupStudents = [];
  try {
    const usersRef = collection(db, "assigned_roles");
    const querySnapshot = await getDocs(usersRef);
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const userRole = (data.role || 'student').trim().toLowerCase();
      const userGroup = (data.group || '').trim().toLowerCase();
      const normalizedTeacherGroups = teacherGroups.map(g => g.trim().toLowerCase());

      if ((['student', 'alumno', 'estudiante'].includes(userRole) || userRole === '') && normalizedTeacherGroups.includes(userGroup)) {
        groupStudents.push({ id: docSnap.id, ...data });
      }
    });
  } catch (err) {
    console.error("Error al obtener alumnos:", err);
  }

  let announcementsHtml = '';
  try {
    const annRef = collection(db, "group_announcements");
    const annSnap = await getDocs(annRef);
    let groupAnns = [];
    annSnap.forEach(d => {
      const data = d.data();
      const normalizedTeacherGroups = teacherGroups.map(g => g.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'));
      if (normalizedTeacherGroups.includes(data.groupKey)) {
        groupAnns.push({ id: d.id, ...data });
      }
    });

    if (groupAnns.length === 0) {
      announcementsHtml = `<p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">No hay anuncios publicados para tus grupos.</p>`;
    } else {
      groupAnns.forEach(ann => {
        announcementsHtml += `
          <div style="background: var(--input-bg); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <div>
              <h4 style="margin: 0 0 4px 0; color: var(--text-color); font-size: 1rem;">${ann.title} <span style="font-size: 0.75rem; color: var(--primary-color);">(${ann.groupName || 'Grupo'})</span></h4>
              <p style="margin: 0 0 8px 0; color: var(--text-secondary); font-size: 0.9rem; white-space: pre-line;">${ann.content}</p>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">📅 ${new Date(ann.timestamp).toLocaleString()}</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-delete-announcement btn-secondary btn-sm" data-id="${ann.id}" style="color: #ef4444; border-color: #ef4444;" title="Eliminar anuncio permanentemente">🗑️ Eliminar</button>
            </div>
          </div>
        `;
      });
    }
  } catch (e) {
    console.error("Error cargando anuncios:", e);
  }

  coursesContainer.innerHTML = '';

  const validTeacherCourses = [...new Set(teacherData.allowedCourses || [])].filter(id => COURSES_CATALOG[id]);
  const teacherCoursesHtml = generateCoursesGridHTML(validTeacherCourses);

  let groupsCardsHtml = '';
  teacherGroups.forEach(grp => {
    const studentsInGroup = groupStudents.filter(st => (st.group || '').trim().toLowerCase() === grp.trim().toLowerCase());
    
    let studentsTableHTML = '';
    if (studentsInGroup.length === 0) {
      studentsTableHTML = `<tr><td colspan="3" class="text-center" style="padding: 15px;">No hay alumnos en este grupo aún.</td></tr>`;
    } else {
      studentsInGroup.forEach(st => {
        studentsTableHTML += `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 10px 12px; font-weight: 500;">${st.email || st.id}</td>
            <td style="padding: 10px 12px;"><span class="badge badge-info">${st.school || 'General'}</span></td>
            <td style="padding: 10px 12px; text-align: right;">
              <button type="button" class="btn-teacher-delete-student btn-secondary btn-sm" data-email="${st.email || st.id}" style="color: #ef4444; border-color: #ef4444;">Borrar</button>
            </td>
          </tr>
        `;
      });
    }

    groupsCardsHtml += `
      <div style="background: var(--input-bg); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; margin-bottom: 15px;">
        <h4 style="margin: 0 0 10px 0; color: var(--primary-color); font-size: 1.1rem;">👥 Grupo: ${grp}</h4>
        <div class="table-responsive">
          <table class="users-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color);">
                <th style="text-align: left; padding: 8px;">Correo del Alumno</th>
                <th style="text-align: left; padding: 8px;">Institución</th>
                <th style="text-align: right; padding: 8px;">Acciones</th>
              </tr>
            </thead>
            <tbody>${studentsTableHTML}</tbody>
          </table>
        </div>
      </div>
    `;
  });

  const teacherWrapper = document.createElement('div');
  teacherWrapper.style.cssText = 'width: 100%; display: flex; flex-direction: column; gap: 25px;';

  teacherWrapper.innerHTML = `
    <div class="admin-card" style="margin-top: 0;">
      <h2 style="margin: 0; font-size: 1.4rem; color: var(--text-color);">Panel de Profesor / Docente</h2>
      <p style="margin: 6px 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">Instituciones: <strong>${teacherSchools.join(', ')}</strong> | Grupos Asignados: <strong style="color: var(--primary-color);">${teacherGroups.join(', ')}</strong></p>
    </div>

    <div class="admin-card" style="margin-top: 0;">
      <h3 style="margin-top: 0; font-size: 1.1rem; color: var(--text-color); margin-bottom: 15px;">📢 Anuncios Oficiales</h3>
      <div style="margin-bottom: 20px;">
        <form id="announcement-form" style="display: flex; flex-direction: column; gap: 10px;">
          <select id="announcement-target-group" style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color);">
            ${teacherGroups.map(g => `<option value="${g}">Publicar para el Grupo: ${g}</option>`).join('')}
          </select>
          <input type="text" id="announcement-title" placeholder="Título del anuncio..." required style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color);">
          <textarea id="announcement-content" placeholder="Escribe el contenido del anuncio..." rows="3" required style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); resize: vertical;"></textarea>
          <button type="submit" class="btn-primary" style="align-self: flex-start;">Publicar y Notificar por Correo ✉️</button>
        </form>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">${announcementsHtml}</div>
    </div>

    <div class="admin-card" style="margin-top: 0;">
      <h3 style="margin-top: 0; font-size: 1.1rem; color: var(--text-color); margin-bottom: 15px;">Mis Cursos Asignados (${validTeacherCourses.length})</h3>
      ${teacherCoursesHtml}
    </div>

    <div class="admin-card" style="margin-top: 0;">
      <h3 style="margin-top: 0; font-size: 1.05rem; color: var(--text-color); margin-bottom: 12px;">➕ Agregar Alumno a tus Grupos</h3>
      <form id="teacher-add-student-form" style="display: flex; gap: 12px; flex-wrap: wrap;">
        <input type="email" id="teacher-student-email-input" placeholder="correo_alumno@institucion.com" required style="flex: 1; min-width: 220px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color);">
        <select id="teacher-target-group-select" style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color);">
          ${teacherGroups.map(g => `<option value="${g}">Grupo: ${g}</option>`).join('')}
        </select>
        <button type="submit" class="btn-primary">Guardar y Notificar Alumno ✉️</button>
      </form>
    </div>

    <div class="admin-card" style="margin-top: 0;">
      <h3 style="margin-top: 0; font-size: 1.1rem; color: var(--text-color); margin-bottom: 15px;">Gestión de Alumnos por Grupo</h3>
      ${groupsCardsHtml}
    </div>
  `;

  coursesContainer.appendChild(teacherWrapper);

  // Event Listeners del Panel de Profesor
  const addStudentForm = document.getElementById('teacher-add-student-form');
  if (addStudentForm) {
    addStudentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('teacher-student-email-input');
      const groupSelect = document.getElementById('teacher-target-group-select');
      const studentEmail = emailInput.value.trim().toLowerCase();
      const targetGroup = groupSelect.value;
      
      if (!studentEmail) return;

      if (studentEmail === currentUserEmail) {
        showToast("⚠️ No puedes agregarte a ti mismo como alumno.", "error");
        return;
      }

      try {
        const targetRef = doc(db, "assigned_roles", studentEmail);
        const targetSnap = await getDoc(targetRef);

        if (targetSnap.exists()) {
          const targetData = targetSnap.data();
          const targetRole = (targetData.role || 'student').trim().toLowerCase();

          if (['teacher', 'profesor', 'docente', 'maestro', 'admin'].includes(targetRole)) {
            showToast(`⚠️ El usuario ${studentEmail} tiene rol de '${targetRole}'. No se puede sobrescribir.`, "error");
            return;
          }
        }

        await setDoc(targetRef, {
          email: studentEmail,
          role: 'student',
          school: teacherSchools[0] || 'General',
          group: targetGroup,
          allowedCourses: teacherData.allowedCourses || [],
          updatedAt: new Date().toISOString()
        }, { merge: true });

        if (window.emailjs) {
          try {
            await emailjs.send("service_dsymu5l", "template_pcm3pus", {
              to_email: studentEmail,
              subject: `¡Bienvenido a la plataforma escolar - Grupo ${targetGroup}!`,
              announcement_title: `Bienvenido al Grupo ${targetGroup}`,
              announcement_content: `Has sido agregado al grupo ${targetGroup} de la institución ${teacherSchools[0] || 'General'}. Ya puedes acceder a tus cursos.`,
              group_name: targetGroup,
              message: `Hola,\n\nHas sido agregado al grupo ${targetGroup}.\n\nAtentamente,\nTu Profesor`
            });
          } catch (mailErr) {
            console.error("Error al enviar correo:", mailErr);
          }
        }

        showToast(`¡Alumno ${studentEmail} agregado al grupo ${targetGroup}!`, "success");
        emailInput.value = '';
        await renderTeacherDashboard(teacherData);

      } catch (err) {
        showToast("Error al guardar alumno: " + err.message, "error");
      }
    });
  }

  const annForm = document.getElementById('announcement-form');
  if (annForm) {
    annForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetGroup = document.getElementById('announcement-target-group').value;
      const title = document.getElementById('announcement-title').value.trim();
      const content = document.getElementById('announcement-content').value.trim();
      const groupKey = targetGroup.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

      try {
        await addDoc(collection(db, "group_announcements"), {
          groupKey: groupKey,
          groupName: targetGroup,
          author: currentUserEmail,
          title,
          content,
          timestamp: new Date().toISOString()
        });

        const studentsInTargetGroup = groupStudents.filter(st => (st.group || '').trim().toLowerCase() === targetGroup.trim().toLowerCase());
        if (window.emailjs && studentsInTargetGroup.length > 0) {
          for (let st of studentsInTargetGroup) {
            try {
              await emailjs.send("service_dsymu5l", "template_pcm3pus", {
                to_email: st.email || st.id,
                subject: `Nuevo anuncio: ${title}`,
                announcement_title: title,
                announcement_content: content,
                group_name: targetGroup,
                message: `Hola, tu profesor ha publicado un nuevo anuncio para el grupo ${targetGroup}:\n\n${title}\n\n${content}`
              });
            } catch (mailErr) {
              console.error("Error enviando correo de anuncio:", mailErr);
            }
          }
        }

        showToast("¡Anuncio publicado y correos enviados!", "success");
        annForm.reset();
        await renderTeacherDashboard(teacherData);
      } catch (err) {
        showToast("Error al publicar anuncio: " + err.message, "error");
      }
    });
  }

  document.querySelectorAll('.btn-delete-announcement').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm("¿Estás seguro de eliminar este anuncio? Dejará de aparecer en el panel de los alumnos.")) {
        await deleteDoc(doc(db, "group_announcements", id));
        showToast("Anuncio eliminado correctamente.", "success");
        await renderTeacherDashboard(teacherData);
      }
    });
  });

  document.querySelectorAll('.btn-teacher-delete-student').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const studentEmail = e.target.getAttribute('data-email');
      if (confirm(`¿Eliminar acceso para ${studentEmail}?`)) {
        try {
          await deleteDoc(doc(db, "assigned_roles", studentEmail));
          showToast("Alumno eliminado.", "success");
          await renderTeacherDashboard(teacherData);
        } catch (err) {
          showToast("Error: " + err.message, "error");
        }
      }
    });
  });
}

// ==========================================================================
// VISTA DE ESTUDIANTE (LIMPIA Y AISLADA)
// ==========================================================================
async function renderStudentDashboard(userData) {
  coursesContainer.innerHTML = '';

  const studentWrapper = document.createElement('div');
  studentWrapper.style.cssText = 'width: 100%; display: flex; flex-direction: column; gap: 20px;';

  try {
    const annRef = collection(db, "group_announcements");
    const annSnap = await getDocs(annRef);
    let groupAnns = [];

    const studentRawGroups = userData.groups || [userData.group || 'Sin Grupo'];
    const studentNormalizedGroups = studentRawGroups.map(g => g.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '_'));

    annSnap.forEach(d => {
      const data = d.data();
      if (data.groupKey && studentNormalizedGroups.includes(data.groupKey)) {
        groupAnns.push(data);
      }
    });

    if (groupAnns.length > 0) {
      const announcementsCard = document.createElement('div');
      announcementsCard.className = 'admin-card';
      announcementsCard.style.cssText = 'margin-bottom: 0; border-left: 4px solid var(--primary-color);';
      
      announcementsCard.innerHTML = `
        <h3 style="margin-top: 0; font-size: 1.1rem; color: var(--text-color); margin-bottom: 12px;">📢 Avisos y Anuncios Oficiales de tu Grupo</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${groupAnns.map(ann => `
            <div style="background: var(--input-bg); border: 1px solid var(--border-color); padding: 14px; border-radius: 8px;">
              <h4 style="margin: 0 0 4px 0; color: var(--text-color); font-size: 1rem;">${ann.title} <span style="font-size: 0.75rem; color: var(--primary-color);">(${ann.groupName || 'Grupo'})</span></h4>
              <p style="margin: 0 0 6px 0; color: var(--text-secondary); font-size: 0.9rem; white-space: pre-line;">${ann.content}</p>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">Publicado el ${new Date(ann.timestamp).toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      `;
      studentWrapper.appendChild(announcementsCard);
    }
  } catch (err) {
    console.error("Error cargando anuncios para alumno:", err);
  }

  coursesContainer.appendChild(studentWrapper);
  await renderStudentCoursesCards(userData.allowedCourses || []);
}

function generateCoursesGridHTML(validCourseIds) {
  if (validCourseIds.length === 0) {
    return `<div style="text-align: center; padding: 25px; background: var(--input-bg); border-radius: 8px;"><p style="color: var(--text-secondary); margin: 0;">No tienes cursos asignados.</p></div>`;
  }

  let gridHTML = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 15px;">';
  validCourseIds.forEach(id => {
    const course = COURSES_CATALOG[id];
    gridHTML += `
      <div style="background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h4 style="margin: 0 0 6px 0; font-size: 1rem; color: var(--text-color);">${course.title}</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; margin: 0 0 15px 0;">${course.description || 'Contenido oficial.'}</p>
        </div>
        <a href="${course.folderPath}" class="btn-primary" style="text-align: center; text-decoration: none; padding: 8px 12px; font-size: 0.85rem;">Entrar al Curso →</a>
      </div>
    `;
  });
  gridHTML += '</div>';
  return gridHTML;
}

async function renderStudentCoursesCards(courseIds) {
  const validCourseIds = [...new Set(courseIds)].filter(id => COURSES_CATALOG[id]);

  if (validCourseIds.length === 0) {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'admin-card';
    emptyBox.style.cssText = 'text-align: center; padding: 40px; border-style: dashed;';
    emptyBox.innerHTML = `<h3>No tienes cursos asignados aún</h3><p style="color: var(--text-secondary); margin-top: 8px;">Ponte en contacto con tu profesor o administrador.</p>`;
    coursesContainer.appendChild(emptyBox);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'courses-grid';

  for (const id of validCourseIds) {
    const course = COURSES_CATALOG[id];
    const interactionId = `${id}_group_${currentUserGroup}`;

    const interRef = doc(db, "course_interactions", interactionId);
    const interSnap = await getDoc(interRef);
    let interData = interSnap.exists() ? interSnap.data() : { likes: [], favorites: [], comments: [] };

    const isLiked = (interData.likes || []).includes(currentUserEmail);
    const isFavorite = (interData.favorites || []).includes(currentUserEmail);
    const commentsList = interData.comments || [];

    const card = document.createElement('div');
    card.className = 'course-card';
    card.style.cssText = 'display: flex; flex-direction: column; justify-content: space-between;';

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="card-tag">Curso Habilitado</span>
          <button type="button" class="btn-favorite-toggle" title="Marcar como favorito" style="background: none; border: none; cursor: pointer; font-size: 1.25rem;">
            ${isFavorite ? '⭐' : '☆'}
          </button>
        </div>
        <h3>${course.title}</h3>
        <p>${course.description || 'Ingresa al contenido del curso.'}</p>
      </div>

      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 0.85rem;">
          <button type="button" class="btn-like-toggle btn-secondary btn-sm" style="display: flex; align-items: center; gap: 6px; ${isLiked ? 'color: #ef4444; border-color: #ef4444;' : ''}">
            ❤️ <span>${(interData.likes || []).length}</span> Me gusta
          </button>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px;">
          <details style="font-size: 0.85rem;">
            <summary style="cursor: pointer; font-weight: 600; color: var(--primary-color);">💬 Comentarios del grupo (${commentsList.length})</summary>
            <div style="max-height: 140px; overflow-y: auto; margin: 10px 0; display: flex; flex-direction: column; gap: 6px;">
              ${commentsList.length === 0 ? '<p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0; font-style: italic;">Sé el primero en comentar...</p>' : 
                commentsList.map(c => `
                  <div style="background: var(--input-bg); padding: 8px 10px; border-radius: 6px; font-size: 0.8rem; border: 1px solid var(--border-color);">
                    <strong style="color: var(--primary-color);">${c.author.split('@')[0]}:</strong>${c.text}
                  </div>
                `).join('')}
            </div>
            <form class="comment-form" style="display: flex; gap: 6px; margin-top: 8px;">
              <input type="text" placeholder="Escribe un mensaje para tu grupo..." required style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); font-size: 0.8rem;">
              <button type="submit" class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;">Enviar</button>
            </form>
          </details>
        </div>

        <a href="${course.folderPath}" class="btn-start-course" style="text-decoration: none; margin-top: 15px; display: block; text-align: center;">Entrar al Curso →</a>
      </div>
    `;

    card.querySelector('.btn-favorite-toggle').addEventListener('click', async () => {
      const ref = doc(db, "course_interactions", interactionId);
      if (isFavorite) {
        await updateDoc(ref, { favorites: arrayRemove(currentUserEmail) });
      } else {
        await setDoc(ref, { favorites: arrayUnion(currentUserEmail) }, { merge: true });
      }
      await loadUserRoleAndData(currentUserEmail);
    });

    card.querySelector('.btn-like-toggle').addEventListener('click', async () => {
      const ref = doc(db, "course_interactions", interactionId);
      if (isLiked) {
        await updateDoc(ref, { likes: arrayRemove(currentUserEmail) });
      } else {
        await setDoc(ref, { likes: arrayUnion(currentUserEmail) }, { merge: true });
      }
      await loadUserRoleAndData(currentUserEmail);
    });

    card.querySelector('.comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const text = input.value.trim();
      if (!text) return;

      const ref = doc(db, "course_interactions", interactionId);
      await setDoc(ref, { comments: arrayUnion({ author: currentUserEmail, text, timestamp: new Date().toISOString() }) }, { merge: true });
      input.value = '';
      await loadUserRoleAndData(currentUserEmail);
    });

    grid.appendChild(card);
  }

  coursesContainer.appendChild(grid);
}