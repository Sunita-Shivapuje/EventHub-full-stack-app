import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Field, inputClass } from '../components/ui.jsx';

function useAfterAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  return (user) => navigate(location.state?.from || (user.role === 'organizer' ? '/organizer' : '/'), { replace: true });
}

export function Login() {
  const { login } = useAuth();
  const done = useAfterAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { done(await login(form.email, form.password)); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  const demo = (email) => setForm({ email, password: 'Password123!' });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">Sign in</h1>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-line bg-white p-6">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" required autoComplete="email" className={inputClass} value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" required autoComplete="current-password" className={inputClass} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button type="submit" busy={busy} className="w-full">Sign in</Button>
      </form>
      <div className="mt-4 rounded-xl border border-dashed border-line bg-white p-4 text-sm">
        <p className="font-semibold">Demo accounts</p>
        <p className="mt-1 text-muted">Fill the form with a seeded account (password: Password123!).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => demo('attendee@example.com')}>Use demo attendee</Button>
          <Button type="button" variant="secondary" onClick={() => demo('organizer@example.com')}>Use demo organizer</Button>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link to="/register" className="font-semibold text-brand hover:underline">Create an account</Link>
      </p>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const done = useAfterAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'attendee' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try { done(await register(form)); }
    catch (err) {
      if (err.details) setErrors(err.details); else setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold">Create your account</h1>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-line bg-white p-6" noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">I want to</legend>
          <div className="grid grid-cols-2 gap-3">
            {[['attendee', 'Book tickets'], ['organizer', 'Host events']].map(([value, label]) => (
              <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-semibold ${form.role === value ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line'}`}>
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {errors.role && <p className="mt-1 text-sm text-rose-700">{errors.role}</p>}
        </fieldset>
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <input id="name" className={inputClass} value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <input id="email" type="email" className={inputClass} value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters">
          <input id="password" type="password" className={inputClass} value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Button type="submit" busy={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already registered? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
