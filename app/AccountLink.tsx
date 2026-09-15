import { useState } from 'react';
export function AccountLink({
  web,
  api,
  csrf,
  token,
  onLinked,
}: {
  web: boolean;
  api: string;
  csrf?: string;
  token?: string;
  onLinked: () => void;
}) {
  const [intent, setIntent] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(web ? '/auth/link/intent' : api + '/auth/link/accept', {
        method: 'POST',
        credentials: web ? 'same-origin' : 'omit',
        headers: {
          'Content-Type': 'application/json',
          ...(web ? { 'X-Dime-CSRF': csrf ?? '' } : { Authorization: 'Bearer ' + (token ?? '') }),
        },
        body: JSON.stringify(web ? {} : { intent }),
      });
      const value = (await response.json()) as { intent?: string };
      if (!response.ok)
        throw Error(
          response.status === 409
            ? 'Link could not be completed. Conflicting saves are preserved.'
            : 'Link could not be completed. Sign in again and retry.',
        );
      if (web && value.intent) {
        setIntent(value.intent);
        setMessage('Enter this one-use code in DIME’s Twitch Extension within five minutes.');
      } else {
        setIntent('');
        setMessage('Linked. Sign in again on the website to load the shared save.');
        onLinked();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Link could not be completed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Link web and Extension accounts">
      <h2>Link your DIME accounts</h2>
      <p>
        Sign in independently on the website and in the Twitch Extension. If both saves have progress, linking
        stops and preserves both.
      </p>
      {web ? (
        intent && (
          <label>
            One-use link code
            <input readOnly value={intent} autoComplete="off" />
          </label>
        )
      ) : (
        <label>
          Code from the DIME website
          <input
            value={intent}
            onChange={(event) => setIntent(event.target.value.trim())}
            autoComplete="off"
            spellCheck={false}
            maxLength={43}
          />
        </label>
      )}
      <button disabled={busy || (!web && !/^[\w-]{43}$/.test(intent))} onClick={() => void submit()}>
        {web ? 'Create link code' : 'Confirm account link'}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
