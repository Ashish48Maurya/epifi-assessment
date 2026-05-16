"use client";
import { useState } from "react";
import { Loader2, NotebookText, Send } from "lucide-react";
import { register, persistAuthToken } from "../api";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const router = useRouter();

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await register(form.name.trim(), form.email.trim(), form.password);
            if (res && res.token) {
                persistAuthToken(res.token);
            }
            router.push("/");
        } catch (err) {
            setError(err?.message || "Registration failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-6">
            <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-white/70 bg-white/90 p-8 shadow-md">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-amber-300 via-amber-200 to-yellow-100 text-slate-900 shadow-inner">
                    <NotebookText className="h-7 w-7" />
                </div>
                <h2 className="text-2xl font-semibold text-slate-900">Create an account</h2>
                <p className="mt-2 text-sm text-slate-600">Sign up to start capturing notes and collaborating.</p>

                <div className="mt-6 space-y-4">
                    <label className="block">
                        <span className="text-sm text-slate-700">Full name</span>
                        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} type="text" required className="mt-2 w-full rounded-lg border px-3 py-2" />
                    </label>

                    <label className="block">
                        <span className="text-sm text-slate-700">Email</span>
                        <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" required className="mt-2 w-full rounded-lg border px-3 py-2" />
                    </label>

                    <label className="block">
                        <span className="text-sm text-slate-700">Password</span>
                        <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" required minLength={6} className="mt-2 w-full rounded-lg border px-3 py-2" />
                    </label>

                    {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{String(error)}</div> : null}

                    <button type="submit" disabled={busy} className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 py-2 font-semibold text-slate-900">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {busy ? "Creating..." : "Create account"}
                    </button>
                </div>
            </form>
        </main>
    );
}
