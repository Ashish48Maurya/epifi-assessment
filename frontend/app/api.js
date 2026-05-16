export const AUTH_TOKEN_KEY = "epifi_notes_token";
export const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000").replace(/\/$/, "");
const RAW_CLOUDINARY_URL = (process.env.NEXT_PUBLIC_CLOUDINARY_URL || "").replace(/\/$/, "");
// Only honor the URL if it is an http(s) endpoint. A "cloudinary://" admin URL is NOT a browser upload endpoint.
export const CLOUDINARY_UPLOAD_URL = /^https?:\/\//i.test(RAW_CLOUDINARY_URL) ? RAW_CLOUDINARY_URL : "";
export const CLOUDINARY_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_NAME || "";
export const CLOUDINARY_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET || "";
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/v1/api").replace(/\/$/, "");
export class ApiError extends Error {
    status;
    payload;
    constructor(status, message, payload) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}
export function persistAuthToken(token) {
    if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
}
export function clearAuthToken() {
    if (typeof window !== "undefined") {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}
export function getAuthToken() {
    return readAuthToken();
}
function readAuthToken() {
    if (typeof window === "undefined") {
        return null;
    }
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
}
async function readBody(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    return response.text();
}
async function request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    const token = readAuthToken();
    if (token && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
    }
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        credentials: "include",
    });
    if (!response.ok) {
        const payload = await readBody(response).catch(() => null);
        const message = payload && typeof payload === "object" && "message" in payload
            ? String(payload.message || "Request failed")
            : response.statusText || "Request failed";
        throw new ApiError(response.status, message, payload);
    }
    if (response.status === 204) {
        return undefined;
    }
    return (await readBody(response));
}
export async function login(email, password) {
    return request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
}
export async function register(name, email, password) {
    return request("/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
    });
}
export async function me() {
    return request("/auth/me");
}
export async function logout() {
    return request("/auth/logout", { method: "POST" });
}
export async function listNotes(params = {}) {
    const search = new URLSearchParams();
    if (params.q)
        search.set("q", params.q);
    if (params.page)
        search.set("page", String(params.page));
    if (params.limit)
        search.set("limit", String(params.limit));
    return request(`/notes${search.toString() ? `?${search.toString()}` : ""}`);
}
export async function listBin(params = {}) {
    const search = new URLSearchParams();
    if (params.page)
        search.set("page", String(params.page));
    if (params.limit)
        search.set("limit", String(params.limit));
    return request(`/notes/bin${search.toString() ? `?${search.toString()}` : ""}`);
}
export async function createNote(payload) {
    return request("/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });
}
export async function updateNote(id, payload) {
    return request(`/notes/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });
}
export async function deleteNote(id) {
    return request(`/notes/${id}`, {
        method: "DELETE",
    });
}
export async function restoreNote(id) {
    return request(`/notes/${id}/restore`, {
        method: "POST",
    });
}
export async function permanentDeleteNote(id) {
    return request(`/notes/${id}/permanent`, {
        method: "DELETE",
    });
}
export async function shareNote(noteId, emails) {
    return request(`/notes/${noteId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noteId, emails }),
    });
}
export async function uploadImageToCloudinary(file) {
    const uploadUrl = CLOUDINARY_UPLOAD_URL || (CLOUDINARY_NAME ? `https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload` : "");

    if (!uploadUrl) {
        throw new Error("Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_NAME in .env.local.");
    }
    if (!CLOUDINARY_PRESET) {
        throw new Error("Missing NEXT_PUBLIC_CLOUDINARY_PRESET. Create an unsigned upload preset in Cloudinary (Settings -> Upload -> Add upload preset, Signing Mode: Unsigned) and put the preset name in .env.local.");
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);
    const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload && typeof payload === "object" && "error" in payload
            ? String(payload.error?.message || "Image upload failed")
            : "Image upload failed");
    }
    if (!payload || typeof payload !== "object" || typeof payload.secure_url !== "string") {
        throw new Error("Cloudinary did not return an image URL.");
    }
    return {
        url: payload.secure_url,
        publicId: typeof payload.public_id === "string" ? payload.public_id : null,
    };
}
export async function uploadImageFiles(files) {
    const uploads = await Promise.all(files.map((file) => uploadImageToCloudinary(file)));
    return uploads.map((item) => item.url);
}
