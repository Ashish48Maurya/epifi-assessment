"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArchiveRestore, CloudUpload, Eye, EyeOff, FileImage, FolderClock, Loader2, LogOut, NotebookText, PencilLine, Plus, RefreshCw, Search, Send, Share2, Sparkles, Trash2, Type, X, } from "lucide-react";
import { io } from "socket.io-client";
import { ApiError, clearAuthToken, createNote, deleteNote, getAuthToken, listBin, listNotes, login, logout, me, permanentDeleteNote, persistAuthToken, restoreNote, shareNote, SOCKET_URL, uploadImageFiles, updateNote, } from "./api";
function makeDraft(type = "text") {
    return {
        title: "",
        type,
        content: "",
        shareEmails: "",
        listCompleted: [],
    };
}
const PALETTES = [
    "from-amber-50/95 via-white/95 to-orange-50/90",
    "from-emerald-50/95 via-white/95 to-teal-50/90",
    "from-sky-50/95 via-white/95 to-cyan-50/90",
    "from-rose-50/95 via-white/95 to-pink-50/90",
    "from-lime-50/95 via-white/95 to-yellow-50/90",
    "from-violet-50/95 via-white/95 to-indigo-50/90",
];
function splitLines(value) {
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function splitEditableLines(value) {
    if (!value)
        return [""];
    return value.split(/\r?\n/);
}
function splitEmailRows(value) {
    return value
        .replace(/,/g, "\n")
        .split(/\r?\n/);
}
function getListItems(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
            if (typeof item === "string")
                return item.trim();
            if (item && typeof item === "object") {
                const record = item;
                const candidate = record.note ?? record.text ?? record.title ?? record.label ?? record.value;
                if (typeof candidate === "string")
                    return candidate.trim();
            }
            return "";
        })
        .filter(Boolean);
}
function getImages(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
            if (typeof item === "string")
                return item.trim();
            if (item && typeof item === "object") {
                const record = item;
                const candidate = record.url ?? record.src ?? record.image ?? record.value;
                if (typeof candidate === "string")
                    return candidate.trim();
            }
            return "";
        })
        .filter(Boolean);
}
function draftFromNote(note) {
    return {
        id: note.id,
        title: note.title ?? "",
        type: note.type,
        content: note.type === "text"
            ? note.note ?? ""
            : note.type === "image"
                ? getImages(note.images).join("\n")
                : (Array.isArray(note.lists) ? note.lists.map((it) => (it && it.note) || "").join("\n") : ""),
        listCompleted: note.type === "list" && Array.isArray(note.lists) ? note.lists.map((it) => Boolean(it && it.isCompleted)) : [],
        shareEmails: "",
    };
}
function buildPayload(draft) {
    const title = draft.title.trim() || null;
    if (draft.type === "text") {
        return { title, type: draft.type, note: draft.content.trim() };
    }
    if (draft.type === "image") {
        return { title, type: draft.type, images: splitLines(draft.content) };
    }
    if (draft.type === "list") {
        const lines = splitLines(draft.content);
        const flags = Array.isArray(draft.listCompleted) ? draft.listCompleted : [];
        return { title, type: draft.type, lists: lines.map((t, i) => ({ note: t, isCompleted: Boolean(flags[i]) })) };
    }
    return { title, type: draft.type, lists: splitLines(draft.content).map((t) => ({ note: t, isCompleted: false })) };
}
function messageFromError(error) {
    if (error instanceof ApiError)
        return error.message;
    if (error instanceof Error)
        return error.message;
    return "Something went wrong";
}
function formatDate(value) {
    if (!value)
        return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "";
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}
function formatRelative(value) {
    if (!value)
        return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}
