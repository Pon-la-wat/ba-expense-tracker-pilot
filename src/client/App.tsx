import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Api, ApiError } from "./api";
import { Ledger } from "./Ledger";
import { Page } from "./Page";

type Screen = "login" | "forgot" | "reset" | "ledger";

const MIN_PASSWORD_LENGTH = 8;

function failureText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.kind === "network" || error.kind === "server") return error.message;
    if (error.details.length > 0) return error.details.join(" ");
  }
  return fallback;
}

/** `baseUrl` points the app at the API; empty means the page's own origin. */
export function App({ baseUrl = "" }: { baseUrl?: string }) {
  const api = useMemo(() => new Api(baseUrl), [baseUrl]);
  const resetToken = new URLSearchParams(window.location.search).get("reset") ?? "";
  const [screen, setScreen] = useState<Screen>(resetToken ? "reset" : "login");
  const [notice, setNotice] = useState("");

  const goTo = useCallback((next: Screen, text = "") => {
    setNotice(text);
    setScreen(next);
  }, []);

  const expired = useCallback(() => {
    api.token = null;
    goTo("login", "หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง");
  }, [api, goTo]);

  if (screen === "ledger") {
    return (
      <Ledger
        api={api}
        onExpired={expired}
        onLogout={() => {
          void api.logout().catch(() => undefined);
          goTo("login", "ออกจากระบบแล้ว");
        }}
      />
    );
  }
  if (screen === "forgot") return <Forgot api={api} onBack={() => goTo("login")} />;
  if (screen === "reset") {
    return (
      <Reset
        api={api}
        token={resetToken}
        onDone={() => {
          window.history.replaceState(null, "", window.location.pathname);
          goTo("login", "ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่");
        }}
      />
    );
  }
  return (
    <Login
      api={api}
      notice={notice}
      onForgot={() => goTo("forgot")}
      onDone={() => goTo("ledger")}
    />
  );
}

function Login({
  api,
  notice,
  onForgot,
  onDone,
}: {
  api: Api;
  notice: string;
  onForgot: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.login(email, password);
      onDone();
    } catch (failure) {
      setError(failureText(failure, "อีเมลหรือรหัสผ่านไม่ถูกต้อง"));
      setBusy(false);
    }
  }

  return (
    <Page title="เข้าสู่ระบบ">
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <form className="card" onSubmit={submit}>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <label>
          อีเมล
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            เข้าสู่ระบบ
          </button>
          <button type="button" onClick={onForgot}>
            ลืมรหัสผ่าน
          </button>
        </div>
      </form>
    </Page>
  );
}

function Forgot({ api, onBack }: { api: Api; onBack: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function send() {
    setError("");
    setState("sending");
    try {
      await api.forgot();
      setState("sent");
    } catch (failure) {
      setError(failureText(failure, "ส่งอีเมลไม่สำเร็จ กรุณาลองอีกครั้ง"));
      setState("idle");
    }
  }

  return (
    <Page title="ลืมรหัสผ่าน">
      <div className="card">
        <p>ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {state === "sent" && (
          <p role="status" className="notice">
            ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้แล้ว ลิงก์ใช้ได้ 1 ชั่วโมง
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() => void send()}
            disabled={state === "sending"}
          >
            ส่งลิงก์ไปที่อีเมล
          </button>
          <button type="button" onClick={onBack}>
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    </Page>
  );
}

function Reset({ api, token, onDone }: { api: Api; token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      return;
    }
    if (password !== again) {
      setError("รหัสผ่านสองช่องไม่ตรงกัน");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.reset(token, password);
      onDone();
    } catch (failure) {
      const invalid = failure instanceof ApiError && failure.message === "invalid_token";
      setError(
        invalid
          ? "ลิงก์นี้ใช้ไม่ได้หรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่จากหน้าลืมรหัสผ่าน"
          : failureText(failure, "ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง"),
      );
      setBusy(false);
    }
  }

  return (
    <Page title="ตั้งรหัสผ่านใหม่">
      <form className="card" onSubmit={submit}>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <label>
          รหัสผ่านใหม่
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          พิมพ์รหัสผ่านใหม่อีกครั้ง
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </label>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            ตั้งรหัสผ่านใหม่
          </button>
        </div>
      </form>
    </Page>
  );
}
