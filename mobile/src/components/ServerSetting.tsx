import { useState } from 'react';

import { Button, Field, Link, Message } from '@/components/ui';
import { TEST_BUILD } from '@/config';
import { getServerUrl, normalizeServerUrl, setServerUrl, testServer } from '@/lib/api';
import { storage } from '@/lib/storage';

// Test builds only: lets a student's phone reach the Docker stack on their PC (http://<PC-LAN-IP>:8000).

const RESULT = {
  ok: (url: string) => `Connected to ${url}`,
  unreachable: (url: string) => `Can't reach ${url}. Check the address, that the phone is on the same Wi-Fi, and Windows Firewall on the PC.`,
  timeout: (url: string) => `${url} didn't answer within 5 seconds.`,
  'not-evacuai': (url: string) => `Something answered at ${url}, but it isn't EvacuAI. Check the port (8000).`,
};

export function ServerSetting() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(getServerUrl());
  const [note, setNote] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!TEST_BUILD) return null;
  if (!open) return <Link label={`Server: ${getServerUrl()}`} onPress={() => setOpen(true)} />;

  async function check() {
    const r = normalizeServerUrl(url);
    if ('error' in r) return setNote({ text: r.error, kind: 'error' });
    setBusy(true);
    const result = await testServer(r.url);
    setBusy(false);
    setNote({ text: RESULT[result](r.url), kind: result === 'ok' ? 'info' : 'error' });
  }

  async function save() {
    const r = normalizeServerUrl(url);
    if ('error' in r) return setNote({ text: r.error, kind: 'error' });
    setServerUrl(r.url);
    setUrl(r.url);
    await storage.set('server_url', getServerUrl());
    setNote({ text: `Using ${getServerUrl()}`, kind: 'info' });
  }

  return (
    <>
      <Field label="Server address" value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" placeholder="http://192.168.1.5:8000" />
      <Message text={note?.text ?? null} kind={note?.kind} />
      <Button label="Test connection" variant="secondary" busy={busy} onPress={check} />
      <Button label="Save server" variant="secondary" onPress={save} />
    </>
  );
}
