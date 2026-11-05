import { useState, type FormEvent } from 'react';
import { post } from '../../api/client.ts';
import { Input, Field } from '../../components/input.tsx';
import { Button } from '../../components/button.tsx';

export function SignIn({ onSignedIn }: { onSignedIn(): void }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await post(register ? '/auth/register' : '/auth/login', {
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
      });
      onSignedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sign-in">
      <div className="sign-in-card">
        <img className="univer-logo" src="/univer-logo.svg" width={32} height={32} alt="" />
        <h1>Univer Office Copilot</h1>
        <p>Your files. Your models. One place to work.</p>
        <form onSubmit={submit}>
          {register && (
            <Field>
              Name
              <Input name="name" required maxLength={60} autoComplete="name" />
            </Field>
          )}
          <Field>
            Email
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field>
            Password
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
          </Field>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <Button variant="ghost" onClick={() => setRegister(!register)}>
          {register ? 'Already have an account? Sign in' : 'Create an account'}
        </Button>
      </div>
    </main>
  );
}