function roleLabel(role) {
    if (role === "owner")
        return "Owned";
    if (role === "shared")
        return "Shared";
    return "Shared link";
}
function noteSummary(note) {
    if (note.type === "image") {
        const images = getImages(note.images);
        return images.length
            ? { lines: images.slice(0, 2), footer: `${images.length} image${images.length === 1 ? "" : "s"}` }
            : { lines: ["No images"], footer: "Image note" };
    }
    if (note.type === "list") {
        const raw = Array.isArray(note.lists) ? note.lists : [];
        const items = raw.map((it) => ({ text: (it && (it.note || it.text || it.title)) || "", completed: Boolean(it && it.isCompleted) })).filter((r) => r.text);
        if (!items.length) return { lines: [{ text: "Empty checklist" }], footer: "List note" };
        // return up to 4 items but mark completed ones and insert a divider before completed block
        const incomplete = items.filter((i) => !i.completed);
        const completed = items.filter((i) => i.completed);
        const lines = [];
        incomplete.slice(0, 4).forEach((it) => lines.push({ text: it.text, completed: false }));
        if (incomplete.length < Math.min(4, items.length) && completed.length > 0) {
            // if space left and there are completed, include first completed
            const remaining = 4 - lines.length;
            completed.slice(0, remaining).forEach((it) => lines.push({ text: it.text, completed: true }));
        }
        // if there are any completed, append a divider line showing completed count
        if (completed.length > 0) {
            lines.push({ divider: true, text: `${completed.length} completed` });
        }
        return { lines, footer: `${items.length} item${items.length === 1 ? "" : "s"}` };
    }
    const body = (note.note || "").trim();
    return body
        ? { lines: body.split(/\r?\n/).filter(Boolean).slice(0, 5), footer: body.length > 110 ? `${body.slice(0, 110)}...` : body }
        : { lines: ["No content yet"], footer: "Text note" };
}
function paletteFor(id) {
    return PALETTES[id % PALETTES.length];
}
function appendLines(existing, lines) {
    const merged = [...splitLines(existing), ...lines];
    return merged.join("\n");
}
export default function Home() {
    const [bootstrapped, setBootstrapped] = useState(false);
    const [session, setSession] = useState(null);
    const [authForm, setAuthForm] = useState({ email: "", password: "" });
    const [authBusy, setAuthBusy] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [banner, setBanner] = useState(null);
    const [tab, setTab] = useState("notes");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [notes, setNotes] = useState([]);
    const [binNotes, setBinNotes] = useState([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [binLoading, setBinLoading] = useState(false);
    const [busyAction, setBusyAction] = useState(null);
    const [reloadTick, setReloadTick] = useState(0);
    const [composer, setComposer] = useState(makeDraft());
    const [composerExpanded, setComposerExpanded] = useState(false);
    const [composerMenuOpen, setComposerMenuOpen] = useState(false);
    const [editor, setEditor] = useState(null);
    const [editorSource, setEditorSource] = useState(null);
    const [editorError, setEditorError] = useState(null);
    const [socketConnected, setSocketConnected] = useState(false);
    const [composerUploading, setComposerUploading] = useState(false);
    const [editorUploading, setEditorUploading] = useState(false);
    const socketRef = useRef(null);
    useEffect(() => {
        let alive = true;
        async function bootstrap() {
            try {
                const response = await me();
                if (alive) {
                    setSession(response.user);
                }
            }
            catch (error) {
                if (error instanceof ApiError && error.status === 401) {
                    clearAuthToken();
                }
            }
            finally {
                if (alive)
                    setBootstrapped(true);
            }
        }
        void bootstrap();
        return () => {
            alive = false;
        };
    }, []);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 350);
        return () => window.clearTimeout(timer);
    }, [search]);
    useEffect(() => {
        if (!session) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            setSocketConnected(false);
            return;
        }
        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ["websocket"],
            auth: { token: getAuthToken() || undefined },
        });
        socketRef.current = socket;
        const refreshWorkspace = (message) => {
            if (message) {
                setBanner(message);
            }
            setReloadTick((value) => value + 1);
        };
        socket.on("connect", () => setSocketConnected(true));
        socket.on("disconnect", () => setSocketConnected(false));
        socket.on("connect_error", () => setSocketConnected(false));
        socket.on("note:created", () => refreshWorkspace("A new note arrived."));
        socket.on("note:updated", () => refreshWorkspace("A note was updated live."));
        socket.on("note:shared", () => refreshWorkspace("A note was shared with you."));
        socket.on("note:unshared", () => refreshWorkspace("A shared note changed."));
        socket.on("note:restored", () => refreshWorkspace("A note was restored."));
        socket.on("note:deleted", () => refreshWorkspace("A note moved to the bin."));
        socket.on("note:purged", () => refreshWorkspace("A note was deleted permanently."));
        return () => {
            socket.disconnect();
            if (socketRef.current === socket) {
                socketRef.current = null;
            }
        };
    }, [session]);
    useEffect(() => {
        if (!session)
            return;
        let alive = true;
        const timer = window.setTimeout(async () => {
            if (tab === "notes") {
                setNotesLoading(true);
            }
            else {
                setBinLoading(true);
            }
            try {
                if (tab === "notes") {
                    const response = await listNotes({ q: debouncedSearch || undefined, limit: 24 });
                    if (alive)
                        setNotes(response.rows);
                }
                else {
                    const response = await listBin({ limit: 24 });
                    if (alive)
                        setBinNotes(response.rows);
                }
            }
            catch (error) {
                if (error instanceof ApiError && error.status === 401) {
                    clearAuthToken();
                    if (alive) {
                        setSession(null);
                        setNotes([]);
                        setBinNotes([]);
                        setAuthError("Your session expired. Please sign in again.");
                    }
                }
                else if (alive) {
                    setBanner(messageFromError(error));
                }
            }
            finally {
                if (alive) {
                    if (tab === "notes") {
                        setNotesLoading(false);
                    }
                    else {
                        setBinLoading(false);
                    }
                }
            }
        }, tab === "notes" ? 220 : 0);
        return () => {
            alive = false;
            window.clearTimeout(timer);
        };
    }, [session, tab, debouncedSearch, reloadTick]);
    async function handleLogin(event) {
        event.preventDefault();
        setAuthBusy(true);
        setAuthError(null);
        try {
            const response = await login(authForm.email.trim(), authForm.password);
            persistAuthToken(response.token);
            setSession(response.user);
            setBanner(`Welcome back, ${response.user.name}.`);
            setAuthForm({ email: authForm.email, password: "" });
            setTab("notes");
            setReloadTick((value) => value + 1);
        }
        catch (error) {
            setAuthError(messageFromError(error));
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleLogout() {
        setBusyAction("logout");
        try {
            await logout();
        }
        catch {
            // Ignore best-effort logout failures.
        }
        finally {
            clearAuthToken();
            setSession(null);
            setNotes([]);
            setBinNotes([]);
            setComposer(makeDraft());
            setEditor(null);
            setEditorSource(null);
            setBanner("Signed out.");
            setBusyAction(null);
        }
    }
    function validateDraft(draft) {
        const lines = splitLines(draft.content);
        if (!draft.title.trim() && !draft.content.trim()) {
            return "Add a title or some content before saving.";
        }
        if (draft.type === "text" && !draft.content.trim()) {
            return "Text notes need some content.";
        }
        if (draft.type === "image" && !lines.length) {
            return "Image notes need at least one image URL.";
        }
        if (draft.type === "list" && !lines.length) {
            return "List notes need at least one item.";
        }
        return null;
    }
    async function handleImageUpload(target, files) {
        const selected = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!selected.length)
            return;
        if (target === "composer") {
            setComposerUploading(true);
        }
        else {
            setEditorUploading(true);
        }
        setBusyAction(`upload:${target}`);
        try {
            const urls = await uploadImageFiles(selected);
            if (target === "composer") {
                setComposer((current) => ({ ...current, content: appendLines(current.content, urls) }));
            }
            else {
                setEditor((current) => (current ? { ...current, content: appendLines(current.content, urls) } : current));
            }
            setBanner(`Uploaded ${urls.length} image${urls.length === 1 ? "" : "s"} to Cloudinary.`);
        }
        catch (error) {
            const message = messageFromError(error);
            if (target === "composer") {
                setBanner(message);
            }
            else {
                setEditorError(message);
            }
        }
        finally {
            if (target === "composer") {
                setComposerUploading(false);
            }
            else {
                setEditorUploading(false);
            }
            setBusyAction(null);
        }
    }

    function removeComposerImage(url) {
        setComposer((c) => ({ ...c, content: splitLines(c.content).filter((u) => u !== url).join("\n") }));
    }

    function updateComposerListItem(index, value) {
        setComposer((c) => {
            const items = splitEditableLines(c.content);
            items[index] = value;
            return { ...c, content: items.join("\n") };
        });
    }

    function addComposerListItem() {
        setComposer((c) => ({ ...c, content: [...splitEditableLines(c.content), ""].join("\n") }));
    }

    function removeComposerListItem(index) {
        setComposer((c) => {
            const items = splitEditableLines(c.content).filter((_, i) => i !== index);
            return { ...c, content: items.join("\n") };
        });
    }
    async function handleCreate(event) {
        event.preventDefault();
        const error = validateDraft(composer);
        if (error) {
            setBanner(error);
            return;
        }
        setBusyAction("create");
        try {
            await createNote(buildPayload(composer));
            setComposer(makeDraft());
            setTab("notes");
            setBanner("Note created.");
            setReloadTick((value) => value + 1);
        }
        catch (err) {
            setBanner(messageFromError(err));
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleSaveEditor() {
        if (!editor)
            return;
        const error = validateDraft(editor);
        if (error) {
            setEditorError(error);
            return;
        }
        setEditorError(null);
        setBusyAction(`save:${editor.id ?? "new"}`);
        try {
            const payload = buildPayload(editor);
            if (editor.id) {
                await updateNote(editor.id, payload);
            }
            else {
                await createNote(payload);
            }
            setBanner("Note saved.");
            setEditor(null);
            setEditorSource(null);
            setReloadTick((value) => value + 1);
        }
        catch (err) {
            setEditorError(messageFromError(err));
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleShareEditor() {
        if (!editor?.id)
            return;
        const emails = splitEmailRows(editor.shareEmails).map((e) => e.trim()).filter(Boolean);
        if (!emails.length) {
            setEditorError("Add one or more email addresses to share the note.");
            return;
        }
        setEditorError(null);
        setBusyAction(`share:${editor.id}`);
        try {
            const result = await shareNote(editor.id, emails);
            const shared = result.results.filter((item) => item.status === "shared").length;
            setBanner(`Shared with ${shared} user${shared === 1 ? "" : "s"}.`);
            setReloadTick((value) => value + 1);
        }
        catch (err) {
            setEditorError(messageFromError(err));
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleDelete(note) {
        setBusyAction(`delete:${note.id}`);
        try {
            await deleteNote(note.id);
            setBanner(note.role === "shared" ? "Removed from your shared notes." : "Moved to bin.");
            setReloadTick((value) => value + 1);
            if (editorSource?.id === note.id) {
                setEditor(null);
                setEditorSource(null);
            }
        }
        catch (err) {
            setBanner(messageFromError(err));
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleRestore(note) {
        setBusyAction(`restore:${note.id}`);
        try {
            await restoreNote(note.id);
            setBanner("Note restored from bin.");
            setReloadTick((value) => value + 1);
        }
        catch (err) {
            setBanner(messageFromError(err));
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handlePermanentDelete(note) {
        const confirmed = window.confirm("Delete this note forever?");
        if (!confirmed)
            return;
        setBusyAction(`purge:${note.id}`);
        try {
            await permanentDeleteNote(note.id);
            setBanner("Note deleted permanently.");
            setReloadTick((value) => value + 1);
        }
        catch (err) {
            setBanner(messageFromError(err));
        }
        finally {
            setBusyAction(null);
        }
    }
    function openEditor(note, type = "text") {
        const nextEditor = note ? draftFromNote(note) : makeDraft(type);
        setEditor(nextEditor);
        setEditorSource(note ?? null);
        setEditorError(null);
    }

    function removeEditorImage(url) {
        setEditor((c) => (c ? { ...c, content: splitLines(c.content).filter((u) => u !== url).join("\n") } : c));
    }

    function updateEditorListItem(index, value) {
        setEditor((c) => {
            if (!c)
                return c;
            const items = splitLines(c.content);
            items[index] = value;
            // keep listCompleted in sync length-wise
            const flags = Array.isArray(c.listCompleted) ? [...c.listCompleted] : [];
            if (flags.length < items.length) {
                while (flags.length < items.length) flags.push(false);
            }
            if (flags.length > items.length) flags.length = items.length;
            return { ...c, content: items.join("\n"), listCompleted: flags };
        });
    }

    function addEditorListItem() {
        setEditor((c) => {
            if (!c) return c;
            const items = [...splitEditableLines(c.content), ""].join("\n");
            const flags = Array.isArray(c.listCompleted) ? [...c.listCompleted, false] : [false];
            return { ...c, content: items, listCompleted: flags };
        });
    }

    function removeEditorListItem(index) {
        setEditor((c) => {
            if (!c)
                return c;
            const items = splitEditableLines(c.content).filter((_, i) => i !== index);
            const flags = Array.isArray(c.listCompleted) ? c.listCompleted.filter((_, i) => i !== index) : [];
            return { ...c, content: items.join("\n"), listCompleted: flags };
        });
    }

    function toggleEditorListCompleted(index) {
        setEditor((c) => {
            if (!c) return c;
            const flags = Array.isArray(c.listCompleted) ? [...c.listCompleted] : [];
            while (flags.length <= index) flags.push(false);
            flags[index] = !flags[index];
            return { ...c, listCompleted: flags };
        });
    }

    function updateEditorShareEmail(index, value) {
        setEditor((c) => {
            if (!c)
                return c;
            const emails = splitEmailRows(c.shareEmails);
            emails[index] = value;
            return { ...c, shareEmails: emails.join("\n") };
        });
    }

    function addEditorShareEmail() {
        setEditor((c) => (c ? { ...c, shareEmails: appendLines(c.shareEmails, [""]) } : c));
    }

    function removeEditorShareEmail(index) {
        setEditor((c) => {
            if (!c)
                return c;
            const emails = splitEmailRows(c.shareEmails).filter((_, i) => i !== index);
            return { ...c, shareEmails: emails.join("\n") };
        });
    }
    const showingNotes = tab === "notes";
    const activeCollection = showingNotes ? notes : binNotes;
    const activeLoading = showingNotes ? notesLoading : binLoading;
    const shareEmailRows = editor ? (splitEmailRows(editor.shareEmails).length ? splitEmailRows(editor.shareEmails) : [""]) : [];
    const composerListRows = composer.type === "list" ? splitEditableLines(composer.content) : [];
    if (!bootstrapped) {
        return (<main className="flex min-h-screen items-center justify-center px-6 py-10">
            <div className="w-full max-w-2xl rounded-4xl border border-white/70 bg-white/75 p-8 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur-xl">
                <div className="space-y-4">
                    <div className="h-3 w-24 animate-pulse rounded-full bg-amber-200/90" />
                    <div className="h-8 w-2/3 animate-pulse rounded-full bg-slate-200/90" />
                    <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-100" />
                </div>
            </div>
        </main>);
    }
    if (!session) {
        return (<main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
            <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.25fr_0.95fr] lg:items-center">
                <section className="space-y-6 rounded-4xl border border-white/70 bg-white/60 p-8 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-10">
                    <div className="inline-flex items-center gap-3 rounded-full border border-amber-200 bg-amber-100/80 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm">
                        <Sparkles className="h-4 w-4" />
                        Simple notes, beautifully organized
                    </div>

                    <div className="space-y-4">
                        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Keep thoughts, images, and checklists in one calm space.</h1>
                        <p className="max-w-xl text-base leading-7 text-slate-600">Write a quick thought, save an image note, or build a checklist without switching apps. Everything stays easy to find and ready when you need it.</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {[
                            ["Quick capture", "Start a note in one tap and keep moving."],
                            ["Image notes", "Upload photos and keep visual ideas together."],
                            ["Checklists", "Turn tasks into a simple todo-style list."],
                            ["Share with others", "Send a note to someone and work together."],
                            ["Restore anytime", "Bring deleted notes back before they are gone."],
                            ["Easy search", "Find the right note in seconds."],
                        ].map(([title, copy]) => (
                            <article key={title} className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-[0_16px_50px_rgba(15,23,42,0.06)]">
                                <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                                <p className="mt-1.5 text-sm leading-6 text-slate-600">{copy}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="relative">
                    <div className="absolute inset-0 -z-10 rounded-[40px] bg-linear-to-br from-amber-200/60 via-white/10 to-sky-200/40 blur-3xl" />
                    <form onSubmit={handleLogin} className="mx-auto w-full max-w-xl rounded-[36px] border border-white/70 bg-white/85 p-8 shadow-[0_32px_120px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-10">
                        <div className="mb-8 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Sign in</p>
                                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
                            </div>
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-amber-300 via-amber-200 to-yellow-100 text-slate-900 shadow-inner">
                                <NotebookText className="h-7 w-7" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block">
                                <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
                                <input type="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@company.com" className="w-full rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
                            </label>

                            <label className="block relative">
                                <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
                                <input type={passwordVisible ? "text" : "password"} value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="••••••••" className="w-full rounded-[22px] border border-slate-200 bg-white px-5 pr-12 py-4 text-base text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
                                <button type="button" onClick={() => setPasswordVisible((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    {passwordVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </label>
                        </div>

                        {authError ? (<div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                            {authError}
                        </div>) : null}

                        <button type="submit" disabled={authBusy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-slate-950 px-5 py-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
                            {authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {authBusy ? "Signing in..." : "Enter workspace"}
                        </button>

                        <p className="mt-4 text-center text-sm">
                            <Link href="/register" className="font-semibold text-amber-800 hover:underline">Create an account</Link>
                        </p>
                    </form>
                </section>
            </div>
        </main>);
    }
    return (<main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
            <header className="sticky top-4 z-20 overflow-hidden rounded-4xl border border-white/60 bg-white/85 shadow-[0_30px_90px_-20px_rgba(15,23,42,0.25)] backdrop-blur-xl">
                <div className="h-1 w-full bg-linear-to-r from-amber-300 via-rose-300 to-violet-400" />

                <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-amber-300 via-amber-200 to-yellow-100 text-slate-900 shadow-[0_8px_24px_rgba(245,158,11,0.35)]">
                                <NotebookText className="h-6 w-6" />
                            </div>
                            <span className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100">
                                <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                            </span>
                        </div>
                        <div className="flex flex-col leading-tight">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">Epifi</span>
                            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Notes</h1>
                            <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium">
                                <span className={`relative inline-flex h-2 w-2 rounded-full ${socketConnected ? "bg-emerald-500" : "bg-amber-500"}`}>
                                    {!socketConnected ? (<span className="absolute inset-0 inline-flex animate-ping rounded-full bg-amber-400 opacity-75" />) : null}
                                </span>
                                <span className={socketConnected ? "text-emerald-700" : "text-amber-700"}>
                                    {socketConnected ? "Live" : "Reconnecting"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <label className="relative flex-1 lg:max-w-lg">
                        <span className="sr-only">Search notes</span>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={showingNotes ? "Search your notes..." : "Browse your bin..."} className="w-full rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 pl-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100" />
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </label>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center rounded-2xl bg-slate-100 p-1">
                            <button type="button" onClick={() => setTab("notes")} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${showingNotes ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>
                                <NotebookText className="h-4 w-4" />
                                Notes
                            </button>
                            <button type="button" onClick={() => setTab("bin")} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${!showingNotes ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>
                                <FolderClock className="h-4 w-4" />
                                Bin
                            </button>
                        </div>

                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 pr-3 shadow-sm">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-200 to-amber-100 text-sm font-bold text-amber-900 ring-1 ring-amber-200/60">
                                {session.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <div className="hidden sm:flex sm:flex-col sm:leading-tight">
                                <span className="text-sm font-semibold text-slate-900">{session.name}</span>
                                <span className="text-xs text-slate-500">{session.email}</span>
                            </div>
                            <button type="button" onClick={() => void handleLogout()} disabled={busyAction === "logout"} title="Sign out" className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50">
                                <LogOut className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {banner ? (<div className="border-t border-amber-200/60 bg-amber-50/60 px-5 py-2.5 text-sm font-medium text-amber-900 sm:px-6">{banner}</div>) : null}
            </header>

            <section className="space-y-5 rounded-[34px] border border-white/70 bg-white/65 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${showingNotes ? "bg-linear-to-br from-amber-200 to-amber-100 text-amber-900" : "bg-linear-to-br from-slate-200 to-slate-100 text-slate-700"} ring-1 ring-white/80 shadow-sm`}>
                            {showingNotes ? <NotebookText className="h-5 w-5" /> : <FolderClock className="h-5 w-5" />}
                        </div>
                        <div className="leading-tight">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                                {showingNotes ? "Your notes" : "Bin"}
                            </p>
                            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                                {showingNotes ? "A board that feels light and fast." : "Deleted notes wait here for recovery."}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {showingNotes
                                    ? "Capture, share, and search across every note in one place."
                                    : "Items stay here for 7 days before they're permanently removed."}
                            </p>
                        </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${showingNotes ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {activeCollection.length} {activeCollection.length === 1 ? "note" : "notes"}
                    </div>
                </div>

                {activeLoading ? (<div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (<div key={index} className="h-60 animate-pulse rounded-[28px] border border-slate-200 bg-white/80" />))}
                </div>) : activeCollection.length ? (<div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                    {activeCollection.map((note, index) => {
                        const summary = noteSummary(note);
                        const images = note.type === "image" ? getImages(note.images) : [];
                        const canShare = note.role === "owner" && showingNotes;
                        return (<article key={note.id} className={`group overflow-hidden rounded-[30px] border border-white/70 bg-linear-to-br ${paletteFor(index)} p-px shadow-[0_18px_60px_rgba(15,23,42,0.08)]`}>
                            <div className="flex h-full flex-col rounded-[29px] bg-white/90 p-5 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_20px_70px_rgba(15,23,42,0.12)]">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1.5">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                            {note.type === "image" ? <FileImage className="h-3.5 w-3.5" /> : note.type === "list" ? <NotebookText className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                                            {note.type}
                                        </div>
                                        <h3 className="text-lg font-semibold leading-6 text-slate-900">
                                            {note.title?.trim() || "Untitled note"}
                                        </h3>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${note.role === "owner" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-violet-50 text-violet-800 ring-violet-200"}`}>
                                        {note.role === "owner" ? <Sparkles className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
                                        {roleLabel(note.role)}
                                    </span>
                                </div>

                                <button type="button" onClick={() => openEditor(note)} className="mt-4 flex flex-1 flex-col rounded-3xl border border-slate-100 bg-slate-50/80 p-4 text-left transition hover:border-amber-200 hover:bg-amber-50/70">
                                    {images.length ? (<div className="mb-4 grid gap-3 sm:grid-cols-2">
                                        {images.slice(0, 2).map((image) => (<img key={image} src={image} alt={note.title?.trim() || "Note image"} className="h-28 w-full rounded-[18px] object-cover shadow-sm" />))}
                                    </div>) : null}

                                    <div className="space-y-2 text-sm leading-6 text-slate-600">
                                        {summary.lines.map((line, idx) => {
                                            if (line && line.divider) {
                                                return (
                                                    <div key={`divider-${idx}`} className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                                                        <span className="h-px flex-1 bg-slate-200" />
                                                        <span className="px-2 font-semibold">{line.text}</span>
                                                        <span className="h-px flex-1 bg-slate-200" />
                                                    </div>
                                                );
                                            }
                                            return (
                                                <p key={line && line.text ? line.text + idx : idx} className={`whitespace-pre-line ${line && line.completed ? "line-through text-slate-400" : ""}`}>
                                                    {line && line.text ? line.text : ""}
                                                </p>
                                            );
                                        })}
                                    </div>

                                    <p className="mt-4 text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
                                        {summary.footer}
                                    </p>
                                </button>

                                {(note.sharedWith && note.sharedWith.length) || (note.role === "shared" && note.owner) ? (
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                        {note.role === "shared" && note.owner ? (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-900 ring-1 ring-amber-200">
                                                <Share2 className="h-3 w-3" />
                                                <span className="font-semibold">Shared by</span>
                                                <span className="rounded-full bg-white/80 px-2 py-0.5 font-semibold text-slate-900" title={note.owner.email}>
                                                    {note.owner.name || note.owner.email}
                                                </span>
                                            </span>
                                        ) : null}
                                        {note.sharedWith && note.sharedWith.length ? (
                                            <>
                                                <span className="font-medium text-slate-500">Shared with</span>
                                                <div className="flex -space-x-1.5">
                                                    {note.sharedWith.slice(0, 4).map((u) => (
                                                        <span
                                                            key={u.id || u.email}
                                                            title={`${u.name || ""} <${u.email || ""}>`.trim()}
                                                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-amber-200 text-[10px] font-bold uppercase text-amber-900 shadow-sm"
                                                        >
                                                            {(u.name || u.email || "?").trim().charAt(0)}
                                                        </span>
                                                    ))}
                                                </div>
                                                {note.sharedWith.length > 4 ? (
                                                    <span className="text-slate-400">+{note.sharedWith.length - 4} more</span>
                                                ) : (
                                                    <span className="hidden md:inline-flex items-center gap-1 text-slate-400">
                                                        {note.sharedWith.map((u) => u.name || u.email).slice(0, 3).join(", ")}
                                                    </span>
                                                )}
                                            </>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                                    <span>{showingNotes ? formatRelative(note.updatedAt) : `Expires ${formatDate(note.expiresAt)}`}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {showingNotes ? (<>
                                            <button type="button" onClick={() => openEditor(note)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
                                                <PencilLine className="h-3.5 w-3.5" />
                                                Edit
                                            </button>
                                            {canShare ? (<button type="button" onClick={() => openEditor(note)} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 transition hover:bg-amber-100">
                                                <Share2 className="h-3.5 w-3.5" />
                                                Share
                                            </button>) : null}
                                            <button type="button" onClick={() => void handleDelete(note)} disabled={busyAction === `delete:${note.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70">
                                                <Trash2 className="h-3.5 w-3.5" />
                                                {busyAction === `delete:${note.id}` ? "Deleting..." : "Delete"}
                                            </button>
                                        </>) : (<>
                                            <button type="button" onClick={() => void handleRestore(note)} disabled={busyAction === `restore:${note.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-70">
                                                <ArchiveRestore className="h-3.5 w-3.5" />
                                                {busyAction === `restore:${note.id}` ? "Restoring..." : "Restore"}
                                            </button>
                                            <button type="button" onClick={() => void handlePermanentDelete(note)} disabled={busyAction === `purge:${note.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70">
                                                <Trash2 className="h-3.5 w-3.5" />
                                                {busyAction === `purge:${note.id}` ? "Deleting..." : "Delete forever"}
                                            </button>
                                        </>)}
                                    </div>
                                </div>
                            </div>
                        </article>);
                    })}
                </div>) : (<div className="relative overflow-hidden rounded-[30px] border border-dashed border-slate-300 bg-linear-to-br from-white/90 via-white/80 to-slate-50/80 p-10 text-center">
                    <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-amber-200/40 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-violet-200/40 blur-3xl" />
                    <div className="relative">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-linear-to-br from-amber-200 to-amber-100 text-amber-900 shadow-[0_10px_30px_rgba(245,158,11,0.25)]">
                            {showingNotes ? <Sparkles className="h-7 w-7" /> : <FolderClock className="h-7 w-7" />}
                        </div>
                        <h3 className="mt-5 text-xl font-semibold text-slate-900">
                            {showingNotes ? "No notes yet" : "Bin is empty"}
                        </h3>
                        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
                            {showingNotes
                                ? "Tap the plus button to capture your first note — text, image, or checklist."
                                : "Deleted notes will appear here for 7 days before they're permanently removed."}
                        </p>
                        {showingNotes ? (
                            <button type="button" onClick={() => setComposerMenuOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                                <Plus className="h-4 w-4" />
                                New note
                            </button>
                        ) : null}
                    </div>
                </div>)}
            </section>

            <button type="button" onClick={() => setComposerMenuOpen((current) => !current)} className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-300 text-slate-950 shadow-[0_18px_60px_rgba(15,23,42,0.25)] transition hover:bg-amber-200" aria-label="Add note">
                <Plus className="h-6 w-6" />
            </button>

            {composerMenuOpen ? (<div className="fixed bottom-24 left-6 z-40 w-72 rounded-[28px] border border-white/80 bg-white/95 p-3 shadow-[0_24px_90px_rgba(15,23,42,0.2)] backdrop-blur-xl">
                <button type="button" onClick={() => setComposerMenuOpen(false)} className="mb-3 inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                    <X className="h-3.5 w-3.5" />
                    Close
                </button>
                <div className="space-y-2">
                    {[
                        { label: "Text note", type: "text" },
                        { label: "Image note", type: "image" },
                        { label: "Checklist", type: "list" },
                    ].map((item) => (<button key={item.type} type="button" onClick={() => {
                        openEditor(null, item.type);
                        setComposerMenuOpen(false);
                    }} className="flex w-full items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50">
                        <span>{item.label}</span>
                        <Plus className="h-4 w-4" />
                    </button>))}
                </div>
            </div>) : null}
        </div>

        {editor ? (<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center">
            <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[36px] border border-white/80 bg-white shadow-[0_32px_120px_rgba(15,23,42,0.2)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                            {editor.id ? "Edit note" : "New note"}
                        </p>
                        <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                            {editor.title.trim() || "Untitled note"}
                        </h3>
                    </div>
                    <button type="button" onClick={() => {
                        setEditor(null);
                        setEditorSource(null);
                    }} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                        <X className="h-4 w-4" />
                        Close
                    </button>
                </div>

                <div className="grid max-h-[92vh] gap-0 overflow-y-auto">
                    <div className="space-y-5 p-6 sm:p-8">
                        <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                            <input value={editor.title} onChange={(event) => setEditor((current) => (current ? { ...current, title: event.target.value } : current))} placeholder="Title" className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100" />
                            <select value={editor.type} onChange={(event) => setEditor((current) => (current ? { ...current, type: event.target.value } : current))} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100">
                                <option value="text">Text note</option>
                                <option value="image">Image note</option>
                                <option value="list">Checklist</option>
                            </select>
                        </div>

                        {editor.type === "image" ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    {getImages(splitLines(editor.content)).map((url) => (<div key={url} className="relative rounded-lg overflow-hidden border bg-white">
                                        <img src={url} alt="uploaded" className="h-28 w-full object-cover" />
                                        <button type="button" onClick={() => removeEditorImage(url)} className="absolute right-1 top-1 rounded-full bg-white/80 p-1 text-xs">Remove</button>
                                    </div>))}
                                </div>
                                <p className="text-xs text-slate-500">Use the upload control below to add images.</p>
                            </div>
                        ) : editor.type === "list" ? (
                            <div className="space-y-2">
                                {splitEditableLines(editor.content).map((item, idx) => (<div key={idx} className="flex items-center gap-2">
                                    <input type="checkbox" checked={Boolean(editor.listCompleted?.[idx])} onChange={() => toggleEditorListCompleted(idx)} className="h-4 w-4" />
                                    <input value={item} onChange={(e) => updateEditorListItem(idx, e.target.value)} placeholder={`Item ${idx + 1}`} className="flex-1 rounded-md border px-3 py-2" />
                                    <button type="button" onClick={() => removeEditorListItem(idx)} className="text-rose-600">×</button>
                                </div>))}
                                <div>
                                    <button type="button" onClick={addEditorListItem} className="mt-2 inline-flex items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm font-medium">Add item</button>
                                </div>
                            </div>
                        ) : (
                            <textarea value={editor.content} onChange={(event) => setEditor((current) => (current ? { ...current, content: event.target.value } : current))} rows={14} placeholder={"Write the full note here..."} className="min-h-80 w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100" />
                        )}

                        {editor.type === "image" ? (<label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-dashed border-slate-300 bg-white px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/70">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 shadow-sm">
                                    <CloudUpload className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Upload more image URLs</p>
                                    <p className="text-xs text-slate-500">Selected files are uploaded to Cloudinary and appended here.</p>
                                </div>
                            </div>
                            <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleImageUpload("editor", event.target.files)} />
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                                {editorUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Upload files
                            </span>
                        </label>) : null}

                        {editorError ? (<div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                            {editorError}
                        </div>) : null}

                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" onClick={() => void handleSaveEditor()} disabled={busyAction === `save:${editor.id ?? "new"}` || editorUploading} className="inline-flex items-center gap-2 rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70">
                                {busyAction === `save:${editor.id ?? "new"}` || editorUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                {busyAction === `save:${editor.id ?? "new"}` ? "Saving..." : editorUploading ? "Uploading..." : "Save note"}
                            </button>
                            <button type="button" onClick={() => setEditor(editorSource ? draftFromNote(editorSource) : makeDraft())} className="inline-flex items-center gap-2 rounded-[20px] border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                                <RefreshCw className="h-4 w-4" />
                                Reset
                            </button>
                        </div>

                        {editorSource?.role === "owner" ? (
                            <div className="space-y-4 rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                                <div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Share</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">Add one or more email addresses, then click save to share the note.</p>
                                </div>

                                <div className="space-y-3">
                                    {shareEmailRows.map((email, index) => (<div key={index} className="flex items-center gap-2">
                                        <input value={email} onChange={(event) => updateEditorShareEmail(index, event.target.value)} placeholder="alice@company.com" className="flex-1 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100" />
                                        <button type="button" onClick={() => removeEditorShareEmail(index)} className="rounded-[18px] border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">Remove</button>
                                    </div>))}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button type="button" onClick={addEditorShareEmail} className="inline-flex items-center gap-2 rounded-[20px] border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                                        <Plus className="h-4 w-4" />
                                        Add email
                                    </button>
                                    <button type="button" onClick={() => void handleShareEditor()} disabled={!editor.id || busyAction === `share:${editor.id}`} className="inline-flex items-center gap-2 rounded-[20px] bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70">
                                        {busyAction === `share:${editor.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                                        {busyAction === `share:${editor.id}` ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex gap-3">
                            {editorSource ? (<button type="button" onClick={() => void handleDelete(editorSource)} className="flex-1 rounded-[20px] border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                                Move to bin
                            </button>) : null}
                            <button type="button" onClick={() => {
                                setEditor(null);
                                setEditorSource(null);
                            }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-[20px] border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                                <X className="h-4 w-4" />
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>) : null}
    </main>);
}
