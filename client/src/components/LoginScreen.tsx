import { useState, type FormEvent } from 'react';

interface LoginScreenProps {
  onLogin: (password: string) => Promise<string | null>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onLogin(password);
    if (result) {
      setError(result);
      setPassword('');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={(e) => void handleSubmit(e)} className="glass w-full max-w-sm p-8 shadow-2xl animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
              <path d="M4 11 12 4l8 7v9H4z" />
              <path d="M10 20v-5h4v5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Hubi<span className="text-accent">Dash</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Enter your password to continue</p>
        </div>

        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          className={`w-full rounded-xl border bg-white/[0.04] px-4 py-3 text-slate-100 placeholder:text-slate-500 transition-all duration-300 ease-in-out focus:bg-white/[0.06] ${
            error ? 'border-rose-500/60' : 'border-white/10 focus:border-accent/50'
          }`}
        />

        {error && (
          <p id="login-error" role="alert" className="mt-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={!password || submitting} className="btn-primary mt-6 w-full py-3">
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
