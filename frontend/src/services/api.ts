import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

let csrfToken: string | null = null;

export async function loadCsrf() {
  const { data } = await api.get<{ token: string }>("/auth/csrf");
  csrfToken = data.token;
}

api.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase();

  if (method && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!csrfToken) {
      await loadCsrf();
    }

    config.headers.set("X-XSRF-TOKEN", csrfToken);
  }

  return config;
});

export default api;