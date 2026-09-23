import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, MessageCircle, LoaderCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AuthMode = 'login' | 'signup';

function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === 'signup' && !result.data.session) {
      setMessage('Account created. Check your email to confirm your address before signing in.');
      setMode('login');
    }

    setBusy(false);
  }

  return (
    <main className="relative flex min-h-[100dvh] overflow-hidden bg-[#18363a] text-[#fffaf0]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,211,102,0.22),transparent_30%),radial-gradient(circle_at_90%_85%,rgba(96,189,167,0.2),transparent_34%)]" />
      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-10 px-5 py-8 sm:px-10 lg:grid-cols-[1.1fr_.9fr] lg:px-16">
        <section className="hidden max-w-xl lg:block">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffd166] text-[#18363a]"><MessageCircle size={22} strokeWidth={2.5} /></div>
            <div>
              <p className="font-display text-lg font-bold">FleetRelay</p>
              <p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[#fffaf0]/55">fleet operations</p>
            </div>
          </div>
          <p className="mt-24 font-mono-app text-[11px] uppercase tracking-[.22em] text-[#ffd166]">Dispatch with confidence</p>
          <h1 className="mt-5 max-w-lg font-display text-5xl font-bold leading-[1.02] tracking-tight xl:text-6xl">Every driver. Every duty. One clear queue.</h1>
          <p className="mt-7 max-w-md text-base leading-7 text-[#fffaf0]/68">Prepare personalized WhatsApp updates from your daily duty sheet and keep delivery status visible from one calm workspace.</p>
          <div className="mt-10 flex items-center gap-3 font-mono-app text-[10px] uppercase tracking-[.14em] text-[#fffaf0]/55"><span className="h-2 w-2 rounded-full bg-[#60bda7]" /> Secure workspace access</div>
        </section>

        <section className="relative mx-auto w-full max-w-md rounded-[28px] border border-white/15 bg-[#fffaf0] p-6 text-[#18363a] shadow-2xl sm:p-8">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ffd166] text-[#18363a]"><MessageCircle size={20} /></div>
            <div><p className="font-display text-lg font-bold">FleetRelay</p><p className="font-mono-app text-[9px] uppercase tracking-[.18em] text-[#18363a]/50">fleet operations</p></div>
          </div>
          <div className="mb-8">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#dff1ed] text-[#246b5e]"><LockKeyhole size={20} /></div>
            <p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[#246b5e]">{mode === 'login' ? 'Welcome back' : 'Create workspace access'}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{mode === 'login' ? 'Sign in to Relay' : 'Join FleetRelay'}</h2>
            <p className="mt-3 text-sm leading-6 text-[#18363a]/60">{mode === 'login' ? 'Continue to your vehicle message dispatcher.' : 'Use your work email to create a dispatcher account.'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="auth-email">Work email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#18363a]/40" /><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-11 border-[#18363a]/15 bg-white pl-10 text-[#18363a] placeholder:text-[#18363a]/35" /></div></div>
            <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="auth-password">Password</Label>{mode === 'login' && <span className="font-mono-app text-[10px] text-[#18363a]/45">Minimum 6 characters</span>}</div><Input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="h-11 border-[#18363a]/15 bg-white text-[#18363a] placeholder:text-[#18363a]/35" /></div>
            {error && <p role="alert" className="rounded-xl border border-[#d96a58]/25 bg-[#fff0ed] px-3 py-2.5 text-xs leading-5 text-[#a74437]">{error}</p>}
            {message && <p role="status" className="flex gap-2 rounded-xl border border-[#60bda7]/30 bg-[#e9f7f2] px-3 py-2.5 text-xs leading-5 text-[#246b5e]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{message}</p>}
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-[#18363a] text-[#fffaf0] hover:bg-[#245056]">{busy ? <LoaderCircle className="animate-spin" /> : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight /></>}</Button>
          </form>
          <p className="mt-7 text-center text-xs text-[#18363a]/55">{mode === 'login' ? 'New to FleetRelay?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }} className="font-bold text-[#246b5e] hover:underline">{mode === 'login' ? 'Create an account' : 'Sign in instead'}</button></p>
        </section>
      </div>
    </main>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#18363a] text-[#ffd166]"><LoaderCircle className="size-7 animate-spin" /></div>;
  }

  return session ? children : <LoginPage />;
}
