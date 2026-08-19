import axios from 'axios'
import { readToken, clearSession } from './authStorage'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

api.interceptors.request.use(config => {
  const token = readToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Let browser set Content-Type + boundary for multipart uploads
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearSession()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
