"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Database, Download, KeyRound, LoaderCircle, Palette, Plus, RotateCcw, Tag, Trash2, Upload, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { LogoutButton, PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Switch } from "@/components/ui/menu";
import { Card, Segmented } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/client/api";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import {
  disablePush,
  enablePush,
  isPushActiveHere,
  notificationsSupported,
  pushSupported,
  showLocalNotification,
} from "@/lib/client/notifications";
import { SNAPSHOT_KEY } from "@/lib/client/store";
import { DEFAULT_TIMEZONE } from "@/lib/domain/dates";
import { type NotificationPrefs, REMINDER_MINUTE_OPTIONS, TASK_COLORS } from "@/lib/settings";
import { cn } from "@/lib/utils";

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-surface-2 p-2 text-fg-2 [&_svg]:size-4">{icon}</div>
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

const subscribe = () => () => {};

let timeZoneCache: string[] | null = null;
function listTimeZones(): string[] | null {
  if (timeZoneCache) return timeZoneCache;
  try {
    timeZoneCache = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? null;
  } catch {
    timeZoneCache = null;
  }
  return timeZoneCache;
}

function ProfileSection() {
  const { snapshot } = useEngine();
  const actions = useAppActions();
  const [name, setName] = useState(snapshot.user.name);
  const [tz, setTz] = useState(snapshot.user.timezone);
  const [zones] = useState(listTimeZones);
  const list = zones && zones.length ? zones : [DEFAULT_TIMEZONE, "UTC"];
  const dirty = name !== snapshot.user.name || tz !== snapshot.user.timezone;
  return (
    <Section icon={<User />} title="Hồ sơ" description="Múi giờ quyết định “hôm nay”, giờ nhắc và cách tính tuần.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên hiển thị">
          {(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Múi giờ" hint={`Mặc định: ${DEFAULT_TIMEZONE} (giờ Việt Nam)`}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={tz} onChange={(e) => setTz(e.target.value)}>
              {!list.includes(tz) && <option value={tz}>{tz}</option>}
              {list.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty || actions.updateProfile.isPending}
          onClick={() => actions.updateProfile.mutate({ name, timezone: tz }, { onSuccess: () => toast.success("Đã lưu hồ sơ") })}
        >
          Lưu
        </Button>
      </div>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <Section icon={<Palette />} title="Giao diện">
      <Segmented
        label="Chế độ màu"
        value={(mounted ? theme : "system") as "light" | "dark" | "system"}
        onChange={setTheme}
        options={[
          { value: "light", label: "Sáng" },
          { value: "dark", label: "Tối" },
          { value: "system", label: "Theo hệ thống" },
        ]}
      />
    </Section>
  );
}

function CategoryRow({ id, name, color }: { id: string; name: string; color: string }) {
  const actions = useAppActions();
  const confirm = useConfirm();
  const [value, setValue] = useState(name);
  const save = (next: { name?: string; color?: string }) => {
    const n = (next.name ?? value).trim();
    if (!n) return;
    actions.saveCategory.mutate({ id, name: n, color: next.color ?? color });
  };
  return (
    <li className="flex items-center gap-2 py-1.5">
      <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-line-strong" style={{ background: color }}>
        <span className="sr-only">Màu của {name}</span>
        <input type="color" value={color} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => save({ color: e.target.value })} />
      </label>
      <Input
        value={value}
        maxLength={40}
        aria-label="Tên danh mục"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() !== name && save({ name: value })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-9"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Xóa danh mục ${name}`}
        onClick={async () => {
          const ok = await confirm({
            title: `Xóa danh mục “${name}”?`,
            description: "Các công việc thuộc danh mục này vẫn được giữ, chỉ không còn danh mục.",
            confirmLabel: "Xóa danh mục",
            tone: "danger",
          });
          if (ok) actions.deleteCategory.mutate(id);
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function CategoriesSection() {
  const { snapshot } = useEngine();
  const actions = useAppActions();
  const [name, setName] = useState("");
  const add = () => {
    if (!name.trim()) return;
    actions.saveCategory.mutate(
      { name: name.trim(), color: TASK_COLORS[snapshot.categories.length % TASK_COLORS.length]! },
      { onSuccess: () => setName("") },
    );
  };
  return (
    <Section icon={<Tag />} title="Danh mục" description="Dùng để lọc lịch và nhóm công việc. Màu danh mục là màu gợi ý khi tạo công việc.">
      <ul className="divide-y divide-line">
        {snapshot.categories.map((c) => (
          <CategoryRow key={`${c.id}:${c.name}`} id={c.id} name={c.name} color={c.color} />
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input
          placeholder="Tên danh mục mới"
          value={name}
          maxLength={40}
          aria-label="Tên danh mục mới"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="outline" onClick={add} disabled={!name.trim()}>
          <Plus /> Thêm
        </Button>
      </div>
    </Section>
  );
}

function NotificationsSection() {
  const { snapshot } = useEngine();
  const actions = useAppActions();
  const prefs = snapshot.user.notificationPrefs;
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window === "undefined" ? "default" : notificationsSupported() ? Notification.permission : "unsupported",
  );
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void isPushActiveHere().then(setPushOn);
  }, []);

  const update = (patch: Partial<NotificationPrefs>) => actions.updateProfile.mutate({ notificationPrefs: { ...prefs, ...patch } });

  const ask = async () => {
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") toast.success("Đã bật thông báo trên trình duyệt này");
    else toast.error("Bạn đã từ chối quyền thông báo. Có thể bật lại trong cài đặt trình duyệt.");
  };

  const togglePush = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        if (permission !== "granted") {
          const p = await Notification.requestPermission();
          setPermission(p);
          if (p !== "granted") throw new Error("Cần cấp quyền thông báo trước");
        }
        await enablePush(snapshot.push.publicKey!);
        toast.success("Đã bật nhắc nhở khi ứng dụng đóng");
      } else {
        await disablePush();
        toast("Đã tắt nhắc nhở khi ứng dụng đóng");
      }
      setPushOn(on);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const rows: { key: keyof NotificationPrefs; label: string; detail: ReactNode }[] = [
    {
      key: "beforeStart",
      label: "Nhắc trước giờ bắt đầu",
      detail: (
        <Select
          aria-label="Số phút nhắc trước"
          className="h-9 w-auto"
          value={prefs.beforeStart.minutes}
          onChange={(e) => update({ beforeStart: { ...prefs.beforeStart, minutes: Number(e.target.value) } })}
        >
          {REMINDER_MINUTE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Trước {m} phút
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: "unfinished",
      label: "Báo việc chưa hoàn thành trong ngày",
      detail: (
        <Input type="time" aria-label="Giờ báo việc chưa hoàn thành" className="h-9 w-32" value={prefs.unfinished.time} onChange={(e) => e.target.value && update({ unfinished: { ...prefs.unfinished, time: e.target.value } })} />
      ),
    },
    {
      key: "dailyReview",
      label: "Nhắc kiểm tra tiến độ cuối ngày",
      detail: (
        <Input type="time" aria-label="Giờ nhắc cuối ngày" className="h-9 w-32" value={prefs.dailyReview.time} onChange={(e) => e.target.value && update({ dailyReview: { ...prefs.dailyReview, time: e.target.value } })} />
      ),
    },
    {
      key: "weeklySummary",
      label: "Tổng kết tuần (tối Chủ Nhật)",
      detail: (
        <Input type="time" aria-label="Giờ tổng kết tuần" className="h-9 w-32" value={prefs.weeklySummary.time} onChange={(e) => e.target.value && update({ weeklySummary: { ...prefs.weeklySummary, time: e.target.value } })} />
      ),
    },
  ];

  return (
    <Section
      icon={<Bell />}
      title="Thông báo"
      description="Thông báo chỉ hoạt động khi bạn cấp quyền. Khi ứng dụng đang mở, nhắc nhở hiện ngay trên trình duyệt; để nhận cả khi đã đóng ứng dụng cần bật Web Push."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-[13px]">
        {permission === "unsupported" ? (
          <span className="flex items-center gap-2 text-fg-2">
            <BellOff className="size-4" /> Trình duyệt này không hỗ trợ thông báo.
          </span>
        ) : permission === "granted" ? (
          <span className="flex items-center gap-2 text-fg-2">
            <Bell className="size-4 text-st-done" /> Đã cấp quyền thông báo.
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2 text-fg-2">
              <BellOff className="size-4" /> {permission === "denied" ? "Quyền thông báo đang bị chặn trong trình duyệt." : "Chưa bật thông báo."}
            </span>
            {permission === "default" && (
              <Button variant="primary" size="sm" onClick={ask}>
                Bật thông báo
              </Button>
            )}
          </>
        )}
        {permission === "granted" && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void showLocalNotification("MY LIFE PLANNER", { body: "Thông báo thử: mọi thứ đã sẵn sàng!", tag: "test" })}>
            Gửi thử
          </Button>
        )}
      </div>

      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-3 py-3">
            <Switch
              checked={prefs[r.key].enabled}
              onCheckedChange={(enabled) => update({ [r.key]: { ...prefs[r.key], enabled } } as Partial<NotificationPrefs>)}
              aria-label={r.label}
            />
            <span className="min-w-0 flex-1 text-[14px]">{r.label}</span>
            <div className={cn(!prefs[r.key].enabled && "pointer-events-none opacity-50")}>{r.detail}</div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">Nhắc cả khi đã đóng ứng dụng (Web Push)</p>
          <p className="text-[12px] text-fg-3">
            {!pushSupported()
              ? "Trình duyệt này không hỗ trợ Web Push. Trên iPhone, hãy “Thêm vào Màn hình chính” trước."
              : snapshot.push.publicKey
                ? "Bật trên từng thiết bị bạn muốn nhận nhắc nhở."
                : "Máy chủ chưa cấu hình Web Push (khóa VAPID). Xem hướng dẫn trong README."}
          </p>
        </div>
        <Switch
          checked={pushOn}
          disabled={busy || !pushSupported() || !snapshot.push.publicKey}
          onCheckedChange={(on) => void togglePush(on)}
          aria-label="Bật Web Push"
        />
      </div>
    </Section>
  );
}

interface BackupInfo {
  id: string;
  label: string;
  sizeBytes: number;
  createdAt: string;
}

function DataSection() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => api<{ backups: BackupInfo[] }>("/api/backups") });

  const refreshAll = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: SNAPSHOT_KEY }), qc.invalidateQueries({ queryKey: ["backups"] })]);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File quá lớn (tối đa 10 MB)");
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast.error("File không phải JSON hợp lệ");
      return;
    }
    setPendingImport(data);
  };

  const doImport = (mode: "merge" | "replace") => {
    const data = pendingImport;
    setPendingImport(null);
    if (data === null) return;
    void run("import", async () => {
      const { result } = await api<{ result: { tasks: number; occurrences: number; categories: number } }>("/api/import", {
        method: "POST",
        body: { mode, data },
      });
      await refreshAll();
      toast.success(`Đã nhập ${result.tasks} công việc, ${result.occurrences} lượt hoàn thành/trạng thái.`);
    });
  };

  return (
    <Section icon={<Database />} title="Dữ liệu & sao lưu" description="Dữ liệu được lưu trên máy chủ theo tài khoản, không mất khi tải lại trang hay đổi thiết bị.">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="outline" asChild>
          <a href="/api/export?format=json" download>
            <Download /> Sao lưu JSON
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/export?format=csv&type=occurrences" download>
            <Download /> Lịch sử (CSV)
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/export?format=csv&type=tasks" download>
            <Download /> Công việc (CSV)
          </a>
        </Button>
      </div>
      <div className="mt-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={busy === "import"}>
          {busy === "import" ? <LoaderCircle className="animate-spin" /> : <Upload />} Nhập / khôi phục từ file JSON
        </Button>
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Bản sao lưu trên máy chủ</h3>
        <Button
          variant="primary"
          size="sm"
          disabled={busy === "backup"}
          onClick={() =>
            void run("backup", async () => {
              await api("/api/backups", { method: "POST", body: { label: "Sao lưu thủ công" } });
              await qc.invalidateQueries({ queryKey: ["backups"] });
              toast.success("Đã tạo bản sao lưu");
            })
          }
        >
          {busy === "backup" ? <LoaderCircle className="animate-spin" /> : <Plus />} Tạo bản sao lưu
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-fg-3">Giữ tối đa 10 bản gần nhất. Trước mỗi lần khôi phục, hệ thống tự tạo một bản sao lưu.</p>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {backups.isPending && <li className="p-3 text-[13px] text-fg-3">Đang tải…</li>}
        {backups.data?.backups.length === 0 && <li className="p-3 text-[13px] text-fg-3">Chưa có bản sao lưu nào.</li>}
        {backups.data?.backups.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 p-3 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{b.label}</p>
              <p className="text-fg-3">
                {new Date(b.createdAt).toLocaleString("vi-VN")} · {(b.sizeBytes / 1024).toFixed(1).replace(".", ",")} KB
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href={`/api/backups/${b.id}`} download>
                <Download /> Tải
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy === b.id}
              onClick={async () => {
                const ok = await confirm({
                  title: "Khôi phục bản sao lưu này?",
                  description: "Toàn bộ dữ liệu hiện tại sẽ được thay bằng bản sao lưu. Dữ liệu hiện tại được tự động sao lưu trước khi khôi phục.",
                  confirmLabel: "Khôi phục",
                  tone: "danger",
                });
                if (!ok) return;
                await run(b.id, async () => {
                  await api(`/api/backups/${b.id}/restore`, { method: "POST" });
                  await refreshAll();
                  toast.success("Đã khôi phục dữ liệu");
                });
              }}
            >
              <RotateCcw /> Khôi phục
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Xóa bản sao lưu"
              onClick={async () => {
                const ok = await confirm({ title: "Xóa bản sao lưu?", confirmLabel: "Xóa", tone: "danger" });
                if (!ok) return;
                await run(b.id, async () => {
                  await api(`/api/backups/${b.id}`, { method: "DELETE" });
                  await qc.invalidateQueries({ queryKey: ["backups"] });
                });
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {pendingImport !== null && (
        <Dialog open onOpenChange={(open) => !open && setPendingImport(null)}>
          <DialogContent
            title="Nhập dữ liệu từ file"
            description="Chọn cách nhập. Có thể hủy nếu chọn nhầm file."
            size="sm"
            footer={
              <Button variant="secondary" onClick={() => setPendingImport(null)}>
                Hủy
              </Button>
            }
          >
            <div className="flex flex-col gap-2 pb-2">
              <button type="button" onClick={() => doImport("merge")} className="rounded-xl border border-line px-4 py-3 text-left hover:bg-surface-2">
                <span className="block text-[14px] font-medium">Gộp vào dữ liệu hiện tại</span>
                <span className="block text-[12px] text-fg-3">Thêm các công việc trong file; dữ liệu đang có được giữ nguyên.</span>
              </button>
              <button
                type="button"
                onClick={() => doImport("replace")}
                className="rounded-xl border border-line px-4 py-3 text-left hover:border-st-overdue/40 hover:bg-st-overdue-soft"
              >
                <span className="block text-[14px] font-medium text-danger-text">Thay thế toàn bộ (khôi phục)</span>
                <span className="block text-[12px] text-fg-3">Dữ liệu hiện tại được tự động sao lưu trên máy chủ trước khi thay thế.</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Section>
  );
}

function AccountSection() {
  const { snapshot } = useEngine();
  const confirm = useConfirm();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletePw, setDeletePw] = useState("");

  return (
    <Section icon={<KeyRound />} title="Tài khoản" description={snapshot.user.email}>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/api/auth/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
            toast.success("Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.");
            setCurrent("");
            setNext("");
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Mật khẩu hiện tại">
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        </Field>
        <Field label="Mật khẩu mới (≥ 8 ký tự)">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Button type="submit" variant="outline" disabled={busy || !current || next.length < 8}>
          Đổi mật khẩu
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <LogoutButton />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            type="password"
            placeholder="Nhập mật khẩu để xóa tài khoản"
            aria-label="Mật khẩu xác nhận xóa tài khoản"
            className="h-9 w-64"
            value={deletePw}
            onChange={(e) => setDeletePw(e.target.value)}
          />
          <Button
            variant="danger-ghost"
            disabled={!deletePw}
            onClick={async () => {
              const ok = await confirm({
                title: "Xóa vĩnh viễn tài khoản?",
                description: "Mọi công việc, lịch sử và bản sao lưu của tài khoản sẽ bị xóa và không thể khôi phục. Hãy tải bản sao lưu JSON trước nếu cần.",
                confirmLabel: "Xóa tài khoản",
                tone: "danger",
              });
              if (!ok) return;
              try {
                await api("/api/account/delete", { method: "POST", body: { password: deletePw } });
                router.replace("/signup");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Trash2 /> Xóa tài khoản
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function SettingsView() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Cài đặt" />
      <div className="flex flex-col gap-4">
        <ProfileSection />
        <AppearanceSection />
        <CategoriesSection />
        <NotificationsSection />
        <DataSection />
        <AccountSection />
      </div>
    </div>
  );
}
