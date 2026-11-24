"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/client/api";
import { loginSchema, signupSchema } from "@/lib/validation";
import { Logo } from "./logo";

function safeNext(value: string | null): string {
  // Only same-site relative paths (no protocol-relative "//evil.com").
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value;
  return "/calendar";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  // Already signed in? Go straight to the app.
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((res) => {
        if (active && res.ok) router.replace(safeNext(params.get("next")));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router, params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = signup ? signupSchema.safeParse({ name, email, password }) : loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
      return;
    }
    if (signup && password !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setBusy(true);
    try {
      await api(signup ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body: parsed.data });
      queryClient.clear();
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-[22px] font-semibold tracking-tight">{signup ? "Tạo tài khoản" : "Đăng nhập"}</h1>
          <p className="mt-1 text-[14px] text-fg-3">
            {signup ? "Lịch, công việc và thống kê của bạn được lưu riêng cho tài khoản này." : "Chào mừng bạn quay lại."}
          </p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
            {signup && (
              <Field label="Tên hiển thị (không bắt buộc)">
                {(id) => <Input id={id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
              </Field>
            )}
            <Field label="Email">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label="Mật khẩu" hint={signup ? "Tối thiểu 8 ký tự." : undefined}>
              {(id, d) => (
                <Input
                  id={id}
                  type="password"
                  aria-describedby={d}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            {signup && (
              <Field label="Nhập lại mật khẩu">
                {(id) => (
                  <Input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                )}
              </Field>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-st-overdue-soft px-3 py-2 text-[13px] text-danger-text">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-1">
              {busy && <LoaderCircle className="animate-spin" />}
              {signup ? "Tạo tài khoản" : "Đăng nhập"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-[14px] text-fg-3">
          {signup ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
          <Link
            href={`${signup ? "/login" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}
            className="font-medium text-accent hover:underline"
          >
            {signup ? "Đăng nhập" : "Đăng ký miễn phí"}
          </Link>
        </p>
      </div>
    </div>
  );
}
