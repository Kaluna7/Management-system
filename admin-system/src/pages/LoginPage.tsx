import type { FormEvent } from "react";
import { LoginLottieAnimation } from "../components/LoginLottieAnimation";

type Props = {
  username: string;
  password: string;
  loading: boolean;
  message: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
};

export function LoginPage({
  username,
  password,
  loading,
  message,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  return (
    <main className="page login-page">
      <div className="login-shell">
        <div className="login-visual">
          <LoginLottieAnimation />
        </div>
        <section className="card login-card">
          <h1>Admin Sign In</h1>
          <p>Masuk dengan akun role `finance_admin` atau `buyers_admin`.</p>
          <form onSubmit={onSubmit}>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder="admin_finance"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Loading..." : "Sign In"}
            </button>
          </form>
          {message && <p className="message error">{message}</p>}
        </section>
      </div>
    </main>
  );
}
