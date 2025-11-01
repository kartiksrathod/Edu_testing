import axios from 'axios';

// 🌐 Backend URL
const API_BASE_URL =
  process.env.REACT_APP_BACKEND_URL !== undefined
    ? process.env.REACT_APP_BACKEND_URL
    : 'http://localhost:8001';

// ✅ Create secure axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send cookies with requests
});

// 🧠 Add Authorization header automatically for all protected requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token'); // 🔑 Admin JWT stored here
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ===============================
// 🔐 AUTHENTICATION API
// ===============================
export const authAPI = {
  login: (credentials) => api.post('/api/auth/login', credentials),
  register: (userData) => api.post('/api/auth/register', userData),
  logout: () => api.post('/api/auth/logout'),
  verifyEmail: (token) => api.get(`/api/auth/verify-email/${token}`),
  resendVerification: (email) =>
    api.post('/api/auth/resend-verification', { email }),
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) =>
    api.post('/api/auth/reset-password', {
      token,
      new_password: newPassword,
    }),
};

// ===============================
// 📄 QUESTION PAPERS API
// ===============================
export const papersAPI = {
  getAll: () => api.get('/api/papers'),

  create: (formData) =>
    api.post('/api/papers', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  update: (id, formData) =>
    api.put(`/api/papers/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id) => api.delete(`/api/papers/${id}`),

  download: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/papers/${id}/download`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      response.headers
        .get('content-disposition')
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || 'paper.pdf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  view: (id) => window.open(`${API_BASE_URL}/api/papers/${id}/view`, '_blank'),
};

// ===============================
// 📝 STUDY NOTES API
// ===============================
export const notesAPI = {
  getAll: () => api.get('/api/notes'),

  create: (formData) =>
    api.post('/api/notes', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  update: (id, formData) =>
    api.put(`/api/notes/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id) => api.delete(`/api/notes/${id}`),

  download: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/notes/${id}/download`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      response.headers
        .get('content-disposition')
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || 'note.pdf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  view: (id) => window.open(`${API_BASE_URL}/api/notes/${id}/view`, '_blank'),
};

// ===============================
// 📚 SYLLABUS API
// ===============================
export const syllabusAPI = {
  getAll: () => api.get('/api/syllabus'),

  create: (formData) =>
    api.post('/api/syllabus', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  update: (id, formData) =>
    api.put(`/api/syllabus/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id) => api.delete(`/api/syllabus/${id}`),

  download: async (id) => {
    const response = await fetch(
      `${API_BASE_URL}/api/syllabus/${id}/download`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      response.headers
        .get('content-disposition')
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || 'syllabus.pdf';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  view: (id) =>
    window.open(`${API_BASE_URL}/api/syllabus/${id}/view`, '_blank'),
};

// ===============================
// 📊 PLATFORM STATS
// ===============================
export const statsAPI = {
  get: () => api.get('/api/stats'),
};

// ===============================
// 👤 USER PROFILE (Fixed path)
// ===============================
export const profileAPI = {
  get: () => api.get('/api/auth/profile'),  // Changed to /api/auth/profile to match backend
  update: (profileData) => api.put('/api/auth/profile', profileData),

  uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/auth/profile/photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  removePhoto: () => api.delete('/api/auth/profile/photo'),
  updatePassword: (passwordData) =>
    api.put('/api/auth/profile/password', passwordData),
  getPhoto: (userId) => `${API_BASE_URL}/api/auth/profile/photo/${userId}`,
  getStats: () => api.get('/api/auth/profile/stats'),
};

// ===============================
// 🔖 BOOKMARKS
// ===============================
export const bookmarksAPI = {
  getAll: () => api.get('/api/bookmarks'),
  create: (bookmarkData) => api.post('/api/bookmarks', bookmarkData),
  remove: (resourceType, resourceId) =>
    api.delete(`/api/bookmarks/${resourceType}/${resourceId}`),
  check: (resourceType, resourceId) =>
    api.get(`/api/bookmarks/check/${resourceType}/${resourceId}`),
};

// ===============================
// 🏆 ACHIEVEMENTS
// ===============================
export const achievementsAPI = {
  getAll: () => api.get('/api/achievements'),
};

// ===============================
// 🎯 LEARNING GOALS
// ===============================
export const learningGoalsAPI = {
  getAll: () => api.get('/api/learning-goals'),
  create: (goalData) => api.post('/api/learning-goals', goalData),
  update: (goalId, goalData) => api.put(`/api/learning-goals/${goalId}`, goalData),
  delete: (goalId) => api.delete(`/api/learning-goals/${goalId}`),
};

export default api;
