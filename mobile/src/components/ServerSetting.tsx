import { useState } from 'react';

import { Button, Field, Link, Message } from '@/components/ui';
import { getServerUrl, setServerUrl } from '@/lib/api';
import { storage } from '@/lib/storage';

// Test builds only: lets a student's phone reach the Docker stack on their PC (http://<PC-LAN-IP>:8000).
const ENABLED = process.env.EXPO_PUBLIC_SHOW_SERVER_SETTING !== 'false';

export function ServerSetting() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(getServerUrl());
  const [saved, setSaved] = useState<string | null>(null);
  if (!ENABLED) return null;
  if (!open) return <Link label={`Server: ${getServerUrl()}`} onPress={() => setOpen(true)} />;

  async function save() {
    setServerUrl(url);
    await storage.set('server_url', getServerUrl());
    setSaved(`Using ${getServerUrl()}`);
  }

  return (
    <>
      <Field label="Server address" value={url} onChangeText={setUrl} keyboardType="url" placeholder="http://192.168.1.5:8000" />
      <Message text={saved} kind="info" />
      <Button label="Save server" variant="secondary" onPress={save} />
    </>
  );
}
